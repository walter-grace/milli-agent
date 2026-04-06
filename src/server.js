import express from 'express';
import cors from 'cors';
import { spawn, execSync } from 'child_process';
import { createInterface } from 'readline';
import { resolve } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';
import { ALL_TOOLS, executeTool, TOOL_SEARCH_TOOL, TOOL_RUN_TOOL } from './tools.js';
import { ReceiptLedger, verify, quorumDiff } from './verifier.js';

// Code Mode: only 3 tools sent to LLM (tool_search, tool_run, clone_repo, grep_search)
// instead of all 30. Saves ~5,000 prompt tokens per request.
// LLM uses tool_search to discover, tool_run to execute.

const app = express();
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`→ ${req.method} ${req.url}`);
  res.on('finish', () => console.log(`← ${req.method} ${req.url} ${res.statusCode} ${Date.now()-start}ms`));
  next();
});

import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.MILLI_ROOT || resolve(__dirname, '..');

// Support both dev (mcp-grep-bench) and prod (milli-agent) layouts
const BASE = existsSync(resolve(ROOT, 'src/mcp-servers')) ? ROOT : resolve(homedir(), 'mcp-grep-bench');
const CORPUS = existsSync(resolve(BASE, 'test-corpus')) ? resolve(BASE, 'test-corpus') : resolve(homedir(), 'mcp-grep-bench/test-corpus');
const MCP = existsSync(resolve(ROOT, 'src/mcp-servers')) ? resolve(ROOT, 'src/mcp-servers') : BASE;

const IMPL_CONFIGS = {
  cpp: {
    cmd: existsSync(resolve(MCP, 'cpp/mcp-grep-cpp')) ? resolve(MCP, 'cpp/mcp-grep-cpp') : resolve(BASE, 'cpp-mcp/mcp-grep-cpp'),
    args: []
  },
  rust: {
    cmd: existsSync(resolve(MCP, 'rust/target/release/mcp-grep-rust')) ? resolve(MCP, 'rust/target/release/mcp-grep-rust') : resolve(BASE, 'rust-mcp/target/release/mcp-grep-rust'),
    args: []
  },
  swift: {
    cmd: existsSync(resolve(MCP, 'swift/mcp-grep-swift')) ? resolve(MCP, 'swift/mcp-grep-swift') : resolve(BASE, 'swift-mcp/mcp-grep-swift'),
    args: []
  },
  python: {
    cmd: 'python3',
    args: [existsSync(resolve(MCP, 'python/server.py')) ? resolve(MCP, 'python/server.py') : resolve(BASE, 'python-mcp/server.py')]
  },
  zig: {
    cmd: existsSync(resolve(MCP, 'zig/zig-out/bin/mcp-grep-zig')) ? resolve(MCP, 'zig/zig-out/bin/mcp-grep-zig') : (existsSync(resolve(BASE, 'zig-mcp/mcp-grep-zig')) ? resolve(BASE, 'zig-mcp/mcp-grep-zig') : ''),
    args: [],
    disabled: process.platform === 'linux', // Zig MCP server has runtime issues on Linux
  },
};

const MODELS = [
  { id: 'google/gemma-4-26b-a4b-it', name: 'Gemma 4 26B', free: false, inputPrice: 0.13, outputPrice: 0.40 },
  { id: 'arcee-ai/trinity-large-preview:free', name: 'Trinity Large', free: true, inputPrice: 0, outputPrice: 0 },
  { id: 'openai/gpt-oss-safeguard-20b', name: 'GPT-OSS 20B', free: false, inputPrice: 0.075, outputPrice: 0.30 },
  { id: 'moonshotai/kimi-k2.5', name: 'Kimi K2.5', free: false, inputPrice: 0.20, outputPrice: 0.60 },
  { id: 'local', name: 'Local LLM', free: true, inputPrice: 0, outputPrice: 0, local: true },
];

// Local LLM config — supports llama.cpp server, Ollama, LM Studio, or any OpenAI-compatible endpoint
const LOCAL_LLM_URL = process.env.LOCAL_LLM_URL || 'http://localhost:8080/v1/chat/completions';
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || 'local';

// Pricing in $/MTok — lookup by model id
const MODEL_PRICING = {};
MODELS.forEach(m => { MODEL_PRICING[m.id] = { input: m.inputPrice, output: m.outputPrice }; });

// Session cost tracker
const sessionCosts = { totalCost: 0, totalIn: 0, totalOut: 0, requests: 0 };

function calcCost(model, inTok, outTok) {
  const p = MODEL_PRICING[model] || { input: 0.13, output: 0.40 };
  return (inTok * p.input + outTok * p.output) / 1_000_000;
}

class MCPServer {
  constructor(name, config) {
    this.name = name; this.config = config; this.process = null;
    this.pendingResolve = null; this.rid = 0; this.ready = false;
  }
  async start() {
    this.process = spawn(this.config.cmd, this.config.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.HOME}/.cargo/bin:${process.env.PATH}` },
    });
    const rl = createInterface({ input: this.process.stdout });
    rl.on('line', (line) => {
      if (line.trim() && this.pendingResolve) {
        try { const p = JSON.parse(line); const r = this.pendingResolve; this.pendingResolve = null; r(p); } catch {}
      }
    });
    this.process.on('error', (e) => console.error(`${this.name} err:`, e.message));
    await this.send({ jsonrpc: '2.0', id: ++this.rid, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {} } });
    this.ready = true;
  }
  send(msg) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.pendingResolve = null; rej(new Error('timeout')); }, 30000);
      this.pendingResolve = (v) => { clearTimeout(t); res(v); };
      this.process.stdin.write(JSON.stringify(msg) + '\n');
    });
  }
  async search(args) {
    const start = performance.now();
    const r = await this.send({ jsonrpc: '2.0', id: ++this.rid, method: 'tools/call', params: { name: 'grep_search', arguments: args } });
    const text = r?.result?.content?.[0]?.text || 'No results';
    return { text, elapsed: Math.round((performance.now() - start) * 100) / 100, bytes: Buffer.byteLength(text) };
  }
  stop() { if (this.process) { this.process.stdin.end(); this.process.kill(); this.ready = false; } }
}

const servers = {};
async function getServer(name) {
  if (!IMPL_CONFIGS[name]) throw new Error(`Unknown server: ${name}`);
  if (IMPL_CONFIGS[name].disabled) throw new Error(`${name} server is not available on this platform`);
  const cmd = IMPL_CONFIGS[name].cmd;
  if (!cmd) throw new Error(`${name} server binary path not configured`);
  if (cmd !== 'python3' && !existsSync(cmd)) throw new Error(`Server binary not found: ${cmd} (${name} may not be available on this platform)`);
  if (!servers[name] || !servers[name].ready) {
    servers[name] = new MCPServer(name, IMPL_CONFIGS[name]);
    await servers[name].start();
  }
  return servers[name];
}

// ─── Repo cloning ───
const REPOS_DIR = resolve(BASE, 'repos');
if (!existsSync(REPOS_DIR)) mkdirSync(REPOS_DIR, { recursive: true });

// Cache of cloned repos: url -> local path
const clonedRepos = {};

function parseGitHubUrl(url) {
  // Handles: https://github.com/owner/repo, github.com/owner/repo, owner/repo
  const m = url.match(/(?:https?:\/\/)?(?:github\.com\/)?([^\/\s]+\/[^\/\s]+)/);
  if (!m) return null;
  const slug = m[1].replace(/\.git$/, '');
  return { slug, url: `https://github.com/${slug}.git` };
}

function cloneOrGetRepo(repoInput) {
  const parsed = parseGitHubUrl(repoInput);
  if (!parsed) return null;

  if (clonedRepos[parsed.slug]) {
    const p = clonedRepos[parsed.slug];
    if (existsSync(p)) return p;
  }

  const localPath = resolve(REPOS_DIR, parsed.slug.replace('/', '__'));
  if (existsSync(localPath)) {
    clonedRepos[parsed.slug] = localPath;
    return localPath;
  }

  try {
    execSync(`git clone --depth 1 ${parsed.url} ${localPath}`, {
      timeout: 60000,
      env: { ...process.env, PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.HOME}/.cargo/bin:${process.env.PATH}` },
    });
    clonedRepos[parsed.slug] = localPath;
    return localPath;
  } catch (e) {
    console.error(`Clone failed for ${parsed.url}:`, e.message);
    return null;
  }
}

const GREP_TOOL = {
  type: 'function',
  function: {
    name: 'grep_search',
    description: `Search files in a codebase using ripgrep. Returns matching lines with file:line:content.
Available local codebases: ${CORPUS}/small (100 py files), ${CORPUS}/medium (1K rs files), ${CORPUS}/large (5K go files).
You can also search any absolute path on the system.`,
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search pattern (supports regex)' },
        path: { type: 'string', description: 'Directory to search' },
        glob: { type: 'string', description: 'File glob filter e.g. "*.go"' },
        case_insensitive: { type: 'boolean', description: 'Case insensitive search' },
        max_results: { type: 'integer', description: 'Max results (default 50)' },
      },
      required: ['pattern'],
    },
  },
};

const CLONE_TOOL = {
  type: 'function',
  function: {
    name: 'clone_repo',
    description: 'Clone a GitHub repository to search it locally. Use this when the user provides a GitHub URL or owner/repo. Returns the local path you can then use with grep_search.',
    parameters: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'GitHub URL or owner/repo slug (e.g. "facebook/react" or "https://github.com/facebook/react")' },
      },
      required: ['repo'],
    },
  },
};

// Prompt caching — adds cache_control breakpoints for Anthropic models via OpenRouter
// System prompt + tool definitions are the stable prefix (~2000 tokens)
// Conversation history grows but older messages are cacheable
const cacheStats = { hits: 0, writes: 0, savedTokens: 0 };

function applyCacheControl(messages, model) {
  // Apply cache_control for all models via OpenRouter
  // OpenRouter passes cache_control to providers that support it (Anthropic, Google, OpenAI)
  // For providers that don't support it, they simply ignore the field — no harm done

  return messages.map((msg, idx) => {
    // Cache the system prompt — this is our biggest stable prefix (18 tools + strategy)
    if (msg.role === 'system') {
      return {
        ...msg,
        content: [{
          type: 'text',
          text: msg.content,
          cache_control: { type: 'ephemeral' }
        }]
      };
    }

    // Cache all messages except the very last user message (which is new)
    // This means conversation history gets cached across turns
    if (idx < messages.length - 1 && (msg.role === 'user' || msg.role === 'assistant')) {
      if (typeof msg.content === 'string' && msg.content.length > 100) {
        return {
          ...msg,
          content: [{
            type: 'text',
            text: msg.content,
            cache_control: { type: 'ephemeral' }
          }]
        };
      }
    }

    return msg;
  });
}

async function chatWithRetry(messages, model, maxRetries = 3) {
  const isLocal = model === 'local' || model.startsWith('local/');
  const apiKey = process.env.OPENROUTER_API_KEY;

  // Pick endpoint + headers based on local vs cloud
  const url = isLocal ? LOCAL_LLM_URL : 'https://openrouter.ai/api/v1/chat/completions';
  const headers = isLocal
    ? { 'Content-Type': 'application/json' }
    : { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  const bodyModel = isLocal ? LOCAL_LLM_MODEL : model;

  // Apply prompt caching for supported models
  const cachedMessages = isLocal ? messages : applyCacheControl(messages, model);

  for (let i = 0; i < maxRetries; i++) {
    const controller = new AbortController();
    const timeoutMs = isLocal ? 120000 : 45000; // local models get 2min
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: bodyModel, messages: cachedMessages, tools: [GREP_TOOL, CLONE_TOOL, TOOL_SEARCH_TOOL, TOOL_RUN_TOOL], tool_choice: 'auto' }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (resp.status === 429) {
        console.log(`  [429 rate limited, retry ${i+1}]`);
        await new Promise(r => setTimeout(r, 3000 * (i + 1)));
        continue;
      }
      if (!resp.ok) throw new Error(`API ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
      const result = await resp.json();

      // Track cache stats from response (works across providers)
      const usage = result.usage || {};
      // Anthropic: cache_read_input_tokens / cache_creation_input_tokens
      // OpenAI: cached_tokens (in prompt_tokens_details)
      // Google: cachedContentTokenCount
      const cachedRead = usage.cache_read_input_tokens || usage.cached_tokens || usage.prompt_tokens_details?.cached_tokens || 0;
      const cachedWrite = usage.cache_creation_input_tokens || 0;
      if (cachedRead > 0) {
        cacheStats.hits++;
        cacheStats.savedTokens += cachedRead;
        const pricing = MODEL_PRICING[model] || { input: 0.13 };
        const saved = cachedRead * pricing.input * 0.9 / 1_000_000; // 90% discount on cached tokens
        console.log(`  [Cache HIT: ${cachedRead} tokens cached, saved ~$${saved.toFixed(6)}]`);
      }
      if (cachedWrite > 0) {
        cacheStats.writes++;
        console.log(`  [Cache WRITE: ${cachedWrite} tokens written to cache]`);
      }

      return result;
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        console.log(`  [LLM timeout after 45s, retry ${i+1}]`);
        if (i < maxRetries - 1) continue;
        throw new Error('LLM request timed out after 45s');
      }
      throw err;
    }
  }
  throw new Error('Rate limited - max retries exceeded');
}

// Main chat endpoint - SSE streaming agent loop (supports both GET and POST)
app.post('/api/chat/stream', async (req, res) => {
  const { message, model = 'google/gemma-4-26b-a4b-it', impl = 'cpp', history } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  let conversationHistory = [
    { role: 'system', content: `You are Milli-Agent, a code intelligence agent with 30 tools available via Code Mode.

You have 4 tools:
- clone_repo(repo) — clone a GitHub repo
- grep_search(pattern, path, ...) — fast regex search via MCP server
- tool_search(query) — find tools by keyword (e.g. "git", "security", "lsp")
- tool_run(tool, args) — execute any tool by name with args

Workflow:
1. Use tool_search to discover what's available (e.g. tool_search("dependency CVE"))
2. Use tool_run to execute (e.g. tool_run({tool: "dependency_audit", args: {path: "/repo"}}))
3. ALWAYS cite file paths and line numbers in format \`file.ext:42\` — outputs are verified
4. NEVER fabricate paths or code. Tool results have [receipt:XXXX] prefixes — your claims must match the actual data.

Be terse. Run tools, cite results.` }
  ];
  try { if (history) { const h = Array.isArray(history) ? history : JSON.parse(history); conversationHistory.push(...h); } } catch {}
  conversationHistory.push({ role: 'user', content: message });

  console.log(`Chat: "${message.slice(0,60)}" model=${model} impl=${impl} history=${conversationHistory.length-1} msgs`);

  send('status', { type: 'thinking', model, impl });

  const totalStart = performance.now();
  let totalToolCalls = 0, totalMcpMs = 0, totalInTok = 0, totalOutTok = 0;
  const ledger = new ReceiptLedger(); // tool-call receipts for verification

  for (let round = 0; round < 6; round++) {
    try {
      send('status', { type: round === 0 ? 'calling_llm' : 'calling_llm_followup', round });
      const llmStart = performance.now();
      const completion = await chatWithRetry(conversationHistory, model);
      const llmMs = Math.round(performance.now() - llmStart);

      if (completion.usage) {
        totalInTok += completion.usage.prompt_tokens || 0;
        totalOutTok += completion.usage.completion_tokens || 0;
      }

      const choice = completion.choices?.[0];
      if (!choice) { send('error', { message: 'No response from model' }); break; }
      const msg = choice.message;

      if (msg.tool_calls?.length > 0) {
        conversationHistory.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });

        for (const tc of msg.tool_calls) {
          let args;
          try { args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments; }
          catch { args = { pattern: 'TODO', path: CORPUS + '/large' }; }

          send('tool_call', { id: tc.id, name: tc.function.name, args, impl, round });

          try {
            const toolStart = performance.now();
            let content;

            if (tc.function.name === 'clone_repo') {
              const repoInput = args.repo || '';
              send('tool_result', { id: tc.id, impl: 'git', elapsed: 0, bytes: 0, matchCount: 0, preview: [`Cloning ${repoInput}...`] });
              const localPath = cloneOrGetRepo(repoInput);
              content = localPath
                ? `Repository cloned successfully to: ${localPath}\nYou can now search it with grep_search using path="${localPath}"`
                : `Failed to clone repository: ${repoInput}`;
              totalToolCalls++;
              send('tool_result', { id: tc.id, impl: 'git', elapsed: Math.round(performance.now() - toolStart), bytes: content.length, matchCount: localPath ? 1 : 0, preview: [content.slice(0, 200)] });

            } else if (tc.function.name === 'grep_search') {
              const server = await getServer(impl);
              const result = await server.search(args);
              totalToolCalls++;
              totalMcpMs += result.elapsed;
              const fullText = result.text;
              content = fullText.length > 4000 ? fullText.slice(0, 4000) + '\n...(truncated)' : fullText;
              // Record receipt with full output (not truncated) for verification
              const receiptId = ledger.record(tc.function.name, args, fullText);
              content = `[receipt:${receiptId}]\n` + content;
              const matchLines = fullText.split('\n').filter(l => l.trim()).slice(0, 30);
              send('tool_result', { id: tc.id, impl, elapsed: result.elapsed, bytes: result.bytes, matchCount: matchLines.length, preview: matchLines.slice(0, 15), receipt: receiptId });

            } else {
              // All other tools (Tier 1-4)
              const result = executeTool(tc.function.name, args);
              if (result !== null) {
                totalToolCalls++;
                const elapsed = Math.round(performance.now() - toolStart);
                const fullText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
                content = fullText.length > 6000 ? fullText.slice(0, 6000) + '\n...(truncated)' : fullText;
                const receiptId = ledger.record(tc.function.name, args, fullText);
                content = `[receipt:${receiptId}]\n` + content;
                const lines = fullText.split('\n').filter(l => l.trim()).slice(0, 30);
                send('tool_result', { id: tc.id, impl: 'system', elapsed, bytes: fullText.length, matchCount: lines.length, preview: lines.slice(0, 15), receipt: receiptId });
              } else {
                content = `Unknown tool: ${tc.function.name}`;
                send('tool_error', { id: tc.id, error: content });
              }
            }

            conversationHistory.push({ role: 'tool', tool_call_id: tc.id, content });
          } catch (err) {
            send('tool_error', { id: tc.id, error: err.message });
            conversationHistory.push({ role: 'tool', tool_call_id: tc.id, content: `Error: ${err.message}` });
          }
        }
      } else {
        // Final text response
        const content = msg.content || '';
        // Stream it word by word for effect
        const words = content.split(/(\s+)/);
        let buffer = '';
        for (let i = 0; i < words.length; i++) {
          buffer += words[i];
          if (i % 3 === 2 || i === words.length - 1) {
            send('text_delta', { content: buffer });
            buffer = '';
          }
        }
        const msgCost = calcCost(model, totalInTok, totalOutTok);
        sessionCosts.totalCost += msgCost;
        sessionCosts.totalIn += totalInTok;
        sessionCosts.totalOut += totalOutTok;
        sessionCosts.requests++;
        console.log(`  Cost: $${msgCost.toFixed(6)} this msg | $${sessionCosts.totalCost.toFixed(6)} session total`);
        send('text_done', {
          content,
          stats: {
            totalMs: Math.round(performance.now() - totalStart),
            toolCalls: totalToolCalls, mcpMs: Math.round(totalMcpMs),
            inTokens: totalInTok, outTokens: totalOutTok,
            model, impl,
            cost: Math.round(msgCost * 1000000) / 1000000,
            sessionCost: Math.round(sessionCosts.totalCost * 1000000) / 1000000,
            sessionRequests: sessionCosts.requests,
          },
        });

        // Verification phase — fire and forget the deterministic checks,
        // optionally include frontier judge for low-confidence responses
        try {
          const useJudge = req.body.verify_with_judge !== false && totalToolCalls > 0;
          const trustReport = await verify(content, ledger, {
            useJudge,
            apiKey: process.env.OPENROUTER_API_KEY,
            model: 'openai/gpt-oss-safeguard-20b',
          });
          send('verification', trustReport);
        } catch (e) {
          console.log('  Verification failed:', e.message);
          send('verification', { label: 'VERIFY_ERROR', error: e.message });
        }
        break;
      }

      if (choice.finish_reason === 'stop') break;
    } catch (err) {
      send('error', { message: err.message });
      break;
    }
  }

  res.end();
});

// Race search (keep from v1)
app.get('/api/search/stream', async (req, res) => {
  const { pattern, path: sp, max_results } = req.query;
  if (!pattern) return res.status(400).json({ error: 'pattern required' });
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  const send = (e, d) => res.write(`event: ${e}\ndata: ${JSON.stringify(d)}\n\n`);
  const args = { pattern, path: sp || CORPUS + '/large', max_results: parseInt(max_results) || 50 };
  send('start', { pattern, implementations: Object.keys(IMPL_CONFIGS) });
  const results = await Promise.all(Object.keys(IMPL_CONFIGS).map(async (name) => {
    try {
      const srv = await getServer(name);
      const r = await srv.search(args);
      send('impl_done', { impl: name, elapsed: r.elapsed, matchCount: r.text.split('\n').filter(l=>l.trim()).length, bytes: r.bytes, preview: r.text.split('\n').slice(0,10) });
      return { impl: name, elapsed: r.elapsed };
    } catch (e) { send('impl_error', { impl: name, error: e.message }); return { impl: name, error: true }; }
  }));
  const ranked = results.filter(r=>!r.error).sort((a,b)=>a.elapsed-b.elapsed);
  send('done', { winner: ranked[0]?.impl, rankings: ranked });
  res.end();
});

// Direct search — instant, no LLM. Returns all results from one server.
app.post('/api/search/direct', async (req, res) => {
  const { pattern, path: searchPath, glob, impl = 'cpp', max_results = 100 } = req.body;
  if (!pattern) return res.status(400).json({ error: 'pattern required' });
  const start = performance.now();
  try {
    const server = await getServer(impl);
    const args = { pattern, path: searchPath || CORPUS + '/large', max_results };
    if (glob) args.glob = glob;
    const result = await server.search(args);
    const lines = result.text.split('\n').filter(l => l.trim());
    res.json({
      impl, pattern, path: args.path,
      elapsed: result.elapsed, bytes: result.bytes,
      matchCount: lines.length,
      lines,
      totalMs: Math.round((performance.now() - start) * 100) / 100,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Direct search — race all 4 servers, return JSON (not SSE)
app.post('/api/search/race', async (req, res) => {
  const { pattern, path: searchPath, glob, max_results = 50 } = req.body;
  if (!pattern) return res.status(400).json({ error: 'pattern required' });
  const start = performance.now();
  const args = { pattern, path: searchPath || CORPUS + '/large', max_results };
  if (glob) args.glob = glob;

  const results = await Promise.all(Object.keys(IMPL_CONFIGS).map(async (name) => {
    try {
      const server = await getServer(name);
      const r = await server.search(args);
      const lines = r.text.split('\n').filter(l => l.trim());
      return { impl: name, elapsed: r.elapsed, bytes: r.bytes, matchCount: lines.length, lines: lines.slice(0, 20) };
    } catch (e) {
      return { impl: name, error: e.message };
    }
  }));

  const valid = results.filter(r => !r.error).sort((a, b) => a.elapsed - b.elapsed);
  res.json({
    pattern, path: args.path,
    totalMs: Math.round((performance.now() - start) * 100) / 100,
    winner: valid[0]?.impl || null,
    results,
  });
});

// Analyze — takes search results and asks LLM to summarize (Option 2)
app.post('/api/search/analyze', async (req, res) => {
  const { pattern, results, question, model = 'google/gemma-4-26b-a4b-it' } = req.body;
  if (!results) return res.status(400).json({ error: 'results required' });

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const truncatedResults = (typeof results === 'string' ? results : results.join('\n')).slice(0, 6000);

  // Count unique files and extract file types
  const lines = typeof results === 'string' ? results.split('\n') : results;
  const files = new Set(lines.map(l => l.split(':')[0]).filter(Boolean));
  const fileCount = files.size;

  const systemPrompt = `You are a senior code analyst. You analyze grep search results from codebases with precision.

Rules:
- Focus ONLY on actual source code findings, not documentation/README examples
- Separate real code issues from test files and config
- Be specific: name exact files, line numbers, and what the code does
- If the pattern reveals bugs, security issues, or tech debt — highlight those first
- Give actionable insights a developer can act on immediately
- Use bullet points, be direct, no filler
- If results are from multiple files with identical content, say so concisely`;

  const userPrompt = question || `Pattern: "${pattern}"
Found in ${fileCount} files, ${lines.length} total matches.

Analyze these results. What are the most important findings? Group by:
1. **Critical** — bugs, security issues, or broken patterns
2. **Tech debt** — TODOs, FIXMEs, incomplete implementations
3. **Patterns** — recurring code patterns, architectural decisions
4. **Summary** — one-line takeaway`;

  try {
    const completion = await chatWithRetry([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt + '\n\n```\n' + truncatedResults + '\n```' }
    ], model);

    const content = completion.choices?.[0]?.message?.content || 'No analysis available.';
    const usage = completion.usage || {};

    const words = content.split(/(\s+)/);
    let buffer = '';
    for (let i = 0; i < words.length; i++) {
      buffer += words[i];
      if (i % 3 === 2 || i === words.length - 1) {
        send('text_delta', { content: buffer });
        buffer = '';
      }
    }
    const cost = calcCost(model, usage.prompt_tokens || 0, usage.completion_tokens || 0);
    sessionCosts.totalCost += cost;
    sessionCosts.totalIn += usage.prompt_tokens || 0;
    sessionCosts.totalOut += usage.completion_tokens || 0;
    sessionCosts.requests++;
    send('text_done', { content, cost, tokens: (usage.prompt_tokens||0) + (usage.completion_tokens||0) });
  } catch (err) {
    send('error', { message: err.message });
  }
  res.end();
});

// Clone endpoint
app.post('/api/clone', (req, res) => {
  const { repo } = req.body;
  if (!repo) return res.status(400).json({ error: 'repo required' });
  const localPath = cloneOrGetRepo(repo);
  if (localPath) {
    res.json({ success: true, path: localPath, repo });
  } else {
    res.status(400).json({ error: `Failed to clone: ${repo}` });
  }
});

// List cloned repos
app.get('/api/repos', (_, res) => {
  res.json(Object.entries(clonedRepos).map(([slug, path]) => ({ slug, path })));
});

// OpenAPI spec upload + search
import { writeFileSync, unlinkSync } from 'fs';
app.post('/api/openapi/upload', (req, res) => {
  const { content, filename } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });
  const dir = resolve(homedir(), 'milli-repos', '_openapi_uploads');
  mkdirSync(dir, { recursive: true });
  const fname = (filename || 'spec.json').replace(/[^a-zA-Z0-9._-]/g, '_');
  const fpath = resolve(dir, fname);
  writeFileSync(fpath, content);
  res.json({ success: true, path: dir, file: fpath });
});

app.post('/api/openapi/search', async (req, res) => {
  const { path: specPath, query, mode, method, impl } = req.body;
  if (!specPath) return res.status(400).json({ error: 'path required' });

  // If impl specified and it's a native MCP server, use that
  if (impl && impl !== 'node' && IMPL_CONFIGS[impl] && !IMPL_CONFIGS[impl].disabled) {
    try {
      const server = await getServer(impl);
      const request = { pattern: '', path: specPath, tool: 'openapi_search' };
      // Send as MCP tools/call
      const mcpReq = {
        jsonrpc: '2.0', id: Date.now(),
        method: 'tools/call',
        params: { name: 'openapi_search', arguments: { path: specPath, query: query || '', mode: mode || 'search', method: method || '' } }
      };
      const start = performance.now();
      const line = JSON.stringify(mcpReq);
      server.proc.stdin.write(line + '\n');
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout')), 15000);
        const handler = (data) => {
          try {
            const resp = JSON.parse(data.toString().trim());
            if (resp.id === mcpReq.id) {
              clearTimeout(timeout);
              server.rl.removeListener('line', handler);
              resolve(resp);
            }
          } catch {}
        };
        server.rl.on('line', handler);
      });
      const elapsed = Math.round(performance.now() - start);
      const text = result?.result?.content?.[0]?.text || 'No results';
      return res.json({ text, elapsed, impl, bytes: text.length });
    } catch (e) {
      // Fall through to Node.js
    }
  }

  // Default: use Node.js executeTool
  const start = performance.now();
  const text = executeTool('openapi_search', { path: specPath, query: query || '', mode: mode || 'search', method: method || '' });
  const elapsed = Math.round(performance.now() - start);
  res.json({ text, elapsed, impl: 'node', bytes: text?.length || 0 });
});

app.post('/api/openapi/race', async (req, res) => {
  const { path: specPath, query, mode, method } = req.body;
  if (!specPath) return res.status(400).json({ error: 'path required' });

  const impls = ['cpp', 'python', 'swift', 'node'];
  const results = {};

  await Promise.all(impls.map(async (impl) => {
    try {
      const start = performance.now();
      let text;
      if (impl === 'node') {
        text = executeTool('openapi_search', { path: specPath, query: query || '', mode: mode || 'search', method: method || '' });
      } else if (IMPL_CONFIGS[impl] && !IMPL_CONFIGS[impl].disabled) {
        const server = await getServer(impl);
        const mcpReq = { jsonrpc: '2.0', id: Date.now() + Math.random(), method: 'tools/call', params: { name: 'openapi_search', arguments: { path: specPath, query: query || '', mode: mode || 'search', method: method || '' } } };
        server.proc.stdin.write(JSON.stringify(mcpReq) + '\n');
        const result = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('timeout')), 15000);
          const handler = (data) => { try { const r = JSON.parse(data.toString().trim()); if (Math.abs(r.id - mcpReq.id) < 1) { clearTimeout(timeout); server.rl.removeListener('line', handler); resolve(r); } } catch {} };
          server.rl.on('line', handler);
        });
        text = result?.result?.content?.[0]?.text || 'No results';
      } else {
        return;
      }
      const elapsed = Math.round(performance.now() - start);
      results[impl] = { text: text?.slice(0, 2000), elapsed, bytes: text?.length || 0 };
    } catch (e) {
      results[impl] = { text: 'Error: ' + e.message, elapsed: 0, bytes: 0, error: true };
    }
  }));

  res.json(results);
});

// Self-heal endpoint — diagnose, fix, test loop
app.post('/api/heal', async (req, res) => {
  const { repo, path: localPath, test_command, fix_type = 'all' } = req.body;
  if (!repo && !localPath) return res.status(400).json({ error: 'repo or path required' });

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  let repoPath = localPath;
  if (repo && !localPath) {
    send('step', { phase: 'clone', status: 'running', text: 'Cloning ' + repo + '...' });
    repoPath = cloneOrGetRepo(repo);
    if (!repoPath) { send('step', { phase: 'clone', status: 'error', text: 'Clone failed' }); res.end(); return; }
    send('step', { phase: 'clone', status: 'done', text: 'Cloned to ' + repoPath });
  }

  // Step 1: Diagnose
  send('step', { phase: 'diagnose', status: 'running', text: 'Running self_heal diagnostics...' });
  const diagResult = executeTool('self_heal', { path: repoPath, test_command, fix_type });
  send('step', { phase: 'diagnose', status: 'done', text: diagResult });

  // Step 2: Ask LLM to generate fixes based on diagnosis
  send('step', { phase: 'fix', status: 'running', text: 'AI analyzing issues and generating fixes...' });
  try {
    const messages = [
      { role: 'system', content: `You are a code repair agent. Given diagnostic output from a self-heal scan, generate specific code_edit tool calls to fix the issues. For each fix:
1. Use grep_search to find the exact code
2. Use read_file to understand context
3. Use code_edit to apply the fix
4. Use sandbox_exec to test

Respond with a clear action plan. Be specific about what to change.` },
      { role: 'user', content: `Here is the self-heal diagnostic for ${repoPath}:\n\n${diagResult}\n\nGenerate fixes for the top issues found. Be specific with file paths and code changes.` }
    ];

    const model = req.body.model || 'google/gemma-4-26b-a4b-it';
    const completion = await chatWithRetry(messages, model);
    const fixPlan = completion.choices?.[0]?.message?.content || 'No fix plan generated';
    send('step', { phase: 'fix', status: 'done', text: fixPlan });
  } catch (e) {
    send('step', { phase: 'fix', status: 'error', text: 'LLM error: ' + e.message });
  }

  send('complete', { repoPath });
  res.end();
});

// White-hat full security audit — runs all security tools, streams results via SSE
app.post('/api/security/audit', async (req, res) => {
  const { repo, path: localPath } = req.body;
  if (!repo && !localPath) return res.status(400).json({ error: 'repo or path required' });

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  let repoPath = localPath;

  // Clone if needed
  if (repo && !localPath) {
    send('step', { name: 'clone', status: 'running', label: 'Cloning repository...' });
    try {
      repoPath = cloneOrGetRepo(repo);
      if (!repoPath) throw new Error('Clone failed');
      send('step', { name: 'clone', status: 'done', label: 'Cloned to ' + repoPath });
    } catch (e) {
      send('step', { name: 'clone', status: 'error', label: 'Clone failed: ' + e.message });
      res.end();
      return;
    }
  }

  const scans = [
    { name: 'code_stats', label: 'Code Statistics', fn: () => executeTool('code_stats', { path: repoPath }) },
    { name: 'deep_security_scan', label: 'OWASP Security Scan', fn: () => executeTool('deep_security_scan', { path: repoPath, ruleset: 'owasp' }) },
    { name: 'dependency_audit', label: 'Dependency CVE Audit', fn: () => executeTool('dependency_audit', { path: repoPath }) },
    { name: 'secrets_scan', label: 'Secrets & Key Detection', fn: () => executeTool('secrets_scan', { path: repoPath, scan_history: true }) },
    { name: 'trivy_scan', label: 'Container & IaC Security', fn: () => executeTool('trivy_scan', { path: repoPath, scan_type: 'all' }) },
    { name: 'port_scan', label: 'Port & Network Exposure', fn: () => executeTool('port_scan', { path: repoPath }) },
    { name: 'security_scan', label: 'Pattern-Based Security', fn: () => executeTool('security_scan', { path: repoPath }) },
  ];

  const results = {};
  let totalFindings = 0;

  for (const scan of scans) {
    send('step', { name: scan.name, status: 'running', label: scan.label + '...' });
    const t0 = performance.now();
    try {
      const result = scan.fn();
      const elapsed = Math.round(performance.now() - t0);
      // Count findings
      const findingMatch = result.match(/(\d+)\s*(potential|findings|vulnerabilities|match|issues)/gi);
      const findings = findingMatch ? findingMatch.reduce((sum, m) => sum + parseInt(m), 0) : 0;
      totalFindings += findings;
      results[scan.name] = { text: result, elapsed, findings };
      send('step', { name: scan.name, status: 'done', label: scan.label, elapsed, findings, text: result });
    } catch (e) {
      send('step', { name: scan.name, status: 'error', label: scan.label + ': ' + e.message, elapsed: Math.round(performance.now() - t0) });
    }
  }

  // Summary
  send('complete', { totalFindings, scanCount: scans.length, results: Object.fromEntries(Object.entries(results).map(([k,v]) => [k, { elapsed: v.elapsed, findings: v.findings }])) });
  res.end();
});

// File read endpoint for code viewer
app.post('/api/file/read', (req, res) => {
  const { path: filePath, start_line = 1, end_line = 500 } = req.body;
  if (!filePath) return res.status(400).json({ error: 'path required' });
  const result = executeTool('read_file', { path: filePath, start_line, end_line });
  res.json({ content: result });
});

app.get('/api/models', (_, res) => res.json(MODELS));
app.get('/api/costs', async (_, res) => {
  // Get live account usage from OpenRouter
  let accountUsage = null;
  try {
    const r = await fetch('https://openrouter.ai/api/v1/auth/key', { headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` } });
    const d = await r.json();
    accountUsage = { total: d.data?.usage || 0, daily: d.data?.usage_daily || 0 };
  } catch {}
  res.json({ session: sessionCosts, account: accountUsage, pricing: MODEL_PRICING, cache: cacheStats });
});
app.get('/api/impls', (_, res) => res.json(Object.keys(IMPL_CONFIGS).map(k => ({ id: k, ...IMPL_CONFIGS[k], color: { rust:'#f74c00', cpp:'#00599c', swift:'#f05138', python:'#3776ab' }[k] }))));
app.post('/api/warmup', async (_, res) => {
  const r = {};
  for (const n of Object.keys(IMPL_CONFIGS)) { try { const s=performance.now(); await getServer(n); r[n]={ready:true,ms:Math.round(performance.now()-s)}; } catch(e) { r[n]={ready:false,err:e.message}; } }
  res.json(r);
});

// Serve static UI — check multiple paths
const staticPaths = [resolve(__dirname, '..', 'public'), resolve(__dirname, '..', 'dist'), resolve(__dirname, 'dist')];
const staticPath = staticPaths.find(p => existsSync(resolve(p, 'index.html')));
if (staticPath) {
  app.use(express.static(staticPath));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(resolve(staticPath, 'index.html'));
  });
}

const PORT = parseInt(process.env.PORT) || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Milli-Agent on http://0.0.0.0:${PORT}`);
  console.log(`MCP servers: ${Object.keys(IMPL_CONFIGS).join(', ')}`);
  if (staticPath) console.log(`UI: ${staticPath}`);
});
