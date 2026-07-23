/*
 * lib.mjs — shared utilities for the migrated→DA content transform.
 * Encode contract: skills/deploy/SKILL.md §9 + stardust/eds-conversion-log.md.
 */
import { readFileSync } from 'node:fs';

export const MIGRATED = '/Users/paolo/stardust/semrush/sos/stardust/migrated';
export const STARDUST = '/Users/paolo/stardust/semrush/sos/stardust';
export const REPO = '/Users/paolo/stardust/semrush/sos-org-repo';

// ---- media manifest (authoritative: a URL not in the manifest is a bug) ----
const manifest = JSON.parse(readFileSync(`${STARDUST}/inventory/da-media-manifest.json`, 'utf8'));
const bySubpath = new Map(manifest.files.map((f) => [f.subpath, f.daUrl]));
// wave-final rehosted externals (qna / veggiefest / find-local-centers / habits)
const supplement = JSON.parse(readFileSync(new URL('./media-supplement.json', import.meta.url), 'utf8'));
const bySource = new Map(supplement.files.map((f) => [f.source, f.daUrl]));
supplement.files.forEach((f) => bySubpath.set(f.subpath, f.daUrl));

export const imgFailures = [];

/** image src → content.da.live URL via the manifest (lowercased subpath) or the supplement. */
export function mapImgSrc(src, page) {
  if (!src) return null;
  if (src.startsWith('https://content.da.live/')) return encodeURI(src);
  if (bySource.has(src)) return encodeURI(bySource.get(src));
  // https://www.sos.org/assets/<rest> ≡ local /assets/uploads/<rest> (extract layout)
  const m = src.match(/^(?:https?:\/\/(?:www\.)?sos\.org)?\/?assets\/(?:uploads\/)?(.+)$/);
  if (!m) { imgFailures.push({ page, src, why: 'external, not in manifest/supplement' }); return null; }
  const sub = `uploads/${decodeURIComponent(m[1]).toLowerCase()}`;
  const hit = bySubpath.get(sub);
  if (!hit) { imgFailures.push({ page, src, why: 'subpath not in manifest' }); return null; }
  // percent-encode — raw spaces in the DA media key broke preview ingestion (#75 class)
  return encodeURI(hit);
}

const YT = /(^|\.)((youtube(-nocookie)?\.com)|youtu\.be)$/;

/** internal links root-relative lowercased; youtube gets #_dnb; others untouched. */
export function mapHref(href, page) {
  if (!href) return href;
  if (/^(mailto:|tel:|#)/.test(href)) return href;
  try {
    if (/^https?:\/\//.test(href)) {
      const u = new URL(href);
      if (YT.test(u.hostname)) {
        if (!u.hash) u.hash = '#_dnb';
        return u.toString();
      }
      if (u.hostname === 'www.sos.org' || u.hostname === 'sos.org') {
        return u.pathname.toLowerCase() + u.search + u.hash;
      }
      return href;
    }
  } catch { return href; }
  // root-relative internal
  const [pathPart, rest] = splitPath(href);
  return pathPart.toLowerCase().replace(/\/{2,}/g, '/') + rest;
}

function splitPath(href) {
  const i = href.search(/[?#]/);
  return i === -1 ? [href, ''] : [href.slice(0, i), href.slice(i)];
}

// ---- node cleaning --------------------------------------------------------
const KEEP_ATTRS = new Set(['href', 'src', 'alt']);
const DROP_TAGS = new Set(['SVG', 'SCRIPT', 'STYLE', 'INPUT', 'BUTTON', 'LABEL', 'SELECT', 'TEXTAREA', 'IFRAME']);

/**
 * Deep-clean a node for authoring: strip classes/attrs, unwrap spans, drop
 * svg/rules, rewrite href/src. Returns the same node (mutated). May return
 * null when the node dissolves to nothing.
 */
export function cleanNode(node, page) {
  if (node.nodeType === 3) return node; // text
  if (node.nodeType !== 1) return null;
  const tag = node.tagName;
  if (DROP_TAGS.has(tag)) return null;
  if (tag === 'SPAN' && /(^|\s)(rule|facade-play|hero-rule)(\s|$)/.test(node.getAttribute('class') || '')) return null;

  // clean children first (static list — we mutate)
  [...node.childNodes].forEach((c) => {
    const out = cleanNode(c, page);
    if (out === null && c.nodeType === 1) c.remove();
  });

  if (tag === 'SPAN') { // unwrap: DA strips spans anyway
    while (node.firstChild) node.parentNode.insertBefore(node.firstChild, node);
    node.remove();
    return null;
  }
  if (tag === 'FIGURE' || tag === 'FIGCAPTION' || tag === 'ADDRESS') {
    // unwrap figure/figcaption/address into parent flow (callers usually handle
    // figures before cleaning; <address> does not survive DA reliably)
    while (node.firstChild) node.parentNode.insertBefore(node.firstChild, node);
    node.remove();
    return null;
  }

  // anchors: button classes ride strong/em, text-links go plain
  if (tag === 'A') {
    const cls = node.getAttribute('class') || '';
    const doc = node.ownerDocument;
    [...node.attributes].forEach((a) => { if (!KEEP_ATTRS.has(a.name)) node.removeAttribute(a.name); });
    node.setAttribute('href', mapHref(node.getAttribute('href'), page));
    if (/btn-primary/.test(cls)) {
      const s = doc.createElement('strong');
      node.replaceWith(s); s.append(node);
      return s;
    }
    if (/btn-secondary/.test(cls)) {
      const e = doc.createElement('em');
      node.replaceWith(e); e.append(node);
      return e;
    }
    return node;
  }

  [...node.attributes].forEach((a) => { if (!KEEP_ATTRS.has(a.name)) node.removeAttribute(a.name); });
  if (tag === 'IMG') {
    const mapped = mapImgSrc(node.getAttribute('src'), page);
    if (!mapped) { node.remove(); return null; }
    node.setAttribute('src', mapped);
    if (!node.hasAttribute('alt')) node.setAttribute('alt', '');
  }
  return node;
}

/** blockquote hygiene: bare <cite> children get wrapped in <p> (exemplar shape). */
export function fixBlockquote(bq) {
  const doc = bq.ownerDocument;
  [...bq.children].forEach((c) => {
    if (c.tagName === 'CITE') {
      const p = doc.createElement('p');
      c.replaceWith(p);
      p.append(c);
    }
  });
  return bq;
}

/**
 * Heading kicker split: <h2><span class=kicker>K</span><br>Title</h2> →
 * returns { kicker: '<p>K</p>' | null } and mutates the heading to plain text.
 * Call BEFORE cleanNode (cleanNode unwraps spans).
 */
export function extractKicker(heading, doc) {
  const k = heading.querySelector('.kicker, .hero-kicker');
  if (!k) return null;
  const text = k.textContent.trim();
  k.remove();
  [...heading.childNodes].forEach((n) => { if (n.nodeType === 1 && n.tagName === 'BR') n.remove(); });
  const p = doc.createElement('p');
  p.textContent = text;
  return p;
}

// ---- serialization --------------------------------------------------------
const indentUnit = '  ';

function ser(node) {
  return node.nodeType === 3 ? node.textContent : node.outerHTML;
}

export function serializeNodes(nodes) {
  return nodes.map(ser).join('').trim();
}

/**
 * Render one section <div> of the body fragment.
 * units: array of { type: 'default', html } | { type: 'block', name, rows }
 * where rows = array of cells, each cell an HTML string.
 */
export function renderSection(units, depth = 2) {
  const pad = indentUnit.repeat(depth);
  const inner = [];
  for (const u of units) {
    if (u.type === 'default') {
      inner.push(u.html.split('\n').map((l) => pad + indentUnit + l).join('\n'));
    } else {
      const b = [`${pad}${indentUnit}<div class="${u.name}">`];
      for (const row of u.rows) {
        if (row.length === 1) {
          const cell = row[0];
          if (cell.includes('\n') || cell.length > 100) {
            b.push(`${pad}${indentUnit}  <div><div>`);
            b.push(cell.split('\n').map((l) => `${pad}${indentUnit}    ${l}`).join('\n'));
            b.push(`${pad}${indentUnit}  </div></div>`);
          } else {
            b.push(`${pad}${indentUnit}  <div><div>${cell}</div></div>`);
          }
        } else {
          b.push(`${pad}${indentUnit}  <div>${row.map((c) => `<div>${c}</div>`).join('')}</div>`);
        }
      }
      b.push(`${pad}${indentUnit}</div>`);
      inner.push(b.join('\n'));
    }
  }
  return `${pad}<div>\n${inner.join('\n')}\n${pad}</div>`;
}

export function renderPage({ title, description, sections }) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const meta = [
    '    <div>',
    '      <div class="metadata">',
    `        <div><div>Title</div><div>${esc(title)}</div></div>`,
    `        <div><div>Description</div><div>${esc(description)}</div></div>`,
    '      </div>',
    '    </div>',
  ].join('\n');
  return `<body>\n  <header></header>\n  <main>\n${meta}\n${sections.join('\n')}\n  </main>\n  <footer></footer>\n</body>\n`;
}
