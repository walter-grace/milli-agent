use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use std::process::Command;
use std::fs;
use std::path::Path;
use std::time::Instant;
use std::collections::HashMap;

#[derive(Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

fn handle_initialize(id: &Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": {
            "protocolVersion": "2024-11-05",
            "capabilities": { "tools": { "listChanged": false } },
            "serverInfo": { "name": "mcp-grep-rust", "version": "0.2.0" }
        }
    })
}

fn handle_tools_list(id: &Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": {
            "tools": [
                {
                    "name": "grep_search",
                    "description": "Search files using ripgrep",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "pattern": { "type": "string", "description": "Search pattern (regex)" },
                            "path": { "type": "string", "description": "Directory to search" },
                            "glob": { "type": "string", "description": "File glob filter" },
                            "case_insensitive": { "type": "boolean", "description": "Case insensitive" },
                            "max_results": { "type": "integer", "description": "Max results" }
                        },
                        "required": ["pattern"]
                    }
                },
                {
                    "name": "openapi_search",
                    "description": "Search OpenAPI specs at milli-speed",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "Directory with specs" },
                            "query": { "type": "string", "description": "Search query" },
                            "mode": { "type": "string", "description": "endpoints|schemas|search|detail" },
                            "method": { "type": "string", "description": "HTTP method filter" }
                        },
                        "required": ["path"]
                    }
                }
            ]
        }
    })
}

fn find_spec_files(dir: &str) -> Vec<String> {
    let names = ["openapi.json", "openapi.yaml", "openapi.yml",
                 "swagger.json", "swagger.yaml", "swagger.yml"];
    let mut result = Vec::new();

    for name in &names {
        let p = format!("{}/{}", dir, name);
        if Path::new(&p).is_file() {
            result.push(p);
        }
    }

    if result.is_empty() {
        // Broader search
        if let Ok(out) = Command::new("find")
            .args([dir, "-maxdepth", "3", "-name", "*.json", "-o", "-name", "*.yaml", "-o", "-name", "*.yml"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for line in stdout.lines().take(50) {
                if let Ok(content) = fs::read_to_string(line) {
                    let preview = &content[..content.len().min(200)];
                    if preview.contains("openapi") || preview.contains("swagger") {
                        result.push(line.to_string());
                    }
                }
            }
        }
    }
    result
}

struct PathEntry {
    path: String,
    method: String,
    summary: String,
    operation_id: String,
}

struct SchemaEntry {
    name: String,
    schema_type: String,
    properties: Vec<String>,
}

fn parse_openapi(content: &str) -> (Vec<PathEntry>, Vec<SchemaEntry>, String, String) {
    let mut paths = Vec::new();
    let mut schemas = Vec::new();
    let mut title = String::new();
    let mut version = String::new();

    let spec: Value = match serde_json::from_str(content) {
        Ok(v) => v,
        Err(_) => return (paths, schemas, title, version),
    };

    // Extract info
    if let Some(info) = spec.get("info") {
        title = info.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
    }
    version = spec.get("openapi").or(spec.get("swagger"))
        .and_then(|v| v.as_str()).unwrap_or("").to_string();

    // Extract paths
    let methods = ["get", "post", "put", "delete", "patch", "options", "head"];
    if let Some(paths_obj) = spec.get("paths").and_then(|v| v.as_object()) {
        for (path, path_item) in paths_obj {
            if let Some(item) = path_item.as_object() {
                for method in &methods {
                    if let Some(op) = item.get(*method).and_then(|v| v.as_object()) {
                        paths.push(PathEntry {
                            path: path.clone(),
                            method: method.to_string(),
                            summary: op.get("summary").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            operation_id: op.get("operationId").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        });
                    }
                }
            }
        }
    }

    // Extract schemas
    let schemas_obj = spec.pointer("/components/schemas")
        .or(spec.get("definitions"))
        .and_then(|v| v.as_object());

    if let Some(sobj) = schemas_obj {
        for (name, schema) in sobj {
            let stype = schema.get("type").and_then(|v| v.as_str()).unwrap_or("object").to_string();
            let props: Vec<String> = schema.get("properties")
                .and_then(|v| v.as_object())
                .map(|p| p.keys().take(8).cloned().collect())
                .unwrap_or_default();
            schemas.push(SchemaEntry { name: name.clone(), schema_type: stype, properties: props });
        }
    }

    (paths, schemas, title, version)
}

fn handle_openapi_search(params: &Value) -> String {
    let empty = json!({});
    let args = params.get("arguments").unwrap_or(&empty);
    let dir = args.get("path").and_then(|v| v.as_str()).unwrap_or(".");
    let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
    let mode = args.get("mode").and_then(|v| v.as_str()).unwrap_or("search");
    let method_filter = args.get("method").and_then(|v| v.as_str()).unwrap_or("");

    let t_start = Instant::now();
    let specs = find_spec_files(dir);
    let find_ms = t_start.elapsed().as_millis();

    if specs.is_empty() {
        return format!("No OpenAPI/Swagger specs found in {} (scanned in {}ms)", dir, find_ms);
    }

    let mut out = format!("OpenAPI Search [Rust]: {}\n{}\nFound {} spec(s) in {}ms\n\n",
        dir, "=".repeat(50), specs.len(), find_ms);

    for spec_file in specs.iter().take(5) {
        let t_parse = Instant::now();
        let content = match fs::read_to_string(spec_file) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let (paths, schemas, title, version) = parse_openapi(&content);
        let parse_ms = t_parse.elapsed().as_millis();

        let display_title = if title.is_empty() { spec_file.as_str() } else { &title };
        out += &format!("## {} ({})\nFile: {} | {} endpoints, {} schemas | parsed {}ms\n\n",
            display_title, version, spec_file, paths.len(), schemas.len(), parse_ms);

        let q = query.to_lowercase();

        if mode == "endpoints" || (mode == "search" && query.is_empty()) {
            out += "Endpoints:\n";
            for pe in &paths {
                if !method_filter.is_empty() && pe.method != method_filter.to_lowercase() { continue; }
                out += &format!("  {:<7} {}", pe.method.to_uppercase(), pe.path);
                if !pe.summary.is_empty() { out += &format!(" -- {}", pe.summary); }
                out += "\n";
            }
            out += "\n";
        }

        if mode == "schemas" || (mode == "search" && query.is_empty()) {
            out += "Schemas:\n";
            for se in &schemas {
                out += &format!("  {} ({})", se.name, se.schema_type);
                if !se.properties.is_empty() {
                    out += &format!(" -- {}", se.properties.join(", "));
                }
                out += "\n";
            }
            out += "\n";
        }

        if mode == "search" && !query.is_empty() {
            let mut matches = 0;
            out += &format!("Search: \"{}\"\n\n", query);

            for pe in &paths {
                if !method_filter.is_empty() && pe.method != method_filter.to_lowercase() { continue; }
                let haystack = format!("{} {} {} {}", pe.path, pe.method, pe.summary, pe.operation_id).to_lowercase();
                if haystack.contains(&q) {
                    matches += 1;
                    out += &format!("  {:<7} {}\n", pe.method.to_uppercase(), pe.path);
                    if !pe.summary.is_empty() { out += &format!("          summary: {}\n", pe.summary); }
                    if !pe.operation_id.is_empty() { out += &format!("          operationId: {}\n", pe.operation_id); }
                    out += "\n";
                }
            }

            for se in &schemas {
                let haystack = se.name.to_lowercase();
                if haystack.contains(&q) {
                    matches += 1;
                    out += &format!("  Schema: {} ({})\n\n", se.name, se.schema_type);
                }
            }

            out += &format!("{} match(es)\n\n", matches);
        }

        if mode == "detail" && !query.is_empty() {
            for pe in &paths {
                if pe.path.to_lowercase().contains(&q) {
                    out += &format!("  {:<7} {}\n", pe.method.to_uppercase(), pe.path);
                    if !pe.summary.is_empty() { out += &format!("    summary: {}\n", pe.summary); }
                    if !pe.operation_id.is_empty() { out += &format!("    operationId: {}\n", pe.operation_id); }
                    out += "\n";
                }
            }
        }
    }

    let total_ms = t_start.elapsed().as_millis();
    out += &format!("Total: {}ms\n", total_ms);
    out
}

// ─── File ops: read_file, list_files, code_stats ───

fn handle_read_file(params: &Value) -> String {
    let empty = json!({});
    let args = params.get("arguments").unwrap_or(&empty);
    let file_path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
    let start_line = args.get("start_line").and_then(|v| v.as_u64()).unwrap_or(1) as usize;
    let end_line_opt = args.get("end_line").and_then(|v| v.as_u64()).map(|v| v as usize);

    if file_path.is_empty() { return "path required".to_string(); }
    let path = Path::new(file_path);
    if !path.exists() { return format!("File not found: {}", file_path); }
    if !path.is_file() { return format!("{} is a directory", file_path); }

    let metadata = match fs::metadata(path) { Ok(m) => m, Err(e) => return format!("Error: {}", e) };
    if metadata.len() > 1024 * 1024 { return format!("File too large ({:.1}MB)", metadata.len() as f64 / 1024.0 / 1024.0); }

    let content = match fs::read_to_string(path) { Ok(c) => c, Err(e) => return format!("Error: {}", e) };
    let lines: Vec<&str> = content.lines().collect();
    let end = end_line_opt.unwrap_or((start_line + 100).min(lines.len()));
    let end = end.min(lines.len());
    let start = start_line.max(1);

    let mut out = format!("File: {} ({} lines, {:.1}KB)\nShowing lines {}-{}:\n\n",
        file_path, lines.len(), metadata.len() as f64 / 1024.0, start, end);
    for i in (start - 1)..end {
        if i < lines.len() {
            out.push_str(&format!("{}|{}\n", i + 1, lines[i]));
        }
    }
    out
}

fn handle_list_files(params: &Value) -> String {
    let empty = json!({});
    let args = params.get("arguments").unwrap_or(&empty);
    let dir_path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
    let recursive = args.get("recursive").and_then(|v| v.as_bool()).unwrap_or(false);
    let glob_filter = args.get("glob").and_then(|v| v.as_str());

    if dir_path.is_empty() { return "path required".to_string(); }
    let path = Path::new(dir_path);
    if !path.exists() { return format!("Directory not found: {}", dir_path); }

    if recursive {
        let mut files = Vec::new();
        let mut count = 0;
        fn walk(p: &Path, files: &mut Vec<String>, count: &mut usize, glob: Option<&str>) {
            if *count >= 500 { return; }
            if let Ok(entries) = fs::read_dir(p) {
                for entry in entries.flatten() {
                    if *count >= 500 { return; }
                    let path = entry.path();
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name == ".git" || name == "node_modules" || name == "target" || name == "dist" { continue; }
                    if path.is_dir() {
                        walk(&path, files, count, glob);
                    } else {
                        if let Some(g) = glob {
                            if !name.contains(&g.replace('*', "")) { continue; }
                        }
                        files.push(path.to_string_lossy().to_string());
                        *count += 1;
                    }
                }
            }
        }
        walk(path, &mut files, &mut count, glob_filter);
        let mut out = format!("{} ({} files)\n\n", dir_path, files.len());
        for f in files { out.push_str(&format!("  {}\n", f)); }
        out
    } else {
        let mut entries: Vec<_> = match fs::read_dir(path) {
            Ok(e) => e.flatten().collect(),
            Err(e) => return format!("Error: {}", e),
        };
        entries.sort_by(|a, b| {
            let a_dir = a.path().is_dir();
            let b_dir = b.path().is_dir();
            b_dir.cmp(&a_dir).then(a.file_name().cmp(&b.file_name()))
        });
        let mut out = format!("{}/\n\n", dir_path);
        for entry in entries {
            let name = entry.file_name().to_string_lossy().to_string();
            let p = entry.path();
            if p.is_dir() {
                out.push_str(&format!("  DIR  {}/\n", name));
            } else if let Ok(meta) = entry.metadata() {
                let sz = meta.len();
                let sz_str = if sz > 1024 * 1024 { format!("{:.1}MB", sz as f64 / 1024.0 / 1024.0) }
                    else if sz > 1024 { format!("{:.1}KB", sz as f64 / 1024.0) }
                    else { format!("{}B", sz) };
                out.push_str(&format!("  FILE {} ({})\n", name, sz_str));
            }
        }
        out
    }
}

fn handle_code_stats(params: &Value) -> String {
    let empty = json!({});
    let args = params.get("arguments").unwrap_or(&empty);
    let dir_path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
    if dir_path.is_empty() { return "path required".to_string(); }
    if !Path::new(dir_path).exists() { return format!("Not found: {}", dir_path); }

    let mut ext_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let mut ext_lines: std::collections::HashMap<String, u64> = std::collections::HashMap::new();
    let mut total_lines: u64 = 0;
    let mut total_size: u64 = 0;
    let mut file_count = 0;

    fn walk(p: &Path, ec: &mut std::collections::HashMap<String, usize>, el: &mut std::collections::HashMap<String, u64>, tl: &mut u64, ts: &mut u64, fc: &mut usize) {
        if *fc >= 5000 { return; }
        if let Ok(entries) = fs::read_dir(p) {
            for entry in entries.flatten() {
                if *fc >= 5000 { return; }
                let name = entry.file_name().to_string_lossy().to_string();
                if name == ".git" || name == "node_modules" || name == "target" || name == "dist" { continue; }
                let path = entry.path();
                if path.is_dir() { walk(&path, ec, el, tl, ts, fc); continue; }
                *fc += 1;
                let ext = path.extension().and_then(|e| e.to_str()).map(|s| format!(".{}", s)).unwrap_or_else(|| "".to_string());
                *ec.entry(ext.clone()).or_insert(0) += 1;
                if let Ok(meta) = entry.metadata() {
                    *ts += meta.len();
                    if meta.len() < 512 * 1024 {
                        if let Ok(content) = fs::read_to_string(&path) {
                            let n = content.lines().count() as u64;
                            *el.entry(ext).or_insert(0) += n;
                            *tl += n;
                        }
                    }
                }
            }
        }
    }
    walk(Path::new(dir_path), &mut ext_counts, &mut ext_lines, &mut total_lines, &mut total_size, &mut file_count);

    let lang_map: std::collections::HashMap<&str, &str> = [
        (".js","JavaScript"),(".ts","TypeScript"),(".py","Python"),(".go","Go"),(".rs","Rust"),
        (".zig","Zig"),(".swift","Swift"),(".c","C"),(".cpp","C++"),(".h","C/C++ Header"),
        (".java","Java"),(".rb","Ruby"),(".md","Markdown"),(".json","JSON"),(".yaml","YAML"),
        (".yml","YAML"),(".toml","TOML"),(".html","HTML"),(".css","CSS"),(".sh","Shell"),
    ].iter().copied().collect();

    let mut out = format!("Code Stats [Rust]: {}\n{}\n\n", dir_path, "=".repeat(50));
    out.push_str(&format!("Total: {} files, {} lines, {:.1}MB\n\nLanguage Breakdown:\n", file_count, total_lines, total_size as f64 / 1024.0 / 1024.0));

    let mut sorted: Vec<(&String, &u64)> = ext_lines.iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(a.1));
    for (ext, lines) in sorted {
        let lang = lang_map.get(ext.as_str()).copied().unwrap_or(ext.as_str());
        let count = ext_counts.get(ext).copied().unwrap_or(0);
        let pct = if total_lines > 0 { *lines as f64 * 100.0 / total_lines as f64 } else { 0.0 };
        out.push_str(&format!("  {:<20} {:>8} lines  {:>4} files  {:.1}%\n", lang, lines, count, pct));
    }
    out
}

fn handle_tool_call(id: &Value, params: &Value) -> Value {
    let tool_name = params.get("name").and_then(|v| v.as_str()).unwrap_or("grep_search");

    if tool_name == "openapi_search" {
        let result = handle_openapi_search(params);
        return json!({ "jsonrpc": "2.0", "id": id, "result": { "content": [{ "type": "text", "text": result }] } });
    }
    if tool_name == "read_file" {
        let result = handle_read_file(params);
        return json!({ "jsonrpc": "2.0", "id": id, "result": { "content": [{ "type": "text", "text": result }] } });
    }
    if tool_name == "list_files" {
        let result = handle_list_files(params);
        return json!({ "jsonrpc": "2.0", "id": id, "result": { "content": [{ "type": "text", "text": result }] } });
    }
    if tool_name == "code_stats" {
        let result = handle_code_stats(params);
        return json!({ "jsonrpc": "2.0", "id": id, "result": { "content": [{ "type": "text", "text": result }] } });
    }

    // Default: grep_search
    let empty = json!({});
    let args = params.get("arguments").unwrap_or(&empty);
    let pattern = args.get("pattern").and_then(|v| v.as_str()).unwrap_or("");
    let path = args.get("path").and_then(|v| v.as_str()).unwrap_or(".");
    let glob_filter = args.get("glob").and_then(|v| v.as_str());
    let case_insensitive = args.get("case_insensitive").and_then(|v| v.as_bool()).unwrap_or(false);
    let max_results = args.get("max_results").and_then(|v| v.as_u64()).unwrap_or(100);

    let mut cmd = Command::new("rg");
    cmd.args(["--json", "-m", &max_results.to_string()]);
    if case_insensitive { cmd.arg("-i"); }
    if let Some(g) = glob_filter { cmd.args(["--glob", g]); }
    cmd.arg(pattern).arg(path);

    let output = cmd.output();
    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let lines: Vec<&str> = stdout.lines().take(max_results as usize).collect();
            let mut results = Vec::new();
            for line in &lines {
                if let Ok(v) = serde_json::from_str::<Value>(line) {
                    if v.get("type").and_then(|t| t.as_str()) == Some("match") {
                        if let Some(data) = v.get("data") {
                            let file = data.pointer("/path/text").and_then(|v| v.as_str()).unwrap_or("?");
                            let line_num = data.get("line_number").and_then(|v| v.as_u64()).unwrap_or(0);
                            let text = data.pointer("/lines/text").and_then(|v| v.as_str()).unwrap_or("").trim();
                            results.push(format!("{}:{}:{}", file, line_num, text));
                        }
                    }
                }
            }
            let result_text = if results.is_empty() {
                "No matches found.".to_string()
            } else {
                results.join("\n")
            };
            json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": { "content": [{ "type": "text", "text": result_text }] }
            })
        }
        Err(e) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": { "content": [{ "type": "text", "text": format!("Error: {}", e) }], "isError": true }
        }),
    }
}

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = stdout.lock();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if line.trim().is_empty() { continue; }

        let req: JsonRpcRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(_) => continue,
        };

        let id = req.id.clone().unwrap_or(json!(null));
        let response = match req.method.as_str() {
            "initialize" => handle_initialize(&id),
            "tools/list" => handle_tools_list(&id),
            "tools/call" => handle_tool_call(&id, req.params.as_ref().unwrap_or(&json!({}))),
            "notifications/initialized" | "notifications/cancelled" => continue,
            _ => json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": { "code": -32601, "message": "Method not found" }
            }),
        };

        let resp_str = serde_json::to_string(&response).unwrap();
        writeln!(out, "{}", resp_str).unwrap();
        out.flush().unwrap();
    }
}
