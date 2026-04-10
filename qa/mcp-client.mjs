// Tiny MCP stdio client for chrome-devtools-mcp.
// Provides .call(toolName, args) returning result.content[0].text
import { spawn } from 'child_process';

export function startBrowser({ headless = true, viewport = '1400x900' } = {}) {
  const args = ['-y', 'chrome-devtools-mcp@latest', '--isolated', '--viewport', viewport];
  if (headless) args.splice(2, 0, '--headless');
  const proc = spawn('npx', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    // detached: true → spawn in its own process group so we can kill the
    // whole tree (npm parent + chrome-devtools-mcp grandchild + any children)
    // with a single signal. Otherwise the binary leaks when only npm is killed.
    detached: true,
    env: {
      ...process.env,
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1',
      CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1',
    },
  });
  // Don't let our parent process keep the child alive past its own exit.
  // Without unref(), node waits for the child even after main() returns.
  proc.unref();

  let buf = '';
  let nextId = 1;
  const pending = new Map();
  proc.stdout.on('data', d => {
    buf += d.toString();
    while (buf.includes('\n')) {
      const i = buf.indexOf('\n');
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id != null && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      } catch {}
    }
  });
  // Swallow stderr unless DEBUG=qa
  proc.stderr.on('data', d => {
    if (process.env.DEBUG === 'qa') process.stderr.write('[srv] ' + d.toString());
  });

  function rpc(method, params = {}, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, msg => {
        if (msg.error) reject(new Error(`${method}: ${msg.error.message || JSON.stringify(msg.error)}`));
        else resolve(msg.result);
      });
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`timeout: ${method}`));
        }
      }, timeoutMs);
    });
  }

  async function call(toolName, args = {}, timeoutMs) {
    const result = await rpc('tools/call', { name: toolName, arguments: args }, timeoutMs);
    const text = result?.content?.[0]?.text || '';
    return { text, raw: result };
  }

  // High-level helper: run a JS expression in the page and return its value (parsed if JSON).
  // Accepts either an arrow function source `() => ...` or a bare expression string.
  // chrome-devtools-mcp wraps results as: "Script ran on page and returned:\n```json\n<value>\n```"
  async function evalJs(code, { timeoutMs = 30000 } = {}) {
    let fnSource;
    if (/^\s*(async\s*)?\(.*\)\s*=>/.test(code) || /^\s*function\s*\(/.test(code)) {
      fnSource = code;
    } else if (/^\s*async\s/.test(code)) {
      fnSource = code; // bare async function
    } else {
      // bare expression / statements — wrap in async IIFE returning the last expression
      fnSource = `async () => { ${code} }`;
    }
    const r = await call('evaluate_script', { function: fnSource }, timeoutMs);
    const m = r.text.match(/```json\n([\s\S]*?)\n```/);
    if (!m) {
      // Sometimes the script just runs without a return value
      if (/Script ran on page/.test(r.text) && !/returned/.test(r.text)) return undefined;
      return r.text;
    }
    try { return JSON.parse(m[1]); }
    catch { return m[1]; }
  }

  async function init() {
    await rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'milli-qa', version: '0.1' },
    });
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    await new Promise(r => setTimeout(r, 200));
  }

  function close() {
    // Kill the whole process group (negative PID) so the chrome-devtools-mcp
    // grandchild dies too, not just the npm parent.
    try { process.kill(-proc.pid, 'SIGKILL'); }
    catch {
      // Fallback if the group is gone — kill the parent at least
      try { proc.kill('SIGKILL'); } catch {}
    }
  }

  // Auto-cleanup if the test process exits without explicitly calling close()
  const cleanup = () => { try { close(); } catch {} };
  process.once('exit', cleanup);
  process.once('SIGINT', () => { cleanup(); process.exit(130); });
  process.once('SIGTERM', () => { cleanup(); process.exit(143); });
  process.once('uncaughtException', (e) => { cleanup(); console.error(e); process.exit(1); });

  return { rpc, call, evalJs, init, close, proc };
}
