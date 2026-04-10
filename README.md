# Milli-Agent

**A cockpit for code.** Drop a GitHub URL, get a security audit, dependency report, code map, and AI walkthrough — in parallel, in seconds, with citations you can click.

Built on 5 MCP servers (C++, Rust, Swift, Python, Zig), 34+ tools, and a multi-model LLM backend. Every answer is verified against the source before it ships.

---

## Why use it

Most code-analysis tools make you pick one thing: either fast grep, or AI chat, or a security scanner, or a dependency auditor. Milli-Agent runs all of them on the same repo at the same time and gives you one screen to read.

- **Mission Control (Cockpit)** — one view, six scores, all scanners running in parallel.
- **Verified answers** — every chat response is graded against the files it cites; hallucinations get flagged with a `MOSTLY_HALLUCINATED` badge.
- **Race the runtimes** — same query, side-by-side, across C++/Rust/Swift/Python ripgrep wrappers. Pick whichever is fastest for your machine.
- **Real CVE data** — `dependency_audit` runs `npm audit` / `pip-audit` / `cargo audit` against the repo, not a static rule list.
- **Self-host friendly** — works with OpenRouter, Ollama, llama.cpp, or LM Studio. No telemetry.

If you've ever done `git clone … && grep -r … && npm audit && cat package.json` over and over to vet a repo, this is the one window that does all of that.

---

## Quick start

```bash
git clone https://github.com/walter-grace/milli-agent.git
cd milli-agent
npm install
./bin/build.sh                     # builds C++/Rust/Swift/Zig MCP servers
export OPENROUTER_API_KEY=sk-or-v1-...   # optional — search/security work without it
node src/server.js
# → http://localhost:3000
```

If port 3000 is busy: `PORT=3030 node src/server.js`.

**Requirements:** Node 18+, ripgrep, and a C/C++ toolchain. Rust/Swift/Zig are optional — Python and Node fallbacks cover everything.

**Recommended extras** (auto-detected, scanners gracefully degrade if missing):

```bash
brew install ripgrep gitleaks fd universal-ctags difftastic
pipx install semgrep pip-audit
```

---

## The tabs

| Tab | What it does |
|---|---|
| **🛩 Cockpit** | The default view. Drop a URL → 7 scanners run in parallel → 6 score cards (Security / Quality / Complexity / Performance / Maintainability / Trust) + clickable findings list + inline code viewer. |
| **🔍 Search** | Instant ripgrep over a cloned repo. Sub-100ms results, split-pane code viewer with VS Code Dark+ syntax highlighting. |
| **💬 Chat** | Full agent loop with 34+ tools. Streams tool calls, renders markdown, attaches a trust badge to every response. Click any `file:line` citation to jump to the exact line. |
| **🏎 Compare** | Same prompt, multiple LLMs in parallel. Useful for "which model actually understands this codebase?" |
| **📡 API** | Upload an OpenAPI spec or auto-discover one in a cloned repo. Parses 8.9 MB Cloudflare spec in ~175 ms. Search endpoints/schemas; race servers. |
| **🛡 WhiteHat** | One-click security pipeline: 7 scans with a warp-speed loading animation and an A+ → D grade. |
| **🧬 Heal** | Clone → diagnose lint/test failures → AI generates a fix plan. (Fix-apply loop is in progress.) |

---

## What it actually does on a real repo

Below is a verbatim run from a fresh clone of [`tj/commander.js`](https://github.com/tj/commander.js) (220 files, 33,115 LOC, 1.1 MB) on an Apple M-series Mac. Numbers are from `POST /api/cockpit/analyze`.

### 1. Clone

```bash
$ curl -X POST http://localhost:3000/api/clone \
    -H 'Content-Type: application/json' \
    -d '{"repo":"tj/commander.js"}'
{"success":true,"path":".../repos/tj__commander.js"}
```

### 2. Race ripgrep across all 5 backends

```bash
$ curl -X POST http://localhost:3000/api/search/race \
    -H 'Content-Type: application/json' \
    -d '{"pattern":"function","path":".../tj__commander.js","max_results":20}'
```

| Server | Cold call | Notes |
|---|---|---|
| Rust | **9.3 ms** | winner |
| Python | 9.3 ms | CPython os.walk is C-optimized |
| C++ | 38 ms | popen subprocess overhead |
| Swift | 76 ms | first call, JIT |

### 3. One-click cockpit analysis

```bash
$ curl -N -X POST http://localhost:3000/api/cockpit/analyze \
    -H 'Content-Type: application/json' \
    -d '{"repo":"tj/commander.js"}'
```

The endpoint streams Server-Sent Events. Per-scan timings from this run:

```
code_stats             3155 ms   220 files / 33,115 LOC / 6 languages
repo_summary           3136 ms   README + manifest digest
deep_security_scan     3115 ms   OWASP regex + (semgrep if installed)
dependency_audit       2524 ms   npm audit → 8 real CVEs
secrets_scan            477 ms   gitleaks-style entropy + patterns
security_scan           294 ms   pattern-based fast pass
port_scan               139 ms   network exposure check
```

The seven scans run in parallel and finish in roughly the time of the slowest one.

**Real findings on commander.js:**

```
## Node.js (npm audit)
Packages scanned: 503
Vulnerabilities: critical=1 high=4 moderate=3 low=0

  [HIGH] glob@10.2.0 - 10.4.5
    glob CLI: Command injection via -c/--cmd executes matches with shell:true
    https://github.com/advisories/GHSA-5j98-mcp5-4vw2
    Fix: fix available

  [HIGH] minimatch@<=3.1.3 || 9.0.0 - 9.0.6
    minimatch has a ReDoS via repeated wildcards…
```

That's 8 real, current CVEs in the dev-dependency tree of one of npm's most-downloaded packages — surfaced by Milli-Agent in under 3 seconds without leaving the browser.

---

## Verification

Every chat response goes through `src/verifier.js` before it lands in your screen:

1. **Citation extraction** — pull every `file:line` reference and code block out of the answer.
2. **Byte-match re-read** — re-open each cited file and confirm the quoted lines actually exist where the model said they did.
3. **Coverage score** — 4-gram overlap between the response and the tool output corpus.
4. **Frontier judge** — a second LLM (configurable; default Gemma 4 26B via OpenRouter) grades how grounded the response is.

You get one of:

`GROUNDED` · `LIKELY_GROUNDED` · `LOW_CONFIDENCE` · `PARTIALLY_HALLUCINATED` · `MOSTLY_HALLUCINATED` · `UNGROUNDED`

The badge sits under the chat response and is clickable for the full report.

---

## API

All endpoints accept `Content-Type: application/json`. Streaming endpoints use SSE.

### Repo

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/api/clone` | `{"repo":"owner/name"}` | Shallow-clone a GitHub repo into `repos/`. |
| `GET`  | `/api/repos` | — | List currently cloned repos. |
| `POST` | `/api/file/read` | `{"path","start_line","end_line"}` | Read a slice of a file. |

### Search

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/search/direct` | One-shot ripgrep through a chosen MCP server (`impl`: `cpp`/`rust`/`swift`/`python`/`zig`). |
| `POST` | `/api/search/race` | Run the same query across all servers, return them ranked by elapsed time. |
| `GET`  | `/api/search/stream` | SSE variant for the search tab. |
| `POST` | `/api/search/analyze` | Search + AI summary. |

### Cockpit (Mission Control)

```bash
POST /api/cockpit/analyze
Content-Type: application/json

{ "repo": "owner/name" }       # OR { "path": "/abs/path/to/repo" }
```

Streams these SSE events:

| Event | Payload |
|---|---|
| `step` | `{name, status: running\|done\|error, label, elapsed?, findings?, text?}` |
| `finding` | `{scan, file, line, severity}` — clickable citations |
| `scores` | `{security, quality, complexity, performance, maintainability, trust}` (0–100 each) |
| `complete` | `{totalFindings, scanCount, scores, grade, repoPath}` |

### Chat (agent loop)

```bash
POST /api/chat/stream
{ "message": "...", "model": "google/gemma-4-26b-a4b-it", "impl": "rust" }
```

Streams tool calls, content tokens, and a verification badge.

### Security audit (sequential, with per-step warp animation)

```bash
POST /api/security/audit
{ "repo": "owner/name" }
```

### OpenAPI

| Method | Path |
|---|---|
| `POST` | `/api/openapi/upload` |
| `POST` | `/api/openapi/search` |
| `POST` | `/api/openapi/race` |

### Models / health / costs

| Method | Path |
|---|---|
| `GET` | `/api/models` |
| `GET` | `/api/models/health` |
| `GET` | `/api/costs` |
| `GET` | `/api/impls` |
| `POST` | `/api/warmup` |

---

## Architecture

```
┌─────────────────────────── Browser (vanilla JS SPA) ───────────────────────────┐
│  Cockpit · Search · Chat · Compare · API · WhiteHat · Heal                    │
└──────────────────────────────────────┬─────────────────────────────────────────┘
                                       │ SSE + JSON
                       ┌───────────────▼───────────────┐
                       │   Node.js / Express server    │
                       │   src/server.js               │
                       └─┬──────────────┬──────────┬───┘
                         │              │          │
            ┌────────────▼──┐  ┌────────▼─────┐ ┌──▼───────────────┐
            │  MCP servers  │  │  Tool layer  │ │  LLM backend     │
            │  (stdio/JSON) │  │  src/tools.js│ │  OpenRouter /    │
            │               │  │  34+ tools   │ │  Ollama / local  │
            │  C++  · Rust  │  │  10 tiers    │ │                  │
            │  Swift · Py   │  │              │ │  +  Verifier     │
            │  Zig          │  │              │ │  src/verifier.js │
            └───────┬───────┘  └──────┬───────┘ └──────────────────┘
                    │                 │
                ┌───▼───┐         ┌───▼─────────────────────────────┐
                │ripgrep│         │ git · semgrep · gitleaks · trivy │
                └───────┘         │ npm audit · pip-audit · cargo    │
                                  │ ast-grep · ctags · difftastic    │
                                  └──────────────────────────────────┘
```

### MCP servers

Five from-scratch implementations of the same MCP tools, all speaking JSON-RPC over stdio.

| Server | Implements | Notes |
|---|---|---|
| C++ | `grep_search`, `read_file`, `list_files`, `code_stats`, `openapi_search` | smallest binary (~40 KB) |
| Rust | same | tightest cold call (~9 ms on small repos) |
| Swift | same | macOS-native FileManager |
| Python | same | wins `code_stats` (CPython `os.walk` is C-fast) |
| Zig | `grep_search` only | 0.15 stdlib changes blocked the rest |

Switch between them in the sidebar; the active impl handles all routable tool calls.

### The 34+ tools (10 tiers)

- **Search** — `clone_repo`, `grep_search`, `read_file`, `list_files`, `find_references`
- **Git** — `git_log`, `git_diff`, `git_summary`, `git_effort`, `git_authors`, `git_timeline`, `git_secrets_clean`
- **Analysis** — `code_stats`, `dependency_graph`, `compare_repos`, `repo_summary`, `knowledge_graph`
- **Security** — `security_scan`, `deep_security_scan` (OWASP/semgrep), `dependency_audit` (CVE), `secrets_scan` (gitleaks)
- **Infra** — `trivy_scan`, `port_scan`, `sandbox_exec`
- **Self-heal** — `code_edit`, `code_write`, `self_heal`
- **File / LSP** — `fast_find`, `lsp_symbols`, `lsp_definitions`, `lsp_diagnostics`
- **AST** — `ast_search`, `symbol_map`, `struct_diff`, `shell_lint`
- **API** — `openapi_search`
- **Code Mode** — `tool_search`, `tool_run` (fallback meta-tools)

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `OPENROUTER_API_KEY` | — | Cloud LLM key (optional). |
| `LOCAL_LLM_URL` | `http://localhost:8080/v1/chat/completions` | OpenAI-compatible local endpoint. |
| `LOCAL_LLM_MODEL` | `local` | Model name to send to the local endpoint. |

### Local LLM examples

```bash
# llama.cpp
./llama-server -m model.gguf -c 4096 --port 8080
node src/server.js

# Ollama
ollama serve
LOCAL_LLM_URL=http://localhost:11434/v1/chat/completions \
LOCAL_LLM_MODEL=qwen3:8b node src/server.js

# LM Studio
LOCAL_LLM_URL=http://localhost:1234/v1/chat/completions node src/server.js
```

Pick "Local LLM" from the model dropdown. Zero cloud cost, zero outbound traffic.

---

## Notes & honest limitations

- **Cockpit scores are heuristic.** They're a useful at-a-glance signal, not a certification. Always read the per-scan output before acting.
- **`dependency_audit` requires the package manager** (`npm`, `pip-audit`, `cargo`) to be installed locally. Missing tools degrade gracefully with a hint.
- **Self-heal currently generates plans, not patches.** The apply-and-test loop is the next milestone.
- **The Zig MCP server only ships `grep_search`** because of the 0.14 → 0.15 stdlib break.
- **Fly.io deployment is paused** — the public preview at `milli-agent.fly.dev` may be down. Run locally for now.

---

## License

MIT
