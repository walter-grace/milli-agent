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

        // Minimal JSON parsing — find method
        const method = jsonGetString(line, "\"method\"") orelse continue;
        const id_str = jsonGetRawValue(line, "\"id\"") orelse "null";

        if (std.mem.eql(u8, method, "initialize")) {
            try stdout.print("{{\"jsonrpc\":\"2.0\",\"id\":{s},\"result\":{{\"protocolVersion\":\"2024-11-05\",\"capabilities\":{{\"tools\":{{\"listChanged\":false}}}},\"serverInfo\":{{\"name\":\"mcp-grep-zig\",\"version\":\"0.1.0\"}}}}}}\n", .{id_str});
        } else if (std.mem.eql(u8, method, "tools/list")) {
            try stdout.print("{{\"jsonrpc\":\"2.0\",\"id\":{s},\"result\":{{\"tools\":[{{\"name\":\"grep_search\",\"description\":\"Search files using ripgrep\",\"inputSchema\":{{\"type\":\"object\",\"properties\":{{\"pattern\":{{\"type\":\"string\",\"description\":\"Search pattern (regex)\"}},\"path\":{{\"type\":\"string\",\"description\":\"Directory to search\"}},\"max_results\":{{\"type\":\"integer\",\"description\":\"Max results\"}}}},\"required\":[\"pattern\"]}}}}]}}}}\n", .{id_str});
        } else if (std.mem.eql(u8, method, "tools/call")) {
            const result = handleToolCall(line) catch "Error executing search";
            // Escape the result for JSON
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
    // Strip quotes if present (value might be "5" or 5)
    if (max_str.len >= 2 and max_str[0] == '"') max_str = max_str[1..max_str.len-1];


    var argv_buf: [20][]const u8 = undefined;
    var argc: usize = 0;

    argv_buf[argc] = "/Users/bigneek/.cargo/bin/rg";
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

fn jsonGetString(json: []const u8, key: []const u8) ?[]const u8 {
    const key_pos = std.mem.indexOf(u8, json, key) orelse return null;
    const after_key = json[key_pos + key.len ..];
    // Find opening quote after colon
    const colon = std.mem.indexOf(u8, after_key, ":") orelse return null;
    const after_colon = after_key[colon + 1 ..];
    const open_q = std.mem.indexOf(u8, after_colon, "\"") orelse return null;
    const str_start = open_q + 1;
    // Find closing quote (handle escaped quotes)
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
    // Skip whitespace
    while (start < after_key.len and (after_key[start] == ' ' or after_key[start] == '\t')) : (start += 1) {}
    // Find end (comma, brace, bracket)
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

fn std_mem_startsWith(comptime T: type, haystack: []const T, needle: []const T) bool {
    if (needle.len > haystack.len) return false;
    return std.mem.eql(T, haystack[0..needle.len], needle);
}
