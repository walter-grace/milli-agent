#!/usr/bin/env python3
"""MCP grep server - Python implementation."""
import json
import subprocess
import sys

SERVER_INFO = {
    "protocolVersion": "2024-11-05",
    "capabilities": {"tools": {"listChanged": False}},
    "serverInfo": {"name": "mcp-grep-python", "version": "0.1.0"},
}

TOOL_DEF = {
    "name": "grep_search",
    "description": "Search files using ripgrep",
    "inputSchema": {
        "type": "object",
        "properties": {
            "pattern": {"type": "string", "description": "Search pattern (regex)"},
            "path": {"type": "string", "description": "Directory to search"},
            "glob": {"type": "string", "description": "File glob filter"},
            "case_insensitive": {"type": "boolean", "description": "Case insensitive"},
            "max_results": {"type": "integer", "description": "Max results"},
        },
        "required": ["pattern"],
    },
}


def grep_search(args):
    pattern = args.get("pattern", "")
    path = args.get("path", ".")
    glob_filter = args.get("glob")
    case_insensitive = args.get("case_insensitive", False)
    max_results = args.get("max_results", 100)

    cmd = ["rg", "--no-heading", "-n", "-m", str(max_results)]
    if case_insensitive:
        cmd.append("-i")
    if glob_filter:
        cmd.extend(["--glob", glob_filter])
    cmd.extend(["--", pattern, path])

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        output = result.stdout.strip()
        if not output:
            output = "No matches found."
        # Trim to max results
        lines = output.split("\n")[:max_results]
        return "\n".join(lines)
    except subprocess.TimeoutExpired:
        return "Error: search timed out"
    except Exception as e:
        return f"Error: {e}"


def handle_request(req):
    method = req.get("method", "")
    req_id = req.get("id")
    params = req.get("params", {})

    if method == "initialize":
        return {"jsonrpc": "2.0", "id": req_id, "result": SERVER_INFO}
    elif method == "tools/list":
        return {"jsonrpc": "2.0", "id": req_id, "result": {"tools": [TOOL_DEF]}}
    elif method == "tools/call":
        args = params.get("arguments", {})
        text = grep_search(args)
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {"content": [{"type": "text", "text": text}]},
        }
    elif method.startswith("notifications/"):
        return None
    else:
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": -32601, "message": "Method not found"},
        }


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue
        response = handle_request(req)
        if response is not None:
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
