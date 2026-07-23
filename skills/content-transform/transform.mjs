#!/usr/bin/env node
/*
 * transform.mjs — generate DA body-fragment content pages from stardust/migrated.
 * Usage: node transform.mjs [pathFilter…]   (no args = all remaining 63 pages)
 * Output: <repo>/content/<lowercased-path>.html
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { MIGRATED, REPO, renderSection, renderPage, imgFailures, mapImgSrc, mapHref } from './lib.mjs';
import {
  walkSection, headUnit, mediaSingleUnit, cardsUnit, galleryUnit, textUnit, splitUnit,
  bandUnit, quoteUnit, relatedLinksUnit, stepsUnit, faqUnit, formUnit, escText, cellOf,
  unmapped, q, qa,
} from './handlers.mjs';

const DONE = new Set(['.', 'news', 'spirituality/spiritual-growth', 'meditation/learn-meditation',
  'about-us', 'sant-rajinder-singh', 'upcoming-events']);

// per-page tuning (populated as the roundtrip iterations demand)
const OVERRIDES = {
  // guide-intro mixes banner img / facade video / prose / social links / cta in
  // one .narrow container — flatten to one text block (facade → plain link; the
  // media facade visual is waived on this page, logged in the conversion log)
  'benefits-of-a-spiritual-guide': { 'guide-intro': { flowAll: true } },
  // sponsor logo walls: h3 group titles + image-only anchors → one text block
  'programs/women-retreat-divine-beauty': { sponsors: { flowAll: true, textVariant: 'centered' } },
};

function listPages() {
  const out = execSync(`find ${MIGRATED} -name index.html`, { encoding: 'utf8' })
    .trim().split('\n')
    .map((f) => path.relative(MIGRATED, path.dirname(f)) || '.')
    .filter((p) => !DONE.has(p))
    .sort();
  return out;
}

function metaOf(doc) {
  const title = (doc.querySelector('title')?.textContent || '').trim();
  const desc = (doc.querySelector('meta[name="description"]')?.getAttribute('content') || '').trim();
  const h1 = (doc.querySelector('main h1')?.textContent || '').replace(/\s+/g, ' ').trim();
  let t = title;
  if (t.length > 60) t = `${h1} | Science of Spirituality`;
  if (t.length > 60) t = h1;
  if (t.length > 60) t = `${t.slice(0, 57).replace(/\s+\S*$/, '')}…`;
  let d = desc;
  if (!d) {
    const p = doc.querySelector('main .prose p, main p');
    d = (p?.textContent || h1).replace(/\s+/g, ' ').trim();
    if (d.length > 158) d = `${d.slice(0, 155).replace(/\s+\S*$/, '')}…`;
  }
  return { title: t || h1, description: d };
}

// ---- hero builders ----------------------------------------------------------
function heroBanner(img, h1Text, page) {
  const rows = [];
  if (img) {
    const src = mapImgSrc(img.getAttribute('src'), page);
    if (src) rows.push([`<img src="${src}" alt="${escText(img.getAttribute('alt') || '')}">`]);
  }
  rows.push([`<h1>${escText(h1Text)}</h1>`]);
  return { type: 'block', name: 'page-hero banner', rows };
}

function heroFrom(section, page, variant, secSel) {
  // generic: img?, kicker (text before h1), h1, lede (text after h1)
  const rows = [];
  const img = q(section, 'img');
  if (img) {
    const src = mapImgSrc(img.getAttribute('src'), page);
    if (src) rows.push([`<img src="${src}" alt="${escText(img.getAttribute('alt') || '')}">`]);
  }
  const h1 = q(section, 'h1, h2');
  const kicker = q(section, '.hero-kicker, .kicker');
  const kickerText = kicker ? kicker.textContent.trim() : '';
  if (kicker && kicker.closest('h1, h2')) kicker.remove(); // kicker nested in the h1
  // a date/sub-line span nested in the h1 (mission heros) → the lede slot
  const h1Date = h1 ? q(h1, '.h1-date') : null;
  const dateText = h1Date ? h1Date.textContent.trim() : '';
  if (h1Date) h1Date.remove();
  if (kickerText) rows.push([`<p>${escText(kickerText)}</p>`]);
  if (h1) rows.push([`<h1>${escText(h1.textContent.replace(/\s+/g, ' ').trim())}</h1>`]);
  const lede = q(section, '.hero-lede, .lede') || qa(section, 'p').find((p) => !p.closest('figure')
    && !p.closest('.hero-meta, .hero-actions') && p.textContent.trim() && h1 && (h1.compareDocumentPosition(p) & 4));
  const units = [];
  if (dateText) {
    rows.push([`<p>${escText(dateText)}</p>`]);
    // the hero-lede then rides a follow-up text block (one lede slot in the hero)
    if (lede && lede.textContent.trim()) {
      units.push({ type: 'block', name: 'text centered', rows: [[`<p>${escText(lede.textContent.replace(/\s+/g, ' ').trim())}</p>`]], sel: secSel ? `${secSel} .hero-lede` : null });
    }
  } else if (lede && lede.textContent.trim()) {
    const html = escText(lede.textContent.replace(/\s+/g, ' ').trim());
    const isHeadingLede = /^H[1-6]$/.test(lede.tagName);
    rows.push([variant === 'photo' && isHeadingLede ? `<h2>${html}</h2>` : `<p>${html}</p>`]);
  }
  // hero-meta lines + hero-actions links → follow-up text blocks (no hero slots)
  const meta = q(section, '.hero-meta');
  if (meta) {
    const ps = qa(meta, 'p').map((p) => `<p>${escText(p.textContent.replace(/\s+/g, ' ').trim())}</p>`);
    if (ps.length) units.push({ type: 'block', name: 'text centered', rows: [[ps.join('\n')]], sel: secSel ? `${secSel} .hero-meta` : null });
  }
  const actions = q(section, '.hero-actions');
  if (actions) {
    const links = qa(actions, 'a').map((a) => {
      const cls = a.getAttribute('class') || '';
      const inner = `<a href="${mapHref(a.getAttribute('href'), page)}">${escText(a.textContent.trim())}</a>`;
      if (/btn-primary/.test(cls)) return `<strong>${inner}</strong>`;
      if (/btn-secondary/.test(cls)) return `<em>${inner}</em>`;
      return inner;
    });
    if (links.length) units.push({ type: 'block', name: 'text centered', rows: [[`<p>${links.join(' ')}</p>`]], sel: secSel ? `${secSel} .hero-actions` : null });
  }
  const hero = { type: 'block', name: `page-hero ${variant}`, rows };
  if (units.length && secSel) hero.sel = `${secSel} h1`; // extras pair with their own scopes
  return units.length ? [hero, ...units] : hero;
}

function pageHeadUnit(section, page, plain) {
  const rows = [];
  const h1 = q(section, 'h1');
  rows.push([`<h1>${escText((h1?.textContent || '').replace(/\s+/g, ' ').trim())}</h1>`]);
  const byline = qa(section, '.byline, .label').find((s) => !s.closest('nav') && !s.closest('h1') && s.textContent.trim());
  if (byline) rows.push([`<p>${escText(byline.textContent.trim())}</p>`]);
  const filterLinks = qa(section, 'nav.filters a');
  const filterSpans = qa(section, 'nav.filters .label').filter((s) => s.tagName !== 'A' && !s.closest('a'));
  if (filterLinks.length) {
    const anyMarked = filterLinks.some((a) => a.getAttribute('aria-current'));
    const ps = filterLinks.map((a, i) => {
      const href = mapHref(a.getAttribute('href') || '#', page);
      const cur = anyMarked ? !!a.getAttribute('aria-current') : i === 0;
      const link = `<a href="${href}">${escText(a.textContent.trim())}</a>`;
      return `<p>${cur ? `<em>${link}</em>` : link}</p>`;
    });
    rows.push([ps.join('\n')]);
  } else if (filterSpans.length) {
    unmapped.push({ page, what: `page-head filter chips are non-link spans (${filterSpans.length}) — dropped (captured non-interactive)` });
  }
  return { type: 'block', name: plain ? 'page-head plain' : 'page-head', rows };
}

function mediaGridUnit(section, page) {
  const figures = qa(section, 'figure').filter((f) => q(f, 'a'));
  const rows = figures.map((f) => {
    const a = q(f, 'a');
    const href = mapHref(a.getAttribute('href'), page);
    let title = (q(f, '.facade-title')?.textContent || q(f, 'figcaption h3, figcaption .title')?.textContent || '').trim();
    if (!title) title = (a.getAttribute('aria-label') || '').replace(/^play video:?\s*/i, '').trim() || 'Play video';
    const desc = q(f, 'figcaption p') || (q(f, 'figcaption') && !q(f, 'figcaption h3') ? q(f, 'figcaption') : null);
    const parts = [`<a href="${href}">${escText(title)}</a>`];
    if (desc && desc.textContent.trim() && desc.textContent.trim() !== title) {
      parts.push(`<p>${escText(desc.textContent.trim())}</p>`);
    }
    return [parts.join('\n')];
  });
  if (!rows.length) return null;
  return { type: 'block', name: 'media grid', rows };
}

function tilesUnit(section, page) {
  const rows = qa(section, 'a.webinar-tile, .tile, a').filter((a) => q(a, 'img')).map((tile) => {
    const img = q(tile, 'img');
    const src = mapImgSrc(img.getAttribute('src'), page);
    const label = q(tile, '.label')?.textContent.trim() || '';
    const title = (q(tile, '.title, h3, h2')?.textContent || tile.textContent).replace(label, '').trim();
    const href = mapHref(tile.getAttribute('href') || q(tile, 'a')?.getAttribute('href'), page);
    const parts = [];
    if (src) parts.push(`<img src="${src}" alt="${escText(img.getAttribute('alt') || '')}">`);
    if (label) parts.push(`<p>${escText(label)}</p>`);
    parts.push(`<p><a href="${href}">${escText(title)}</a></p>`);
    return [parts.join('\n')];
  });
  return { type: 'block', name: 'tiles', rows };
}

// ---- per-section dispatch -----------------------------------------------------
function dispatch(section, page, state, opts) {
  const cls = (section.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  const has = (c) => cls.includes(c);
  const dataSection = section.getAttribute('data-section') || '';
  const onNavy = has('on-navy');

  if (has('hero-banner')) {
    state.bannerImg = q(section, 'img');
    return null; // merged into the article-head that follows
  }
  if (has('article-head')) {
    const h1 = q(section, 'h1');
    const h1Text = (h1?.textContent || '').replace(/\s+/g, ' ').trim();
    if (state.bannerImg) {
      const u = heroBanner(state.bannerImg, h1Text, page);
      state.bannerImg = null;
      return [u];
    }
    return [pageHeadUnit(section, page, false)];
  }
  if (has('page-head')) return [pageHeadUnit(section, page, false)];
  if (has('page-title')) return [pageHeadUnit(section, page, true)];
  if (has('band-hero')) return [].concat(heroFrom(section, page, 'panel', opts.secSel));
  if (has('page-hero')) return [].concat(heroFrom(section, page, q(section, '.hero-kicker') && q(section, '.page-hero-text') ? 'photo plate' : 'photo', opts.secSel));
  if (has('hero')) return [].concat(heroFrom(section, page, onNavy ? 'panel' : 'photo', opts.secSel));
  if (has('hero-carousel')) { unmapped.push({ page, what: 'hero-carousel outside index' }); return null; }

  if (has('opening')) return walkSection(section, page, { textVariant: 'centered', ...opts });
  if (has('free-callout') || has('statement')) return [bandUnit(section, page, 'callout')];
  if (has('centers') && onNavy) {
    // band head (+ optional prose cols); a figure grid inside goes to gallery centers
    const units = [];
    const figures = qa(section, 'figure');
    const wrap = q(section, ':scope > .wrap') || section;
    const proseCols = qa(wrap, ':scope > div').filter((d) => !q(d, 'figure') && !d.matches('.section-head') && d.textContent.trim());
    const headEl = q(wrap, ':scope > .section-head');
    const heading = headEl ? null : q(wrap, 'h2');
    if (headEl) units.push(headUnit(headEl, page));
    if (proseCols.length >= 2 || (heading && !headEl && !figures.length)) {
      units.length = 0;
      units.push(bandUnit(section, page, 'centers'));
    } else if (heading) {
      units.push({ type: 'default', html: `<h2>${escText(heading.textContent.trim())}</h2>` });
    }
    if (figures.length) {
      const g = galleryUnit(figures, page, opts.galleryVariant || 'centers');
      if (g) {
        const container = figures[0].parentElement;
        const cls = (container.getAttribute('class') || '').split(/\s+/)[0];
        g.sel = opts.secSel && cls ? `${opts.secSel} .${cls}` : opts.secSel;
        units.push(g);
      }
    }
    return units;
  }
  if ((has('community') || dataSection === 'schedule') && onNavy) {
    const units = [];
    const grid = q(section, '.card-grid, .news-grid');
    if (grid) {
      // navy band head + card grid (meditation "classes-webinars")
      const wrap = q(section, ':scope > .wrap') || section;
      const h2 = q(wrap, 'h2');
      const lede = q(wrap, '.section-lede, p');
      const rows = [];
      if (h2) rows.push([`<h2>${escText(h2.textContent.trim())}</h2>`]);
      if (lede && !lede.closest('.card-grid, .news-grid')) rows.push([`<p>${escText(lede.textContent.trim())}</p>`]);
      // sel scoped to the band's own head — the grid pairs with the cards block
      units.push({ type: 'block', name: 'band community', rows, sel: opts.secSel ? `${opts.secSel} .wrap > h2` : null });
      const c = cardsUnit(grid, page, opts.cardsVariant);
      if (c) {
        const cls = (grid.getAttribute('class') || '').split(/\s+/)[0];
        c.sel = opts.secSel && cls ? `${opts.secSel} .${cls}` : opts.secSel;
        units.push(c);
      }
      return units;
    }
    return [bandUnit(section, page, 'community')];
  }
  if (has('on-navy-band')) {
    const wrap = q(section, ':scope > .wrap') || section;
    const sub0 = q(wrap, '.sub-label');
    const cardGrid = q(wrap, '.card-grid, .news-grid');
    if (cardGrid) {
      // navy band head (+ sublabel) over a card grid (meditation-center initiatives)
      const units = [];
      const rows = [];
      const h2c = q(wrap, 'h2');
      if (h2c) rows.push([`<h2>${escText(h2c.textContent.trim())}</h2>`]);
      if (sub0) rows.push([`<p>${escText(sub0.textContent.trim())}</p>`]);
      // sel scoped to the band's own heading — the card grid pairs with the cards block
      units.push({ type: 'block', name: 'band community sublabel', rows, sel: opts.secSel ? `${opts.secSel} .wrap > h2` : null });
      const c = cardsUnit(cardGrid, page, opts.cardsVariant);
      if (c) {
        c.sel = opts.secSel ? `${opts.secSel} .${(cardGrid.getAttribute('class') || '').split(/\s+/)[0]}` : null;
        const cta = q(wrap, '.section-cta a');
        if (cta) c.rows.push([`<p><a href="${mapHref(cta.getAttribute('href'), page)}">${escText(cta.textContent.trim())}</a></p>`]);
        units.push(c);
      }
      return units;
    }
    // meditation-center navy split-media bands → band about (h2 | prose col | media col)
    const rows = [];
    const h2 = q(wrap, 'h2');
    if (h2) rows.push([`<h2>${escText(h2.textContent.trim())}</h2>`]);
    const sub = sub0;
    const grid = q(wrap, '.band-grid') || wrap;
    const proseCol = qa(grid, ':scope > div').find((d) => !q(d, 'img')) || grid;
    const colParts = [];
    if (sub) colParts.push(`<p>${escText(sub.textContent.trim())}</p>`);
    colParts.push(cellOf([...proseCol.children].filter((n) => n !== h2 && n !== sub), page));
    rows.push([colParts.join('\n')]);
    const fig = qa(grid, 'figure, img').find((f) => f.tagName === 'FIGURE' || !f.closest('figure'));
    if (fig) {
      const img = fig.tagName === 'IMG' ? fig : q(fig, 'img');
      const src = img && mapImgSrc(img.getAttribute('src'), page);
      const cap = fig.tagName === 'FIGURE' ? q(fig, 'figcaption') : null;
      const parts = [];
      if (src) parts.push(`<img src="${src}" alt="${escText(img.getAttribute('alt') || '')}">`);
      if (cap && cap.textContent.trim()) parts.push(`<p>${escText(cap.textContent.trim())}</p>`);
      if (parts.length) rows.push([parts.join('\n')]);
    }
    return [{ type: 'block', name: sub ? 'band about sublabel' : 'band about', rows }];
  }
  if (has('about') && onNavy) return [bandUnit(section, page, 'about')];
  if (has('connect') && onNavy) return [bandUnit(section, page, 'connect')];
  if (onNavy && !has('talks') && !has('programs') && !has('community-programs')) {
    // unclassified navy prose band → community shape
    if (!q(section, '.card-grid, .news-grid, figure')) return [bandUnit(section, page, 'community')];
  }

  if (has('master-quote') || has('quote-band')) {
    const units = [];
    const secSel = opts.secSel;
    const qu = quoteUnit(section, page);
    if (qu) {
      qu.sel = secSel ? `${secSel} ${q(section, '.quote-band') ? '.quote-band' : 'blockquote'}` : null;
      units.push(qu);
    }
    qa(section, 'figure').filter((f) => q(f, 'a.facade') || q(f, 'a')).forEach((f) => {
      const m = mediaSingleUnit(f, page);
      if (m) { m.sel = secSel ? `${secSel} figure` : null; units.push(m); }
    });
    return units;
  }
  if (has('featured-video')) {
    const units = [];
    const headEl = q(section, '.section-head');
    if (headEl) units.push(headUnit(headEl, page));
    const f = q(section, 'figure') || section;
    const m = mediaSingleUnit(f, page);
    if (m) units.push(m);
    return units;
  }
  if (has('featured-videos') || (has('videos') && qa(section, 'figure a').length)) {
    const units = [];
    const headEl = q(section, '.section-head');
    if (headEl) units.push(headUnit(headEl, page));
    const m = mediaGridUnit(section, page);
    if (m) units.push(m);
    return units;
  }
  if (has('webinars') && qa(section, 'a.webinar-tile').length) {
    const units = [];
    const headEl = q(section, '.section-head');
    if (headEl) units.push(headUnit(headEl, page));
    else {
      const h2 = q(section, 'h2');
      if (h2) units.push({ type: 'default', html: `<h2>${escText(h2.textContent.trim())}</h2>` });
    }
    units.push(tilesUnit(section, page));
    return units;
  }
  if (has('technique')) {
    const units = [];
    const wrap = q(section, ':scope > .wrap') || section;
    const headEl = q(wrap, '.section-head');
    if (headEl) units.push(headUnit(headEl, page));
    else {
      const parts = [];
      const h2 = q(wrap, 'h2');
      if (h2) parts.push(`<h2>${escText(h2.textContent.trim())}</h2>`);
      const lede = qa(wrap, ':scope > p, :scope > .section-lede');
      lede.forEach((p) => parts.push(`<p>${escText(p.textContent.trim())}</p>`));
      if (parts.length) units.push({ type: 'default', html: parts.join('\n') });
    }
    const ol = q(section, 'ol');
    if (ol) units.push(stepsUnit(ol, page));
    return units;
  }
  if (has('faq') && q(section, 'details')) {
    const units = [];
    const headEl = q(section, '.section-head');
    const h2 = headEl ? null : q(section, 'h2');
    if (headEl) units.push(headUnit(headEl, page));
    else if (h2) units.push({ type: 'default', html: `<h2>${escText(h2.textContent.trim())}</h2>` });
    const f = faqUnit(section, page);
    if (f) units.push(f);
    return units;
  }
  if (has('related') || has('related-links') || has('learn-more') || has('resources')) {
    const units = [];
    const wrap = q(section, ':scope > .wrap') || section;
    const headEl = q(wrap, '.section-head');
    const h2 = headEl ? null : q(wrap, ':scope > h2') || q(wrap, 'h2');
    if (headEl) units.push(headUnit(headEl, page));
    else if (h2) units.push({ type: 'default', html: `<h2>${escText(h2.textContent.trim())}</h2>` });
    // leaf columns only: a div whose DIRECT children include the topic heading + list
    const cols = qa(wrap, 'div').filter((d) => q(d, ':scope > h3, :scope > h2, :scope > h4') && q(d, ':scope > ul'));
    const variant = cols.some((c) => q(c, 'img')) ? 'circles' : (opts.relatedVariant || '');
    if (cols.length) units.push(relatedLinksUnit(cols, page, variant));
    return units;
  }
  if (has('stats')) {
    const rows = qa(section, '.stat, li, .stat-tile').map((s) => {
      const value = (q(s, '.value, strong, .num')?.textContent || '').trim();
      const label = (q(s, '.label, h3, .name')?.textContent || '').trim();
      if (value && label) return [escText(value), escText(label)];
      const txt = s.textContent.trim().split(/\n+/).map((x) => x.trim()).filter(Boolean);
      return txt.length >= 2 ? [escText(txt[0]), escText(txt[1])] : null;
    }).filter(Boolean);
    if (rows.length) return [{ type: 'block', name: 'stats', rows }];
  }
  if (has('cta-band')) {
    const wrap = q(section, ':scope > .wrap') || section;
    const rows = [];
    const line = qa(wrap, 'p, h2').find((n) => !q(n, 'a'));
    if (line) rows.push([cellOf([line], page)]);
    const links = qa(wrap, 'a');
    if (links.length) {
      rows.push([`<p>${links.map((a) => {
        const inner = `<a href="${mapHref(a.getAttribute('href'), page)}">${escText(a.textContent.trim())}</a>`;
        return /btn-primary/.test(a.getAttribute('class') || '') ? `<strong>${inner}</strong>` : inner;
      }).join(' ')}</p>`]);
    }
    return [{ type: 'block', name: 'cta', rows }];
  }
  if (has('split')) {
    const units = [];
    if (q(section, 'details')) {
      const su = splitUnit(section, page);
      if (su) units.push(su);
      const f = faqUnit(section, page);
      if (f) units.push(f);
      return units;
    }
    const su = splitUnit(section, page);
    if (su) return [su];
  }
  if (has('contact') && !onNavy) {
    const wrap = q(section, ':scope > .wrap') || section;
    return [textUnit([...wrap.children], page, 'centered')].filter(Boolean);
  }

  // generic fallback (article-section, listings, odd one-offs)
  return walkSection(section, page, opts);
}

// ---- main -------------------------------------------------------------------
const filters = process.argv.slice(2);
const pages = listPages().filter((p) => !filters.length || filters.some((f) => p.includes(f)));

let generated = 0;
for (const page of pages) {
  const html = readFileSync(`${MIGRATED}/${page}/index.html`, 'utf8');
  const { document } = parseHTML(html);
  const main = document.querySelector('main');
  if (!main) { unmapped.push({ page, what: 'no <main>' }); continue; }
  const meta = metaOf(document);
  const state = {};
  const allUnits = [];
  const pageOverrides = OVERRIDES[page] || {};
  for (const section of qa(main, ':scope > section, :scope > [data-section]')) {
    const ds = section.getAttribute('data-section') || '';
    if (ds === 'header' || ds === 'footer') continue;
    const secSel = `[data-section="${ds}"]`;
    const opts = { secSel, ...(pageOverrides['*'] || {}), ...(pageOverrides[ds] || {}) };
    let units;
    try {
      units = dispatch(section, page, state, opts);
    } catch (e) {
      unmapped.push({ page, what: `dispatch error in ${ds}: ${e.message}` });
      continue;
    }
    if (!units || !units.length) continue;
    units.forEach((u) => { if (u.type === 'block' && !u.sel) u.sel = secSel; });
    allUnits.push(...units);
  }

  // fold a default-content head into a FOLLOWING text block's cell (text does
  // not reabsorb default content; repeating blocks do)
  for (let i = allUnits.length - 1; i >= 0; i -= 1) {
    const u = allUnits[i];
    const next = allUnits[i + 1];
    if (u.type === 'default' && next && next.type === 'block' && next.name.startsWith('text ')) {
      next.rows[0][0] = `${u.html}\n${next.rows[0][0]}`;
      allUnits.splice(i, 1);
    }
  }

  // one block per section div; default-content heads ride with the next block
  const sections = [];
  const rtMap = {};
  let pendingDefaults = [];
  for (const u of allUnits) {
    if (u.type === 'default') { pendingDefaults.push(u); continue; }
    sections.push(renderSection([...pendingDefaults, u]));
    pendingDefaults = [];
    const base = u.name.split(' ')[0];
    (rtMap[base] ||= []).push(u.sel || '');
  }
  if (pendingDefaults.length) sections.push(renderSection(pendingDefaults));

  const mapPath = new URL(`./maps/${page.toLowerCase().replace(/\//g, '__')}.json`, import.meta.url).pathname;
  mkdirSync(path.dirname(mapPath), { recursive: true });
  writeFileSync(mapPath, JSON.stringify(rtMap, null, 1));

  const out = renderPage({ ...meta, sections });
  const outPath = `${REPO}/content/${page.toLowerCase()}.html`;
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, out);
  generated += 1;
}

console.log(`generated ${generated} pages`);
if (unmapped.length) {
  console.log('\n-- unmapped / notes --');
  unmapped.forEach((u) => console.log(`  [${u.page}] ${u.what}`));
}
if (imgFailures.length) {
  console.log('\n-- IMAGE FAILURES (manifest misses — bugs) --');
  imgFailures.forEach((f) => console.log(`  [${f.page}] ${f.src}: ${f.why}`));
}
