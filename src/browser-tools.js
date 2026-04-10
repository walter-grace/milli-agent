// Singleton chrome-devtools-mcp client.
// Spawns one persistent headless Chrome via npx chrome-devtools-mcp@latest
// and exposes a callBrowserTool(name, args) helper that forwards via JSON-RPC stdio.
//
// Used by milli-agent chat to give the LLM browser_navigate / browser_click /
// browser_screenshot / etc. as first-class tools.
import { spawn } from 'child_process';

let _proc = null;
let _ready = null;
let _nextId = 1;
const _pending = new Map();
let _buf = '';

function _start() {
  if (_proc) return _ready;
  _proc = spawn('npx', ['-y', 'chrome-devtools-mcp@latest', '--headless', '--isolated', '--viewport', '1400x900'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    // Own process group → killable as a unit (npm parent + binary + Chrome)
    detached: true,
    env: {
      ...process.env,
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1',
      CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1',
    },
  });
  // Don't keep the milli-agent server alive waiting for the browser child
  _proc.unref();
  _proc.stdout.on('data', d => {
    _buf += d.toString();
    while (_buf.includes('\n')) {
      const i = _buf.indexOf('\n');
      const line = _buf.slice(0, i);
      _buf = _buf.slice(i + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id != null && _pending.has(msg.id)) {
          _pending.get(msg.id)(msg);
          _pending.delete(msg.id);
        }
      } catch {}
    }
  });
  _proc.stderr.on('data', () => {});
  _proc.on('exit', (code) => {
    console.log('[browser-tools] chrome-devtools-mcp exited code=' + code);
    _proc = null;
    _ready = null;
    for (const cb of _pending.values()) cb({ error: { message: 'browser proc exited' } });
    _pending.clear();
  });

  _ready = (async () => {
    await _rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'milli-agent', version: '0.1' },
    }, 60000);
    _proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    await new Promise(r => setTimeout(r, 200));
    return true;
  })();
  return _ready;
}

function _rpc(method, params = {}, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const id = _nextId++;
    _pending.set(id, msg => {
      if (msg.error) reject(new Error(`${method}: ${msg.error.message || JSON.stringify(msg.error)}`));
      else resolve(msg.result);
    });
    _proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => {
      if (_pending.has(id)) {
        _pending.delete(id);
        reject(new Error(`browser timeout: ${method}`));
      }
    }, timeoutMs);
  });
}

// Public API: call any chrome-devtools-mcp tool by name.
export async function callBrowserTool(toolName, args = {}, { timeoutMs = 60000 } = {}) {
  await _start();
  const result = await _rpc('tools/call', { name: toolName, arguments: args }, timeoutMs);
  return result?.content?.[0]?.text || JSON.stringify(result);
}

// Higher-level helper: returns parsed JSON if the tool returned a fenced ```json``` block.
export async function callBrowserToolJson(toolName, args = {}, opts) {
  const text = await callBrowserTool(toolName, args, opts);
  const m = text.match(/```json\n([\s\S]*?)\n```/);
  if (m) {
    try { return JSON.parse(m[1]); }
    catch { return m[1]; }
  }
  return text;
}

// Save a screenshot to a file path inside /tmp/milli-sandbox-screenshots/<uuid>.png
// and return the path so the agent can read it.
export async function browserScreenshotToFile() {
  await _start();
  const { mkdirSync } = await import('fs');
  const { join } = await import('path');
  const { tmpdir } = await import('os');
  const { randomUUID } = await import('crypto');
  const dir = join(tmpdir(), 'milli-shots');
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, randomUUID().slice(0, 8) + '.png');
  await callBrowserTool('take_screenshot', { filePath });
  return filePath;
}

export function isBrowserReady() {
  return _proc && _ready != null;
}

export function shutdownBrowser() {
  if (_proc) {
    // Kill the entire process group so the chrome-devtools-mcp grandchild
    // dies too — not just the npm parent.
    try { process.kill(-_proc.pid, 'SIGKILL'); }
    catch {
      try { _proc.kill('SIGKILL'); } catch {}
    }
    _proc = null;
    _ready = null;
  }
}

// Hook server lifecycle so a SIGTERM/SIGINT/exit reaps the headless Chrome.
// Without this, every restart of milli-agent leaks a chrome-devtools-mcp child.
const _hookOnce = (() => {
  process.once('exit', shutdownBrowser);
  process.once('SIGINT', () => { shutdownBrowser(); process.exit(130); });
  process.once('SIGTERM', () => { shutdownBrowser(); process.exit(143); });
  return true;
})();
