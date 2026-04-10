// Cockpit scan worker — runs a single tool and prints its text result.
// Spawned by /api/cockpit/analyze for true OS-level parallelism.
import { executeTool } from './tools.js';

const [, , toolName, argsJson] = process.argv;
if (!toolName) {
  console.error('usage: node cockpit-worker.js <toolName> <argsJson>');
  process.exit(2);
}

let args;
try { args = JSON.parse(argsJson || '{}'); }
catch (e) { console.error('bad args json:', e.message); process.exit(2); }

try {
  const out = executeTool(toolName, args);
  if (out == null) { console.error('tool returned null'); process.exit(3); }
  process.stdout.write(typeof out === 'string' ? out : JSON.stringify(out));
  process.exit(0);
} catch (e) {
  console.error(e.stack || e.message || String(e));
  process.exit(1);
}
