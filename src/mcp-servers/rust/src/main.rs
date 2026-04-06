use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use std::process::Command;
use std::fs;
use std::path::Path;
use std::time::Instant;

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

fn handle_tool_call(id: &Value, params: &Value) -> Value {
    let tool_name = params.get("name").and_then(|v| v.as_str()).unwrap_or("grep_search");

    if tool_name == "openapi_search" {
        let result = handle_openapi_search(params);
        return json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": { "content": [{ "type": "text", "text": result }] }
        });
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
