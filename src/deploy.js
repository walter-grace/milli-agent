// Cloudflare Workers deployer — uploads a JS module to a user's CF account
// and returns a live workers.dev URL.
//
// Requires env:
//   CLOUDFLARE_API_TOKEN       — a token with Workers Scripts:Edit
//   CLOUDFLARE_ACCOUNT_ID      — your CF account ID
//   CLOUDFLARE_WORKERS_SUBDOMAIN (optional) — e.g. "milli-agent" → milli-agent.workers.dev
//
// The code must be a Worker module (ES module) exporting a default {fetch(req, env, ctx)}.
// If the user pastes a plain script without `export default`, we wrap it.
//
// API reference:
//   https://developers.cloudflare.com/api/operations/worker-script-upload-worker-module
import { randomUUID } from 'crypto';

const CF_API = 'https://api.cloudflare.com/client/v4';

function needEnv() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) {
    const err = new Error('Cloudflare deploy not configured');
    err.hint = 'Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the server env, then restart.';
    throw err;
  }
  return { token, account };
}

// Turn a plain snippet into a minimal Worker module that echoes the script output on GET /.
// If the user already wrote `export default { fetch(...) { ... } }`, leave it alone.
function wrapIfNeeded(code) {
  const looksLikeWorker = /export\s+default\s*\{[\s\S]*fetch\s*\(/m.test(code);
  if (looksLikeWorker) return code;
  // Wrap: run the snippet once on cold-start, capture console.log output, serve it as text.
  return `
const __capturedLogs = [];
const __origLog = console.log;
console.log = (...args) => __capturedLogs.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));

let __userResult, __userError;
try {
  __userResult = (() => {
${code.split('\n').map(l => '    ' + l).join('\n')}
  })();
} catch (e) {
  __userError = String(e && e.stack || e);
}
console.log = __origLog;

export default {
  async fetch(req, env, ctx) {
    const body = [
      '// Milli-Agent sandbox deploy · ' + new Date().toISOString(),
      '',
      ...__capturedLogs,
      __userError ? '\\nError:\\n' + __userError : '',
      __userResult !== undefined ? '\\nReturn value: ' + (typeof __userResult === 'string' ? __userResult : JSON.stringify(__userResult, null, 2)) : '',
    ].join('\\n');
    return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  },
};
`.trimStart();
}

// Upload a Worker script via multipart. CF's worker-module upload endpoint expects:
//   - a "metadata" part with JSON { main_module, compatibility_date, ... }
//   - one file part per module (we only ever have main.mjs)
async function uploadWorkerModule({ token, account, name, moduleCode }) {
  const boundary = '----millibox-' + randomUUID();
  const metadata = JSON.stringify({
    main_module: 'main.mjs',
    compatibility_date: new Date().toISOString().slice(0, 10),
  });
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="metadata"\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="main.mjs"; filename="main.mjs"\r\n` +
    `Content-Type: application/javascript+module\r\n\r\n` +
    `${moduleCode}\r\n` +
    `--${boundary}--\r\n`;

  const url = `${CF_API}/accounts/${account}/workers/scripts/${name}`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { success: false, raw: text }; }
  if (!resp.ok || !json.success) {
    const msg = json.errors?.map(e => `[${e.code}] ${e.message}`).join('; ') || text;
    const err = new Error('Cloudflare upload failed: ' + msg);
    err.hint = resp.status === 401
      ? 'Check CLOUDFLARE_API_TOKEN has "Workers Scripts:Edit" permission on account ' + account
      : resp.status === 404
      ? 'Check CLOUDFLARE_ACCOUNT_ID is correct'
      : 'See errors array in response';
    throw err;
  }
  return json.result;
}

// Enable the workers.dev route (so the script is reachable at <name>.<subdomain>.workers.dev)
async function enableWorkersDev({ token, account, name }) {
  const url = `${CF_API}/accounts/${account}/workers/scripts/${name}/subdomain`;
  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ enabled: true }),
  });
}

async function getWorkersSubdomain({ token, account }) {
  if (process.env.CLOUDFLARE_WORKERS_SUBDOMAIN) return process.env.CLOUDFLARE_WORKERS_SUBDOMAIN;
  const url = `${CF_API}/accounts/${account}/workers/subdomain`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  const json = await resp.json();
  return json?.result?.subdomain || null;
}

// Main entry — called by /api/sandbox/deploy
export async function deployWorker({ code, language, name }) {
  const { token, account } = needEnv();
  const cleanName = (name || ('milli-snip-' + randomUUID().slice(0, 6))).toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40);
  const moduleCode = wrapIfNeeded(code);

  const t0 = Date.now();
  const result = await uploadWorkerModule({ token, account, name: cleanName, moduleCode });
  await enableWorkersDev({ token, account, name: cleanName });
  const subdomain = await getWorkersSubdomain({ token, account });
  const url = subdomain ? `https://${cleanName}.${subdomain}.workers.dev` : null;
  const elapsedMs = Date.now() - t0;

  return {
    name: cleanName,
    url,
    elapsedMs,
    uploadedAt: new Date().toISOString(),
    size: moduleCode.length,
    cloudflare: {
      id: result?.id,
      etag: result?.etag,
      modified_on: result?.modified_on,
    },
  };
}

export function deployConfigured() {
  return !!(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
}
