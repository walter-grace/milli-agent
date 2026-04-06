const std = @import("std");

const allocator = std.heap.page_allocator;

pub fn main() !void {
    const stdin = std.io.getStdIn().reader();
    const stdout = std.io.getStdOut().writer();

    var buf: [65536]u8 = undefined;

    while (true) {
        const line = stdin.readUntilDelimiter(&buf, '\n') catch |err| {
            if (err == error.EndOfStream) break;
            return err;
        };

        if (line.len == 0) continue;

        const method = jsonGetString(line, "\"method\"") orelse continue;
        const id_str = jsonGetRawValue(line, "\"id\"") orelse "null";

        if (std.mem.eql(u8, method, "initialize")) {
            try stdout.print("{{\"jsonrpc\":\"2.0\",\"id\":{s},\"result\":{{\"protocolVersion\":\"2024-11-05\",\"capabilities\":{{\"tools\":{{\"listChanged\":false}}}},\"serverInfo\":{{\"name\":\"mcp-grep-zig\",\"version\":\"0.2.0\"}}}}}}\n", .{id_str});
        } else if (std.mem.eql(u8, method, "tools/list")) {
            try stdout.print("{{\"jsonrpc\":\"2.0\",\"id\":{s},\"result\":{{\"tools\":[{{\"name\":\"grep_search\",\"description\":\"Search files using ripgrep\",\"inputSchema\":{{\"type\":\"object\",\"properties\":{{\"pattern\":{{\"type\":\"string\",\"description\":\"Search pattern (regex)\"}},\"path\":{{\"type\":\"string\",\"description\":\"Directory to search\"}},\"max_results\":{{\"type\":\"integer\",\"description\":\"Max results\"}}}},\"required\":[\"pattern\"]}}}},{{\"name\":\"openapi_search\",\"description\":\"Search OpenAPI specs at milli-speed\",\"inputSchema\":{{\"type\":\"object\",\"properties\":{{\"path\":{{\"type\":\"string\",\"description\":\"Directory with specs\"}},\"query\":{{\"type\":\"string\",\"description\":\"Search query\"}},\"mode\":{{\"type\":\"string\",\"description\":\"endpoints|schemas|search|detail\"}},\"method\":{{\"type\":\"string\",\"description\":\"HTTP method filter\"}}}},\"required\":[\"path\"]}}}}]}}}}\n", .{id_str});
        } else if (std.mem.eql(u8, method, "tools/call")) {
            // Determine which tool
            const tool_name = jsonGetString(line, "\"name\"") orelse "grep_search";
            var result: []const u8 = undefined;

            if (std.mem.eql(u8, tool_name, "openapi_search")) {
                result = handleOpenAPISearch(line) catch "Error executing OpenAPI search";
            } else {
                result = handleToolCall(line) catch "Error executing search";
            }

            var escaped_buf: [65536]u8 = undefined;
            const escaped = jsonEscape(result, &escaped_buf);
            try stdout.print("{{\"jsonrpc\":\"2.0\",\"id\":{s},\"result\":{{\"content\":[{{\"type\":\"text\",\"text\":\"{s}\"}}]}}}}\n", .{ id_str, escaped });
        } else if (std.mem.startsWith(u8, method, "notifications/")) {
            continue;
        } else {
            try stdout.print("{{\"jsonrpc\":\"2.0\",\"id\":{s},\"error\":{{\"code\":-32601,\"message\":\"Method not found\"}}}}\n", .{id_str});
        }
    }
}

fn handleToolCall(line: []const u8) ![]const u8 {
    const args_start = std.mem.indexOf(u8, line, "\"arguments\"") orelse return "No arguments";
    const args_section = line[args_start..];

    const pattern = jsonGetString(args_section, "\"pattern\"") orelse return "No pattern found in args";
    const path = jsonGetString(args_section, "\"path\"") orelse ".";
    var max_str = jsonGetRawValue(args_section, "\"max_results\"") orelse "100";
    if (max_str.len >= 2 and max_str[0] == '"') max_str = max_str[1 .. max_str.len - 1];

    var argv_buf: [20][]const u8 = undefined;
    var argc: usize = 0;

    argv_buf[argc] = "rg";
    argc += 1;
    argv_buf[argc] = "--no-heading";
    argc += 1;
    argv_buf[argc] = "-n";
    argc += 1;
    argv_buf[argc] = "-m";
    argc += 1;
    argv_buf[argc] = max_str;
    argc += 1;
    argv_buf[argc] = "--color";
    argc += 1;
    argv_buf[argc] = "never";
    argc += 1;
    argv_buf[argc] = "--";
    argc += 1;
    argv_buf[argc] = pattern;
    argc += 1;
    argv_buf[argc] = path;
    argc += 1;

    const result = std.process.Child.run(.{
        .allocator = allocator,
        .argv = argv_buf[0..argc],
        .max_output_bytes = 65536,
    }) catch |err| {
        _ = std.io.getStdErr().writer().print("Zig rg error: {s}\n", .{@errorName(err)}) catch {};
        return "Error running ripgrep";
    };

    if (result.stdout.len == 0) return "No matches found.";
    return result.stdout;
}

fn handleOpenAPISearch(line: []const u8) ![]const u8 {
    const args_start = std.mem.indexOf(u8, line, "\"arguments\"") orelse return "No arguments";
    const args_section = line[args_start..];

    const dir = jsonGetString(args_section, "\"path\"") orelse ".";
    const query = jsonGetString(args_section, "\"query\"") orelse "";
    const mode = jsonGetString(args_section, "\"mode\"") orelse "search";

    // Use find + rg to locate and search spec files, then parse output
    // For Zig, we delegate to a shell pipeline for JSON parsing since Zig lacks a JSON parser in stdlib
    // Strategy: use rg + jq-like extraction via shell commands for milli-speed

    // Build a shell command that finds specs, reads them, and extracts paths
    var cmd_buf: [4096]u8 = undefined;

    // First: check for common spec files
    const check_cmd = try std.fmt.bufPrint(&cmd_buf,
        "test -f \"{s}/openapi.json\" && echo \"{s}/openapi.json\" || " ++
        "(test -f \"{s}/swagger.json\" && echo \"{s}/swagger.json\" || " ++
        "find \"{s}\" -maxdepth 3 -name 'openapi.json' -o -name 'swagger.json' -o -name 'openapi.yaml' 2>/dev/null | head -5)",
        .{ dir, dir, dir, dir });

    const find_result = std.process.Child.run(.{
        .allocator = allocator,
        .argv = &[_][]const u8{ "sh", "-c", check_cmd },
        .max_output_bytes = 4096,
    }) catch return "Error finding spec files";

    if (find_result.stdout.len == 0) {
        return try std.fmt.allocPrint(allocator, "OpenAPI Search [Zig]: No specs found in {s}", .{dir});
    }

    // Get first spec file
    var spec_file: []const u8 = find_result.stdout;
    if (std.mem.indexOf(u8, spec_file, "\n")) |nl| {
        spec_file = spec_file[0..nl];
    }

    // Use rg to extract paths from the JSON spec — much faster than full JSON parse
    // For JSON OpenAPI: grep for path keys and method keys
    var search_cmd_buf: [8192]u8 = undefined;

    if (std.mem.eql(u8, mode, "endpoints") or (std.mem.eql(u8, mode, "search") and query.len == 0)) {
        // Extract all endpoint paths: find keys starting with /
        const search_cmd = try std.fmt.bufPrint(&search_cmd_buf,
            "rg -o '\"(/[^\"]+)\"\\s*:\\s*\\{{' --no-filename --no-line-number \"{s}\" 2>/dev/null | " ++
            "sed 's/\"//g; s/\\s*:\\s*{{//' | sort -u | head -500",
            .{spec_file});

        const paths_result = std.process.Child.run(.{
            .allocator = allocator,
            .argv = &[_][]const u8{ "sh", "-c", search_cmd },
            .max_output_bytes = 65536,
        }) catch return "Error searching spec";

        var out_buf: [65536]u8 = undefined;
        const header = try std.fmt.bufPrint(&out_buf,
            "OpenAPI Search [Zig]: {s}\n==================================================\nSpec: {s}\n\nEndpoints:\n{s}\nTotal: found via ripgrep\n",
            .{ dir, spec_file, if (paths_result.stdout.len > 0) paths_result.stdout else "No endpoints found" });
        return try allocator.dupe(u8, header);
    }

    if (std.mem.eql(u8, mode, "search") and query.len > 0) {
        // Search for query in the spec
        const search_cmd = try std.fmt.bufPrint(&search_cmd_buf,
            "rg -i --no-heading -n -m 50 '{s}' \"{s}\" 2>/dev/null | head -50",
            .{ query, spec_file });

        const search_result = std.process.Child.run(.{
            .allocator = allocator,
            .argv = &[_][]const u8{ "sh", "-c", search_cmd },
            .max_output_bytes = 65536,
        }) catch return "Error searching spec";

        var out_buf: [65536]u8 = undefined;
        const header = try std.fmt.bufPrint(&out_buf,
            "OpenAPI Search [Zig]: {s}\n==================================================\nSpec: {s}\nSearch: \"{s}\"\n\n{s}\n",
            .{ dir, spec_file, query, if (search_result.stdout.len > 0) search_result.stdout else "No matches" });
        return try allocator.dupe(u8, header);
    }

    if (std.mem.eql(u8, mode, "schemas")) {
        const search_cmd = try std.fmt.bufPrint(&search_cmd_buf,
            "rg -o '\"([A-Z][a-zA-Z0-9_]+)\"\\s*:\\s*\\{{\"type\"' --no-filename --no-line-number \"{s}\" 2>/dev/null | " ++
            "sed 's/\"//g; s/\\s*:\\s*{{\"type\"//' | sort -u | head -200",
            .{spec_file});

        const schemas_result = std.process.Child.run(.{
            .allocator = allocator,
            .argv = &[_][]const u8{ "sh", "-c", search_cmd },
            .max_output_bytes = 65536,
        }) catch return "Error searching schemas";

        var out_buf: [65536]u8 = undefined;
        const header = try std.fmt.bufPrint(&out_buf,
            "OpenAPI Search [Zig]: {s}\n==================================================\nSpec: {s}\n\nSchemas:\n{s}\n",
            .{ dir, spec_file, if (schemas_result.stdout.len > 0) schemas_result.stdout else "No schemas found" });
        return try allocator.dupe(u8, header);
    }

    return try std.fmt.allocPrint(allocator, "OpenAPI Search [Zig]: {s} — use mode=endpoints|schemas|search", .{dir});
}

fn jsonGetString(json: []const u8, key: []const u8) ?[]const u8 {
    const key_pos = std.mem.indexOf(u8, json, key) orelse return null;
    const after_key = json[key_pos + key.len ..];
    const colon = std.mem.indexOf(u8, after_key, ":") orelse return null;
    const after_colon = after_key[colon + 1 ..];
    const open_q = std.mem.indexOf(u8, after_colon, "\"") orelse return null;
    const str_start = open_q + 1;
    var i: usize = str_start;
    while (i < after_colon.len) : (i += 1) {
        if (after_colon[i] == '\\') {
            i += 1;
            continue;
        }
        if (after_colon[i] == '"') break;
    }
    return after_colon[str_start..i];
}

fn jsonGetRawValue(json: []const u8, key: []const u8) ?[]const u8 {
    const key_pos = std.mem.indexOf(u8, json, key) orelse return null;
    const after_key = json[key_pos + key.len ..];
    const colon = std.mem.indexOf(u8, after_key, ":") orelse return null;
    var start = colon + 1;
    while (start < after_key.len and (after_key[start] == ' ' or after_key[start] == '\t')) : (start += 1) {}
    var end = start;
    while (end < after_key.len) : (end += 1) {
        if (after_key[end] == ',' or after_key[end] == '}' or after_key[end] == ']') break;
    }
    if (start >= end) return null;
    return after_key[start..end];
}

fn jsonEscape(input: []const u8, out_buf: []u8) []const u8 {
    var pos: usize = 0;
    for (input) |c| {
        if (pos + 2 >= out_buf.len) break;
        switch (c) {
            '"' => {
                out_buf[pos] = '\\';
                pos += 1;
                out_buf[pos] = '"';
                pos += 1;
            },
            '\\' => {
                out_buf[pos] = '\\';
                pos += 1;
                out_buf[pos] = '\\';
                pos += 1;
            },
            '\n' => {
                out_buf[pos] = '\\';
                pos += 1;
                out_buf[pos] = 'n';
                pos += 1;
            },
            '\r' => {
                out_buf[pos] = '\\';
                pos += 1;
                out_buf[pos] = 'r';
                pos += 1;
            },
            '\t' => {
                out_buf[pos] = '\\';
                pos += 1;
                out_buf[pos] = 't';
                pos += 1;
            },
            else => {
                out_buf[pos] = c;
                pos += 1;
            },
        }
    }
    return out_buf[0..pos];
}
