import express from 'express';
import cors from 'cors';
import { spawn, execSync } from 'child_process';
import { createInterface } from 'readline';
import { resolve } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';
import { ALL_TOOLS, executeTool, TOOL_SEARCH_TOOL, TOOL_RUN_TOOL, BROWSER_TOOL_NAMES } from './tools.js';
import { callBrowserTool, browserScreenshotToFile } from './browser-tools.js';
import { ReceiptLedger, verify, quorumDiff } from './verifier.js';
import { runSandboxStream, listSupportedLanguages } from './sandbox.js';
import { deployWorker, deployConfigured } from './deploy.js';

// Code Mode: only 3 tools sent to LLM (tool_search, tool_run, clone_repo, grep_search)
// instead of all 30. Saves ~5,000 prompt tokens per request.
// LLM uses tool_search to discover, tool_run to execute.

// ═══ SESSION CONTEXT STORE ═══
// Each tab writes its last result here. Chat @-mentions read from it.
// In-memory, single-session. Cleared on server restart.
const sessionContext = {
  cockpit:  null,  // { repoPath, scores, grade, totalFindings, scans:{name→text}, findings:[...], summary, ts }
  whitehat: null,  // { repoPath, totalFindings, scans:{name→text}, summary, ts }
  search:   null,  // { pattern, path, impl, matchCount, lines, summary, ts }
  compare:  null,  // { pattern, path, winner, results, summary, ts }
  api:      null,  // { specPath, query, results, summary, ts }
  heal:     null,  // { repoPath, diagnostic, fixPlan, summary, ts }
};
const SOURCES = ['cockpit','whitehat','search','compare','api','heal'];
const MAX_PER_SOURCE_BYTES = 5000; // truncation cap per source when injected
function trunc(s, n = MAX_PER_SOURCE_BYTES) {
  if (!s) return '';
  s = String(s);
  return s.length <= n ? s : s.slice(0, n) + `\n…[truncated ${s.length - n} bytes]`;
}
function ageStr(ts) {
  if (!ts) return null;
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 60) return sec + 's ago';
  if (sec < 3600) return Math.round(sec / 60) + 'm ago';
  if (sec < 86400) return Math.round(sec / 3600) + 'h ago';
  return Math.round(sec / 86400) + 'd ago';
}
function formatContextBlock(name, data) {
  if (!data) return '';
  const ts = data.ts ? ` (${ageStr(data.ts)})` : '';
  let body = '';
  if (name === 'cockpit') {
    body += `Repo: ${data.repoPath || '?'}\nGrade: ${data.grade || '?'}  ·  ${data.totalFindings ?? 0} findings  ·  ${data.scanCount ?? 0} scans\n`;
    if (data.scores) body += `Scores: ${Object.entries(data.scores).map(([k,v])=>`${k}=${v}`).join('  ')}\n`;
    if (data.scans) {
      for (const [scanName, scanText] of Object.entries(data.scans)) {
        body += `\n--- ${scanName} ---\n${trunc(scanText, 1500)}\n`;
      }
    }
    if (data.findings?.length) {
      body += `\nClickable findings (${data.findings.length}):\n`;
      data.findings.slice(0, 30).forEach(f => { body += `  [${f.scan}] ${f.file}:${f.line}\n`; });
    }
  } else if (name === 'whitehat') {
    body += `Repo: ${data.repoPath || '?'}\nTotal findings: ${data.totalFindings ?? 0}\n`;
    if (data.scans) for (const [k, v] of Object.entries(data.scans)) body += `\n--- ${k} ---\n${trunc(v, 1200)}\n`;
  } else if (name === 'search') {
    body += `Pattern: ${data.pattern}\nPath: ${data.path}\nImpl: ${data.impl}  ·  ${data.matchCount ?? 0} matches\n\n`;
    body += (data.lines || []).slice(0, 50).join('\n');
  } else if (name === 'compare') {
    body += `Pattern: ${data.pattern}\nPath: ${data.path}\nWinner: ${data.winner}\n\n`;
    (data.results || []).forEach(r => { body += `  [${r.impl}] ${r.elapsed}ms  matches=${r.matchCount}\n`; });
  } else if (name === 'api') {
    body += `Spec: ${data.specPath}\nQuery: ${data.query || '(none)'}\n\n${trunc(data.results || '', 3500)}`;
  } else if (name === 'heal') {
    body += `Repo: ${data.repoPath || '?'}\n\n--- DIAGNOSTIC ---\n${trunc(data.diagnostic || '', 2000)}\n\n--- FIX PLAN ---\n${trunc(data.fixPlan || '', 2000)}`;
  }
  return `[@${name}${ts}]\n${trunc(body, MAX_PER_SOURCE_BYTES)}\n`;
}

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
    return this.callTool('grep_search', args);
  }
  async callTool(name, args) {
    const start = performance.now();
    const r = await this.send({ jsonrpc: '2.0', id: ++this.rid, method: 'tools/call', params: { name, arguments: args } });
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

async function chatWithRetry(messages, model, maxRetries = 5) {
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
    const timeoutMs = isLocal ? 120000 : 90000; // 90s for cloud, 2min for local
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: bodyModel, messages: cachedMessages, tools: [GREP_TOOL, CLONE_TOOL, ...ALL_TOOLS], tool_choice: 'auto' }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (resp.status === 429) {
        // Read Retry-After header if present
        const retryAfter = parseInt(resp.headers.get('retry-after')) || 0;
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(2000 * Math.pow(2, i), 30000); // exponential backoff capped at 30s
        console.log(`  [429 rate limited, retry ${i+1}/${maxRetries} in ${waitMs}ms]`);
        await new Promise(r => setTimeout(r, waitMs));
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
  // Note: Gemma is currently the most reliable. GPT-OSS hit Groq rate limits.
  if (!message) return res.status(400).json({ error: 'message required' });

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  let conversationHistory = [
    { role: 'system', content: `You are Milli-Agent, a code intelligence agent. You have 30+ tools for code search, security review, git analysis, and self-healing.

Common tools:
- clone_repo(repo) — clone GitHub repo
- grep_search(pattern, path) — regex search via MCP server
- read_file(path, start_line, end_line) — read file contents
- list_files(path, recursive) — list directory
- code_stats(path) — language breakdown, line counts
- repo_summary(path) — README + structure + entry points + deps + stats (ALL IN ONE)
- knowledge_graph(path, depth) — modules, imports, definitions
- symbol_map(path) — instant symbol index via ctags
- git_summary, git_log, git_authors, git_timeline — git intelligence
- deep_security_scan, secrets_scan, dependency_audit, trivy_scan — security
- ast_search(path, pattern, language) — structural code search
- code_edit, code_write — make changes (path must be inside cloned repo)
- sandbox_exec — run commands in sandbox

CRITICAL — AVOID REDUNDANT CALLS (this wastes tokens and time):
- If user asks about a SUBDIRECTORY of a repo, call tools ONLY on that subdirectory path. Do NOT also call them on the parent repo.
- After repo_summary you ALREADY have: README contents, directory structure, entry points, dependencies, code stats. Do NOT then call list_files, read_file(README), code_stats, or dependency_graph on the same path.
- After list_files you ALREADY have file names. Do NOT call repo_summary unless you specifically need the README or stats.
- After read_file lines 1-100 you have those lines. Do NOT re-read them. Use start_line=101 to continue.
- Each tool call adds tokens to your context. Plan the MINIMUM set of calls needed to answer.

Workflow:
1. clone_repo if user gives a GitHub URL
2. Pick ONE high-information tool first (repo_summary OR knowledge_graph OR symbol_map)
3. Only call additional tools if the first one is missing the specific info needed
4. Answer the user — don't keep exploring after you have enough

ALWAYS cite file paths and line numbers in format \`file.ext:42\`. NEVER fabricate paths. Tool outputs have [receipt:XXXX] prefixes — your claims are auto-verified.

Be terse. Minimum tools, maximum signal.` }
  ];
  try { if (history) { const h = Array.isArray(history) ? history : JSON.parse(history); conversationHistory.push(...h); } } catch {}

  // Receipt ledger needs to live before @-mention injection so we can record
  // injected context as evidence the verifier can match against.
  const ledger = new ReceiptLedger();

  // ── @-mention context injection ──────────────────────────────────────
  // Detect @cockpit, @whitehat, @search, @compare, @api, @heal in the message.
  // For each, inject the cached sessionContext entry as a system message.
  const mentionRe = /@(cockpit|whitehat|search|compare|api|heal)\b/gi;
  const mentioned = new Set();
  let m;
  while ((m = mentionRe.exec(message)) !== null) mentioned.add(m[1].toLowerCase());

  const injectedSources = [];
  const missingSources = [];
  if (mentioned.size > 0) {
    const blocks = [];
    for (const src of mentioned) {
      if (sessionContext[src]) {
        const block = formatContextBlock(src, sessionContext[src]);
        blocks.push(block);
        injectedSources.push(src);
        // ALSO push to the verifier ledger so this counts as "evidence the agent
        // had access to" — otherwise inline code refs to scanner names get flagged
        // as fabricated and coverage drops to 0.
        ledger.record('mention_' + src, { source: src }, block);
      } else {
        missingSources.push(src);
      }
    }
    if (blocks.length > 0) {
      conversationHistory.push({
        role: 'system',
        content: `The user has attached the following context from previous tab runs. Use this data to answer — do NOT re-run the tools unless explicitly asked. Cite specific findings, files, and line numbers from this context.\n\n${blocks.join('\n')}`,
      });
    }
    if (missingSources.length > 0) {
      conversationHistory.push({
        role: 'system',
        content: `Note: the user mentioned @${missingSources.join(', @')} but no run is cached for ${missingSources.length === 1 ? 'that tab' : 'those tabs'}. Tell the user to run ${missingSources.length === 1 ? 'that tab' : 'those tabs'} first.`,
      });
    }
  }
  // Strip the @-mentions from the user message to keep it clean (optional — LLM handles either)
  const cleanMessage = message.replace(mentionRe, '').replace(/\s+/g, ' ').trim();
  conversationHistory.push({ role: 'user', content: cleanMessage || message });

  if (injectedSources.length > 0) {
    send('mentions', { injected: injectedSources, missing: missingSources });
    console.log(`Chat @-mentions: injected=${injectedSources.join(',')} missing=${missingSources.join(',')||'none'}`);
  }

  console.log(`Chat: "${message.slice(0,60)}" model=${model} impl=${impl} history=${conversationHistory.length-1} msgs`);

  send('status', { type: 'thinking', model, impl });

  const totalStart = performance.now();
  let totalToolCalls = 0, totalMcpMs = 0, totalInTok = 0, totalOutTok = 0;
  // (ledger is declared earlier so @-mention injection can record into it)

  for (let round = 0; round < 12; round++) {
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

            } else if (BROWSER_TOOL_NAMES.has(tc.function.name)) {
              // Route to chrome-devtools-mcp singleton
              const name = tc.function.name;
              let result;
              try {
                if (name === 'browser_navigate') {
                  result = await callBrowserTool('navigate_page', { url: args.url });
                } else if (name === 'browser_snapshot') {
                  result = await callBrowserTool('take_snapshot', {});
                } else if (name === 'browser_screenshot') {
                  const filePath = await browserScreenshotToFile();
                  result = `Screenshot saved to: ${filePath}`;
                } else if (name === 'browser_click') {
                  result = await callBrowserTool('click', args);
                } else if (name === 'browser_type') {
                  // chrome-devtools-mcp uses fill for inputs, type_text for keystrokes
                  result = await callBrowserTool(args.uid || args.selector ? 'fill' : 'type_text', args);
                } else if (name === 'browser_eval') {
                  result = await callBrowserTool('evaluate_script', { function: args.function });
                } else {
                  result = `Unknown browser tool: ${name}`;
                }
              } catch (e) {
                result = `Browser tool error: ${e.message}`;
              }
              totalToolCalls++;
              const elapsed = Math.round(performance.now() - toolStart);
              const fullText = String(result);
              content = fullText.length > 6000 ? fullText.slice(0, 6000) + '\n...(truncated)' : fullText;
              const receiptId = ledger.record(tc.function.name, args, fullText);
              content = `[receipt:${receiptId}]\n` + content;
              const lines = fullText.split('\n').filter(l => l.trim()).slice(0, 20);
              send('tool_result', { id: tc.id, impl: 'browser', elapsed, bytes: fullText.length, matchCount: lines.length, preview: lines.slice(0, 10), receipt: receiptId });

            } else if (['grep_search', 'read_file', 'list_files', 'code_stats'].includes(tc.function.name)) {
              // Route through the selected MCP server (C++/Rust/Swift/Python)
              // Falls back to Node executeTool if MCP server doesn't implement this tool yet
              let result, usedImpl = impl;
              try {
                const server = await getServer(impl);
                result = await server.callTool(tc.function.name, args);
                // Detect "method not found" errors
                if (result.text.includes('Method not found') || result.text.includes('Unknown') || result.text === 'No results') {
                  throw new Error('tool not implemented in ' + impl);
                }
              } catch (e) {
                // Fallback to Node executeTool
                const fallback = executeTool(tc.function.name, args);
                if (fallback === null) throw e;
                result = { text: fallback, elapsed: Math.round(performance.now() - toolStart), bytes: Buffer.byteLength(fallback) };
                usedImpl = 'system';
              }
              totalToolCalls++;
              totalMcpMs += result.elapsed;
              const fullText = result.text;
              content = fullText.length > 6000 ? fullText.slice(0, 6000) + '\n...(truncated)' : fullText;
              const receiptId = ledger.record(tc.function.name, args, fullText);
              content = `[receipt:${receiptId}]\n` + content;
              const lines = fullText.split('\n').filter(l => l.trim()).slice(0, 30);
              send('tool_result', { id: tc.id, impl: usedImpl, elapsed: result.elapsed, bytes: result.bytes, matchCount: lines.length, preview: lines.slice(0, 15), receipt: receiptId });

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
          // Resolve relative file:line citations against any repo the user
          // has touched in this session — cockpit/whitehat/heal each cache
          // their repoPath so the verifier can read /tmp/milli-push/repos/foo/lib/bar.js
          // when the LLM cites just lib/bar.js.
          const repoRoots = [
            sessionContext.cockpit?.repoPath,
            sessionContext.whitehat?.repoPath,
            sessionContext.heal?.repoPath,
          ].filter(Boolean);
          const trustReport = await verify(content, ledger, {
            useJudge,
            apiKey: process.env.OPENROUTER_API_KEY,
            model: 'google/gemma-4-26b-a4b-it',
            repoRoots,
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
    sessionContext.search = {
      pattern, path: args.path, impl,
      matchCount: lines.length,
      lines: lines.slice(0, 100),
      summary: `"${pattern}" → ${lines.length} matches via ${impl}`,
      ts: Date.now(),
    };
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
  const winner = valid[0]?.impl || null;
  sessionContext.compare = {
    pattern, path: args.path, winner, results,
    summary: `"${pattern}" raced ${results.length} servers · winner ${winner}`,
    ts: Date.now(),
  };
  res.json({
    pattern, path: args.path,
    totalMs: Math.round((performance.now() - start) * 100) / 100,
    winner,
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
  sessionContext.api = {
    specPath, query: query || '',
    results: text,
    summary: `${specPath.split('/').pop()} · ${(text||'').length} bytes`,
    ts: Date.now(),
  };
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
    sessionContext.heal = {
      repoPath,
      diagnostic: diagResult,
      fixPlan,
      summary: 'diagnosed + fix plan generated',
      ts: Date.now(),
    };
  } catch (e) {
    send('step', { phase: 'fix', status: 'error', text: 'LLM error: ' + e.message });
  }

  send('complete', { repoPath });
  res.end();
});

// White-hat full security audit — runs all security tools, streams results via SSE
// ─── Cockpit findings extractor (per-scanner, strict) ───
// Returns [{file, line, snippet?}] for a single scanner's text output.
// Excludes scanners that don't produce findings (code_stats, repo_summary).
// Requires file:line to appear at the start of an indented line (real entry,
// not a URL or a quoted README example). Strips http(s) URLs first to avoid
// matching ports in CVE advisory links.
function extractCockpitFindings(scanName, text) {
  if (!text) return [];
  if (scanName === 'code_stats' || scanName === 'repo_summary') return [];

  const out = [];
  const seen = new Set();
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (!line.trim()) continue;
    // Strip URLs first — advisory links contain colons that look like file:line
    line = line.replace(/https?:\/\/\S+/g, '');
    // Real findings are indented (2+ spaces). Top-level headings/labels skipped.
    // Pattern: optional indent, then path with extension, then :line, then space or end
    const m = line.match(/^\s{2,}([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+):(\d+)(?:[\s:]|$)/);
    if (!m) continue;
    const file = m[1];
    const lineNum = parseInt(m[2], 10);
    if (!Number.isFinite(lineNum)) continue;
    // Filter common false positives: scanner self-references and dotfiles in package paths
    if (/node_modules\/.*\.json/.test(file) && file.length < 30) continue;
    const key = file + ':' + lineNum;
    if (seen.has(key)) continue;
    seen.add(key);
    // Snippet = the rest of the line after the file:line
    const after = line.slice(m[0].length).trim().slice(0, 120);
    out.push({ file, line: lineNum, snippet: after || undefined });
    if (out.length >= 30) break;
  }
  return out;
}

// Count "real" findings for a scanner — uses extractor for indented findings,
// plus the scanner's own structured count for dependency_audit (npm audit JSON-ish).
function countCockpitFindings(scanName, text, extracted) {
  if (!text) return 0;
  if (scanName === 'code_stats' || scanName === 'repo_summary') return 0;
  // dependency_audit: parse the "Vulnerabilities: critical=X high=Y moderate=Z low=W" line
  if (scanName === 'dependency_audit') {
    const m = text.match(/Vulnerabilities:\s*critical=(\d+)\s*high=(\d+)\s*moderate=(\d+)\s*low=(\d+)/);
    if (m) return parseInt(m[1]) + parseInt(m[2]) + parseInt(m[3]) + parseInt(m[4]);
  }
  // Otherwise use the count of distinct file:line refs we extracted
  return extracted.length;
}

// ═══ COCKPIT — Unified Mission Control ═══
// Runs all scans in TRUE parallel via child processes and streams events live.
app.post('/api/cockpit/analyze', async (req, res) => {
  const { repo, path: localPath } = req.body;
  if (!repo && !localPath) return res.status(400).json({ error: 'repo or path required' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
  };

  let repoPath = localPath;

  // Clone if needed (sync — needs to finish before scans launch)
  if (repo && !localPath) {
    send('step', { name: 'clone', status: 'running', label: 'Cloning repository' });
    const t0 = performance.now();
    try {
      repoPath = cloneOrGetRepo(repo);
      if (!repoPath) throw new Error('Clone failed');
      send('step', { name: 'clone', status: 'done', label: 'Cloned', elapsed: Math.round(performance.now() - t0), path: repoPath });
    } catch (e) {
      send('step', { name: 'clone', status: 'error', label: 'Clone failed: ' + e.message });
      res.end();
      return;
    }
  }

  const scans = [
    { name: 'code_stats',         label: 'Code Statistics',     scoreKey: 'complexity' },
    { name: 'repo_summary',       label: 'Repo Overview',       scoreKey: 'maintainability' },
    { name: 'deep_security_scan', label: 'OWASP Security Scan', scoreKey: 'security', args: { ruleset: 'owasp' } },
    { name: 'dependency_audit',   label: 'CVE Dependency Audit',scoreKey: 'security' },
    { name: 'secrets_scan',       label: 'Secrets Detection',   scoreKey: 'security', args: { scan_history: false } },
    { name: 'security_scan',      label: 'Pattern Security',    scoreKey: 'security' },
    { name: 'port_scan',          label: 'Network Exposure',    scoreKey: 'security' },
  ];

  // Announce all as running BEFORE launching any work — these flush immediately
  scans.forEach(s => send('step', { name: s.name, status: 'running', label: s.label }));

  const scanResults = {};
  const workerScript = resolve(__dirname, 'cockpit-worker.js');

  const runOne = (scan) => new Promise((done) => {
    const t0 = performance.now();
    const args = { path: repoPath, ...(scan.args || {}) };
    const child = spawn(process.execPath, [workerScript, scan.name, JSON.stringify(args)], {
      cwd: resolve(__dirname, '..'),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('exit', (code) => {
      const elapsed = Math.round(performance.now() - t0);
      if (code !== 0 || !stdout) {
        send('step', { name: scan.name, status: 'error', label: scan.label + ': ' + (stderr.trim().slice(-200) || 'exit '+code), elapsed });
        scanResults[scan.name] = { text: '', elapsed, findings: 0, scoreKey: scan.scoreKey };
        return done();
      }
      const text = stdout;
      const extracted = extractCockpitFindings(scan.name, text);
      const findings = countCockpitFindings(scan.name, text, extracted);
      scanResults[scan.name] = { text, elapsed, findings, scoreKey: scan.scoreKey, extracted };
      send('step', { name: scan.name, status: 'done', label: scan.label, elapsed, findings, text });
      // Emit each verified finding as its own SSE 'finding' event for the right panel
      extracted.slice(0, 15).forEach(f => {
        send('finding', {
          scan: scan.name,
          file: f.file,
          line: f.line,
          snippet: f.snippet,
          severity: scan.scoreKey === 'security' ? 'warn' : 'info',
        });
      });
      done();
    });
    child.on('error', (err) => {
      send('step', { name: scan.name, status: 'error', label: scan.label + ': ' + err.message, elapsed: Math.round(performance.now() - t0) });
      scanResults[scan.name] = { text: '', elapsed: Math.round(performance.now() - t0), findings: 0, scoreKey: scan.scoreKey };
      done();
    });
  });

  // True parallel: each scan runs in its own child process
  await Promise.all(scans.map(runOne));

  // Compute 6 scores (0-100, higher = better)
  const secFindings = Object.values(scanResults).filter(r => r.scoreKey === 'security').reduce((s, r) => s + (r.findings || 0), 0);
  const securityScore = Math.max(0, 100 - secFindings * 3);

  // Quality: based on repo_summary presence + no errors
  const qualityScore = scanResults.repo_summary ? 85 : 60;

  // Complexity: inverse of LOC (rough)
  const codeStatsText = scanResults.code_stats?.text || '';
  const locMatch = codeStatsText.match(/(\d[\d,]*)\s*(lines|LOC)/i);
  const loc = locMatch ? parseInt(locMatch[1].replace(/,/g, '')) : 0;
  const complexityScore = loc === 0 ? 75 : Math.max(20, 100 - Math.min(80, Math.floor(loc / 1000)));

  // Performance: based on scan elapsed times
  const avgElapsed = Object.values(scanResults).reduce((s, r) => s + (r.elapsed || 0), 0) / Math.max(1, Object.keys(scanResults).length);
  const performanceScore = Math.max(40, 100 - Math.floor(avgElapsed / 100));

  // Maintainability: based on secrets + deps
  const maintScore = Math.max(30, 95 - (scanResults.secrets_scan?.findings || 0) * 5 - (scanResults.dependency_audit?.findings || 0) * 2);

  // Trust: average of all + presence of tests (placeholder)
  const trustScore = Math.round((securityScore + qualityScore + maintScore) / 3);

  const scores = {
    security: Math.round(securityScore),
    quality: Math.round(qualityScore),
    complexity: Math.round(complexityScore),
    performance: Math.round(performanceScore),
    maintainability: Math.round(maintScore),
    trust: trustScore,
  };

  send('scores', scores);

  const totalFindings = Object.values(scanResults).reduce((s, r) => s + (r.findings || 0), 0);
  const grade = trustScore >= 90 ? 'A+' : trustScore >= 80 ? 'A' : trustScore >= 70 ? 'B' : trustScore >= 60 ? 'C' : 'D';

  // Cache for @cockpit mentions in chat
  const cockpitFindings = [];
  for (const [scanName, r] of Object.entries(scanResults)) {
    const refs = (r.text || '').match(/([a-zA-Z0-9_\-./]+\.[a-z]+):(\d+)/g) || [];
    [...new Set(refs)].slice(0, 15).forEach(ref => {
      const [file, line] = ref.split(':');
      cockpitFindings.push({ scan: scanName, file, line: parseInt(line) });
    });
  }
  sessionContext.cockpit = {
    repoPath,
    scores,
    grade,
    totalFindings,
    scanCount: scans.length,
    scans: Object.fromEntries(Object.entries(scanResults).map(([k, v]) => [k, v.text])),
    findings: cockpitFindings,
    summary: `grade ${grade} · ${totalFindings} findings · ${scans.length} scans`,
    ts: Date.now(),
  };

  send('complete', { totalFindings, scanCount: scans.length, scores, grade, repoPath });
  res.end();
});

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

  // Cache for @whitehat mentions
  sessionContext.whitehat = {
    repoPath,
    totalFindings,
    scanCount: scans.length,
    scans: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.text])),
    summary: `${totalFindings} findings · ${scans.length} scans`,
    ts: Date.now(),
  };

  // Summary
  send('complete', { totalFindings, scanCount: scans.length, results: Object.fromEntries(Object.entries(results).map(([k,v]) => [k, { elapsed: v.elapsed, findings: v.findings }])) });
  res.end();
});

// ═══ SELF-HEAL LOOP — write → run in sandbox → if exit≠0, patch → retry ═══
// Picoclaw-style: the agent fixes its own bugs in an isolated environment.
// Streams each iteration via SSE so the UI can show the loop live.
//
// Body: { code, language, objective?, max_attempts?, model? }
// Events: iteration{n,phase,detail}, stdout{chunk}, stderr{chunk}, exit{code,elapsed},
//         patch{newCode}, done{status,attempts,finalCode}
import { runSandbox } from './sandbox.js';

app.post('/api/sandbox/self-heal', async (req, res) => {
  const { code, language, objective, max_attempts = 5, model = 'google/gemma-4-26b-a4b-it' } = req.body || {};
  if (!code || typeof code !== 'string') return res.status(400).json({ error: 'code (string) required' });
  if (!language) return res.status(400).json({ error: 'language required' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
  };

  let currentCode = code;
  let attempt = 0;
  const t0 = Date.now();
  const maxA = Math.max(1, Math.min(10, parseInt(max_attempts, 10) || 5));

  while (attempt < maxA) {
    attempt++;
    send('iteration', { n: attempt, phase: 'run', codePreview: currentCode.slice(0, 200) });

    // Run the current code in the sandbox (10s timeout)
    const result = await runSandbox({ code: currentCode, language, timeout: 10000 });

    // Stream the output
    if (result.stdout) send('stdout', { chunk: result.stdout });
    if (result.stderr) send('stderr', { chunk: result.stderr });
    send('exit', { n: attempt, code: result.exitCode, elapsed: result.elapsedMs, timedOut: result.timedOut });

    if (result.exitCode === 0 && !result.timedOut) {
      send('done', {
        status: 'passed',
        attempts: attempt,
        elapsedMs: Date.now() - t0,
        finalCode: currentCode,
        finalStdout: result.stdout,
      });
      res.end();
      return;
    }

    // Failed. If we have attempts left, ask the LLM to patch.
    if (attempt >= maxA) {
      send('done', {
        status: 'failed',
        attempts: attempt,
        elapsedMs: Date.now() - t0,
        finalCode: currentCode,
        finalStderr: result.stderr,
        reason: result.timedOut ? 'timeout' : `exit ${result.exitCode}`,
      });
      res.end();
      return;
    }

    send('iteration', { n: attempt, phase: 'patch', detail: 'asking ' + model + ' to fix' });

    const fixPrompt = `You are a code-repair agent. The following ${language} code failed in a sandbox.

${objective ? `OBJECTIVE: ${objective}\n\n` : ''}CURRENT CODE:
\`\`\`${language}
${currentCode}
\`\`\`

EXIT CODE: ${result.exitCode}${result.timedOut ? ' (timeout)' : ''}

STDOUT:
${result.stdout || '(empty)'}

STDERR:
${result.stderr || '(empty)'}

Reply with EXACTLY ONE corrected code block in the same language. No prose, no explanation outside the code block. Just one fenced \`\`\`${language} ... \`\`\` block.`;

    try {
      const completion = await chatWithRetry(
        [{ role: 'user', content: fixPrompt }],
        model,
      );
      const reply = completion.choices?.[0]?.message?.content || '';
      // Extract the first fenced code block
      const m = reply.match(/```(?:[a-zA-Z]+)?\n([\s\S]*?)```/);
      if (!m) {
        send('iteration', { n: attempt, phase: 'patch', detail: 'LLM did not return a code block, retrying with same code' });
        continue; // try again with the same code (rare — usually means LLM emitted prose)
      }
      const newCode = m[1].trim();
      if (newCode === currentCode.trim()) {
        send('done', {
          status: 'stuck',
          attempts: attempt,
          elapsedMs: Date.now() - t0,
          finalCode: currentCode,
          reason: 'LLM returned identical code (giving up)',
        });
        res.end();
        return;
      }
      send('patch', { n: attempt, newCode, diff_summary: `${newCode.split('\n').length} lines (was ${currentCode.split('\n').length})` });
      currentCode = newCode;
    } catch (e) {
      send('iteration', { n: attempt, phase: 'patch', detail: 'LLM call failed: ' + e.message });
      // Don't bail — try one more time with the same code
    }
  }
});

// ═══ SANDBOX — execute a code block in an isolated process ═══
// Uses macOS sandbox-exec (fs-restricted, network-denied) via src/sandbox.js.
app.post('/api/sandbox/run', async (req, res) => {
  const { code, language, timeout } = req.body || {};
  if (!code || typeof code !== 'string') return res.status(400).json({ error: 'code (string) required' });
  if (!language) return res.status(400).json({ error: 'language required (one of: ' + listSupportedLanguages().join(',') + ')' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
  };

  send('start', { language, timeout: timeout || 10000 });

  try {
    runSandboxStream({ code, language, timeout: timeout || 10000 }, {
      onStdout: (chunk) => send('stdout', { chunk }),
      onStderr: (chunk) => send('stderr', { chunk }),
      onExit: ({ id, exitCode, signal, elapsedMs, timedOut }) => {
        send('exit', { id, exitCode, signal, elapsedMs, timedOut });
        res.end();
      },
      onError: (err) => {
        send('error', { message: err.message });
        res.end();
      },
    });
  } catch (e) {
    send('error', { message: e.message });
    res.end();
  }
});

// Sandbox capabilities — lets the UI know if deploy is wired
app.get('/api/sandbox/config', (_, res) => {
  res.json({
    runtime: 'sandbox-exec',
    languages: listSupportedLanguages(),
    deploy: {
      provider: 'cloudflare-workers',
      configured: deployConfigured(),
      languages: ['js','ts','mjs'],
    },
  });
});

// ═══ DEPLOY — push a code block to Cloudflare Workers ═══
app.post('/api/sandbox/deploy', async (req, res) => {
  const { code, language, name } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code required' });
  if (!['js','ts','mjs'].includes(String(language||'').toLowerCase())) {
    return res.status(400).json({ error: 'Cloudflare Workers only supports JavaScript/TypeScript. Use language: js, ts, or mjs.' });
  }
  try {
    const result = await deployWorker({ code, language, name });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message, hint: e.hint });
  }
});

// File read endpoint for code viewer
app.post('/api/file/read', (req, res) => {
  const { path: filePath, start_line = 1, end_line = 500 } = req.body;
  if (!filePath) return res.status(400).json({ error: 'path required' });
  const result = executeTool('read_file', { path: filePath, start_line, end_line });
  res.json({ content: result });
});

// Model health check — pings each model with a tiny prompt, returns latency + status
app.get('/api/models/health', async (_, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const results = await Promise.all(MODELS.filter(m => !m.local).map(async (m) => {
    const t0 = performance.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m.id, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const ms = Math.round(performance.now() - t0);
      if (resp.status === 429) return { ...m, status: 'rate_limited', ms, ok: false };
      if (!resp.ok) return { ...m, status: `http_${resp.status}`, ms, ok: false };
      const data = await resp.json();
      const provider = data.provider || 'unknown';
      return { ...m, status: 'ok', ms, ok: true, provider };
    } catch (e) {
      return { ...m, status: e.name === 'AbortError' ? 'timeout' : 'error', ms: Math.round(performance.now() - t0), ok: false, error: e.message };
    }
  }));
  results.sort((a, b) => (a.ok === b.ok ? a.ms - b.ms : a.ok ? -1 : 1));
  res.json(results);
});

// What @-mention sources are currently attachable in chat?
app.get('/api/context', (_, res) => {
  const out = {};
  for (const k of SOURCES) {
    const v = sessionContext[k];
    out[k] = v ? { available: true, age: ageStr(v.ts), summary: v.summary || '' } : { available: false };
  }
  res.json(out);
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
