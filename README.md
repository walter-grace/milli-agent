# Milli-Agent

Ultra-fast code search agent. Clone any GitHub repo and search it in milliseconds.

Built on ripgrep + MCP servers in C++, Rust, Zig, Swift, and Python — racing side-by-side. Optional AI analysis via OpenRouter or local LLMs.

**Web**: [milli-agent.fly.dev](https://milli-agent.fly.dev)

## Quick Start

### CLI (recommended)

```bash
# Install globally
npm install -g milli-agent

# Run the agent
milli-agent

# Opens at http://localhost:3000
```

Or run without installing:

```bash
npx milli-agent
```

### From source

```bash
git clone https://github.com/walter-grace/milli-agent.git
cd milli-agent
npm install

# Build all MCP servers (C++, Rust, Zig, Swift)
chmod +x bin/build.sh && ./bin/build.sh

# Set API key for AI features (optional — search works without it)
export OPENROUTER_API_KEY="your-key"

# Start
npm start
```

### Docker

```bash
docker build -t milli-agent .
docker run -p 3000:3000 -e OPENROUTER_API_KEY=your-key milli-agent
```

## What it does

Paste a GitHub URL. Repo gets cloned. Search it in <100ms.

```
You: Clone https://github.com/facebook/react and find all TODO comments

Milli-Agent:
  → clone_repo("facebook/react")         ✓ cloned
  → grep_search("TODO", path=react/)     ✓ 847 matches in 42ms
  
  Found 847 TODO comments across the React codebase...
```

### Three modes

| Mode | Speed | What it does |
|------|-------|-------------|
| **Search** | <100ms | Direct ripgrep — instant results, no LLM |
| **Chat** | 3-10s | Agent loop — LLM calls grep_search, analyzes results |
| **Compare** | <100ms | Same query through all MCP servers side-by-side |

## Features

- **Millisecond search** — ripgrep through MCP servers, sub-100ms results
- **Clone any repo** — paste a GitHub URL, auto-clones and indexes
- **AI analysis** — optional LLM summarizes what it found (OpenRouter or local)
- **Compare servers** — race C++, Rust, Zig, Swift, Python on the same query
- **Cost tracking** — real-time cost meter for API usage
- **Local LLM support** — works with llama.cpp, Ollama, LM Studio
- **CLI + Web** — terminal agent or browser UI

## Architecture

```
                    ┌─────────────────────────────────┐
                    │         Milli-Agent              │
                    │         (Node.js)                │
                    └──────┬──────────────┬────────────┘
                           │              │
              ┌────────────▼──┐    ┌──────▼───────┐
              │  MCP Servers  │    │  LLM Backend  │
              │  (stdio)      │    │  (optional)   │
              └───────┬───────┘    └──────┬────────┘
                      │                   │
        ┌─────┬───────┼───────┬─────┐     │
        │     │       │       │     │     │
       C++  Rust    Zig    Swift  Python  │
       40K  378K    91K    62K   script   │
        │     │       │       │     │     │
        └─────┴───────┼───────┴─────┘     │
                      │                   │
                  ┌───▼───┐        ┌──────▼──────┐
                  │ripgrep│        │ OpenRouter   │
                  │ (rg)  │        │ Ollama       │
                  └───────┘        │ llama.cpp    │
                                   └─────────────┘
```

## MCP Servers

Five implementations of the same MCP grep_search tool, benchmarked on Apple M4:

| Server | Binary | Search (5K files) | Memory | Language |
|--------|--------|-------------------|--------|----------|
| **C++** | 40 KB | 46ms | 6.4 MB | C++17 |
| **Swift** | 62 KB | 137ms | 8.4 MB | Swift 6 |
| **Zig** | 91 KB | ~50ms | ~5 MB | Zig 0.14 |
| **Rust** | 378 KB | 72ms | 7.0 MB | Rust |
| **Python** | script | 65ms | 13.6 MB | Python 3 |

All servers implement the [MCP protocol](https://modelcontextprotocol.io) over stdio and call ripgrep for the actual search.

## Local LLM Support

Use any OpenAI-compatible local server:

```bash
# With llama.cpp
./llama-server -m model.gguf -c 4096 --port 8080
LOCAL_LLM_URL=http://localhost:8080/v1/chat/completions milli-agent

# With Ollama
ollama serve
LOCAL_LLM_URL=http://localhost:11434/v1/chat/completions LOCAL_LLM_MODEL=qwen3:8b milli-agent

# With LM Studio
LOCAL_LLM_URL=http://localhost:1234/v1/chat/completions milli-agent
```

Select "Local LLM" in the model dropdown. Zero cost, zero latency to the cloud.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `OPENROUTER_API_KEY` | — | OpenRouter API key for cloud LLMs |
| `LOCAL_LLM_URL` | `http://localhost:8080/v1/chat/completions` | Local LLM endpoint |
| `LOCAL_LLM_MODEL` | `local` | Model name for local LLM |

## API

### Search (instant)

```bash
curl -X POST http://localhost:3000/api/search/direct \
  -H "Content-Type: application/json" \
  -d '{"pattern":"TODO","impl":"cpp","max_results":50}'
```

### Clone a repo

```bash
curl -X POST http://localhost:3000/api/clone \
  -H "Content-Type: application/json" \
  -d '{"repo":"facebook/react"}'
```

### Chat (agent loop)

```bash
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"Find all TODO comments","model":"google/gemma-4-26b-a4b-it","impl":"cpp"}'
```

### Race all servers

```bash
curl -X POST http://localhost:3000/api/search/race \
  -H "Content-Type: application/json" \
  -d '{"pattern":"error","max_results":20}'
```

## Requirements

- **Node.js** 18+
- **ripgrep** (`brew install ripgrep` / `cargo install ripgrep` / `apt install ripgrep`)
- **C++ compiler** (clang/gcc) for C++ MCP server
- **Rust** (optional) for Rust MCP server
- **Zig** (optional) for Zig MCP server
- **Swift** (optional, macOS only) for Swift MCP server

## Roadmap

- [ ] File read/write tools (full coding agent)
- [ ] AST-aware search (tree-sitter)
- [ ] Sandboxed code execution (Cloudflare Workers)
- [ ] Knowledge base / embeddings
- [ ] Picoclaw integration
- [ ] Terminal UI (TUI) mode

## License

MIT
