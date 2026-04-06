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

let rgPaths = ["/usr/bin/rg", "/usr/local/bin/rg", "/opt/homebrew/bin/rg",
               NSHomeDirectory() + "/.cargo/bin/rg"]
let rgPath = rgPaths.first { FileManager.default.fileExists(atPath: $0) } ?? "rg"

func grepSearch(args: [String: Any]) -> String {
    let pattern = args["pattern"] as? String ?? ""
    let path = args["path"] as? String ?? "."
    let globFilter = args["glob"] as? String
    let caseInsensitive = args["case_insensitive"] as? Bool ?? false
    let maxResults = args["max_results"] as? Int ?? 100

    let process = Process()
    process.executableURL = URL(fileURLWithPath: rgPath)
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

func findSpecFiles(dir: String) -> [String] {
    var specs: [String] = []
    let fm = FileManager.default
    let names = ["openapi.json", "openapi.yaml", "openapi.yml",
                 "swagger.json", "swagger.yaml", "swagger.yml"]

    for name in names {
        let p = (dir as NSString).appendingPathComponent(name)
        if fm.fileExists(atPath: p) { specs.append(p) }
    }

    if specs.isEmpty {
        // Broader search
        if let enumerator = fm.enumerator(atPath: dir) {
            var count = 0
            while let file = enumerator.nextObject() as? String, count < 50 {
                let components = file.components(separatedBy: "/")
                if components.contains(".git") || components.contains("node_modules") { continue }
                if components.count > 4 { continue }
                if file.hasSuffix(".json") || file.hasSuffix(".yaml") || file.hasSuffix(".yml") {
                    let fp = (dir as NSString).appendingPathComponent(file)
                    if let data = fm.contents(atPath: fp), data.count > 10 {
                        let head = String(data: data.prefix(200), encoding: .utf8) ?? ""
                        if head.contains("openapi") || head.contains("swagger") {
                            specs.append(fp)
                            count += 1
                        }
                    }
                }
            }
        }
    }
    return specs
}

struct PathEntry {
    let path: String
    let method: String
    let summary: String
    let operationId: String
}

struct SchemaEntry {
    let name: String
    let type: String
    let properties: [String]
}

let httpMethods: Set<String> = ["get", "post", "put", "delete", "patch", "options", "head"]

func parseOpenAPI(content: Data) -> (paths: [PathEntry], schemas: [SchemaEntry], title: String, version: String) {
    guard let spec = try? JSONSerialization.jsonObject(with: content) as? [String: Any] else {
        return ([], [], "", "")
    }

    let info = spec["info"] as? [String: Any] ?? [:]
    let title = info["title"] as? String ?? ""
    let version = (spec["openapi"] as? String) ?? (spec["swagger"] as? String) ?? "?"

    var pathEntries: [PathEntry] = []
    if let pathsObj = spec["paths"] as? [String: Any] {
        for (path, value) in pathsObj {
            if let methods = value as? [String: Any] {
                for (method, detail) in methods {
                    guard httpMethods.contains(method) else { continue }
                    let det = detail as? [String: Any] ?? [:]
                    pathEntries.append(PathEntry(
                        path: path,
                        method: method,
                        summary: det["summary"] as? String ?? "",
                        operationId: det["operationId"] as? String ?? ""
                    ))
                }
            }
        }
    }

    var schemaEntries: [SchemaEntry] = []
    let schemasObj = (spec["components"] as? [String: Any])?["schemas"] as? [String: Any]
        ?? spec["definitions"] as? [String: Any] ?? [:]
    for (name, value) in schemasObj {
        let s = value as? [String: Any] ?? [:]
        let type = s["type"] as? String ?? "object"
        let props = (s["properties"] as? [String: Any])?.keys.prefix(8).map { String($0) } ?? []
        schemaEntries.append(SchemaEntry(name: name, type: type, properties: props))
    }

    return (pathEntries, schemaEntries, title, version)
}

func openapiSearch(args: [String: Any]) -> String {
    let dir = args["path"] as? String ?? "."
    let query = args["query"] as? String ?? ""
    let mode = args["mode"] as? String ?? "search"
    let methodFilter = args["method"] as? String ?? ""

    let t0 = Date().timeIntervalSinceReferenceDate
    let specs = findSpecFiles(dir: dir)
    let findMs = Int((Date().timeIntervalSinceReferenceDate - t0) * 1000)

    if specs.isEmpty {
        return "No OpenAPI/Swagger specs found in \(dir) (scanned in \(findMs)ms)"
    }

    var out = "OpenAPI Search [Swift]: \(dir)\n\(String(repeating: "=", count: 50))\nFound \(specs.count) spec(s) in \(findMs)ms\n\n"

    for specFile in specs.prefix(5) {
        let tParse = Date().timeIntervalSinceReferenceDate
        guard let data = FileManager.default.contents(atPath: specFile) else { continue }

        let (paths, schemas, title, version) = parseOpenAPI(content: data)
        let parseMs = Int((Date().timeIntervalSinceReferenceDate - tParse) * 1000)

        let displayTitle = title.isEmpty ? specFile : title
        out += "## \(displayTitle) (\(version))\nFile: \(specFile) | \(paths.count) endpoints, \(schemas.count) schemas | parsed \(parseMs)ms\n\n"

        let q = query.lowercased()

        if mode == "endpoints" || (mode == "search" && query.isEmpty) {
            out += "Endpoints:\n"
            for pe in paths {
                if !methodFilter.isEmpty && pe.method != methodFilter.lowercased() { continue }
                let m = pe.method.uppercased().padding(toLength: 7, withPad: " ", startingAt: 0)
                out += "  \(m) \(pe.path)"
                if !pe.summary.isEmpty { out += " -- \(pe.summary)" }
                out += "\n"
            }
            out += "\n"
        }

        if mode == "schemas" || (mode == "search" && query.isEmpty) {
            out += "Schemas:\n"
            for se in schemas {
                out += "  \(se.name) (\(se.type))"
                if !se.properties.isEmpty { out += " -- \(se.properties.joined(separator: ", "))" }
                out += "\n"
            }
            out += "\n"
        }

        if mode == "search" && !query.isEmpty {
            var matches = 0
            out += "Search: \"\(query)\"\n\n"

            for pe in paths {
                if !methodFilter.isEmpty && pe.method != methodFilter.lowercased() { continue }
                let haystack = "\(pe.path) \(pe.method) \(pe.summary) \(pe.operationId)".lowercased()
                if haystack.contains(q) {
                    matches += 1
                    let m = pe.method.uppercased().padding(toLength: 7, withPad: " ", startingAt: 0)
                    out += "  \(m) \(pe.path)\n"
                    if !pe.summary.isEmpty { out += "          summary: \(pe.summary)\n" }
                    if !pe.operationId.isEmpty { out += "          operationId: \(pe.operationId)\n" }
                    out += "\n"
                }
            }

            for se in schemas {
                if se.name.lowercased().contains(q) {
                    matches += 1
                    out += "  Schema: \(se.name) (\(se.type))\n\n"
                }
            }

            out += "\(matches) match(es)\n\n"
        }

        if mode == "detail" && !query.isEmpty {
            for pe in paths {
                if pe.path.lowercased().contains(q) {
                    let m = pe.method.uppercased().padding(toLength: 7, withPad: " ", startingAt: 0)
                    out += "  \(m) \(pe.path)\n"
                    if !pe.summary.isEmpty { out += "    summary: \(pe.summary)\n" }
                    if !pe.operationId.isEmpty { out += "    operationId: \(pe.operationId)\n" }
                    out += "\n"
                }
            }
        }
    }

    let totalMs = Int((Date().timeIntervalSinceReferenceDate - t0) * 1000)
    out += "Total: \(totalMs)ms\n"
    return out
}

// Tool definitions for tools/list
let toolDefs: [[String: Any]] = [
    [
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
    ] as [String: Any],
    [
        "name": "openapi_search",
        "description": "Search OpenAPI specs at milli-speed",
        "inputSchema": [
            "type": "object",
            "properties": [
                "path": ["type": "string", "description": "Directory with specs"],
                "query": ["type": "string", "description": "Search query"],
                "mode": ["type": "string", "description": "endpoints|schemas|search|detail"],
                "method": ["type": "string", "description": "HTTP method filter"]
            ],
            "required": ["path"]
        ] as [String: Any]
    ] as [String: Any]
]

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
            "serverInfo": ["name": "mcp-grep-swift", "version": "0.2.0"]
        ])
    case "tools/list":
        response = respond(id: id, result: ["tools": toolDefs])
    case "tools/call":
        let toolName = params["name"] as? String ?? "grep_search"
        let args = params["arguments"] as? [String: Any] ?? [:]
        let text: String
        if toolName == "openapi_search" {
            text = openapiSearch(args: args)
        } else {
            text = grepSearch(args: args)
        }
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
