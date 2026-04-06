import Foundation

func jsonString(_ dict: [String: Any]) -> String {
    let data = try! JSONSerialization.data(withJSONObject: dict, options: [])
    return String(data: data, encoding: .utf8)!
}

func respond(id: Any, result: [String: Any]) -> String {
    let full: [String: Any] = ["jsonrpc": "2.0", "id": id, "result": result]
    return jsonString(full)
}

func respondError(id: Any, code: Int, message: String) -> String {
    let full: [String: Any] = ["jsonrpc": "2.0", "id": id, "error": ["code": code, "message": message]]
    return jsonString(full)
}

func grepSearch(args: [String: Any]) -> String {
    let pattern = args["pattern"] as? String ?? ""
    let path = args["path"] as? String ?? "."
    let globFilter = args["glob"] as? String
    let caseInsensitive = args["case_insensitive"] as? Bool ?? false
    let maxResults = args["max_results"] as? Int ?? 100

    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/Users/bigneek/.cargo/bin/rg")
    var arguments = ["--no-heading", "-n", "-m", String(maxResults)]
    if caseInsensitive { arguments.append("-i") }
    if let g = globFilter { arguments += ["--glob", g] }
    arguments += ["--", pattern, path]
    process.arguments = arguments

    let outPipe = Pipe()
    let errPipe = Pipe()
    process.standardOutput = outPipe
    process.standardError = errPipe

    do {
        try process.run()
        // Read output BEFORE waiting (avoids deadlock on large output)
        let data = outPipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        var output = String(data: data, encoding: .utf8) ?? ""
        if output.isEmpty { output = "No matches found." }
        let lines = output.components(separatedBy: "\n").prefix(maxResults)
        return lines.joined(separator: "\n")
    } catch {
        return "Error: \(error)"
    }
}

while let line = readLine() {
    guard !line.isEmpty,
          let data = line.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }

    let method = json["method"] as? String ?? ""
    let id = json["id"] ?? 0
    let params = json["params"] as? [String: Any] ?? [:]

    var response: String?
    switch method {
    case "initialize":
        response = respond(id: id, result: [
            "protocolVersion": "2024-11-05",
            "capabilities": ["tools": ["listChanged": false]],
            "serverInfo": ["name": "mcp-grep-swift", "version": "0.1.0"]
        ])
    case "tools/list":
        response = respond(id: id, result: [
            "tools": [[
                "name": "grep_search",
                "description": "Search files using ripgrep",
                "inputSchema": [
                    "type": "object",
                    "properties": [
                        "pattern": ["type": "string", "description": "Search pattern (regex)"],
                        "path": ["type": "string", "description": "Directory to search"],
                        "glob": ["type": "string", "description": "File glob filter"],
                        "case_insensitive": ["type": "boolean", "description": "Case insensitive"],
                        "max_results": ["type": "integer", "description": "Max results"]
                    ],
                    "required": ["pattern"]
                ] as [String: Any]
            ] as [String: Any]]
        ])
    case "tools/call":
        let args = params["arguments"] as? [String: Any] ?? [:]
        let text = grepSearch(args: args)
        response = respond(id: id, result: [
            "content": [["type": "text", "text": text]]
        ])
    case let m where m.hasPrefix("notifications/"):
        continue
    default:
        response = respondError(id: id, code: -32601, message: "Method not found")
    }

    if let resp = response {
        print(resp)
        fflush(stdout)
    }
}
