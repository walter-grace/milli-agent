#include <iostream>
#include <string>
#include <sstream>
#include <array>
#include <memory>
#include <cstdio>
#include <vector>
#include <fstream>
#include <algorithm>
#include <chrono>
#include <dirent.h>
#include <sys/stat.h>

static std::string json_get_string(const std::string& json, const std::string& key) {
    std::string needle = "\"" + key + "\"";
    auto pos = json.find(needle);
    if (pos == std::string::npos) return "";
    pos = json.find("\"", pos + needle.size() + 1);
    if (pos == std::string::npos) return "";
    auto end = json.find("\"", pos + 1);
    if (end == std::string::npos) return "";
    return json.substr(pos + 1, end - pos - 1);
}

static int json_get_int(const std::string& json, const std::string& key, int def = 0) {
    std::string needle = "\"" + key + "\"";
    auto pos = json.find(needle);
    if (pos == std::string::npos) return def;
    pos = json.find_first_of("-0123456789", pos + needle.size());
    if (pos == std::string::npos) return def;
    return std::stoi(json.substr(pos));
}

static bool json_get_bool(const std::string& json, const std::string& key, bool def = false) {
    std::string needle = "\"" + key + "\"";
    auto pos = json.find(needle);
    if (pos == std::string::npos) return def;
    pos = json.find_first_of("tf", pos + needle.size());
    if (pos == std::string::npos) return def;
    return json[pos] == 't';
}

static std::string escape_json(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 16);
    for (char c : s) {
        switch (c) {
            case '\"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default: out += c;
        }
    }
    return out;
}

static std::string exec_cmd(const std::string& cmd) {
    std::array<char, 4096> buffer;
    std::string result;
    std::unique_ptr<FILE, decltype(&pclose)> pipe(popen(cmd.c_str(), "r"), pclose);
    if (!pipe) return "Error: popen failed";
    while (fgets(buffer.data(), buffer.size(), pipe.get()) != nullptr)
        result += buffer.data();
    return result;
}

static std::string read_file(const std::string& path) {
    std::ifstream f(path, std::ios::binary);
    if (!f) return "";
    std::ostringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

struct PathEntry {
    std::string path;
    std::string method;
    std::string summary;
    std::string operationId;
};

struct SchemaEntry {
    std::string name;
    std::string type;
};

// Extract a JSON string starting at position (must be at opening quote)
static std::string extract_json_string(const std::string& json, size_t& pos) {
    if (pos >= json.size() || json[pos] != '"') return "";
    pos++; // skip opening quote
    std::string result;
    result.reserve(64);
    while (pos < json.size()) {
        if (json[pos] == '\\' && pos + 1 < json.size()) {
            result += json[pos + 1];
            pos += 2;
        } else if (json[pos] == '"') {
            pos++; // skip closing quote
            return result;
        } else {
            result += json[pos];
            pos++;
        }
    }
    return result;
}

// Skip a JSON value (string, number, object, array, bool, null)
static void skip_json_value(const std::string& json, size_t& pos) {
    while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t' || json[pos] == '\n' || json[pos] == '\r')) pos++;
    if (pos >= json.size()) return;
    if (json[pos] == '"') { extract_json_string(json, pos); return; }
    if (json[pos] == '{') {
        pos++; int d = 1;
        while (pos < json.size() && d > 0) {
            if (json[pos] == '"') { extract_json_string(json, pos); continue; }
            if (json[pos] == '{') d++;
            else if (json[pos] == '}') d--;
            pos++;
        }
        return;
    }
    if (json[pos] == '[') {
        pos++; int d = 1;
        while (pos < json.size() && d > 0) {
            if (json[pos] == '"') { extract_json_string(json, pos); continue; }
            if (json[pos] == '[') d++;
            else if (json[pos] == ']') d--;
            pos++;
        }
        return;
    }
    // number, bool, null
    while (pos < json.size() && json[pos] != ',' && json[pos] != '}' && json[pos] != ']') pos++;
}

// Find string value for a key within a bounded region
static std::string find_string_in_object(const std::string& json, size_t start, size_t end, const std::string& key) {
    std::string needle = "\"" + key + "\"";
    auto pos = json.find(needle, start);
    if (pos == std::string::npos || pos >= end) return "";
    pos += needle.size();
    while (pos < end && json[pos] != '"') pos++;
    if (pos >= end) return "";
    return extract_json_string(json, pos);
}

// Parse OpenAPI JSON using proper brace-depth tracking
static void parse_openapi_json(const std::string& json,
    std::vector<PathEntry>& paths,
    std::vector<SchemaEntry>& schemas,
    std::string& title, std::string& version) {

    // Find openapi version
    auto ver_pos = json.find("\"openapi\"");
    if (ver_pos == std::string::npos) ver_pos = json.find("\"swagger\"");
    if (ver_pos != std::string::npos) {
        size_t p = ver_pos + 10;
        while (p < json.size() && json[p] != '"') p++;
        if (p < json.size()) version = extract_json_string(json, p);
    }

    // Find title
    auto info_pos = json.find("\"info\"");
    if (info_pos != std::string::npos) {
        auto title_pos = json.find("\"title\"", info_pos);
        if (title_pos != std::string::npos && title_pos < info_pos + 5000) {
            size_t p = title_pos + 7;
            while (p < json.size() && json[p] != '"') p++;
            if (p < json.size()) title = extract_json_string(json, p);
        }
    }

    // Parse paths — find top-level "paths" key (the one with endpoint values starting with /)
    // The Cloudflare spec has multiple "paths" keys at different depths — we need the one
    // that actually contains API endpoints (keys like "/accounts", "/zones", etc.)
    size_t paths_pos = std::string::npos;
    {
        size_t search_from = 0;
        while (search_from < json.size()) {
            auto found = json.find("\"paths\"", search_from);
            if (found == std::string::npos) break;
            // Check if the value contains a key starting with "/a" to "/z" (actual API paths)
            auto brace = json.find('{', found + 7);
            if (brace != std::string::npos) {
                // Look at the first key inside
                size_t p = brace + 1;
                while (p < json.size() && json[p] != '"' && json[p] != '}') p++;
                if (p < json.size() && json[p] == '"') {
                    size_t ks = p;
                    auto key = extract_json_string(json, p);
                    if (!key.empty() && key[0] == '/') {
                        paths_pos = found;
                        break;
                    }
                }
            }
            search_from = found + 7;
        }
    }
    if (paths_pos == std::string::npos) return;

    size_t pos = json.find('{', paths_pos + 7);
    if (pos == std::string::npos) return;
    pos++; // enter paths object

    static const std::string method_names[] = {"get","post","put","delete","patch","options","head"};

    // Parse top-level path keys
    while (pos < json.size()) {
        while (pos < json.size() && (json[pos] == ' ' || json[pos] == ',' || json[pos] == '\n' || json[pos] == '\r' || json[pos] == '\t')) pos++;
        if (pos >= json.size() || json[pos] == '}') break;
        if (json[pos] != '"') { pos++; continue; }

        std::string path_key = extract_json_string(json, pos);
        if (path_key.empty() || path_key[0] != '/') {
            // Not a path — we've left the paths object
            break;
        }

        // Skip to opening brace of path item
        while (pos < json.size() && json[pos] != '{') pos++;
        if (pos >= json.size()) break;

        // Track the path item object boundaries
        size_t path_obj_start = pos;
        pos++; // enter path item
        int depth = 1;

        // Scan for method keys at depth 1
        while (pos < json.size() && depth > 0) {
            while (pos < json.size() && (json[pos] == ' ' || json[pos] == ',' || json[pos] == '\n' || json[pos] == '\r' || json[pos] == '\t')) pos++;
            if (pos >= json.size()) break;

            if (json[pos] == '}') { depth--; pos++; continue; }
            if (json[pos] == '{') { depth++; pos++; continue; }

            if (json[pos] == '"' && depth == 1) {
                size_t key_start = pos;
                std::string key = extract_json_string(json, pos);

                // Skip colon
                while (pos < json.size() && json[pos] != ':') pos++;
                if (pos < json.size()) pos++;
                while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) pos++;

                bool is_method = false;
                for (auto& m : method_names) {
                    if (key == m) { is_method = true; break; }
                }

                if (is_method && pos < json.size() && json[pos] == '{') {
                    // Found a method object — mark its boundaries
                    size_t method_start = pos;
                    // Find the end of this method object
                    int md = 1; pos++;
                    while (pos < json.size() && md > 0) {
                        if (json[pos] == '"') { extract_json_string(json, pos); continue; }
                        if (json[pos] == '{') md++;
                        else if (json[pos] == '}') md--;
                        pos++;
                    }
                    size_t method_end = pos;

                    PathEntry pe;
                    pe.path = path_key;
                    pe.method = key;
                    pe.summary = find_string_in_object(json, method_start, method_end, "summary");
                    pe.operationId = find_string_in_object(json, method_start, method_end, "operationId");
                    paths.push_back(pe);
                } else {
                    skip_json_value(json, pos);
                }
            } else {
                pos++;
            }
        }
    }

    // Parse schemas
    auto schemas_key = json.find("\"schemas\"");
    if (schemas_key == std::string::npos) schemas_key = json.find("\"definitions\"");
    if (schemas_key == std::string::npos) return;

    pos = json.find('{', schemas_key + 10);
    if (pos == std::string::npos) return;
    pos++;

    while (pos < json.size()) {
        while (pos < json.size() && (json[pos] == ' ' || json[pos] == ',' || json[pos] == '\n' || json[pos] == '\r' || json[pos] == '\t')) pos++;
        if (pos >= json.size() || json[pos] == '}') break;
        if (json[pos] != '"') { pos++; continue; }

        SchemaEntry se;
        se.name = extract_json_string(json, pos);

        // Skip to value
        while (pos < json.size() && json[pos] != ':') pos++;
        if (pos < json.size()) pos++;
        while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) pos++;

        // Find type within the schema object
        if (pos < json.size() && json[pos] == '{') {
            size_t obj_start = pos;
            // Quick scan for "type" before fully skipping
            size_t lookahead = std::min(pos + 500, json.size());
            se.type = find_string_in_object(json, obj_start, lookahead, "type");
            if (se.type.empty()) se.type = "object";
            skip_json_value(json, pos);
        } else {
            skip_json_value(json, pos);
            se.type = "?";
        }
        schemas.push_back(se);
    }
}

static std::vector<std::string> find_spec_files(const std::string& dir) {
    std::vector<std::string> result;
    static const char* names[] = {"openapi.json", "openapi.yaml", "openapi.yml",
        "swagger.json", "swagger.yaml", "swagger.yml"};
    for (auto name : names) {
        std::string path = dir + "/" + name;
        struct stat st;
        if (stat(path.c_str(), &st) == 0 && S_ISREG(st.st_mode)) {
            result.push_back(path);
        }
    }
    if (result.empty()) {
        // Broader search with find
        std::string cmd = "find \"" + dir + "\" -maxdepth 3 -name '*.json' -o -name '*.yaml' -o -name '*.yml' 2>/dev/null | head -50";
        std::string found = exec_cmd(cmd);
        std::istringstream stream(found);
        std::string line;
        while (std::getline(stream, line)) {
            if (line.empty()) continue;
            std::string content = read_file(line).substr(0, 200);
            if (content.find("openapi") != std::string::npos || content.find("swagger") != std::string::npos) {
                result.push_back(line);
            }
        }
    }
    return result;
}

static std::string handle_openapi_search(const std::string& params) {
    auto args_pos = params.find("\"arguments\"");
    std::string args = (args_pos != std::string::npos) ? params.substr(args_pos) : params;

    std::string path = json_get_string(args, "path");
    if (path.empty()) path = ".";
    std::string query = json_get_string(args, "query");
    std::string mode = json_get_string(args, "mode");
    if (mode.empty()) mode = "search";
    std::string method_filter = json_get_string(args, "method");

    auto t_start = std::chrono::high_resolution_clock::now();

    auto specs = find_spec_files(path);
    auto t_find = std::chrono::high_resolution_clock::now();
    auto find_ms = std::chrono::duration_cast<std::chrono::milliseconds>(t_find - t_start).count();

    if (specs.empty()) {
        return "No OpenAPI/Swagger specs found in " + path + " (scanned in " + std::to_string(find_ms) + "ms)";
    }

    std::string out = "OpenAPI Search [C++]: " + path + "\n";
    out += "==================================================\n";
    out += "Found " + std::to_string(specs.size()) + " spec(s) in " + std::to_string(find_ms) + "ms\n\n";

    for (auto& spec_file : specs) {
        auto t_parse = std::chrono::high_resolution_clock::now();
        std::string content = read_file(spec_file);
        if (content.empty()) continue;

        std::vector<PathEntry> paths;
        std::vector<SchemaEntry> schemas;
        std::string title, version;
        parse_openapi_json(content, paths, schemas, title, version);

        auto t_done = std::chrono::high_resolution_clock::now();
        auto parse_ms = std::chrono::duration_cast<std::chrono::milliseconds>(t_done - t_parse).count();

        if (title.empty()) title = spec_file;
        out += "## " + title + " (" + version + ")\n";
        out += "File: " + spec_file + " | " + std::to_string(paths.size()) + " endpoints, " +
               std::to_string(schemas.size()) + " schemas | parsed " + std::to_string(parse_ms) + "ms\n\n";

        std::string q = query;
        std::transform(q.begin(), q.end(), q.begin(), ::tolower);

        if (mode == "endpoints" || (mode == "search" && query.empty())) {
            out += "Endpoints:\n";
            for (auto& pe : paths) {
                if (!method_filter.empty()) {
                    std::string mf = method_filter;
                    std::transform(mf.begin(), mf.end(), mf.begin(), ::tolower);
                    if (pe.method != mf) continue;
                }
                std::string m = pe.method;
                std::transform(m.begin(), m.end(), m.begin(), ::toupper);
                while (m.size() < 7) m += ' ';
                out += "  " + m + " " + pe.path;
                if (!pe.summary.empty()) out += " -- " + pe.summary;
                out += "\n";
            }
            out += "\n";
        }

        if (mode == "schemas" || (mode == "search" && query.empty())) {
            out += "Schemas:\n";
            for (auto& se : schemas) {
                out += "  " + se.name + " (" + (se.type.empty() ? "object" : se.type) + ")\n";
            }
            out += "\n";
        }

        if (mode == "search" && !query.empty()) {
            int matches = 0;
            out += "Search: \"" + query + "\"\n\n";
            for (auto& pe : paths) {
                std::string haystack = pe.path + " " + pe.method + " " + pe.summary + " " + pe.operationId;
                std::transform(haystack.begin(), haystack.end(), haystack.begin(), ::tolower);
                if (haystack.find(q) != std::string::npos) {
                    matches++;
                    std::string m = pe.method;
                    std::transform(m.begin(), m.end(), m.begin(), ::toupper);
                    while (m.size() < 7) m += ' ';
                    out += "  " + m + " " + pe.path;
                    if (!pe.summary.empty()) out += "\n          summary: " + pe.summary;
                    if (!pe.operationId.empty()) out += "\n          operationId: " + pe.operationId;
                    out += "\n\n";
                }
            }
            for (auto& se : schemas) {
                std::string haystack = se.name;
                std::transform(haystack.begin(), haystack.end(), haystack.begin(), ::tolower);
                if (haystack.find(q) != std::string::npos) {
                    matches++;
                    out += "  Schema: " + se.name + " (" + (se.type.empty() ? "object" : se.type) + ")\n\n";
                }
            }
            out += std::to_string(matches) + " match(es)\n\n";
        }
    }

    auto t_total = std::chrono::high_resolution_clock::now();
    auto total_ms = std::chrono::duration_cast<std::chrono::milliseconds>(t_total - t_start).count();
    out += "Total: " + std::to_string(total_ms) + "ms\n";
    return out;
}

static std::string handle_initialize(const std::string& id) {
    return "{\"jsonrpc\":\"2.0\",\"id\":" + id +
        ",\"result\":{\"protocolVersion\":\"2024-11-05\","
        "\"capabilities\":{\"tools\":{\"listChanged\":false}},"
        "\"serverInfo\":{\"name\":\"mcp-grep-cpp\",\"version\":\"0.2.0\"}}}";
}

static std::string handle_tools_list(const std::string& id) {
    return "{\"jsonrpc\":\"2.0\",\"id\":" + id +
        ",\"result\":{\"tools\":["
        "{\"name\":\"grep_search\",\"description\":\"Search files using ripgrep\","
        "\"inputSchema\":{\"type\":\"object\",\"properties\":{"
        "\"pattern\":{\"type\":\"string\",\"description\":\"Search pattern (regex)\"},"
        "\"path\":{\"type\":\"string\",\"description\":\"Directory to search\"},"
        "\"glob\":{\"type\":\"string\",\"description\":\"File glob filter\"},"
        "\"case_insensitive\":{\"type\":\"boolean\",\"description\":\"Case insensitive\"},"
        "\"max_results\":{\"type\":\"integer\",\"description\":\"Max results\"}},"
        "\"required\":[\"pattern\"]}},"
        "{\"name\":\"openapi_search\",\"description\":\"Search OpenAPI specs at milli-speed\","
        "\"inputSchema\":{\"type\":\"object\",\"properties\":{"
        "\"path\":{\"type\":\"string\",\"description\":\"Directory with specs\"},"
        "\"query\":{\"type\":\"string\",\"description\":\"Search query\"},"
        "\"mode\":{\"type\":\"string\",\"description\":\"endpoints|schemas|search|detail\"},"
        "\"method\":{\"type\":\"string\",\"description\":\"HTTP method filter\"}},"
        "\"required\":[\"path\"]}}"
        "]}}";
}

static std::string handle_tool_call(const std::string& id, const std::string& params) {
    std::string tool_name = json_get_string(params, "name");

    if (tool_name == "openapi_search") {
        std::string result = handle_openapi_search(params);
        return "{\"jsonrpc\":\"2.0\",\"id\":" + id +
            ",\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"" +
            escape_json(result) + "\"}]}}";
    }

    // Default: grep_search
    auto args_pos = params.find("\"arguments\"");
    std::string args = (args_pos != std::string::npos) ? params.substr(args_pos) : params;

    std::string pattern = json_get_string(args, "pattern");
    std::string path = json_get_string(args, "path");
    if (path.empty()) path = ".";
    std::string glob = json_get_string(args, "glob");
    bool ci = json_get_bool(args, "case_insensitive");
    int max_r = json_get_int(args, "max_results", 100);

    std::string cmd = "rg --no-heading -n -m " + std::to_string(max_r);
    if (ci) cmd += " -i";
    if (!glob.empty()) cmd += " --glob '" + glob + "'";
    cmd += " -- '" + pattern + "' '" + path + "' 2>&1";

    std::string output = exec_cmd(cmd);
    if (output.empty()) output = "No matches found.";

    std::string trimmed;
    int count = 0;
    std::istringstream stream(output);
    std::string line;
    while (std::getline(stream, line) && count < max_r) {
        trimmed += line + "\n";
        count++;
    }

    return "{\"jsonrpc\":\"2.0\",\"id\":" + id +
        ",\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"" +
        escape_json(trimmed) + "\"}]}}";
}

int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;

        std::string method = json_get_string(line, "method");
        auto id_pos = line.find("\"id\"");
        std::string id_val = "null";
        if (id_pos != std::string::npos) {
            auto colon = line.find(":", id_pos + 4);
            if (colon != std::string::npos) {
                auto start = line.find_first_not_of(" \t", colon + 1);
                if (start != std::string::npos) {
                    if (line[start] == '"') {
                        auto end = line.find("\"", start + 1);
                        id_val = line.substr(start, end - start + 1);
                    } else {
                        auto end = line.find_first_of(",} \t\n", start);
                        id_val = line.substr(start, end - start);
                    }
                }
            }
        }

        std::string response;
        if (method == "initialize") {
            response = handle_initialize(id_val);
        } else if (method == "tools/list") {
            response = handle_tools_list(id_val);
        } else if (method == "tools/call") {
            response = handle_tool_call(id_val, line);
        } else if (method.find("notifications/") == 0) {
            continue;
        } else {
            response = "{\"jsonrpc\":\"2.0\",\"id\":" + id_val +
                ",\"error\":{\"code\":-32601,\"message\":\"Method not found\"}}";
        }

        std::cout << response << "\n";
        std::cout.flush();
    }
    return 0;
}
