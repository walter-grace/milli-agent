// QA: 📦 Deploy button on a JS code block in chat
// 1. Check /api/sandbox/config — skip if deploy.configured is false
// 2. Send a chat with a JS code block
// 3. Click 📦 Deploy
// 4. Wait for the inline panel to show "deployed as ..." and a workers.dev URL
// 5. Curl the URL and confirm 200

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
  console.log(`Milli-Agent QA · 📦 Deploy button\nbase=${BASE}  headless=${HEADLESS}\n`);

  // Pre-flight: deploy must be configured
  const cfgResp = await fetch(`${BASE}/api/sandbox/config`);
  const cfg = await cfgResp.json();
  if (!cfg.deploy?.configured) {
    console.log('SKIP: deploy not configured (CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID missing).');
    console.log('Set them in the server env and restart.');
    process.exit(0);
  }
  console.log('deploy is configured ✓\n');

  const browser = startBrowser({ headless: HEADLESS });
  await browser.init();

  try {
    console.log('[01] Load chat tab');
    await browser.call('navigate_page', { url: BASE });
    await browser.call('wait_for', { text: 'Mission Control', timeout: 8000 });
    await browser.evalJs(`
      const btns = Array.from(document.querySelectorAll('button.sidebar-item'));
      const chat = btns.find(b => b.textContent.includes('Chat'));
      chat.click();
      return { ok: true };
    `);
    await new Promise(r => setTimeout(r, 500));

    console.log('\n[02] Inject a deterministic assistant message with a JS code block');
    const md = '```js\nconsole.log("milli-deploy-ok");\nconsole.log("from-cf-worker");\n```';
    await browser.evalJs(`
      window.__milli.injectAssistantMessage(${JSON.stringify(md)});
      return { ok: true };
    `);
    await new Promise(r => setTimeout(r, 400));

    let deployedUrl = null;

    console.log('\n[03] Click 📦 Deploy');
    // Pre-set the deploy name so the click handler skips window.prompt()
    // (window.prompt blocks headless Chrome and stalls the test)
    await browser.evalJs(`
      const pres = document.querySelectorAll('#chat-messages pre[data-lang]');
      const jsPre = Array.from(pres).find(p => /^(js|javascript|mjs)$/.test(p.getAttribute('data-lang') || ''));
      if (!jsPre) return { error: 'no js pre' };
      jsPre.dataset.deployName = 'milli-qa-test';
      const btn = Array.from(jsPre.querySelectorAll('button')).find(b => b.textContent.includes('Deploy'));
      if (!btn) return { error: 'no deploy button' };
      btn.click();
      return { ok: true };
    `);

    await assert('deploy panel returns a workers.dev URL within 30s', async () => {
      for (let i = 0; i < 60; i++) {
        const j = await browser.evalJs(`
          const panel = document.querySelector('#chat-messages .sbx-out');
          if (!panel) return null;
          const link = panel.querySelector('a[href*="workers.dev"]');
          return { has: !!link, url: link?.href, text: panel.textContent.slice(0, 300) };
        `);
        if (j?.has && j.url) { deployedUrl = j.url; return j.url; }
        if (j?.text && /failed|error/i.test(j.text)) throw new Error('deploy failed: ' + j.text);
        await new Promise(r => setTimeout(r, 500));
      }
      throw new Error('no workers.dev link in deploy panel');
    });

    if (deployedUrl) {
      await assert('deployed worker responds 200 (poll up to 30s for propagation)', async () => {
        for (let i = 0; i < 30; i++) {
          try {
            const r = await fetch(deployedUrl);
            if (r.ok) {
              const body = await r.text();
              if (body.includes('milli-deploy-ok')) return `200 with expected stdout (try ${i+1})`;
              return `200 (try ${i+1}) · body did not contain "milli-deploy-ok": ${body.slice(0, 120)}`;
            }
          } catch {}
          await new Promise(r => setTimeout(r, 1000));
        }
        throw new Error('worker never returned 200');
      });
    }
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
