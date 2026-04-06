use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use std::process::Command;

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
            "serverInfo": { "name": "mcp-grep-rust", "version": "0.1.0" }
        }
    })
}

fn handle_tools_list(id: &Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": {
            "tools": [{
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
            }]
        }
    })
}

fn handle_tool_call(id: &Value, params: &Value) -> Value {
    let empty = json!({}); let args = params.get("arguments").unwrap_or(&empty);
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
                "result": {
                    "content": [{ "type": "text", "text": result_text }]
                }
            })
        }
        Err(e) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "content": [{ "type": "text", "text": format!("Error: {}", e) }],
                "isError": true
            }
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
