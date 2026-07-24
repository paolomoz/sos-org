#!/usr/bin/env node
/**
 * build-search-index.mjs — emits repo-root search-index.json for the `search` block.
 * (dynamic wave, audit F-015: the live site ships no site search — this is net-new.)
 *
 * Walks content/**\/*.html (DA body fragments), and per page extracts:
 *   path        — the served URL path (/index → /)
 *   title       — the metadata block's Title row (display case)
 *   description — the metadata block's Description row (display case)
 *   headings    — h1/h2/h3 text, lowercased (match field)
 *   body        — first ~200 words of main text minus the metadata block, lowercased
 *
 * The index is COMMITTED to code and served from the code origin, so the block
 * fetches it root-relative (/search-index.json).
 *
 * Scope: English tree only — the 9 locale subtrees (de,el,es,fr,hi,hu,it,ja,nl)
 * are excluded to keep the payload lean; locale search is a documented follow-up.
 *
 * Usage: node tools/build-search-index.mjs   (from the repo root)
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, 'content');
const OUT = path.join(ROOT, 'search-index.json');
const LOCALE_DIRS = new Set(['de', 'el', 'es', 'fr', 'hi', 'hu', 'it', 'ja', 'nl']);
const BODY_WORDS = 200;

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', hellip: '…', copy: '©', reg: '®',
};

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** remove a <div class="metadata">…</div> subtree by balanced div counting */
function removeMetadataBlock(html) {
  const start = html.search(/<div[^>]*class="metadata"[^>]*>/);
  if (start === -1) return { html, meta: null };
  let depth = 0;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  let m = re.exec(html);
  let end = html.length;
  while (m !== null) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) { end = re.lastIndex; break; }
    m = re.exec(html);
  }
  return { html: html.slice(0, start) + html.slice(end), meta: html.slice(start, end) };
}

function metaRow(meta, name) {
  if (!meta) return '';
  // rows are <div><div>Name</div><div>Value</div></div>
  const re = new RegExp(`<div>\\s*<div>\\s*${name}\\s*</div>\\s*<div>([\\s\\S]*?)</div>`, 'i');
  const m = meta.match(re);
  return m ? stripTags(m[1]) : '';
}

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const rel = path.relative(CONTENT, p);
      if (LOCALE_DIRS.has(rel.split(path.sep)[0])) continue;
      files.push(...walk(p));
    } else if (entry.name.endsWith('.html')) {
      files.push(p);
    }
  }
  return files;
}

const pages = [];
for (const file of walk(CONTENT).sort()) {
  const raw = fs.readFileSync(file, 'utf8');
  const mainMatch = raw.match(/<main[\s\S]*?<\/main>/);
  if (!mainMatch) continue;
  const { html: main, meta } = removeMetadataBlock(mainMatch[0]);

  const rel = path.relative(CONTENT, file).replace(/\.html$/, '');
  let urlPath = `/${rel.split(path.sep).join('/')}`;
  if (urlPath === '/index') urlPath = '/';
  urlPath = urlPath.replace(/\/index$/, '/');

  const title = metaRow(meta, 'Title') || stripTags((main.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [undefined, ''])[1]);
  const description = metaRow(meta, 'Description');
  const headings = [...main.matchAll(/<h[123][^>]*>([\s\S]*?)<\/h[123]>/g)]
    .map((h) => stripTags(h[1]).toLowerCase()).filter(Boolean);
  const body = stripTags(main).toLowerCase().split(/\s+/).slice(0, BODY_WORDS).join(' ');

  if (!title) continue;
  pages.push({ path: urlPath, title, description, headings, body });
}

fs.writeFileSync(OUT, `${JSON.stringify({ generated: new Date().toISOString(), count: pages.length, pages }, null, 1)}\n`);
console.log(`search-index.json: ${pages.length} pages, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
