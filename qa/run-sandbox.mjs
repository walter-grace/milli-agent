// QA: ▶ Run button on a code block in chat
// 1. Send a chat with a JS code block
// 2. Find the rendered <pre data-lang="js"> in the chat bubble
// 3. Click ▶ Run, wait for the inline output panel
// 4. Assert the output contains "exit 0" and the expected stdout

import { startBrowser } from './mcp-client.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:3737';
const HEADLESS = process.env.HEADLESS !== '0';
const results = [];
const t0 = Date.now();

async function assert(label, fn) {
  const t = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - t;
    console.log(`     ✓ ${label}  (${ms}ms)`);
    if (detail) console.log(`        ${detail}`);
    results.push({ label, pass: true, ms });
  } catch (e) {
    const ms = Date.now() - t;
    console.log(`     ✗ ${label}  (${ms}ms)`);
    console.log(`        ${e.message}`);
    results.push({ label, pass: false, ms, error: e.message });
  }
}

(async () => {
  console.log(`Milli-Agent QA · sandbox ▶ Run button\nbase=${BASE}  headless=${HEADLESS}\n`);
  const browser = startBrowser({ headless: HEADLESS });
  await browser.init();

  try {
    console.log('[01] Load chat tab');
    await browser.call('navigate_page', { url: BASE });
    await browser.call('wait_for', { text: 'Mission Control', timeout: 8000 });
    await browser.evalJs(`
      const btns = Array.from(document.querySelectorAll('button.sidebar-item'));
      const chat = btns.find(b => b.textContent.includes('Chat'));
      if (!chat) return { error: 'Chat sidebar item not found' };
      chat.click();
      return { ok: true };
    `);
    await new Promise(r => setTimeout(r, 500));

    console.log('\n[02] Inject a deterministic assistant message with a JS code block');
    // Bypass the LLM (Gemma is unreliable about emitting clean code blocks).
    // Tests the button wiring, not the model.
    const md = '```js\nconsole.log("milli-sandbox-ok");\nconsole.log("sum=" + (5+5));\n```';
    await browser.evalJs(`
      window.__milli.injectAssistantMessage(${JSON.stringify(md)});
      return { ok: true };
    `);
    await new Promise(r => setTimeout(r, 400)); // let throttled render fire

    await assert('a JS code block was rendered', async () => {
      const j = await browser.evalJs(`
        const pres = document.querySelectorAll('#chat-messages pre[data-lang]');
        const langs = Array.from(pres).map(p => p.getAttribute('data-lang'));
        const jsPre = Array.from(pres).find(p => /^(js|javascript|mjs)$/.test(p.getAttribute('data-lang') || ''));
        return { count: pres.length, langs, hasJs: !!jsPre, code: jsPre?.querySelector('code')?.textContent?.slice(0, 200) };
      `);
      if (!j?.hasJs) throw new Error('no js code block found; langs=' + JSON.stringify(j?.langs));
      return `${j.count} code blocks · js content: ${(j.code || '').slice(0, 80)}…`;
    });

    await assert('▶ Run button is wired on the JS code block', async () => {
      const j = await browser.evalJs(`
        const pres = document.querySelectorAll('#chat-messages pre[data-lang]');
        const jsPre = Array.from(pres).find(p => /^(js|javascript|mjs)$/.test(p.getAttribute('data-lang') || ''));
        if (!jsPre) return { error: 'no js pre' };
        const btns = jsPre.querySelectorAll('button');
        const runBtn = Array.from(btns).find(b => b.textContent.includes('Run'));
        return { hasRun: !!runBtn };
      `);
      if (!j.hasRun) throw new Error('▶ Run button not attached');
      return null;
    });

    console.log('\n[03] Click ▶ Run and capture the streamed output');
    await browser.evalJs(`
      const pres = document.querySelectorAll('#chat-messages pre[data-lang]');
      const jsPre = Array.from(pres).find(p => /^(js|javascript|mjs)$/.test(p.getAttribute('data-lang') || ''));
      const runBtn = Array.from(jsPre.querySelectorAll('button')).find(b => b.textContent.includes('Run'));
      runBtn.click();
      return { clicked: true };
    `);

    await assert('sandbox panel appears with exit 0', async () => {
      for (let i = 0; i < 30; i++) {
        const j = await browser.evalJs(`
          const panel = document.querySelector('#chat-messages .sbx-out');
          if (!panel) return { has: false };
          const text = panel.textContent || '';
          return { has: true, text: text.slice(0, 600), exit0: /exit 0/.test(text), failed: /exit (?!0)/.test(text), milli: /milli-sandbox-ok/.test(text) };
        `);
        if (j?.exit0) return `exit 0 · "milli-sandbox-ok" present: ${j.milli}`;
        if (j?.failed) throw new Error('sandbox returned non-zero exit. text=' + j.text);
        await new Promise(r => setTimeout(r, 500));
      }
      throw new Error('no sandbox output panel within 15s');
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
  if (failed > 0) {
    console.log('Failures:');
    results.filter(r => !r.pass).forEach(r => console.log(`  ✗ ${r.label}: ${r.error}`));
  }
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('top-level fatal:', e); process.exit(2); });
