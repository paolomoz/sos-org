#!/usr/bin/env node
/*
 * gate-live.mjs — the atomic contract's headless computed-style gate on the
 * delivered branch URL: every grid/flex block computes grid/flex (not block),
 * sections > 0, data-block-name present, zero pageerror, zero broken images.
 * Usage: node gate-live.mjs <path> [...]   (paths without leading slash)
 */
import { chromium } from 'playwright';

const HOST = process.env.GATE_HOST || 'https://stardust--sos-org--paolomoz.aem.live';
// blocks whose CSS declares grid/flex layout containers, with the selector to probe
const LAYOUT_PROBES = [
  ['cards', '.card-grid, .talks-grid, .news-grid, .workshop-grid', ['grid', 'flex']],
  ['gallery', '.gallery-grid, .centers-grid, .reach-grid, .wide-grid, [class*="grid"]', ['grid', 'flex']],
  ['related-links', '[class*="cols"], [class*="grid"]', ['grid', 'flex']],
  ['page-hero', '.hero-grid', ['grid', 'flex']],
  ['stats', '[class*="grid"], [class*="row"]', ['grid', 'flex']],
  ['tiles', '[class*="rail"], [class*="grid"]', ['grid', 'flex']],
  ['media', '.media-grid, [class*="grid"]', ['grid', 'flex']],
  ['text', '.split-grid, [class*="split"]', ['grid', 'flex']],
  ['form', '.form-grid', ['grid', 'flex']],
];

const browser = await chromium.launch();
let failed = 0;
for (const path of process.argv.slice(2)) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
  const url = `${HOST}/${path}`.replace(/\/+$/, '');
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  } catch (e) { console.log(`${path}: FAIL goto ${e.message.slice(0, 80)}`); failed = 1; await page.close(); continue; }
  await page.waitForTimeout(1500);
  const res = await page.evaluate((probes) => {
    const out = { sections: document.querySelectorAll('main .section').length, named: 0, blocks: 0, layoutFails: [], brokenImgs: 0 };
    document.querySelectorAll('main [data-block-name]').forEach(() => { out.named += 1; });
    document.querySelectorAll('main .block-content > div[class]').forEach(() => { out.blocks += 1; });
    for (const [name, sel] of probes) {
      document.querySelectorAll(`.${name}`).forEach((b) => {
        const containers = b.querySelectorAll(sel);
        containers.forEach((c) => {
          const d = getComputedStyle(c).display;
          if (/grid|flex/.test(c.className) === false && !/grid|flex/.test(d)) return;
          if (!/grid|flex/.test(d) && c.children.length > 1) out.layoutFails.push(`${name} ${c.className.slice(0, 30)}=${d}`);
        });
      });
    }
    document.querySelectorAll('img').forEach((i) => {
      if (i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith('data:')) out.brokenImgs += 1;
    });
    return out;
  }, LAYOUT_PROBES);
  const bad = [];
  if (res.sections < 1) bad.push('sections=0');
  if (res.named < 1) bad.push('no data-block-name');
  if (res.layoutFails.length) bad.push(`layout: ${res.layoutFails.join('; ')}`);
  if (errors.length) bad.push(`pageerror: ${errors[0]}`);
  if (res.brokenImgs) bad.push(`brokenImgs=${res.brokenImgs}`);
  if (bad.length) { failed = 1; console.log(`${path}: FAIL — ${bad.join(' | ')} (sections=${res.sections} named=${res.named})`); }
  else console.log(`${path}: OK (sections=${res.sections}, decorated=${res.named}, imgs ok, 0 pageerror)`);
  await page.close();
}
await browser.close();
process.exit(failed);
