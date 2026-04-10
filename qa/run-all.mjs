// Run every qa/run-*.mjs in sequence and aggregate results.
// Used by pre-commit and as a single "is the UI healthy?" check.
//
// Usage:
//   node qa/run-all.mjs
//   BASE=http://127.0.0.1:3737 node qa/run-all.mjs
//   HEADLESS=0 node qa/run-all.mjs   # show the browser

import { spawn } from 'child_process';
import { readdirSync } from 'fs';
import { resolve as resolvePath, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || 'http://127.0.0.1:3737';

// Order: golden flow first (smoke), then deeper tabs
const ORDER = ['run-golden-flow.mjs', 'run-sandbox.mjs', 'run-deploy.mjs', 'run-multimodel.mjs'];
const tests = readdirSync(__dirname)
  .filter(f => f.startsWith('run-') && f.endsWith('.mjs') && f !== 'run-all.mjs')
  .sort((a, b) => (ORDER.indexOf(a) === -1 ? 99 : ORDER.indexOf(a)) - (ORDER.indexOf(b) === -1 ? 99 : ORDER.indexOf(b)));

console.log(`\n${'═'.repeat(60)}\nMilli-Agent QA · run-all\n${'═'.repeat(60)}`);
console.log(`base=${BASE}\ntests=${tests.length}\n`);

// Pre-flight: server reachable?
try {
  const r = await fetch(BASE + '/');
  if (!r.ok) throw new Error('http ' + r.status);
} catch (e) {
  console.error(`✗ server unreachable at ${BASE}: ${e.message}`);
  console.error('  start it with:  PORT=3737 node src/server.js');
  process.exit(2);
}

const t0 = Date.now();
const summary = [];

for (const file of tests) {
  console.log(`\n${'─'.repeat(60)}\n▶ ${file}\n${'─'.repeat(60)}`);
  const t = Date.now();
  const code = await new Promise((res) => {
    const child = spawn('node', [resolvePath(__dirname, file)], {
      stdio: 'inherit',
      env: { ...process.env, BASE },
    });
    child.on('exit', res);
  });
  summary.push({ file, code, ms: Date.now() - t });
}

console.log(`\n${'═'.repeat(60)}\nAggregate (${Date.now() - t0}ms total)\n${'═'.repeat(60)}`);
let allPass = true;
for (const s of summary) {
  const mark = s.code === 0 ? '✓' : '✗';
  const status = s.code === 0 ? 'PASS' : `FAIL (exit ${s.code})`;
  console.log(`  ${mark} ${s.file.padEnd(28)} ${status.padEnd(20)} ${s.ms}ms`);
  if (s.code !== 0) allPass = false;
}
console.log();
process.exit(allPass ? 0 : 1);
