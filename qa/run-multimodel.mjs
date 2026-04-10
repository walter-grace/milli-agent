// QA: Multi-model fan-out in chat (replaces the deleted Compare tab)
// 1. Open Chat tab
// 2. Pick 2 models in the sidebar (state.activeModels.length === 2)
// 3. Send a tiny prompt
// 4. Assert: 2 lanes render, both have content, one has the FASTEST crown

import { startBrowser } from './mcp-client.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:3737';
const HEADLESS = process.env.HEADLESS !== '0';
const results = [];
const t0 = Date.now();

async function assert(label, fn) {
  const t = Date.now();
  try {
    const detail = await fn();
    console.log(`     ✓ ${label}  (${Date.now() - t}ms)`);
    if (detail) console.log(`        ${detail}`);
    results.push({ label, pass: true });
  } catch (e) {
    console.log(`     ✗ ${label}  (${Date.now() - t}ms)`);
    console.log(`        ${e.message}`);
    results.push({ label, pass: false, error: e.message });
  }
}

(async () => {
  console.log(`Milli-Agent QA · multi-model lanes\nbase=${BASE}  headless=${HEADLESS}\n`);
  const browser = startBrowser({ headless: HEADLESS });
  await browser.init();

  try {
    console.log('[01] Load chat');
    await browser.call('navigate_page', { url: BASE });
    await browser.call('wait_for', { text: 'Mission Control', timeout: 8000 });
    await browser.evalJs(`
      const btns = Array.from(document.querySelectorAll('button.sidebar-item'));
      Array.from(btns).find(b => b.textContent.includes('Chat')).click();
      return { ok: true };
    `);
    await new Promise(r => setTimeout(r, 600));

    console.log('\n[02] Activate 2 models in the sidebar');
    await assert('two models added to state.activeModels', async () => {
      // Force activeModels to be exactly 2 — pick the first 2 models
      const j = await browser.evalJs(`
        const st = window.__milli?.state;
        if (!st || !st.models?.length) return { error: 'no models loaded yet' };
        const ids = st.models.slice(0, 2).map(m => m.id);
        st.activeModels = ids;
        return { activeModels: st.activeModels };
      `);
      if (j?.error) throw new Error(j.error);
      if (j.activeModels.length !== 2) throw new Error('activeModels.length=' + j.activeModels.length);
      return j.activeModels.join(' + ');
    });

    console.log('\n[03] Send a tiny prompt');
    const prompt = 'Reply with exactly one short sentence: "Hello from milli QA."';
    await browser.evalJs(`
      const ta = document.querySelector('textarea');
      ta.value = ${JSON.stringify(prompt)};
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('send-btn').click();
      return { ok: true };
    `);

    await assert('multi-lane grid appears', async () => {
      for (let i = 0; i < 30; i++) {
        const j = await browser.evalJs(`
          const grids = document.querySelectorAll('#chat-messages > .messages-inner > div');
          // sendChatMulti creates a div with display:grid
          const last = grids[grids.length - 1];
          const display = last ? getComputedStyle(last).display : '';
          const lanes = last ? last.children.length : 0;
          return { display, lanes };
        `);
        if (j.display === 'grid' && j.lanes >= 2) return `${j.lanes} lanes`;
        await new Promise(r => setTimeout(r, 500));
      }
      throw new Error('no grid with >=2 lanes within 15s');
    });

    await assert('both lanes finish (state.sending=false)', async () => {
      for (let i = 0; i < 90; i++) {
        const j = await browser.evalJs(`return { sending: !!window.__milli?.state?.sending };`);
        if (!j.sending) return null;
        await new Promise(r => setTimeout(r, 1000));
      }
      throw new Error('multi-fan still sending after 90s');
    });

    await assert('both lanes have content', async () => {
      const j = await browser.evalJs(`
        const grids = document.querySelectorAll('#chat-messages > .messages-inner > div');
        const last = grids[grids.length - 1];
        if (!last) return { error: 'no grid' };
        const lanes = Array.from(last.children);
        return {
          count: lanes.length,
          lengths: lanes.map(l => (l.querySelector('.bubble')?.textContent || '').length),
        };
      `);
      if (j.error) throw new Error(j.error);
      const empty = j.lengths.filter(l => l < 5).length;
      if (empty > 0) throw new Error(empty + ' lane(s) empty: ' + JSON.stringify(j.lengths));
      return `lengths=${j.lengths.join(',')}`;
    });

    await assert('one lane shows the ⚡ FASTEST crown', async () => {
      const j = await browser.evalJs(`
        const grids = document.querySelectorAll('#chat-messages > .messages-inner > div');
        const last = grids[grids.length - 1];
        const text = last ? last.textContent : '';
        return { hasFastest: /FASTEST/.test(text) };
      `);
      if (!j.hasFastest) throw new Error('no FASTEST crown rendered');
      return null;
    });

  } catch (e) {
    console.log(`\nFATAL: ${e.message}`);
    results.push({ label: 'fatal', pass: false, error: e.message });
  } finally {
    browser.close();
  }

  const passed = results.filter(r => r.pass).length;
  const failed = results.length - passed;
  console.log(`\n${'─'.repeat(60)}\nSummary: ${passed}/${results.length} passed  ·  ${failed} failed  ·  ${Date.now() - t0}ms`);
  if (failed > 0) results.filter(r => !r.pass).forEach(r => console.log(`  ✗ ${r.label}: ${r.error}`));
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('top-level fatal:', e); process.exit(2); });
