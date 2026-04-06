// Full milli-agent walkthrough of mac-code/research/expert-sniper/distributed
import { executeTool } from './src/tools.js';

const REPO = '/tmp/mac-code-test';
const TARGET = '/tmp/mac-code-test/research/expert-sniper/distributed';

const colorize = (s, c) => '\x1b[' + c + 'm' + s + '\x1b[0m';
const heading = (n, t) => console.log('\n' + colorize('='.repeat(70), '36') + '\n' + colorize(`STEP ${n}: ${t}`, '36;1') + '\n' + colorize('='.repeat(70), '36'));
const subhead = (t) => console.log('\n' + colorize('▸ ' + t, '33'));

async function step(num, title, fn) {
  heading(num, title);
  const t0 = performance.now();
  try {
    await fn();
    console.log(colorize(`\n✓ Completed in ${Math.round(performance.now() - t0)}ms`, '32'));
  } catch (e) {
    console.log(colorize(`\n✗ Error: ${e.message}`, '31'));
  }
}

const trim = (s, n=15) => s.split('\n').slice(0, n).join('\n');

// === STEP 1: REPO STRUCTURE ===
await step(1, 'Repo Structure (list_files)', async () => {
  const r = executeTool('list_files', { path: TARGET });
  console.log(trim(r, 25));
});

// === STEP 2: CODE STATS ===
await step(2, 'Code Statistics (code_stats)', async () => {
  const r = executeTool('code_stats', { path: TARGET });
  console.log(trim(r, 20));
});

// === STEP 3: SYMBOL MAP ===
await step(3, 'Symbol Map (ctags) — instant orientation', async () => {
  const r = executeTool('symbol_map', { path: TARGET });
  console.log(trim(r, 30));
});

// === STEP 4: REPO SUMMARY ===
await step(4, 'Repo Summary (README + entry points + deps)', async () => {
  const r = executeTool('repo_summary', { path: TARGET });
  console.log(trim(r, 30));
});

// === STEP 5: KNOWLEDGE GRAPH ===
await step(5, 'Knowledge Graph (modules + imports + definitions)', async () => {
  const r = executeTool('knowledge_graph', { path: TARGET, depth: 2 });
  console.log(trim(r, 35));
});

// === STEP 6: GIT INTELLIGENCE ===
subhead('Git history (only available on full repo)');
await step(6, 'Git Summary', async () => {
  const r = executeTool('git_summary', { path: REPO });
  console.log(trim(r, 20));
});

// === STEP 7: SECURITY SCANS ===
await step(7, 'Quick Security Scan', async () => {
  const r = executeTool('security_scan', { path: TARGET });
  console.log(trim(r, 15));
});

await step(8, 'Deep Security Scan (OWASP)', async () => {
  const r = executeTool('deep_security_scan', { path: TARGET, ruleset: 'owasp' });
  console.log(trim(r, 25));
});

await step(9, 'Secrets Scan', async () => {
  const r = executeTool('secrets_scan', { path: TARGET, scan_history: false });
  console.log(trim(r, 20));
});

// === STEP 10: DEPENDENCY AUDIT ===
await step(10, 'Dependency Audit (CVEs)', async () => {
  const r = executeTool('dependency_audit', { path: TARGET });
  console.log(trim(r, 15));
});

// === STEP 11: AST SEARCH ===
await step(11, 'AST Search — all Python class definitions', async () => {
  const r = executeTool('ast_search', { path: TARGET, pattern: 'class $NAME', language: 'py' });
  console.log(trim(r, 20));
});

// === STEP 12: GREP FOR EXPERT-RELATED CODE ===
subhead('grep_search needs MCP server — using fast_find instead');
await step(12, 'Fast Find — Python files', async () => {
  const r = executeTool('fast_find', { path: TARGET, extension: 'py' });
  console.log(trim(r, 20));
});

// === STEP 13: LSP SYMBOLS ===
await step(13, 'LSP Symbols — functions in distributed_interactive.py', async () => {
  const r = executeTool('lsp_symbols', { path: TARGET + '/distributed_interactive.py', kind: 'function' });
  console.log(trim(r, 20));
});

// === STEP 14: PORT SCAN ===
await step(14, 'Port & Network Scan', async () => {
  const r = executeTool('port_scan', { path: TARGET });
  console.log(trim(r, 20));
});

// === STEP 15: README ===
await step(15, 'Read README', async () => {
  const r = executeTool('read_file', { path: TARGET + '/README.md', start_line: 1, end_line: 40 });
  console.log(trim(r, 50));
});

console.log('\n' + colorize('═'.repeat(70), '36'));
console.log(colorize('  WALKTHROUGH COMPLETE', '36;1'));
console.log(colorize('═'.repeat(70), '36'));
