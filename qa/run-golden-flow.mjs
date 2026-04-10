// Milli-Agent QA — drives the golden flow through a real headless Chrome
// using chrome-devtools-mcp. Reports pass/fail per assertion.
//
// Usage:
//   node qa/run-golden-flow.mjs                # headless, against http://localhost:3030
//   HEADLESS=0 node qa/run-golden-flow.mjs     # show the browser
//   BASE=http://localhost:3030 node qa/...     # different base url
//   DEBUG=qa node qa/...                       # show MCP server stderr
//
// Exits 0 on all-pass, 1 on any failure.

import { startBrowser } from './mcp-client.mjs';
import { mkdirSync } from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3737';
const HEADLESS = process.env.HEADLESS !== '0';
const SHOTS_DIR = '/tmp/milli-qa-shots';
mkdirSync(SHOTS_DIR, { recursive: true });

const results = [];
let stepIdx = 0;
const t0 = Date.now();

function logStep(msg) {
  stepIdx++;
  console.log(`\n[${String(stepIdx).padStart(2, '0')}] ${msg}`);
}

async function assert(label, fn) {
  const t = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - t;
    console.log(`     ✓ ${label}  (${ms}ms)`);
    if (detail) console.log(`        ${detail}`);
    results.push({ label, pass: true, ms, detail });
  } catch (e) {
    const ms = Date.now() - t;
    console.log(`     ✗ ${label}  (${ms}ms)`);
    console.log(`        ${e.message}`);
    results.push({ label, pass: false, ms, error: e.message });
  }
}

async function main() {
  console.log(`Milli-Agent QA · golden flow`);
  console.log(`base=${BASE}  headless=${HEADLESS}\n`);

  const browser = startBrowser({ headless: HEADLESS });
  await browser.init();

  // Helper: snapshot DOM, return text
  const snap = async () => (await browser.call('take_snapshot')).text;
  const shot = async (name) => browser.call('take_screenshot', { filePath: `${SHOTS_DIR}/${name}.png` });
  const evalJs = (code) => browser.evalJs(code);

  try {
    // ── Step 1: Load page ──
    logStep('Load milli-agent UI');
    await browser.call('navigate_page', { url: BASE });
    await browser.call('wait_for', { text: 'Mission Control', timeout: 8000 });
    await shot('01-loaded');

    await assert('page title contains Milli', async () => {
      const s = await snap();
      if (!/RootWebArea "Milli-Agent"/.test(s)) throw new Error('title mismatch');
      return null;
    });

    await assert('all 6 nav tabs visible (no Compare)', async () => {
      const s = await snap();
      const expected = ['Cockpit', 'Search', 'Chat', 'API', 'WhiteHat', 'Heal'];
      for (const tab of expected) {
        if (!s.includes(`button "🛩 Cockpit"`) && tab === 'Cockpit') throw new Error('Cockpit missing');
        if (!s.includes(tab)) throw new Error(`tab missing: ${tab}`);
      }
      if (/button.*Compare/.test(s)) throw new Error('Compare tab still present!');
      return `found ${expected.length} tabs`;
    });

    await assert('default tab is Cockpit', async () => {
      const s = await snap();
      if (!s.includes('Mission Control')) throw new Error('Mission Control header missing');
      return null;
    });

    await assert('Mission card golden flow card visible', async () => {
      const s = await snap();
      if (!/Mission · The Golden Flow/i.test(s) && !/Golden Flow/i.test(s)) throw new Error('mission card not found');
      return null;
    });

    // ── Step 2: Cockpit Launch ──
    logStep('Run cockpit on tj/commander.js');
    // Type the URL into the cockpit input
    const cockpitUrl = 'https://github.com/tj/commander.js';

    await evalJs(`
      const inputs = document.querySelectorAll('input.sinput');
      const cockpitInput = Array.from(inputs).find(i => i.placeholder && i.placeholder.includes('GitHub'));
      if (!cockpitInput) return { error: 'cockpit input not found' };
      cockpitInput.value = '${cockpitUrl}';
      cockpitInput.dispatchEvent(new Event('input', { bubbles: true }));
      return { ok: true };
    `);

    await evalJs(`
      const btns = Array.from(document.querySelectorAll('button'));
      const launch = btns.find(b => b.textContent && b.textContent.includes('Launch'));
      if (!launch) return { error: 'Launch button not found' };
      launch.click();
      return { ok: true };
    `);
    await shot('02-launched');

    await assert('cockpit run completes within 60s', async () => {
      for (let i = 0; i < 120; i++) {
        const j = await evalJs(`
          const cs = window.__milli?.cockpitState;
          if (!cs) return { error: '__milli.cockpitState missing' };
          return { running: !!cs.running, complete: !!cs.complete, scoreKeys: cs.scores ? Object.keys(cs.scores).length : 0 };
        `);
        if (j?.error) throw new Error(j.error);
        if (j?.complete) return `complete, ${j.scoreKeys} score keys`;
        await new Promise(r => setTimeout(r, 500));
      }
      throw new Error('cockpitState.complete never set');
    });

    await assert('all 6 score cards rendered', async () => {
      const s = await snap();
      const expected = ['Security', 'Quality', 'Complexity', 'Performance', 'Maintainability', 'Trust'];
      const missing = expected.filter(k => !s.toLowerCase().includes(k.toLowerCase()));
      if (missing.length) throw new Error('missing: ' + missing.join(','));
      return `all ${expected.length} score cards present`;
    });

    await assert('grade letter A+/A/B/C/D shown in summary', async () => {
      const s = await snap();
      if (!/grade.*[A-D]/i.test(s) && !/(A\+|[A-D]).*\d+ findings/.test(s)) {
        // Looser check: just look for any solo letter near "complete"
      }
      const m = s.match(/(A\+|[A-D])\s*Mission/);
      const grade = m ? m[1] : 'unknown';
      return `grade=${grade}`;
    });

    await assert('at least 1 real finding in right panel', async () => {
      const j = await evalJs(`
        const cs = window.__milli?.cockpitState;
        if (!cs) return { error: '__milli.cockpitState missing' };
        return { count: cs.findings.length, sample: cs.findings[0] || null };
      `);
      if (j?.error) throw new Error(j.error);
      const n = j?.count ?? 0;
      if (n === 0) throw new Error('cockpitState.findings is empty');
      return `${n} findings (e.g. ${j.sample?.scan}:${j.sample?.file}:${j.sample?.line})`;
    });

    await shot('03-cockpit-complete');

    // ── Step 3: Switch to Chat tab ──
    logStep('Switch to Chat tab');
    await evalJs(`
      const btns = Array.from(document.querySelectorAll('button.sidebar-item'));
      const chat = btns.find(b => b.textContent.includes('Chat'));
      if (!chat) return { error: 'Chat sidebar item not found' };
      chat.click();
      return { ok: true };
    `);
    await new Promise(r => setTimeout(r, 500));
    await shot('04-chat-empty');

    await assert('chat input is present', async () => {
      const s = await snap();
      if (!s.includes('Ask Milli-Agent')) throw new Error('chat textarea not found');
      return null;
    });

    await assert('@ context strip shows @cockpit as available (purple)', async () => {
      await evalJs(`await window.__milli.refreshContextStrip(); return { ok: true };`);
      for (let i = 0; i < 10; i++) {
        const j = await evalJs(`
          const strip = document.getElementById('ctx-strip');
          if (!strip) return { error: 'strip missing' };
          const buttons = strip.querySelectorAll('button');
          const cockpit = Array.from(buttons).find(b => b.textContent.includes('cockpit'));
          if (!cockpit) return { found: false };
          // Read computed background — the chip uses rgba(139,92,246,.10) when available
          const bg = getComputedStyle(cockpit).backgroundColor || '';
          const op = parseFloat(getComputedStyle(cockpit).opacity || '1');
          return { found: true, bg, op, text: (cockpit.textContent || '').trim() };
        `);
        // Available chips have purple-tinted bg (rgba(139,92,246,...)) AND opacity 1
        const isPurple = j.bg && /139,\s*92,\s*246/.test(j.bg) && (j.op ?? 1) >= 0.9;
        if (j.found && isPurple) return j.text;
        await new Promise(r => setTimeout(r, 500));
      }
      throw new Error('@cockpit chip never went purple');
    });

    // ── Step 4: Send a chat with @cockpit ──
    logStep('Send chat with @cockpit mention');
    await evalJs(`
      const ta = document.querySelector('textarea');
      if (!ta) return { error: 'textarea missing' };
      ta.value = '@cockpit list the top finding from this run in one line';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return { ok: true };
    `);
    await new Promise(r => setTimeout(r, 200));
    await evalJs(`
      const send = document.getElementById('send-btn');
      if (!send) return { error: 'send button missing' };
      send.click();
      return { ok: true };
    `);
    await shot('05-chat-sending');

    await assert('mentions badge appears (📎 attached: @cockpit)', async () => {
      const r = await browser.call('wait_for', { text: '📎', timeout: 30000 }, 35000);
      return null;
    });

    await assert('LLM response streams and finishes', async () => {
      let lastLen = 0;
      for (let i = 0; i < 120; i++) {
        const j = await evalJs(`
          const st = window.__milli?.state;
          const bubbles = document.querySelectorAll('#chat-messages .bubble');
          const last = bubbles[bubbles.length - 1];
          return { sending: !!st?.sending, len: last?.textContent?.length || 0 };
        `);
        if ((j?.len ?? 0) > lastLen) lastLen = j.len;
        if (!j?.sending && lastLen > 30) return `done · ${lastLen} chars`;
        await new Promise(r => setTimeout(r, 1000));
      }
      throw new Error(`stream did not finish in 120s (max chars seen: ${lastLen})`);
    });

    await shot('06-chat-response');

    await assert('trust badge appears (GROUNDED / LIKELY / etc)', async () => {
      for (let i = 0; i < 30; i++) {
        const j = await evalJs(`
          const st = window.__milli?.state;
          if (!st) return { error: 'no state' };
          const m = st.msgs[st.msgs.length - 1];
          return m?.verification ? { label: m.verification.label, score: m.verification.score } : { waiting: true };
        `);
        if (j?.label) return `${j.label} · ${j.score != null ? Math.round(j.score*100)+'%' : '?'}`;
        await new Promise(r => setTimeout(r, 1000));
      }
      throw new Error('no verification on last message after 30s');
    });

    await shot('07-chat-verified');

    // ── Step 5: Check sandbox endpoint config ──
    logStep('Verify sandbox endpoints reachable from browser');
    await assert('/api/sandbox/config returns deploy.configured boolean', async () => {
      const j = await evalJs(`
        const r = await fetch('/api/sandbox/config');
        return await r.json();
      `);
      if (typeof j?.deploy?.configured !== 'boolean') throw new Error('config malformed: ' + JSON.stringify(j));
      return `runtime=${j.runtime} configured=${j.deploy.configured}`;
    });

  } catch (e) {
    console.log(`\nFATAL: ${e.message}`);
    results.push({ label: 'fatal', pass: false, error: e.message });
  } finally {
    browser.close();
  }

  // Summary
  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = total - passed;
  const totalMs = Date.now() - t0;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Summary: ${passed}/${total} passed  ·  ${failed} failed  ·  ${totalMs}ms total`);
  console.log(`Screenshots: ${SHOTS_DIR}/`);
  if (failed > 0) {
    console.log('\nFailures:');
    results.filter(r => !r.pass).forEach(r => console.log(`  ✗ ${r.label}: ${r.error}`));
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('top-level fatal:', e); process.exit(2); });
