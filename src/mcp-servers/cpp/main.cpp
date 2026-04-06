#include <iostream>
#include <string>
#include <sstream>
#include <array>
#include <memory>
#include <cstdio>
#include <vector>

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

static std::string handle_initialize(const std::string& id) {
    return "{\"jsonrpc\":\"2.0\",\"id\":" + id +
        ",\"result\":{\"protocolVersion\":\"2024-11-05\","
        "\"capabilities\":{\"tools\":{\"listChanged\":false}},"
        "\"serverInfo\":{\"name\":\"mcp-grep-cpp\",\"version\":\"0.1.0\"}}}";
}

static std::string handle_tools_list(const std::string& id) {
    return "{\"jsonrpc\":\"2.0\",\"id\":" + id +
        ",\"result\":{\"tools\":[{\"name\":\"grep_search\","
        "\"description\":\"Search files using ripgrep\","
        "\"inputSchema\":{\"type\":\"object\","
        "\"properties\":{"
        "\"pattern\":{\"type\":\"string\",\"description\":\"Search pattern (regex)\"},"
        "\"path\":{\"type\":\"string\",\"description\":\"Directory to search\"},"
        "\"glob\":{\"type\":\"string\",\"description\":\"File glob filter\"},"
        "\"case_insensitive\":{\"type\":\"boolean\",\"description\":\"Case insensitive\"},"
        "\"max_results\":{\"type\":\"integer\",\"description\":\"Max results\"}},"
        "\"required\":[\"pattern\"]}}]}}";
}

static std::string handle_tool_call(const std::string& id, const std::string& params) {
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
