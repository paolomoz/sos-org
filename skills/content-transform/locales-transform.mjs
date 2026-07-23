#!/usr/bin/env node
/*
 * locales-transform.mjs — localization wave: live Divi DOM → DA body fragments.
 *
 * Input:  stardust/current/html-locales/<slug>.html   (post-JS #main-content outerHTML)
 *         stardust/current/pages/<slug>.json          (wave2 record: title/description/lang)
 *         stardust/inventory/locales-urls.json        ({slug,url,locale,srcPath,daPath})
 * Output: <repo>/content/<daPath>.html                (raw UTF-8 — run sanitise.js before PUT)
 *         stardust/inventory/locales-transform-report.json
 *         stardust/inventory/locales-needed-images.json (daSub → srcUrl for the media pass)
 *
 * Copy is VERBATIM in the source language. Template mapping mirrors the EN pages:
 *   h1 text module          → page-head (h1 + optional .byline sub-line row)
 *   prose text modules      → text prose blocks, split per h2 chunk
 *   code/video module iframe→ media single (plain <a>; youtube gets #_dnb)
 *   blog grid (sos-article-grid / sos-master-message-grid) → h2 default-content head + cards grid
 *   pre-footer link columns (sos-footer-menu-section / sos-expanded-footer) → related-links
 *   et_pb_image             → <img> in its own text prose block
 *   et_pb_button            → <p><strong><a>label</a></strong></p> appended to flow
 * Pages whose finalUrl dropped the locale prefix (redirected to EN) are SKIPPED and logged.
 *
 * Usage: node locales-transform.mjs [slugFilter…]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import {
  SOS_ROOT, REPO, escText, escAttr, mapImgSrc, mapHref, isHiddenForLocale, neededImages,
} from './locales-lib.mjs';

const HTML_DIR = `${SOS_ROOT}/stardust/current/html-locales`;
const PAGES_DIR = `${SOS_ROOT}/stardust/current/pages`;
const INV = JSON.parse(readFileSync(`${SOS_ROOT}/stardust/inventory/locales-urls.json`, 'utf8'));
const REPORT_FILE = `${SOS_ROOT}/stardust/inventory/locales-transform-report.json`;
const IMAGES_FILE = `${SOS_ROOT}/stardust/inventory/locales-needed-images.json`;

const filters = process.argv.slice(2);

// ---------- node cleaning (verbatim copy, semantic tags only) ----------------
const INLINE_KEEP = new Set(['STRONG', 'EM', 'A', 'CODE', 'BR', 'CITE', 'SUB']);
const INLINE_MAP = { B: 'strong', I: 'em' };
const BLOCK_KEEP = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE']);
const DROP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'FORM', 'INPUT', 'BUTTON', 'SVG', 'SELECT', 'TEXTAREA', 'LINK', 'META']);

function realImgSrc(img) {
  let s = img.getAttribute('src') || '';
  if (s.startsWith('data:') || !s) {
    s = img.getAttribute('data-src-webp') || img.getAttribute('data-src-img')
      || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
  }
  if (!s || s.startsWith('data:')) {
    const ss = img.getAttribute('srcset') || img.getAttribute('data-srcset-webp') || '';
    s = (ss.split(',')[0] || '').trim().split(/\s+/)[0] || '';
  }
  return s && !s.startsWith('data:') ? s : null;
}

// serialize inline content of an element
function inlineHTML(el, ctx) {
  let out = '';
  for (const n of el.childNodes) {
    if (n.nodeType === 3) { out += escText(n.textContent); continue; }
    if (n.nodeType !== 1) continue;
    const tag = n.tagName;
    if (DROP.has(tag)) continue;
    if (tag === 'IMG') {
      const src = realImgSrc(n);
      const mapped = src ? mapImgSrc(src, ctx.page) : null;
      if (mapped) out += `<img src="${escAttr(mapped)}" alt="${escAttr(n.getAttribute('alt') || '')}">`;
      continue;
    }
    if (tag === 'A') {
      const href = mapHref(n.getAttribute('href'), ctx.locale);
      const inner = inlineHTML(n, ctx);
      if (!inner.trim() && !href) continue;
      out += href ? `<a href="${escAttr(href)}">${inner}</a>` : inner;
      continue;
    }
    if (INLINE_KEEP.has(tag)) {
      const t = tag.toLowerCase();
      const inner = inlineHTML(n, ctx);
      if (tag === 'BR') { out += '<br>'; continue; }
      if (!inner.trim()) continue;
      out += `<${t}>${inner}</${t}>`;
      continue;
    }
    if (INLINE_MAP[tag]) {
      const inner = inlineHTML(n, ctx);
      if (inner.trim()) out += `<${INLINE_MAP[tag]}>${inner}</${INLINE_MAP[tag]}>`;
      continue;
    }
    // SPAN / SUP / unknown inline / DIV nested inline — unwrap
    out += inlineHTML(n, ctx);
  }
  return out;
}

const isEmptyHtml = (h) => !h.replace(/&nbsp;|<br>|\s+/g, '').trim();

/** Flatten an element into an ordered list of cleaned block-level HTML strings. */
function blockNodes(el, ctx, out = []) {
  for (const n of el.childNodes) {
    if (n.nodeType === 3) {
      const t = n.textContent.trim();
      if (t) out.push(`<p>${escText(n.textContent).trim()}</p>`);
      continue;
    }
    if (n.nodeType !== 1) continue;
    const tag = n.tagName;
    if (DROP.has(tag)) continue;
    if (isHiddenForLocale(n)) { ctx.skipped.push(`hidden:${(n.getAttribute('class') || tag).slice(0, 60)}`); continue; }
    if (BLOCK_KEEP.has(tag)) {
      if (tag === 'UL' || tag === 'OL') {
        const t = tag.toLowerCase();
        const lis = [...n.children].filter((c) => c.tagName === 'LI')
          .map((li) => `<li>${inlineHTML(li, ctx)}</li>`).filter((li) => !isEmptyHtml(li));
        if (lis.length) out.push(`<${t}>${lis.join('')}</${t}>`);
        // pathological nesting (ol > ol/div > h3 …) — recurse the non-li children
        for (const c of [...n.children].filter((x) => x.tagName !== 'LI')) blockNodes(c, ctx, out);
      } else if (tag === 'BLOCKQUOTE') {
        const inner = [];
        blockNodes(n, ctx, inner);
        if (inner.length) out.push(`<blockquote>${inner.map((x) => x.replace(/^<h1([\s>])/, '<h2$1').replace(/<\/h1>$/, '</h2>')).join('')}</blockquote>`);
      } else {
        const t = tag.toLowerCase();
        let inner = inlineHTML(n, ctx);
        // headings carry no emphasis wrappers (encode contract: plain heading text)
        if (/^h[1-6]$/.test(t)) inner = inner.replace(/<\/?(strong|em)>/g, '').trim();
        if (!isEmptyHtml(inner)) out.push(`<${t}>${inner}</${t}>`);
      }
      continue;
    }
    if (tag === 'IMG') {
      const src = realImgSrc(n);
      const mapped = src ? mapImgSrc(src, ctx.page) : null;
      if (mapped) out.push(`<p><img src="${escAttr(mapped)}" alt="${escAttr(n.getAttribute('alt') || '')}"></p>`);
      continue;
    }
    if (tag === 'A') {
      const href = mapHref(n.getAttribute('href'), ctx.locale);
      const inner = inlineHTML(n, ctx);
      if (!isEmptyHtml(inner)) out.push(`<p><a href="${escAttr(href || '#')}">${inner}</a></p>`);
      continue;
    }
    // container (div/section/figure/…) — recurse
    blockNodes(n, ctx, out);
  }
  return out;
}

// ---------- block emitters ----------------------------------------------------
const sec = (inner) => `    <div>\n${inner}\n    </div>`;
function block(name, rows) {
  const rowsHtml = rows.map((cells) => cells.map((c) => `        <div><div>\n          ${c}\n        </div></div>`).join('\n'))
    .map((r) => r).join('\n');
  return `      <div class="${name}">\n${rowsHtml}\n      </div>`;
}
const oneCell = (name, cells) => block(name, cells.map((c) => [c]));

// split cleaned block nodes into text-prose chunks at h2 boundaries (EN parity)
function proseBlocks(nodes) {
  const chunks = [];
  let cur = [];
  for (const n of nodes) {
    if (/^<h2[\s>]/.test(n) && cur.length) { chunks.push(cur); cur = []; }
    cur.push(n);
  }
  if (cur.length) chunks.push(cur);
  return chunks.filter((c) => c.length && !c.every((n) => isEmptyHtml(n)))
    .map((c) => ({ nodes: c, html: sec(block('text prose', [[c.join('\n          ')]])) }));
}

// ---------- section handlers ---------------------------------------------------
// push with bookkeeping so a later grid can claim a preceding heading-only prose block
function pushOut(out, ctx, html, meta = null) {
  out.push(html);
  ctx.last = meta ? { idx: out.length - 1, ...meta } : null;
}

function handleBlogGrid(grid, ctx, out) {
  const items = [];
  for (const art of grid.querySelectorAll('article')) {
    const cell = [];
    const imgA = art.querySelector('.et_pb_image_container img');
    if (imgA) {
      const mapped = realImgSrc(imgA) ? mapImgSrc(realImgSrc(imgA), ctx.page) : null;
      if (mapped) cell.push(`<img src="${escAttr(mapped)}" alt="${escAttr(imgA.getAttribute('alt') || '')}">`);
    }
    const titleA = art.querySelector('.entry-title a, h2 a');
    const titleEl = titleA || art.querySelector('.entry-title, h2');
    if (titleEl) cell.push(`<h3>${escText(titleEl.textContent.replace(/\s+/g, ' ').trim())}</h3>`);
    // video-blog card: a real embedded video id → facade link (empty ids are AJAX-lazy; logged)
    const vf = art.querySelector('iframe[src*="vimeo"], iframe[src*="youtube"]');
    if (vf) {
      const vsrc = vf.getAttribute('src') || '';
      if (/\/\d{6,}/.test(vsrc)) {
        const href = /youtube/.test(vsrc) ? `${vsrc}#_dnb` : vsrc;
        cell.push(`<p><a href="${escAttr(href)}">${escText((titleEl?.textContent || 'Play video').replace(/\s+/g, ' ').trim())}</a></p>`);
      } else ctx.skipped.push(`video-card:no-id(${(titleEl?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)})`);
    }
    const more = art.querySelector('a.more-link') || titleA;
    const moreHref = more ? mapHref(more.getAttribute('href'), ctx.locale) : null;
    const moreLabel = more && more.classList?.contains('more-link')
      ? more.textContent.trim() : (titleA ? titleA.textContent.trim() : '');
    const exc = art.querySelector('.post-content p, .excerpt p, .et_pb_text_inner p, .post-content');
    if (exc && exc.textContent.trim()) {
      for (const a of exc.querySelectorAll('a.more-link')) a.remove();
      const t = exc.textContent.replace(/\s+/g, ' ').trim();
      if (t) cell.push(`<p>${escText(t)}</p>`);
    }
    if (moreHref && moreLabel) cell.push(`<p><a href="${escAttr(moreHref)}">${escText(moreLabel)}</a></p>`);
    if (cell.length) items.push([cell.join('\n          ')]);
  }
  if (!items.length) { ctx.skipped.push('blog-grid:empty(head+no-results dropped)'); return; }
  // head: preceding heading-only prose block, reclaimed as default-content h2
  let head = '';
  if (ctx.last && ctx.last.headingOnly && ctx.last.idx === out.length - 1) {
    out.pop();
    ctx.blocks.pop();
    head = `      <h2>${escText(ctx.last.text)}</h2>\n`;
  }
  pushOut(out, ctx, sec(head + block('cards grid', items)));
  ctx.blocks.push(`cards grid(${items.length})`);
}

function handleFooterMenu(section, ctx, out) {
  const cols = [...section.querySelectorAll('.et_pb_column')];
  const rows = [];
  for (const col of cols) {
    const parts = [];
    const h = col.querySelector('h1,h2,h3,h4');
    if (h) parts.push(`<h3>${escText(h.textContent.trim())}</h3>`);
    const links = [...col.querySelectorAll('a[href]')]
      .map((a) => ({ href: mapHref(a.getAttribute('href'), ctx.locale), label: a.textContent.replace(/\s+/g, ' ').trim() }))
      .filter((l) => l.href && l.label);
    if (links.length) {
      parts.push(`<ul>${links.map((l) => `<li><a href="${escAttr(l.href)}">${escText(l.label)}</a></li>`).join('')}</ul>`);
    }
    if (parts.length) rows.push([parts.join('\n          ')]);
  }
  if (!rows.length) { ctx.skipped.push('footer-menu:empty'); return; }
  pushOut(out, ctx, sec(block('related-links', rows)));
  ctx.blocks.push(`related-links(${rows.length})`);
}

function emitIframe(f, ctx, out) {
  const src = f.getAttribute('src') || '';
  if (!/youtube|youtu\.be|vimeo/.test(src)) { ctx.skipped.push(`iframe:${src.slice(0, 60)}`); return; }
  const href = /youtube|youtu\.be/.test(src) ? `${src}#_dnb` : src;
  const title = (f.getAttribute('title') || '').trim() || 'Play video';
  pushOut(out, ctx, sec(block('media single', [[`<a href="${escAttr(href)}">${escText(title)}</a>`]])));
  ctx.blocks.push('media single');
}

function handleTextModule(mod, ctx, out) {
  const inner = mod.querySelector('.et_pb_text_inner') || mod;
  // iframes inside prose (rare) — emit after the prose
  const iframes = [...inner.querySelectorAll('iframe')];
  const nodes = blockNodes(inner, ctx);
  if (!nodes.length && !iframes.length) return;

  let rest = nodes;
  if (!ctx.h1Done) {
    const h1Idx = nodes.findIndex((n) => /^<h1[\s>]/.test(n));
    if (h1Idx !== -1) {
      const h1 = nodes[h1Idx];
      const after = nodes.slice(0, h1Idx).concat(nodes.slice(h1Idx + 1));
      // byline: a single short link-free node directly following the h1
      const rows = [[h1]];
      let bylineUsed = 0;
      if (after.length && after[0].length < 160 && !/<a |<img /.test(after[0]) && /^<(h3|h4|p)[\s>]/.test(after[0])) {
        rows.push([after[0].replace(/^<h[34]([\s>])/, '<p$1').replace(/<\/h[34]>$/, '</p>')]);
        bylineUsed = 1;
      }
      pushOut(out, ctx, sec(block('page-head', rows)));
      ctx.blocks.push('page-head');
      ctx.h1Done = true;
      rest = after.slice(bylineUsed);
    }
  }
  // demote stray h1s (one-h1 contract)
  rest = rest.map((n) => n.replace(/^<h1([\s>])/, '<h2$1').replace(/<\/h1>$/, '</h2>'));
  for (const chunk of proseBlocks(rest)) {
    const headingOnly = chunk.nodes.length === 1 && /^<h[1-6][\s>]/.test(chunk.nodes[0]);
    pushOut(out, ctx, chunk.html, headingOnly
      ? { headingOnly: true, text: chunk.nodes[0].replace(/<[^>]+>/g, '').trim() } : null);
    ctx.blocks.push('text prose');
  }
  for (const f of iframes) emitIframe(f, ctx, out);
}

function handleSectionFlow(section, ctx, out) {
  // footer-menu rows embedded in a mixed section → related-links; mark consumed
  const consumed = new Set();
  for (const row of section.querySelectorAll('.et_pb_row')) {
    if (/sos-expanded-footer/.test(row.getAttribute('class') || '')) {
      if (!isHiddenForLocale(row)) handleFooterMenu(row, ctx, out);
      for (const m of row.querySelectorAll('.et_pb_module')) consumed.add(m);
    }
  }
  const mods = [...section.querySelectorAll('.et_pb_module')]
    .filter((m) => !consumed.has(m) && !m.parentElement.closest('.et_pb_module'));
  for (const mod of mods) {
    if (isHiddenForLocale(mod)) { ctx.skipped.push(`hidden-module:${(mod.getAttribute('class') || '').slice(0, 60)}`); continue; }
    const cls = mod.getAttribute('class') || '';
    if (/et_pb_blog/.test(cls)) handleBlogGrid(mod, ctx, out);
    else if (/et_pb_posts/.test(cls)) handlePosts(mod, ctx, out);
    else if (/et_pb_(accordion|toggle)/.test(cls)) handleAccordion(mod, ctx, out);
    else if (/et_pb_gallery/.test(cls)) handleGallery(mod, ctx, out);
    else if (/et_pb_slider/.test(cls)) handleSlider(mod, ctx, out);
    else if (/sos_mod_quoteslisting/.test(cls)) handleTextModule(mod, ctx, out);
    else if (/et_pb_map_container/.test(cls)) ctx.skipped.push('dynamic:map');
    else if (/et_pb_social_media_follow/.test(cls)) ctx.skipped.push('chrome:social-follow');
    else if (/contact_form_container/.test(cls)) handleContactForm(mod, ctx, out);
    else if (/et_pb_text/.test(cls)) handleTextModule(mod, ctx, out);
    else if (/et_pb_(code|video)/.test(cls)) {
      for (const f of mod.querySelectorAll('iframe')) emitIframe(f, ctx, out);
    } else if (/et_pb_image|et_pb_fullwidth_image/.test(cls)) {
      const img = mod.querySelector('img');
      const src = img && realImgSrc(img);
      const mapped = src ? mapImgSrc(src, ctx.page) : null;
      if (mapped) {
        pushOut(out, ctx, sec(block('text prose', [[`<p><img src="${escAttr(mapped)}" alt="${escAttr(img.getAttribute('alt') || '')}"></p>`]])));
        ctx.blocks.push('text prose(img)');
      }
    } else if (/et_pb_button/.test(cls)) {
      const a = mod.matches('a') ? mod : mod.querySelector('a');
      if (a) {
        const href = mapHref(a.getAttribute('href'), ctx.locale);
        pushOut(out, ctx, sec(block('text prose', [[`<p><strong><a href="${escAttr(href || '#')}">${escText(a.textContent.trim())}</a></strong></p>`]])));
        ctx.blocks.push('text prose(cta)');
      }
    } else if (/et_pb_fullwidth_code/.test(cls)) {
      const vids = [...mod.querySelectorAll('iframe')].filter((f) => /vimeo|youtube/.test(f.getAttribute('src') || ''));
      if (vids.length) for (const f of vids) emitIframe(f, ctx, out);
      else if (mod.querySelector('footer, .et-social-icons')) ctx.skipped.push('chrome:fullwidth-code-footer');
      else if (mod.textContent.trim()) ctx.skipped.push('module:et_pb_fullwidth_code');
    } else if (/et_pb_(divider|space)/.test(cls)) {
      // decorative spacer — silent skip
    } else {
      const clone = mod.cloneNode(true);
      for (const s of clone.querySelectorAll('script, style')) s.remove();
      const t = clone.textContent.replace(/\s+/g, ' ').trim();
      if (t) ctx.skipped.push(`module:${cls.split(/\s+/).find((c) => /et_pb_[a-z_]+$/.test(c)) || cls.slice(0, 40)}`);
    }
  }
}

// et_pb_posts (news / video archives) → cards listing|grid (EN sos-global / videos shapes)
function handlePosts(mod, ctx, out) {
  const items = [...mod.querySelectorAll('article')];
  if (!items.length) { ctx.skipped.push('posts:empty'); return; }
  const isVideo = items.some((a) => /format-video/.test(a.getAttribute('class') || ''));
  const rows = [];
  for (const art of items) {
    const cell = [];
    const img = [...art.querySelectorAll('img')].find((i) => realImgSrc(i));
    if (img) {
      const mapped = mapImgSrc(realImgSrc(img), ctx.page);
      const alt = img.getAttribute('alt') || art.querySelector('.entry-title')?.textContent.replace(/\s+/g, ' ').trim() || '';
      if (mapped) cell.push(`<img src="${escAttr(mapped)}" alt="${escAttr(alt)}">`);
    }
    const date = art.querySelector('.published, .post-meta .published, time');
    if (date && date.textContent.trim() && !isVideo) cell.push(`<p>${escText(date.textContent.replace(/\s+/g, ' ').trim())}</p>`);
    const title = art.querySelector('.entry-title');
    const titleText = title ? title.textContent.replace(/\s+/g, ' ').trim() : '';
    const linkEl = title?.closest('a') || art.querySelector('a[href]:not(.vimeo-video-id)');
    const href = !isVideo && linkEl ? mapHref(linkEl.getAttribute('href'), ctx.locale) : null;
    if (titleText) cell.push(href ? `<h2><a href="${escAttr(href)}">${escText(titleText)}</a></h2>` : `<h2>${escText(titleText)}</h2>`);
    if (cell.length) rows.push([cell.join('\n          ')]);
  }
  // pagination (news archives): numbered /page/N links + prev/next labels, EN row shape
  if (!isVideo) {
    const scope = mod.closest('.et_pb_section') || mod.parentElement;
    const pageLinks = [...scope.querySelectorAll('a[href*="/page/"]')]
      .map((a) => ({ href: mapHref(a.getAttribute('href'), ctx.locale), label: a.textContent.replace(/\s+/g, ' ').trim() }))
      .filter((l, i, arr) => l.label && arr.findIndex((x) => x.href === l.href && x.label === l.label) === i);
    if (pageLinks.length) {
      const nums = pageLinks.filter((l) => /^\d+$/.test(l.label));
      const words = pageLinks.filter((l) => !/^\d+$/.test(l.label));
      const cur = scope.querySelector('.current, .wp-pagenavi span.current')?.textContent.trim() || '1';
      const ps = [`<p>${escText(cur)}</p>`];
      if (nums.length) ps.push(`<p>${nums.map((l) => `<a href="${escAttr(l.href)}">${escText(l.label)}</a>`).join(' ')}</p>`);
      if (words.length) ps.push(`<p>${words.map((l) => `<a href="${escAttr(l.href)}">${escText(l.label)}</a>`).join(' ')}</p>`);
      rows.push([ps.join('\n          ')]);
    }
  }
  // head reclaim (same as blog grid)
  let head = '';
  if (ctx.last && ctx.last.headingOnly && ctx.last.idx === out.length - 1) {
    out.pop(); ctx.blocks.pop();
    head = `      <h2>${escText(ctx.last.text)}</h2>\n`;
  }
  const variant = isVideo ? 'cards grid' : 'cards news';
  pushOut(out, ctx, sec(head + block(variant, rows)));
  ctx.blocks.push(`${variant}(${rows.length})`);
}

// et_pb_slider → slide title/description/cta as page-head (first h1) or prose
function handleSlider(mod, ctx, out) {
  for (const slide of mod.querySelectorAll('.et_pb_slide')) {
    const title = slide.querySelector('.et_pb_slide_title, h1, h2');
    const titleText = title ? title.textContent.replace(/\s+/g, ' ').trim() : '';
    const ps = [...slide.querySelectorAll('.et_pb_slide_content p, .et_pb_slide_description p')]
      .map((p) => `<p>${escText(p.textContent.replace(/\s+/g, ' ').trim())}</p>`).filter((x) => !isEmptyHtml(x));
    const btn = slide.querySelector('a.et_pb_button, a.et_pb_more_button');
    if (titleText && !ctx.h1Done) {
      pushOut(out, ctx, sec(block('page-head', [[`<h1>${escText(titleText)}</h1>`]])));
      ctx.blocks.push('page-head');
      ctx.h1Done = true;
    } else if (titleText) {
      ps.unshift(`<h2>${escText(titleText)}</h2>`);
    }
    if (btn) {
      const href = mapHref(btn.getAttribute('href'), ctx.locale);
      if (href && btn.textContent.trim()) ps.push(`<p><strong><a href="${escAttr(href)}">${escText(btn.textContent.trim())}</a></strong></p>`);
    }
    if (ps.length) { pushOut(out, ctx, sec(block('text prose', [[ps.join('\n          ')]]))); ctx.blocks.push('text prose(slide)'); }
  }
}

// et_pb_gallery → gallery block (rows: img + p caption, EN about-skrm shape)
function handleGallery(mod, ctx, out) {
  const rows = [];
  for (const item of mod.querySelectorAll('.et_pb_gallery_item')) {
    const img = item.querySelector('img');
    const src = img && realImgSrc(img);
    const mapped = src ? mapImgSrc(src, ctx.page) : null;
    if (!mapped) continue;
    const cap = item.querySelector('.et_pb_gallery_caption, figcaption');
    const capText = cap ? cap.textContent.replace(/\s+/g, ' ').trim() : '';
    const alt = img.getAttribute('alt') || capText;
    rows.push([`<img src="${escAttr(mapped)}" alt="${escAttr(alt)}">${capText ? `<p>${escText(capText)}</p>` : ''}`]);
  }
  if (!rows.length) { ctx.skipped.push('gallery:empty'); return; }
  pushOut(out, ctx, sec(block('gallery', rows)));
  ctx.blocks.push(`gallery(${rows.length})`);
}

// Divi accordion/toggles → faq block (rows: question / answer)
function handleAccordion(mod, ctx, out) {
  const toggles = mod.matches('.et_pb_toggle') ? [mod] : [...mod.querySelectorAll('.et_pb_toggle')];
  const rows = [];
  for (const t of toggles) {
    const q = t.querySelector('.et_pb_toggle_title, h5, h4');
    const body = t.querySelector('.et_pb_toggle_content');
    if (!q || !body) continue;
    const answer = blockNodes(body, ctx)
      .map((n) => n.replace(/^<h1([\s>])/, '<h2$1').replace(/<\/h1>$/, '</h2>')).join('\n          ');
    rows.push([`${escText(q.textContent.replace(/\s+/g, ' ').trim())}`, answer || '<p></p>']);
  }
  if (!rows.length) { ctx.skipped.push('accordion:empty'); return; }
  pushOut(out, ctx, sec(block('faq', rows)));
  ctx.blocks.push(`faq(${rows.length})`);
}

// Divi contact form → form block (rows: label / type, EN authoring shape incl. checkbox + note)
function handleContactForm(mod, ctx, out) {
  const rows = [];
  for (const f of mod.querySelectorAll('.et_pb_contact_field')) {
    const dt = f.getAttribute('data-type') || '';
    const labelEl = f.querySelector('label');
    const label = labelEl?.textContent.replace(/\s+/g, ' ').trim()
      || f.querySelector('input, textarea')?.getAttribute('placeholder') || '';
    if (dt === 'checkbox') {
      // one row per option (EN connect-form shape)
      const opts = [...f.querySelectorAll('.et_pb_contact_field_checkbox')]
        .map((o) => o.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
      if (!opts.length && label) rows.push([escText(label), 'checkbox']);
      for (const o of opts) rows.push([escText(o), 'checkbox']);
      continue;
    }
    if (dt === 'label') {
      // question / consent prose → note row, links preserved
      if (labelEl) rows.push([inlineHTML(labelEl, ctx).trim() || escText(label), 'note']);
      continue;
    }
    if (!label) continue;
    const input = f.querySelector('input, textarea');
    let type = 'text';
    if (input?.tagName === 'TEXTAREA' || dt === 'text') type = 'textarea';
    else if (dt === 'email' || input?.getAttribute('type') === 'email') type = 'email';
    rows.push([escText(label), type]);
  }
  const submit = mod.querySelector('button, .et_pb_contact_submit, input[type="submit"]');
  if (submit) rows.push([escText(submit.textContent.trim() || submit.getAttribute('value') || 'Submit'), 'submit']);
  if (!rows.length) { ctx.skipped.push('contact-form:empty'); return; }
  const mainTitle = mod.querySelector('.et_pb_contact_main_title');
  const head = mainTitle && mainTitle.textContent.trim()
    ? `      <h2>${escText(mainTitle.textContent.replace(/\s+/g, ' ').trim())}</h2>\n` : '';
  pushOut(out, ctx, sec(head + block('form', rows)));
  ctx.blocks.push(`form(${rows.length})`);
}

// classic (non-builder) WP post: entry-title + post-meta + .entry-content
function handleClassicPost(document, ctx, out) {
  const art = [...document.querySelectorAll('article')].find((a) => a.querySelector('.entry-content')) || document;
  const title = art.querySelector('.entry-title, h1');
  const meta = art.querySelector('.post-meta');
  if (title && !ctx.h1Done) {
    const rows = [[`<h1>${escText(title.textContent.replace(/\s+/g, ' ').trim())}</h1>`]];
    if (meta && meta.textContent.trim()) rows.push([`<p>${escText(meta.textContent.replace(/\s+/g, ' ').trim())}</p>`]);
    pushOut(out, ctx, sec(block('page-head', rows)));
    ctx.blocks.push('page-head');
    ctx.h1Done = true;
  }
  const ec = art.querySelector('.entry-content');
  if (!ec) { ctx.skipped.push('classic:no-entry-content'); return; }
  const nodes = blockNodes(ec, ctx).map((n) => n.replace(/^<h1([\s>])/, '<h2$1').replace(/<\/h1>$/, '</h2>'));
  for (const chunk of proseBlocks(nodes)) { pushOut(out, ctx, chunk.html); ctx.blocks.push('text prose'); }
  for (const f of ec.querySelectorAll('iframe')) emitIframe(f, ctx, out);
  ctx.classic = true;
}

// ---------- per-page ------------------------------------------------------------
function transformPage(row) {
  const htmlFile = path.join(HTML_DIR, `${row.slug}.html`);
  const recFile = path.join(PAGES_DIR, `${row.slug}.json`);
  if (!existsSync(htmlFile) || !existsSync(recFile)) return { slug: row.slug, status: 'missing-crawl' };
  const rec = JSON.parse(readFileSync(recFile, 'utf8'));

  // redirected-to-EN exclusion: finalUrl lost the locale prefix
  const finalSeg = (() => { try { return new URL(rec.finalUrl).pathname.split('/').filter(Boolean)[0]; } catch { return null; } })();
  if (finalSeg !== row.locale) {
    return { slug: row.slug, status: 'redirected', finalUrl: rec.finalUrl, lang: rec.lang };
  }

  const { document } = parseHTML(readFileSync(htmlFile, 'utf8'));
  const ctx = { page: row.slug, locale: row.locale, h1Done: false, blocks: [], skipped: [] };
  const out = [];

  // metadata (verbatim captured title/meta; description falls back to first paragraph)
  let desc = (rec.description || '').trim();
  if (!desc) {
    desc = (rec.body || []).find((p) => p.length > 40) || (rec.body || [])[0] || rec.title || '';
    if (desc.length > 158) desc = `${desc.slice(0, 155).replace(/\s+\S*$/, '')}…`;
  }
  // metadata in EN key/value shape
  const metaHtml = `      <div class="metadata">
        <div><div>Title</div><div>${escText((rec.title || '').trim())}</div></div>
        <div><div>Description</div><div>${escText(desc)}</div></div>
      </div>`;
  out.push(sec(metaHtml.replace(/^ {6}/, '      ')));

  const root = document.querySelector('article .et_builder_inner_content')
    || document.querySelector('.et_builder_inner_content')
    || document.querySelector('.entry-content') || document.body;
  const sections = [...root.children].filter((c) => /et_pb_section/.test(c.getAttribute('class') || ''));

  if (!sections.length && !root.querySelector('.et_pb_module')) {
    // classic (non-builder) WP post
    handleClassicPost(document, ctx, out);
  } else {
    for (const section of (sections.length ? sections : [root])) {
      if (isHiddenForLocale(section)) { ctx.skipped.push('hidden-section'); continue; }
      const cls = section.getAttribute('class') || '';
      if (/sos-footer-menu-section/.test(cls)) handleFooterMenu(section, ctx, out);
      else handleSectionFlow(section, ctx, out);
    }
  }

  // one-h1 contract: no h1 found → promote page-head from captured title
  if (!ctx.h1Done) {
    const h1Text = (rec.headings || []).find((h) => h.tag === 'h1')?.text
      || (rec.headings || [])[0]?.text || (rec.title || '').split('|')[0].trim();
    out.splice(1, 0, sec(block('page-head', [[`<h1>${escText(h1Text)}</h1>`]])));
    ctx.blocks.unshift('page-head(promoted)');
    ctx.skipped.push('no-h1-in-main:promoted-from-record');
  }

  const bodyHtml = `<body>\n  <header></header>\n  <main>\n${out.join('\n')}\n  </main>\n  <footer></footer>\n</body>\n`;
  const outFile = path.join(REPO, 'content', `${row.daPath}.html`);
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, bodyHtml);
  return {
    slug: row.slug, status: 'ok', daPath: row.daPath, blocks: ctx.blocks, skipped: ctx.skipped,
  };
}

// ---------- main -----------------------------------------------------------------
const results = [];
for (const row of INV) {
  if (filters.length && !filters.some((f) => row.slug.includes(f))) continue;
  try {
    results.push(transformPage(row));
  } catch (e) {
    results.push({ slug: row.slug, status: 'error', message: String(e.stack || e).slice(0, 400) });
  }
}

const byStatus = {};
for (const r of results) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
console.log('transform:', byStatus);
for (const r of results.filter((x) => x.status === 'error')) console.log('ERROR', r.slug, r.message.split('\n')[0]);
if (!filters.length) {
  writeFileSync(REPORT_FILE, JSON.stringify({ at: new Date().toISOString(), byStatus, results }, null, 2));
  writeFileSync(IMAGES_FILE, JSON.stringify([...neededImages.values()].map((v) => ({ daSub: v.daSub, srcUrl: v.srcUrl, pages: v.pages.length })), null, 2));
  console.log('needed images:', neededImages.size);
} else {
  for (const r of results) console.log(JSON.stringify(r, null, 1));
}
