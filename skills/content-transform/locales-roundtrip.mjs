#!/usr/bin/env node
/*
 * locales-roundtrip.mjs — structural parity gate: generated content/<daPath>.html
 * vs the crawled source (#main-content DOM at stardust/current/html-locales/<slug>.html).
 *
 * Per page:
 *   - exactly one <h1> in the generated fragment;
 *   - heading parity: source headings (h1-h6 in main, non-hidden) ⊆ generated (text-normalized);
 *   - body parity: ≥90% of source paragraphs/list items (len>2) present in generated;
 *   - img/link tallies (reported).
 * Exit 0 when every checked page passes; 2 otherwise.
 *
 * Usage: node locales-roundtrip.mjs [slugFilter…] [--all] [--report <path>]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { SOS_ROOT, REPO, isHiddenForLocale } from './locales-lib.mjs';

const HTML_DIR = `${SOS_ROOT}/stardust/current/html-locales`;
const INV = JSON.parse(readFileSync(`${SOS_ROOT}/stardust/inventory/locales-urls.json`, 'utf8'));

const args = process.argv.slice(2);
const reportIdx = args.indexOf('--report');
const reportPath = reportIdx !== -1 ? args.splice(reportIdx, 2)[1] : null;
const all = args.includes('--all');
const filters = args.filter((a) => a !== '--all');

const norm = (s) => s.replace(/\s+/g, ' ').replace(/[‘’“”]/g, "'").trim();

function checkPage(row) {
  const genFile = path.join(REPO, 'content', `${row.daPath}.html`);
  const srcFile = path.join(HTML_DIR, `${row.slug}.html`);
  if (!existsSync(genFile)) return { slug: row.slug, status: 'not-transformed' };
  if (!existsSync(srcFile)) return { slug: row.slug, status: 'no-source' };

  const gen = parseHTML(readFileSync(genFile, 'utf8')).document;
  const src = parseHTML(readFileSync(srcFile, 'utf8')).document;

  // strip hidden + non-content nodes from source before measuring
  for (const el of src.querySelectorAll('script,style,noscript,.et_post_meta_wrapper')) el.remove();
  // in-page campaign chrome (fullwidth-code footers / social rails) — skipped by the transform
  for (const el of [...src.querySelectorAll('.et_pb_fullwidth_code')]) {
    if (el.querySelector('footer, .et-social-icons')) el.remove();
  }
  // WP empty-state of AJAX video grids ("No results" + refine-search para) — deliberately dropped
  for (const el of src.querySelectorAll('.no-results, .not-found-title')) el.remove();
  for (const el of [...src.querySelectorAll('.et_pb_ajax_pagination_container .entry')]) {
    if (el.querySelector('.not-found-title') || !el.querySelector('article')) el.remove();
  }
  // dynamic ?post= detail view on news archives (EN sos-global parity: not authored)
  for (const el of src.querySelectorAll('.sos-recent-news-detail-wrapper')) el.remove();
  // dynamic integration points the transform skips (EN parity: find-local-programs, meditation-center)
  for (const el of src.querySelectorAll('.et_pb_map_container')) el.remove();
  for (const el of [...src.querySelectorAll('.et_pb_code, .et_pb_fullwidth_code')]) {
    if (!el.querySelector('iframe[src*="vimeo"], iframe[src*="youtube"]')) el.remove();
  }
  // dropdown options + social-follow rails aren't authored content
  for (const el of src.querySelectorAll('select, .et_pb_social_media_follow, .et_pb_countdown_timer')) el.remove();
  // contact fields duplicate the label text (label + fallback text node) — measure the label once
  for (const f of [...src.querySelectorAll('.et_pb_contact_field')]) {
    const l = f.querySelector('label');
    if (l) f.textContent = l.textContent;
  }
  for (const el of [...src.querySelectorAll('[class], [style]')]) {
    if (isHiddenForLocale(el)) el.remove();
  }
  const srcRoot = src.querySelector('article .et_builder_inner_content')
    || src.querySelector('.et_builder_inner_content') || src.querySelector('.entry-content') || src;

  const h1s = gen.querySelectorAll('main h1').length;
  const genHeads = new Set([...gen.querySelectorAll('main h1,main h2,main h3,main h4')].map((h) => norm(h.textContent)));
  // blob = ALL main text (block cells like form label/type rows and faq cells are divs, not <p>)
  const genBlob = norm(gen.querySelector('main').textContent);

  // heading TEXT must survive (role remaps like h3-byline → p are template mappings)
  const srcHeads = [...srcRoot.querySelectorAll('h1,h2,h3,h4')].map((h) => norm(h.textContent)).filter(Boolean);
  const missHeads = srcHeads.filter((h) => ![...genHeads].some((g) => g === h || g.includes(h) || h.includes(g))
    && !genBlob.includes(h));

  const srcParas = [...srcRoot.querySelectorAll('p,li')]
    .map((p) => norm(p.textContent)).filter((t) => t.length > 2);
  const missParas = srcParas.filter((t) => !genBlob.includes(t));
  const coverage = srcParas.length ? 1 - missParas.length / srcParas.length : 1;

  const srcImgs = [...srcRoot.querySelectorAll('img')].filter((im) => {
    const s = im.getAttribute('src') || '';
    return s && !s.startsWith('data:');
  }).length;
  const genImgs = gen.querySelectorAll('main img').length;

  const pass = h1s === 1 && missHeads.length === 0 && coverage >= 0.9;
  return {
    slug: row.slug,
    status: pass ? 'pass' : 'fail',
    h1s,
    headings: { src: srcHeads.length, missing: missHeads.slice(0, 8) },
    paras: { src: srcParas.length, missing: missParas.length, coverage: +coverage.toFixed(3), sample: missParas.slice(0, 4).map((t) => t.slice(0, 90)) },
    imgs: { src: srcImgs, gen: genImgs },
  };
}

const rows = INV.filter((r) => (all || !filters.length) ? true : filters.some((f) => r.slug.includes(f)));
const results = rows.map(checkPage);
const byStatus = {};
for (const r of results) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
console.log('roundtrip:', byStatus);
for (const r of results.filter((x) => x.status === 'fail')) {
  console.log('FAIL', r.slug, `h1=${r.h1s}`, `missHeads=${r.headings.missing.length}`, `cov=${r.paras.coverage}`);
  if (filters.length) console.log(JSON.stringify(r, null, 1));
}
if (reportPath) writeFileSync(reportPath, JSON.stringify({ at: new Date().toISOString(), byStatus, results }, null, 2));
process.exit(results.every((r) => r.status === 'pass' || r.status === 'redirected' || r.status === 'not-transformed') ? 0 : 2);
