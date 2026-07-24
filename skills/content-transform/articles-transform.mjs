#!/usr/bin/env node
/*
 * articles-transform.mjs — article-post bulk wave: crawl records → DA body fragments.
 *
 * Source: stardust/current/pages/<slug>.json (articleHtml = rendered Divi post DOM).
 * Output: <repo>/content/<lowercased-path>.html (article template pages) +
 *         proto shells stardust/validation/articles-proto/<slug>.html with
 *         data-rtb="<block>" wrappers for the whole-page block-roundtrip, +
 *         stardust/inventory/articles-transform-report.json.
 *
 * Mapping (locked in stardust/eds-conversion-log.md, article-post wave):
 *   h1                        → page-head (one h1; derived from <title> when the
 *                               post has none — tour landing posts)
 *   prose (split on h2)       → text prose (byline heading rides the first block
 *                               verbatim; heading levels clamped to no-jump)
 *   vimeo/youtube iframes     → media single facade (<a href>title</a>; #_dnb on youtube)
 *   other iframes (eventbrite)→ plain link paragraph (logged)
 *   et_pb_button              → <p><strong><a>…</a></strong></p> (primary CTA)
 *   et_pb_image               → inline <p><img></p> in the text flow
 *   et_pb_toggle/accordion    → faq block (question cell / answer cell)
 *   et_pb_blog grid           → cards grid (img / <h3><a>title</a></h3> / excerpt /
 *                               read-more), preceding lone heading → default-content head
 *   footer-columns section    → dropped (byte-matches fragments/footer.html chrome)
 *
 * Usage: node articles-transform.mjs [slugFilter…]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseHTML } from 'linkedom';

const STARDUST = '/Users/paolo/stardust/semrush/sos/stardust';
const REPO = '/Users/paolo/stardust/semrush/sos-org-repo';
const PAGES = `${STARDUST}/current/pages`;
const PROTO_DIR = `${STARDUST}/validation/articles-proto`;
const REPORT = `${STARDUST}/inventory/articles-transform-report.json`;

// ---- media manifests (authoritative) ---------------------------------------
const bySubpath = new Map();
for (const f of JSON.parse(readFileSync(`${STARDUST}/inventory/da-media-manifest.json`, 'utf8')).files) {
  bySubpath.set(f.subpath, f.daUrl);
}
for (const f of JSON.parse(readFileSync(`${STARDUST}/inventory/da-media-manifest-articles.json`, 'utf8')).files) {
  bySubpath.set(f.subpath, f.daUrl);
}

const notes = [];
const imgFailures = [];

function mapImg(src, page) {
  if (!src) return null;
  if (src.startsWith('https://content.da.live/')) return encodeURI(src);
  const m = src.match(/^https?:\/\/(?:www\.)?sos\.org\/wp-content\/uploads\/(.+?)(\?.*)?$/);
  if (!m) { imgFailures.push({ page, src, why: 'not a sos.org uploads URL' }); return null; }
  const sub = `uploads/${decodeURIComponent(m[1]).toLowerCase()}`;
  const hit = bySubpath.get(sub);
  if (!hit) { imgFailures.push({ page, src, why: 'subpath not in manifests' }); return null; }
  return encodeURI(hit);
}

// href mapping (same contract as lib.mjs mapHref): internal sos.org links
// root-relative lowercased; youtube gets #_dnb; others untouched.
const YT = /(^|\.)((youtube(-nocookie)?\.com)|youtu\.be)$/;
function mapHref(href) {
  if (!href) return href;
  if (/^(mailto:|tel:|#)/.test(href)) return href;
  try {
    if (/^https?:\/\//.test(href)) {
      const u = new URL(href);
      if (YT.test(u.hostname)) { if (!u.hash) u.hash = '#_dnb'; return u.toString(); }
      if (u.hostname === 'www.sos.org' || u.hostname === 'sos.org') {
        return u.pathname.toLowerCase() + u.search + u.hash;
      }
      return href;
    }
  } catch { return href; }
  const i = href.search(/[?#]/);
  const [p, rest] = i === -1 ? [href, ''] : [href.slice(0, i), href.slice(i)];
  return p.toLowerCase().replace(/\/{2,}/g, '/') + rest;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

// ---- node cleaning ----------------------------------------------------------
const DROP_TAGS = new Set(['SVG', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'INPUT', 'BUTTON', 'LABEL',
  'SELECT', 'TEXTAREA', 'IFRAME', 'FORM', 'HR', 'LINK', 'META']);
const KEEP_ATTRS = new Set(['href', 'src', 'alt']);

function cleanNode(node, page, doc) {
  if (node.nodeType === 3) return node;
  if (node.nodeType !== 1) return null;
  const tag = node.tagName;
  if (DROP_TAGS.has(tag)) { node.remove(); return null; }

  [...node.childNodes].forEach((c) => {
    const out = cleanNode(c, page, doc);
    if (out === null && c.nodeType === 1 && c.parentNode) c.remove();
  });

  const unwrap = () => {
    while (node.firstChild) node.parentNode.insertBefore(node.firstChild, node);
    node.remove();
    return null;
  };
  if (tag === 'SPAN' || tag === 'SECTION' || tag === 'FIGURE' || tag === 'FIGCAPTION' || tag === 'U') return unwrap();
  if (tag === 'B' || tag === 'I') {
    const repl = doc.createElement(tag === 'B' ? 'strong' : 'em');
    while (node.firstChild) repl.append(node.firstChild);
    node.replaceWith(repl);
    return repl;
  }
  if (tag === 'A') {
    const hasImg = !!node.querySelector('img');
    if (!norm(node.textContent) && !hasImg) { node.remove(); return null; }
    [...node.attributes].forEach((a) => { if (a.name !== 'href') node.removeAttribute(a.name); });
    node.setAttribute('href', mapHref(node.getAttribute('href') || '#'));
    return node;
  }
  [...node.attributes].forEach((a) => { if (!KEEP_ATTRS.has(a.name)) node.removeAttribute(a.name); });
  if (tag === 'IMG') {
    const mapped = mapImg(node.getAttribute('src'), page);
    if (!mapped) { node.remove(); return null; }
    node.setAttribute('src', mapped);
    if (!node.hasAttribute('alt')) node.setAttribute('alt', '');
    node.removeAttribute('srcset');
    return node;
  }
  if (tag === 'DIV') {
    if (!norm(node.textContent) && !node.querySelector('img')) { node.remove(); return null; }
    return unwrap();
  }
  if ((tag === 'P' || tag === 'BLOCKQUOTE') && !norm(node.textContent) && !node.querySelector('img')) {
    node.remove(); return null;
  }
  if (tag === 'BLOCKQUOTE') {
    [...node.children].forEach((c) => {
      if (c.tagName === 'CITE') { const p = doc.createElement('p'); c.replaceWith(p); p.append(c); }
    });
  }
  return node;
}

/** clean a CLONE of el and return serialized html ('' when it dissolves). */
function cleanHtml(el, page, doc) {
  const host = doc.createElement('div');
  host.append(el.cloneNode(true));
  [...host.childNodes].forEach((c) => cleanNode(c, page, doc));
  return norm(host.innerHTML) ? host.innerHTML.trim() : '';
}

// ---- per-page transform ------------------------------------------------------
function transformPage(slug, row) {
  const rec = JSON.parse(readFileSync(`${PAGES}/${slug}.json`, 'utf8'));
  const { document: doc } = parseHTML(`<main>${rec.articleHtml}</main>`);
  const page = row.path;
  const pageNotes = [];

  let sections = [...doc.querySelectorAll('.et_builder_inner_content > .et_pb_section')];
  if (!sections.length) sections = [doc.querySelector('main')];

  // ---- streaming state ----
  const units = []; // {type:'block',name,rows,src:[nodes]} | {type:'default',html,src:[nodes]}
  let pending = []; // flow: {html, src}
  let seenH1 = null;
  let lastLvl = 1;
  let faqRows = null; let faqSrc = null;

  const flushFaq = () => {
    if (faqRows && faqRows.length) units.push({ type: 'block', name: 'faq', rows: faqRows, src: faqSrc });
    faqRows = null; faqSrc = null;
  };
  const flushText = () => {
    flushFaq();
    if (!pending.length) return;
    const cell = pending.map((n) => n.html).join('\n');
    units.push({
      type: 'block', name: 'text prose', rows: [[cell]],
      src: pending.flatMap((n) => (Array.isArray(n.src) ? n.src : [n.src])),
    });
    pending = [];
  };
  const pushFlow = (html, src) => { if (html) pending.push({ html, src }); };

  const handleEmbed = (iframe, container) => {
    const src = iframe.getAttribute('src') || '';
    let host = '';
    try { host = new URL(src).hostname; } catch { host = ''; }
    const title = norm(iframe.getAttribute('title') || '');
    if (/vimeo\.com$/.test(host.replace(/^player\./, '')) || /vimeo\.com/.test(host)) {
      flushText();
      units.push({
        type: 'block', name: 'media single',
        rows: [[`<a href="${escAttr(src)}">${esc(title || 'Play video')}</a>`]],
        src: [container],
      });
      return;
    }
    if (YT.test(host)) {
      flushText();
      units.push({
        type: 'block', name: 'media single',
        rows: [[`<a href="${escAttr(mapHref(src))}">${esc(title || 'Play video')}</a>`]],
        src: [container],
      });
      return;
    }
    // non-video embed (eventbrite checkout etc) → plain link paragraph
    const label = title || (/eventbrite/.test(host) ? 'Register online' : host);
    if (src) {
      pushFlow(`<p><a href="${escAttr(src)}">${esc(label)}</a></p>`, container);
      pageNotes.push(`non-video iframe (${host}) authored as plain link`);
    }
  };

  const handleHeading = (el) => {
    let lvl = +el.tagName[1];
    // <br> renders as whitespace — normalize before textContent extraction
    const brClone = el.cloneNode(true);
    brClone.querySelectorAll('br').forEach((b) => b.replaceWith(doc.createTextNode(' ')));
    const text = norm(brClone.textContent);
    if (!text) return;
    if (el.tagName === 'H1') {
      if (!seenH1) {
        seenH1 = { text, src: el };
        lastLvl = 1;
        return; // page-head owns it
      }
      lvl = 2;
      pageNotes.push(`extra h1 "${text.slice(0, 40)}" demoted to h2`);
    }
    lvl = Math.min(lvl, lastLvl + 1);
    if (lvl !== +el.tagName[1]) pageNotes.push(`h${el.tagName[1]} "${text.slice(0, 30)}" clamped to h${lvl}`);
    lastLvl = lvl;
    if (lvl === 2) flushText();
    // rebuild the heading at the clamped level from its cleaned inline content
    const inner = cleanHtml(el, page, doc).replace(/^<h[1-6]>|<\/h[1-6]>$/g, '');
    pushFlow(`<h${lvl}>${inner || esc(text)}</h${lvl}>`, el);
  };

  const INLINE = new Set(['A', 'STRONG', 'EM', 'B', 'I', 'SPAN', 'BR', 'IMG', 'U', 'CODE', 'SUP', 'SUB']);
  const processInner = (inner) => {
    // bare text nodes / loose inline runs (classic-template posts put prose
    // directly in et_pb_text_inner with no <p>) buffer into one paragraph
    let buf = [];
    const flushBuf = () => {
      if (!buf.length) return;
      const html = buf.map((b) => b.html).join('').trim();
      const srcNodes = buf.map((b) => b.node);
      buf = [];
      if (norm(html.replace(/<[^>]+>/g, '')) || /<img/.test(html)) pushFlow(`<p>${html}</p>`, srcNodes);
    };
    for (const child of [...inner.childNodes]) {
      if (child.nodeType === 3) { if (norm(child.textContent)) buf.push({ html: esc(child.textContent), node: child }); continue; }
      if (child.nodeType !== 1) continue;
      if (INLINE.has(child.tagName)) { const h = cleanHtml(child, page, doc); if (h) buf.push({ html: h, node: child }); continue; }
      flushBuf();
      const ifr = child.tagName === 'IFRAME' ? [child] : [...child.querySelectorAll('iframe')];
      if (ifr.length) {
        // strip iframes out, then process any remaining text in the container
        const rest = child.cloneNode(true);
        ifr.forEach((f) => handleEmbed(f, child));
        rest.querySelectorAll('iframe').forEach((f) => f.remove());
        const html = child.tagName === 'IFRAME' ? '' : cleanHtml(rest, page, doc);
        if (html) pushFlow(html, child);
        continue;
      }
      if (/^H[1-6]$/.test(child.tagName)) { handleHeading(child); continue; }
      if (child.tagName === 'DIV' || child.tagName === 'SECTION') { processInner(child); continue; }
      if (child.tagName === 'HR') continue;
      const html = cleanHtml(child, page, doc);
      if (html) pushFlow(html, child);
    }
    flushBuf();
  };

  const handleBlogGrid = (mod) => {
    // trailing heading in the pending flow → default-content head for the cards
    let headUnit = null;
    if (pending.length) {
      const lastNode = pending[pending.length - 1];
      const pm = lastNode.html.trim().match(/^<h([1-6])>([^]{1,120})<\/h[1-6]>$/);
      if (pm && !pm[2].includes('<h')) {
        pending.pop();
        const lv = pm[1] === '1' ? '2' : pm[1];
        headUnit = { type: 'default', html: `<h${lv}>${pm[2]}</h${lv}>`, src: Array.isArray(lastNode.src) ? lastNode.src : [lastNode.src] };
      }
    }
    flushText();
    // or: a preceding lone-heading text unit
    const last = units[units.length - 1];
    if (!headUnit && last && last.type === 'block' && last.name === 'text prose'
      && /^<h[1-6]>[^<]{1,80}<\/h[1-6]>$/.test(last.rows[0][0].trim())) {
      const m = last.rows[0][0].trim().match(/^<h([1-6])>(.+)<\/h[1-6]>$/);
      headUnit = { type: 'default', html: `<h${m[1] === '1' ? 2 : m[1]}>${m[2]}</h${m[1] === '1' ? 2 : m[1]}>`, src: last.src };
      units.pop();
    }
    const rows = [];
    for (const post of mod.querySelectorAll('article')) {
      const titleA = post.querySelector('.entry-title a') || post.querySelector('h2 a, h3 a');
      const title = norm(titleA ? titleA.textContent : (post.querySelector('.entry-title')?.textContent || ''));
      if (!title) continue;
      const href = mapHref(titleA?.getAttribute('href') || '#');
      const img = [...post.querySelectorAll('img')].map((i) => mapImg(i.getAttribute('src'), page)).find(Boolean);
      const alt = norm(post.querySelector('img')?.getAttribute('alt') || title);
      const excerpt = norm(post.querySelector('.post-content-inner p, .post-content p')?.textContent || '');
      const more = post.querySelector('a.more-link');
      const parts = [];
      if (img) parts.push(`<img src="${img}" alt="${escAttr(alt)}">`);
      parts.push(`<h3><a href="${escAttr(href)}">${esc(title)}</a></h3>`);
      if (excerpt) parts.push(`<p>${esc(excerpt)}</p>`);
      if (more) parts.push(`<p><a href="${escAttr(mapHref(more.getAttribute('href') || href))}">${esc(norm(more.textContent) || 'read more')}</a></p>`);
      rows.push([parts.join('\n')]);
    }
    if (mod.querySelector('.pagination, .wp-pagenavi')) {
      pageNotes.push('blog-grid pagination dropped (dynamic ajax widget chrome — targets do not exist in EDS)');
      // remove from the source node too so the proto shell reflects the logged decision
      mod.querySelectorAll('.pagination, .wp-pagenavi').forEach((n) => n.remove());
    }
    if (!rows.length) { pageNotes.push('blog grid with no items — skipped'); if (headUnit) units.push(headUnit); return; }
    const cards = { type: 'block', name: 'cards grid', rows, src: [mod] };
    if (headUnit) { cards.head = headUnit; cards.src = [...headUnit.src, mod]; }
    units.push(cards);
  };

  const handleToggle = (t) => {
    const q = norm(t.querySelector('.et_pb_toggle_title')?.textContent || '');
    const a = t.querySelector('.et_pb_toggle_content');
    let aHtml = a ? cleanHtml(a, page, doc) : '';
    // answers that clean down to inline content (bare text + links) ride one <p>
    if (aHtml && !/^<(p|ul|ol|blockquote|h[1-6]|img)/.test(aHtml.trim())) aHtml = `<p>${aHtml.trim()}</p>`;
    if (!q || !aHtml) return;
    if (!faqRows) { flushText(); faqRows = []; faqSrc = []; }
    faqRows.push([esc(q), aHtml]);
    faqSrc.push(t);
  };

  // ---- classic-template post chrome: h1 + featured image live in
  // article .et_post_meta_wrapper, outside the builder sections ----
  const metaWrap = doc.querySelector('.et_post_meta_wrapper');
  if (metaWrap) {
    for (const child of [...metaWrap.children]) {
      if (/^H[1-6]$/.test(child.tagName)) { handleHeading(child); continue; }
      if (/post-meta/.test(child.getAttribute('class') || '')) {
        pageNotes.push('WP post-meta line dropped (date/category template furniture)');
        continue;
      }
      if (child.tagName === 'IMG') {
        const src = mapImg(child.getAttribute('src'), page);
        if (src) pushFlow(`<p><img src="${src}" alt="${escAttr(child.getAttribute('alt') || '')}"></p>`, child);
        continue;
      }
      const html = cleanHtml(child, page, doc);
      if (html) pushFlow(html, child);
    }
  }

  // ---- walk ----
  for (const sec of sections) {
    // chrome: footer-column section (mirrors fragments/footer.html)
    const h3s = [...sec.querySelectorAll('h3')].map((h) => norm(h.textContent));
    if (h3s.includes('About Us') && h3s.includes('Explore') && h3s.includes('More')) {
      pageNotes.push('footer-columns section dropped (site footer chrome)');
      continue;
    }
    const mods = [...sec.querySelectorAll('.et_pb_module')]
      .filter((m) => !m.parentElement.closest('.et_pb_module'));
    const list = mods.length ? mods : [sec];
    for (const mod of list) {
      const cls = mod.getAttribute('class') || '';
      const isToggle = /et_pb_toggle(\s|_\d)/.test(cls);
      if (!isToggle) flushFaq();
      if (/et_pb_divider/.test(cls)) continue;
      if (/et_pb_blog/.test(cls)) { handleBlogGrid(mod); continue; }
      if (isToggle) { handleToggle(mod); continue; }
      if (/et_pb_accordion/.test(cls)) {
        [...mod.querySelectorAll('.et_pb_toggle')].forEach(handleToggle);
        continue;
      }
      if (/et_pb_button_module|et_pb_button_\d/.test(cls) || (mod.querySelector('a.et_pb_button') && !/et_pb_text|et_pb_code/.test(cls))) {
        const a = mod.querySelector('a');
        if (a && norm(a.textContent)) {
          pushFlow(`<p><strong><a href="${escAttr(mapHref(a.getAttribute('href') || '#'))}">${esc(norm(a.textContent))}</a></strong></p>`, mod);
        }
        continue;
      }
      if (/et_pb_(fullwidth_)?image/.test(cls)) {
        const img = mod.querySelector('img');
        const src = img && mapImg(img.getAttribute('src'), page);
        if (src) pushFlow(`<p><img src="${src}" alt="${escAttr(img.getAttribute('alt') || '')}"></p>`, mod);
        continue;
      }
      const inner = mod.querySelector('.et_pb_text_inner, .et_pb_code_inner') || mod;
      processInner(inner);
    }
  }
  flushText();
  flushFaq();

  // ---- page-head ----
  let h1Text = seenH1 && seenH1.text;
  let h1Derived = false;
  if (!h1Text) {
    // prefer the crawl record's VISIBLE h1 (captured outside the article
    // region on some templates) over the <title> tag
    const recH1 = (rec.headings || []).find((h) => h.tag === 'h1' && norm(h.text));
    h1Text = (recH1 && norm(recH1.text))
      || norm((rec.title || '').replace(/\s*[|–—-]\s*Science of Spirituality.*$/i, ''))
      || norm(rec.og?.title || '') || row.path.split('/').pop();
    h1Derived = true;
    pageNotes.push(`no h1 in article region — derived from ${recH1 ? 'captured visible h1' : '<title>'}: "${h1Text}"`);
  }
  const pageHead = { type: 'block', name: 'page-head', rows: [[`<h1>${esc(h1Text)}</h1>`]], src: seenH1 ? [seenH1.src] : [] };
  units.unshift(pageHead);

  // ---- metadata ----
  const h1 = h1Text;
  let title = norm(rec.title || '');
  if (!title || title.length > 60) title = `${h1} | Science of Spirituality`;
  if (title.length > 60) title = h1;
  if (title.length > 60) title = `${title.slice(0, 57).replace(/\s+\S*$/, '')}…`;
  let description = norm(rec.description || '');
  let descDerived = false;
  if (!description) {
    // first prose unit with real text (skip image-only and heading-only cells)
    let text = '';
    for (const u of units) {
      if (u.type !== 'block' || u.name !== 'text prose') continue;
      const t = norm(u.rows[0][0].replace(/<h[1-6]>[^]*?<\/h[1-6]>/g, ' ').replace(/<[^>]+>/g, ' '));
      if (t.length >= 30) { text = t; break; }
    }
    if (!text) text = h1;
    const sentence = (text.match(/^.*?[.!?](\s|$)/) || [text])[0].trim();
    description = sentence.length <= 160 ? sentence : `${sentence.slice(0, 157).replace(/\s+\S*$/, '')}…`;
    descDerived = true;
  }

  // ---- render authored page ----
  const sectionsOut = [];
  const pad = '    ';
  const renderUnit = (u) => {
    const inner = [];
    if (u.head) inner.push(u.head.html.split('\n').map((l) => `${pad}  ${l}`).join('\n'));
    const b = [`${pad}  <div class="${u.name}">`];
    for (const rowCells of u.rows) {
      if (rowCells.length === 1) {
        const cell = rowCells[0];
        if (cell.includes('\n') || cell.length > 100) {
          b.push(`${pad}    <div><div>`);
          b.push(cell.split('\n').map((l) => `${pad}      ${l}`).join('\n'));
          b.push(`${pad}    </div></div>`);
        } else b.push(`${pad}    <div><div>${cell}</div></div>`);
      } else {
        b.push(`${pad}    <div>${rowCells.map((c) => (c.includes('\n') ? `<div>\n${c.split('\n').map((l) => `${pad}      ${l}`).join('\n')}\n${pad}    </div>` : `<div>${c}</div>`)).join('')}</div>`);
      }
    }
    b.push(`${pad}  </div>`);
    inner.push(b.join('\n'));
    return `${pad}<div>\n${inner.join('\n')}\n${pad}</div>`;
  };
  for (const u of units) sectionsOut.push(renderUnit(u));

  const metaBlock = [
    `${pad}<div>`,
    `${pad}  <div class="metadata">`,
    `${pad}    <div><div>Title</div><div>${esc(title)}</div></div>`,
    `${pad}    <div><div>Description</div><div>${esc(description)}</div></div>`,
    `${pad}  </div>`,
    `${pad}</div>`,
  ].join('\n');
  const derivedComment = descDerived ? `\n  <!-- description: derived from first body sentence (no meta description captured) -->` : '';
  const out = `<body>\n  <header></header>${derivedComment}\n  <main>\n${metaBlock}\n${sectionsOut.join('\n')}\n  </main>\n  <footer></footer>\n</body>\n`;

  const outPath = `${REPO}/content/${page.toLowerCase()}.html`;
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, out);

  // ---- proto shell (source nodes wrapped per block, document order) ----
  // Shell normalizations (text-preserving, logged here): img srcs → 1px data
  // URI (offline harness — imgs are counted, never diffed); Divi toggle-title
  // headings → <p> (FAQ questions are summary affordances, matching the faq
  // block's details/summary semantics, not document headings).
  const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  const shellHtml = (n) => {
    if (!n || !n.cloneNode) return '';
    const c = n.cloneNode(true);
    if (c.nodeType !== 1) return c.textContent || '';
    if (c.tagName === 'IMG') { c.setAttribute('src', PIXEL); c.removeAttribute('srcset'); return c.outerHTML; }
    c.querySelectorAll('img').forEach((im) => { im.setAttribute('src', PIXEL); im.removeAttribute('srcset'); });
    // live embeds keep the network busy forever → networkidle never fires
    c.querySelectorAll('iframe').forEach((f) => f.setAttribute('src', 'about:blank'));
    c.querySelectorAll('.et_pb_toggle_title').forEach((h) => {
      if (!/^H[1-6]$/.test(h.tagName)) return;
      const p = doc.createElement('p');
      p.innerHTML = h.innerHTML;
      p.setAttribute('class', 'et_pb_toggle_title');
      h.replaceWith(p);
    });
    return c.outerHTML;
  };
  const shellParts = [];
  for (const u of units) {
    const name = u.type === 'block' ? u.name.split(' ')[0] : 'default';
    const nodes = (u.src || []).filter(Boolean);
    const html = nodes.map(shellHtml).join('\n');
    if (u.type === 'default') { shellParts.push(html); continue; }
    shellParts.push(`<div data-rtb="${name}">\n${html}\n</div>`);
  }
  mkdirSync(PROTO_DIR, { recursive: true });
  writeFileSync(`${PROTO_DIR}/${slug}.html`,
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(h1Text)}</title></head><body><main>\n${shellParts.join('\n')}\n</main></body></html>\n`);

  return {
    slug,
    path: `/${page.toLowerCase()}`,
    file: `content/${page.toLowerCase()}.html`,
    title,
    descDerived,
    h1Derived,
    blocks: units.map((u) => u.name || 'default'),
    notes: pageNotes,
  };
}

// ---- main ---------------------------------------------------------------------
const filters = process.argv.slice(2);
const crawlLedger = JSON.parse(readFileSync(`${STARDUST}/inventory/articles-crawl-ledger.json`, 'utf8'));
const pagesOut = [];
const redirectSkips = [];
const caseRedirects = [];

for (const [slug, row] of Object.entries(crawlLedger)) {
  if (filters.length && !filters.some((f) => slug.includes(f))) continue;
  if (row.status !== 'ok') { continue; }
  if (row.redirected) {
    redirectSkips.push({ slug, from: `/${row.path}/`, to: new URL(row.finalUrl).pathname });
    continue;
  }
  if (row.path !== row.path.toLowerCase()) {
    caseRedirects.push({ from: `/${row.path}/`, to: `/${row.path.toLowerCase()}/` });
  }
  try {
    pagesOut.push(transformPage(slug, row));
  } catch (e) {
    pagesOut.push({ slug, error: `${e.message}\n${e.stack.split('\n')[1]}` });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  generated: pagesOut.filter((p) => !p.error).length,
  errors: pagesOut.filter((p) => p.error),
  redirectSkips,
  caseRedirects,
  imgFailures,
  pages: pagesOut,
};
if (!filters.length) writeFileSync(REPORT, JSON.stringify(report, null, 2));
console.log(`generated ${report.generated} pages, ${report.errors.length} errors, ${imgFailures.length} img failures`);
report.errors.forEach((e) => console.log(`  ERROR [${e.slug}] ${e.error}`));
imgFailures.slice(0, 20).forEach((f) => console.log(`  IMG [${f.page}] ${f.src}: ${f.why}`));
