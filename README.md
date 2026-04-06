# Milli-Agent

Millisecond code search agent. 4 MCP server implementations (C++, Rust, Swift, Python) racing ripgrep. Sub-100ms search results with optional AI analysis.

## Quick Start

```bash
# Install
git clone https://github.com/YOUR_USER/milli-agent.git
cd milli-agent
npm install

# Build MCP servers
chmod +x bin/build.sh && ./bin/build.sh

# Run (set your OpenRouter API key for AI features)
export OPENROUTER_API_KEY="your-key"
npm start

# Open http://localhost:3000
```

## Docker

```bash
docker build -t milli-agent .
docker run -p 3000:3000 -e OPENROUTER_API_KEY=your-key milli-agent
```

## Features

- **Milli-Search**: Direct ripgrep search in <100ms. No LLM delay.
- **AI Analysis**: Optional — click "Analyze with AI" to get LLM summary of results.
- **Chat Mode**: Full agent loop — LLM calls grep_search tool, analyzes results.
- **Compare Mode**: Same prompt through all 4 MCP servers simultaneously.
- **GitHub Clone**: Paste a repo URL — auto-clones and searches.
- **Cost Tracking**: Real-time cost meter for OpenRouter API usage.

## MCP Servers

| Server | Binary | Search (5K files) | Memory |
|--------|--------|-------------------|--------|
| C++    | 40 KB  | 46ms              | 6.4 MB |
| Rust   | 378 KB | 72ms              | 7.0 MB |
| Python | script | 65ms              | 13.6 MB|
| Swift  | 63 KB  | 137ms             | 8.4 MB |

## Architecture

```
Browser → Express (port 3000)
              ├── /api/search/direct  → MCP Server → ripgrep (instant)
              ├── /api/search/analyze → OpenRouter LLM (optional)
              ├── /api/chat/stream    → LLM + MCP Server (agent loop)
              └── /api/clone          → git clone
```

## License

MIT
