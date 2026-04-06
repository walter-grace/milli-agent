import express from 'express';
import cors from 'cors';
import { spawn, execSync } from 'child_process';
import { createInterface } from 'readline';
import { resolve } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';

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
    cmd: existsSync(resolve(MCP, 'zig/zig-out/bin/mcp-grep-zig')) ? resolve(MCP, 'zig/zig-out/bin/mcp-grep-zig') : resolve(BASE, 'zig-mcp/mcp-grep-zig'),
    args: []
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
  // Check if binary exists
  const cmd = IMPL_CONFIGS[name].cmd;
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

async function chatWithRetry(messages, model, maxRetries = 3) {
  const isLocal = model === 'local' || model.startsWith('local/');
  const apiKey = process.env.OPENROUTER_API_KEY;

  // Pick endpoint + headers based on local vs cloud
  const url = isLocal ? LOCAL_LLM_URL : 'https://openrouter.ai/api/v1/chat/completions';
  const headers = isLocal
    ? { 'Content-Type': 'application/json' }
    : { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  const bodyModel = isLocal ? LOCAL_LLM_MODEL : model;

  for (let i = 0; i < maxRetries; i++) {
    const controller = new AbortController();
    const timeoutMs = isLocal ? 120000 : 45000; // local models get 2min
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: bodyModel, messages, tools: [GREP_TOOL, CLONE_TOOL], tool_choice: 'auto' }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (resp.status === 429) {
        console.log(`  [429 rate limited, retry ${i+1}]`);
        await new Promise(r => setTimeout(r, 3000 * (i + 1)));
        continue;
      }
      if (!resp.ok) throw new Error(`API ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
      return resp.json();
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

  let conversationHistory = [];
  try { if (history) conversationHistory = Array.isArray(history) ? history : JSON.parse(history); } catch {}
  conversationHistory.push({ role: 'user', content: message });

  console.log(`Chat: "${message.slice(0,60)}" model=${model} impl=${impl} history=${conversationHistory.length-1} msgs`);

  send('status', { type: 'thinking', model, impl });

  const totalStart = performance.now();
  let totalToolCalls = 0, totalMcpMs = 0, totalInTok = 0, totalOutTok = 0;

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
            if (tc.function.name === 'clone_repo') {
              // Handle clone_repo tool
              const repoInput = args.repo || '';
              send('tool_result', { id: tc.id, impl: 'git', elapsed: 0, bytes: 0, matchCount: 0, preview: [`Cloning ${repoInput}...`] });

              const localPath = cloneOrGetRepo(repoInput);
              const content = localPath
                ? `Repository cloned successfully to: ${localPath}\nYou can now search it with grep_search using path="${localPath}"`
                : `Failed to clone repository: ${repoInput}. Make sure the URL or slug is correct.`;

              totalToolCalls++;
              send('tool_result', { id: tc.id, impl: 'git', elapsed: 0, bytes: content.length, matchCount: localPath ? 1 : 0, preview: [content] });
              conversationHistory.push({ role: 'tool', tool_call_id: tc.id, content });
            } else {
              // Handle grep_search tool
              const server = await getServer(impl);
              const result = await server.search(args);
              totalToolCalls++;
              totalMcpMs += result.elapsed;

              const truncated = result.text.length > 4000 ? result.text.slice(0, 4000) + '\n...(truncated)' : result.text;
              const matchLines = result.text.split('\n').filter(l => l.trim()).slice(0, 30);

              send('tool_result', {
                id: tc.id, impl,
                elapsed: result.elapsed, bytes: result.bytes,
                matchCount: matchLines.length, preview: matchLines.slice(0, 15),
              });

              conversationHistory.push({ role: 'tool', tool_call_id: tc.id, content: truncated });
            }
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

  const prompt = question || `Analyze these search results for pattern "${pattern}" and provide a brief summary of what you found. Be concise.`;
  const truncatedResults = (typeof results === 'string' ? results : results.join('\n')).slice(0, 4000);

  try {
    const completion = await chatWithRetry([
      { role: 'user', content: prompt + '\n\nSearch results:\n' + truncatedResults }
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

app.get('/api/models', (_, res) => res.json(MODELS));
app.get('/api/costs', async (_, res) => {
  // Get live account usage from OpenRouter
  let accountUsage = null;
  try {
    const r = await fetch('https://openrouter.ai/api/v1/auth/key', { headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` } });
    const d = await r.json();
    accountUsage = { total: d.data?.usage || 0, daily: d.data?.usage_daily || 0 };
  } catch {}
  res.json({ session: sessionCosts, account: accountUsage, pricing: MODEL_PRICING });
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
