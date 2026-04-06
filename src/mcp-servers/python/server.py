#!/usr/bin/env python3
"""MCP grep + OpenAPI search server - Python implementation."""
import json
import subprocess
import sys
import os
import time

SERVER_INFO = {
    "protocolVersion": "2024-11-05",
    "capabilities": {"tools": {"listChanged": False}},
    "serverInfo": {"name": "mcp-grep-python", "version": "0.2.0"},
}

TOOLS = [
    {
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
    },
    {
        "name": "openapi_search",
        "description": "Search OpenAPI specs at milli-speed",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Directory with specs"},
                "query": {"type": "string", "description": "Search query"},
                "mode": {"type": "string", "description": "endpoints|schemas|search|detail"},
                "method": {"type": "string", "description": "HTTP method filter"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "read_file",
        "description": "Read file contents with optional line range",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "start_line": {"type": "integer"},
                "end_line": {"type": "integer"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "list_files",
        "description": "List files in directory",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "recursive": {"type": "boolean"},
                "glob": {"type": "string"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "code_stats",
        "description": "Code statistics: lines per language, file counts",
        "inputSchema": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        },
    },
]


def read_file_tool(args):
    file_path = args.get("path", "")
    start_line = args.get("start_line", 1)
    end_line = args.get("end_line")
    if not file_path or not os.path.exists(file_path):
        return f"File not found: {file_path}"
    try:
        if not os.path.isfile(file_path):
            return f"{file_path} is a directory, use list_files instead"
        size = os.path.getsize(file_path)
        if size > 1024 * 1024:
            return f"File too large ({size/1024/1024:.1f}MB). Max 1MB."
        with open(file_path, 'r', errors='replace') as f:
            content = f.read()
        lines = content.split('\n')
        if not end_line:
            end_line = min(start_line + 100, len(lines))
        sliced = lines[start_line-1:end_line]
        header = f"File: {file_path} ({len(lines)} lines, {size/1024:.1f}KB)\nShowing lines {start_line}-{end_line}:\n\n"
        return header + '\n'.join(f"{start_line+i}|{l}" for i, l in enumerate(sliced))
    except Exception as e:
        return f"Error: {e}"


def list_files_tool(args):
    dir_path = args.get("path", "")
    recursive = args.get("recursive", False)
    glob_filter = args.get("glob")
    if not dir_path or not os.path.exists(dir_path):
        return f"Directory not found: {dir_path}"
    try:
        if recursive:
            files = []
            for root, dirs, fnames in os.walk(dir_path):
                dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', 'target', 'dist')]
                for fn in fnames:
                    if glob_filter:
                        import fnmatch
                        if not fnmatch.fnmatch(fn, glob_filter):
                            continue
                    files.append(os.path.join(root, fn))
                if len(files) >= 500:
                    break
            out = f"{dir_path} ({len(files)} files)\n\n"
            dirs_map = {}
            for f in files:
                rel = os.path.relpath(f, dir_path)
                d = os.path.dirname(rel) or '.'
                dirs_map.setdefault(d, []).append(os.path.basename(f))
            for d in sorted(dirs_map.keys()):
                out += f"{d}/\n"
                for fn in dirs_map[d]:
                    out += f"  {fn}\n"
            return out
        else:
            entries = sorted(os.listdir(dir_path), key=lambda x: (not os.path.isdir(os.path.join(dir_path, x)), x))
            out = f"{dir_path}/\n\n"
            for e in entries:
                full = os.path.join(dir_path, e)
                if os.path.isdir(full):
                    out += f"  DIR  {e}/\n"
                else:
                    sz = os.path.getsize(full)
                    sz_str = f"{sz/1024/1024:.1f}MB" if sz > 1024*1024 else f"{sz/1024:.1f}KB" if sz > 1024 else f"{sz}B"
                    out += f"  FILE {e} ({sz_str})\n"
            return out
    except Exception as e:
        return f"Error: {e}"


def code_stats_tool(args):
    dir_path = args.get("path", "")
    if not os.path.exists(dir_path):
        return f"Not found: {dir_path}"
    try:
        ext_counts = {}
        ext_lines = {}
        total_lines = 0
        total_size = 0
        file_count = 0
        for root, dirs, files in os.walk(dir_path):
            dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', 'target', 'dist', '.zig-cache')]
            for f in files:
                if file_count >= 5000:
                    break
                fp = os.path.join(root, f)
                ext = os.path.splitext(f)[1] or os.path.basename(f)
                ext_counts[ext] = ext_counts.get(ext, 0) + 1
                try:
                    size = os.path.getsize(fp)
                    total_size += size
                    if size < 512 * 1024:
                        with open(fp, 'rb') as fh:
                            n_lines = fh.read().count(b'\n') + 1
                        ext_lines[ext] = ext_lines.get(ext, 0) + n_lines
                        total_lines += n_lines
                except:
                    pass
                file_count += 1
        lang_map = {'.js':'JavaScript','.ts':'TypeScript','.py':'Python','.go':'Go','.rs':'Rust','.zig':'Zig',
                    '.swift':'Swift','.c':'C','.cpp':'C++','.h':'C/C++ Header','.java':'Java','.rb':'Ruby',
                    '.md':'Markdown','.json':'JSON','.yaml':'YAML','.yml':'YAML','.toml':'TOML','.html':'HTML','.css':'CSS','.sh':'Shell'}
        out = f"Code Stats [Python]: {dir_path}\n{'='*50}\n\n"
        out += f"Total: {file_count} files, {total_lines:,} lines, {total_size/1024/1024:.1f}MB\n\nLanguage Breakdown:\n"
        for ext, lines in sorted(ext_lines.items(), key=lambda x: -x[1]):
            lang = lang_map.get(ext, ext)
            count = ext_counts.get(ext, 0)
            pct = (lines / total_lines * 100) if total_lines else 0
            out += f"  {lang:<20} {lines:>8} lines  {count:>4} files  {pct:.1f}%\n"
        return out
    except Exception as e:
        return f"Error: {e}"


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
        lines = output.split("\n")[:max_results]
        return "\n".join(lines)
    except subprocess.TimeoutExpired:
        return "Error: search timed out"
    except Exception as e:
        return f"Error: {e}"


def find_spec_files(dir_path):
    specs = []
    common = ["openapi.json", "openapi.yaml", "openapi.yml",
              "swagger.json", "swagger.yaml", "swagger.yml"]
    for name in common:
        p = os.path.join(dir_path, name)
        if os.path.isfile(p):
            specs.append(p)

    if not specs:
        for root, dirs, files in os.walk(dir_path):
            dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', 'target')]
            depth = root.replace(dir_path, '').count(os.sep)
            if depth > 3:
                dirs.clear()
                continue
            for f in files:
                if f.endswith(('.json', '.yaml', '.yml')):
                    fp = os.path.join(root, f)
                    try:
                        with open(fp, 'r') as fh:
                            head = fh.read(200)
                        if 'openapi' in head or 'swagger' in head:
                            specs.append(fp)
                    except:
                        pass
            if len(specs) >= 20:
                break
    return specs


def parse_spec(file_path):
    with open(file_path, 'r') as f:
        content = f.read()
    return json.loads(content)


METHODS = {"get", "post", "put", "delete", "patch", "options", "head"}


def openapi_search(args):
    dir_path = args.get("path", ".")
    query = args.get("query", "")
    mode = args.get("mode", "search")
    method_filter = args.get("method", "")

    t0 = time.time()
    specs = find_spec_files(dir_path)
    find_ms = int((time.time() - t0) * 1000)

    if not specs:
        return f"No OpenAPI/Swagger specs found in {dir_path} (scanned in {find_ms}ms)"

    out = f"OpenAPI Search [Python]: {dir_path}\n{'='*50}\nFound {len(specs)} spec(s) in {find_ms}ms\n\n"

    for spec_file in specs[:5]:
        t_parse = time.time()
        try:
            spec = parse_spec(spec_file)
        except Exception as e:
            out += f"{spec_file}: parse error — {e}\n\n"
            continue

        parse_ms = int((time.time() - t_parse) * 1000)
        version = spec.get("openapi", spec.get("swagger", "?"))
        title = spec.get("info", {}).get("title", os.path.basename(spec_file))
        paths = spec.get("paths", {})
        schemas = spec.get("components", {}).get("schemas", spec.get("definitions", {}))

        endpoint_count = 0
        for p in paths.values():
            endpoint_count += len([m for m in p if m in METHODS])

        rel = os.path.relpath(spec_file, dir_path)
        out += f"## {title} ({version})\nFile: {rel} | {endpoint_count} endpoints, {len(schemas)} schemas | parsed {parse_ms}ms\n"
        desc = spec.get("info", {}).get("description", "")
        if desc:
            out += desc[:200] + "\n"
        out += "\n"

        q = query.lower()

        if mode == "endpoints" or (mode == "search" and not query):
            out += "Endpoints:\n"
            for path, methods in paths.items():
                for method, detail in methods.items():
                    if method not in METHODS:
                        continue
                    if method_filter and method != method_filter.lower():
                        continue
                    summary = detail.get("summary", detail.get("operationId", ""))
                    out += f"  {method.upper():<7} {path}"
                    if summary:
                        out += f" -- {summary}"
                    out += "\n"
            out += "\n"

        if mode == "schemas" or (mode == "search" and not query):
            out += "Schemas:\n"
            for name, schema in schemas.items():
                stype = schema.get("type", "object")
                props = list(schema.get("properties", {}).keys())[:8]
                out += f"  {name} ({stype})"
                if props:
                    out += f" -- {', '.join(props)}"
                out += "\n"
            out += "\n"

        if mode == "search" and query:
            matches = 0
            out += f'Search: "{query}"\n\n'
            for path, methods in paths.items():
                for method, detail in methods.items():
                    if method not in METHODS:
                        continue
                    if method_filter and method != method_filter.lower():
                        continue
                    haystack = f"{path} {method} {detail.get('summary','')} {detail.get('operationId','')}".lower()
                    if q in haystack:
                        matches += 1
                        summary = detail.get("summary", "")
                        op_id = detail.get("operationId", "")
                        out += f"  {method.upper():<7} {path}\n"
                        if summary:
                            out += f"          summary: {summary}\n"
                        if op_id:
                            out += f"          operationId: {op_id}\n"
                        out += "\n"

            for name, schema in schemas.items():
                if q in name.lower():
                    matches += 1
                    out += f"  Schema: {name} ({schema.get('type','object')})\n\n"

            out += f"{matches} match(es)\n\n"

        if mode == "detail" and query:
            for path, methods in paths.items():
                if q not in path.lower():
                    continue
                for method, detail in methods.items():
                    if method not in METHODS:
                        continue
                    out += f"  {method.upper():<7} {path}\n"
                    if detail.get("summary"):
                        out += f"    summary: {detail['summary']}\n"
                    if detail.get("operationId"):
                        out += f"    operationId: {detail['operationId']}\n"
                    if detail.get("parameters"):
                        params = [f"{p.get('name','?')}({p.get('in','?')})" for p in detail["parameters"]]
                        out += f"    params: {', '.join(params)}\n"
                    if detail.get("responses"):
                        out += f"    responses: {', '.join(detail['responses'].keys())}\n"
                    out += "\n"

    total_ms = int((time.time() - t0) * 1000)
    out += f"Total: {total_ms}ms\n"
    return out


def handle_request(req):
    method = req.get("method", "")
    req_id = req.get("id")
    params = req.get("params", {})

    if method == "initialize":
        return {"jsonrpc": "2.0", "id": req_id, "result": SERVER_INFO}
    elif method == "tools/list":
        return {"jsonrpc": "2.0", "id": req_id, "result": {"tools": TOOLS}}
    elif method == "tools/call":
        tool_name = params.get("name", "grep_search")
        args = params.get("arguments", {})
        if tool_name == "openapi_search":
            text = openapi_search(args)
        elif tool_name == "read_file":
            text = read_file_tool(args)
        elif tool_name == "list_files":
            text = list_files_tool(args)
        elif tool_name == "code_stats":
            text = code_stats_tool(args)
        else:
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
