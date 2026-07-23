/*
 * handlers.mjs — migrated <section> → EDS block units.
 * Each handler returns an array of units: {type:'default', html} | {type:'block', name, rows}.
 * Decode contracts: the block JSDocs under blocks/; authoring shapes: the 7 exemplar pages.
 */
import { cleanNode, fixBlockquote, extractKicker, serializeNodes, mapImgSrc, mapHref } from './lib.mjs';

export const unmapped = [];

const q = (el, sel) => el.querySelector(sel);
const qa = (el, sel) => [...el.querySelectorAll(sel)];

function cleanHTML(node, page) {
  const c = cleanNode(node, page);
  return c ? (c.nodeType === 3 ? c.textContent : c.outerHTML) : '';
}

/** clean+serialize a list of nodes into one cell string */
function cellOf(nodes, page) {
  const parts = [];
  for (const n of nodes) {
    if (n.nodeType === 1 && ['ADDRESS', 'FIGURE', 'FIGCAPTION'].includes(n.tagName)) {
      // container tags cleanNode unwraps in-place — serialize their children here
      const inner = cellOf([...n.children], page);
      if (inner) parts.push(inner);
      continue;
    }
    if (n.nodeType === 1 && n.tagName === 'BLOCKQUOTE') fixBlockquote(n);
    const html = cleanHTML(n, page);
    if (html && html.trim()) parts.push(html.trim());
  }
  return parts.join('\n');
}

/** section-head → default-content unit (label span → <p>, heading, lede) */
function headUnit(headEl, page) {
  const doc = headEl.ownerDocument;
  const labels = [];
  const parts = [];
  for (const n of [...headEl.children]) {
    if (n.matches('span.label, .label')) {
      // labels lead the head (the archetype kicker shape — a folded text block
      // then classifies the first short pre-heading node as the kicker)
      const p = doc.createElement('p');
      p.textContent = n.textContent.trim();
      labels.push(p.outerHTML);
    } else {
      const k = n.matches('h1,h2,h3,h4') ? extractKicker(n, doc) : null;
      if (k) labels.push(k.outerHTML);
      const html = cleanHTML(n, page);
      if (html.trim()) parts.push(html.trim());
    }
  }
  return { type: 'default', html: [...labels, ...parts].join('\n') };
}

// ---- media (video facades) -------------------------------------------------
function mediaSingleUnit(figure, page) {
  const a = q(figure, 'a');
  if (!a) return null;
  const href = mapHref(a.getAttribute('href'), page);
  let title = (q(figure, '.facade-title')?.textContent || '').trim();
  if (!title) {
    const aria = a.getAttribute('aria-label') || '';
    title = aria.replace(/^play video:?\s*/i, '').trim() || 'Play video';
  }
  const cap = q(figure, 'figcaption');
  const rows = [[`<a href="${href}">${escText(title)}</a>`]];
  if (cap && cap.textContent.trim()) {
    const capCell = cellOf([...cap.children].length ? [...cap.children] : [pOf(cap)], page);
    rows.push([capCell || `<p>${escText(cap.textContent.trim())}</p>`]);
  }
  return { type: 'block', name: 'media single', rows };
}

function pOf(el) {
  const p = el.ownerDocument.createElement('p');
  p.textContent = el.textContent.trim();
  return p;
}

function escText(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

// ---- cards ------------------------------------------------------------------
function cardRows(cards, page, variant) {
  return cards.map((card) => {
    const parts = [];
    const cardHref = card.tagName === 'A' ? mapHref(card.getAttribute('href'), page) : null;
    const img = q(card, 'img');
    if (img) {
      const src = mapImgSrc(img.getAttribute('src'), page);
      if (src) parts.push(`<img src="${src}" alt="${escText(img.getAttribute('alt') || '')}">`);
    }
    // pre-title labels (category / byline): the decode buffers ANY pre-title
    // text as span.label — author each as a <strong> p before the title
    qa(card, '.card-body > .label, :scope > .label').forEach((l) => {
      if (l.textContent.trim()) parts.push(`<p><strong>${escText(l.textContent.trim())}</strong></p>`);
    });
    const title = q(card, '.title, h2, h3');
    if (title) {
      const k = extractKicker(title, card.ownerDocument);
      if (k) parts.push(k.outerHTML);
      if (cardHref && !q(title, 'a')) {
        // whole-card anchor → linked title (learn-meditation "workshops" exemplar)
        const tag = title.tagName.toLowerCase().startsWith('h') ? title.tagName.toLowerCase() : 'h3';
        parts.push(`<${tag}><a href="${cardHref}">${escText(title.textContent.trim())}</a></${tag}>`);
      } else {
        parts.push(cleanHTML(title, page).trim());
      }
    }
    // listing date: <time> authored as plain text (decoded by date-pattern match)
    const time = q(card, 'time');
    if (time && time.textContent.trim()) parts.push(`<p>${escText(time.textContent.trim())}</p>`);
    // body paragraphs (excerpt) — skip the ones that are just the card link
    qa(card, 'p').forEach((p) => {
      if (p.closest('.title')) return;
      const html = cleanHTML(p, page).trim();
      if (html) parts.push(html);
    });
    const titleTookCardHref = !!(cardHref && title && !q(title, 'a'));
    const link = q(card, 'a.card-link') || (card.tagName === 'A' && !titleTookCardHref ? card : null);
    if (link && link !== title?.querySelector?.('a')) {
      const href = mapHref(link.getAttribute('href'), page);
      const text = link.textContent.trim() || 'Learn more';
      parts.push(`<p><a href="${href}">${escText(text)}</a></p>`);
    }
    return [parts.join('\n')];
  });
}

function inferCardsVariant(cards) {
  const withImg = cards.filter((c) => q(c, 'img')).length;
  const withExcerpt = cards.filter((c) => qa(c, '.card-body > p, p').length > 0).length;
  const withLabels = cards.filter((c) => q(c, '.label')).length;
  const withDate = cards.filter((c) => q(c, 'time') || /[A-Z][a-z]+ \d{1,2}, \d{4}/.test(c.textContent)).length;
  const withCardLink = cards.filter((c) => q(c, 'a.card-link')).length;
  const titleLinked = cards.filter((c) => q(c, '.title a, h2 a, h3 a')).length;
  const anchorCards = cards.filter((c) => c.tagName === 'A').length;
  if (withLabels && withDate) return 'listing';
  if (anchorCards === cards.length && withImg === cards.length && !withExcerpt) return 'offerings';
  if (withImg === cards.length && !withExcerpt && !withCardLink && titleLinked === cards.length) return 'offerings';
  if (!withExcerpt && withCardLink) return 'news';
  return 'grid';
}

function cardsUnit(gridEl, page, forcedVariant) {
  const cards = qa(gridEl, 'article.card, a.card, .card');
  if (!cards.length) return null;
  const variant = forcedVariant || inferCardsVariant(cards);
  return { type: 'block', name: `cards ${variant}`, rows: cardRows(cards, page, variant) };
}

// testimonial quote cards → cards grid (one quote per row)
function testimonialUnit(gridEl, page) {
  const rows = qa(gridEl, 'blockquote').map((bq) => [cellOf(qa(bq, 'p'), page)]);
  return { type: 'block', name: 'cards grid', rows };
}

// ---- gallery ----------------------------------------------------------------
function galleryUnit(figures, page, variant) {
  const rows = figures.map((f) => {
    const parts = [];
    const img = q(f, 'img');
    if (img) {
      const src = mapImgSrc(img.getAttribute('src'), page);
      if (src) parts.push(`<img src="${src}" alt="${escText(img.getAttribute('alt') || '')}">`);
    }
    const cap = q(f, 'figcaption');
    if (cap && cap.textContent.trim()) parts.push(`<p>${escText(cap.textContent.trim())}</p>`);
    return [parts.join('')];
  }).filter((r) => r[0]);
  if (!rows.length) return null;
  return { type: 'block', name: `gallery ${variant}`, rows };
}

function inferGalleryVariant(figures, onNavy) {
  if (figures.length === 1) return 'single';
  if (figures.length === 2) return 'wide';
  // 3-col captioned grid; the navy ground rides :has(.gallery.centers) — light
  // sections opt out via the `light` sub-variant
  return onNavy ? 'centers' : 'centers light';
}

// ---- text -------------------------------------------------------------------
function textUnit(nodes, page, variant) {
  const doc = nodes[0]?.ownerDocument;
  const parts = [];
  let anchorRun = [];
  const flushAnchors = () => {
    if (!anchorRun.length) return;
    parts.push(`<p>${anchorRun.join(' ')}</p>`); // bare anchors ride a <p>
    anchorRun = [];
  };
  for (const n of nodes) {
    if (n.nodeType !== 1) continue;
    if (n.matches('span.rule, .hero-rule')) continue;
    if (n.tagName === 'A') {
      const html = cleanHTML(n, page);
      if (html && html.trim()) anchorRun.push(html.trim());
      continue;
    }
    flushAnchors();
    if (n.tagName === 'FIGURE') {
      // editorial figure in flow: img + caption p, never the raw <figure>
      const img = n.querySelector('img');
      if (img) {
        const html = cleanHTML(img, page);
        if (html) parts.push(html);
      }
      const cap = n.querySelector('figcaption');
      if (cap && cap.textContent.trim()) parts.push(`<p>${escText(cap.textContent.trim())}</p>`);
      continue;
    }
    if (n.matches('h1,h2,h3,h4')) {
      const k = extractKicker(n, doc);
      if (k) parts.push(k.outerHTML);
    }
    if (n.tagName === 'BLOCKQUOTE') fixBlockquote(n);
    const html = cleanHTML(n, page);
    if (html && html.trim()) parts.push(html.trim());
  }
  flushAnchors();
  if (!parts.length) return null;
  return { type: 'block', name: variant ? `text ${variant}` : 'text', rows: [[parts.join('\n')]] };
}

// split section → text split / text split right (media-right when img follows prose)
function splitUnit(sectionEl, page) {
  // the prose side: .prose, or (init-row/speaker shapes) the img-less inner div
  const prose = q(sectionEl, '.prose')
    || qa(sectionEl, 'div').find((d) => !q(d, 'img, figure') && d.textContent.trim().length > 40);
  const fig = q(sectionEl, 'figure') || q(sectionEl, ':scope img')?.closest('figure');
  const img = fig ? q(fig, 'img') : qa(sectionEl, 'img').find((i) => !i.closest('.prose'));
  let right = false;
  if (img && prose) {
    right = !!(prose.compareDocumentPosition(img.closest('figure') || img) & 4); // img FOLLOWS prose
  }
  const cellParts = [];
  const doc = sectionEl.ownerDocument;
  // a wrap-level heading above the split grid belongs at the head of the cell
  const wrapHeading = qa(sectionEl, 'h2, h3').find((h) => !(prose && prose.contains(h)) && !h.closest('figure'));
  if (wrapHeading) {
    const k = extractKicker(wrapHeading, doc);
    if (k) cellParts.push(k.outerHTML);
    const html = cleanHTML(wrapHeading, page);
    if (html && html.trim()) cellParts.push(html.trim());
  }
  const pushProse = () => {
    if (!prose) return;
    for (const n of [...prose.children]) {
      if (n.matches('h1,h2,h3,h4')) {
        const k = extractKicker(n, doc);
        if (k) cellParts.push(k.outerHTML);
      }
      if (n.tagName === 'BLOCKQUOTE') fixBlockquote(n);
      const html = cleanHTML(n, page);
      if (html && html.trim()) cellParts.push(html.trim());
    }
  };
  const pushImg = () => {
    if (!img) return;
    const src = mapImgSrc(img.getAttribute('src'), page);
    if (src) cellParts.push(`<img src="${src}" alt="${escText(img.getAttribute('alt') || '')}">`);
  };
  if (right) { pushProse(); pushImg(); } else { pushImg(); pushProse(); }
  if (!cellParts.length) return null;
  return { type: 'block', name: right ? 'text split right' : 'text split', rows: [[cellParts.join('\n')]] };
}

// ---- band -------------------------------------------------------------------
function bandUnit(sectionEl, page, variant) {
  const doc = sectionEl.ownerDocument;
  const wrap = q(sectionEl, '.wrap') || sectionEl;
  const heading = q(wrap, 'h2, h1');
  // detect BEFORE cellOf mutates the DOM (cleanNode strips classes in place):
  // a trailing .label line in community prose → sublabel-last CSS variant
  const srcLabels = qa(wrap, 'p.label');
  const hasTrailingLabel = variant === 'community' && srcLabels.length > 0
    && !srcLabels[srcLabels.length - 1].closest('.community-actions');
  const rows = [];
  if (heading) {
    const k = extractKicker(heading, doc);
    rows.push([cleanHTML(heading, page).trim()]);
  }
  if (variant === 'callout') return { type: 'block', name: 'band callout', rows };

  const actionEls = qa(wrap, '.community-actions a, .band-actions a, .actions a');
  const proseCols = qa(wrap, '.band-cols > div, .cols > div');
  if (variant === 'centers' && proseCols.length) {
    proseCols.forEach((col) => rows.push([cellOf([...col.children], page)]));
  } else {
    // everything that's not the heading / actions / rule = the prose row(s)
    const proseNodes = [...wrap.children].filter((n) => n !== heading
      && !n.matches('span.rule, .community-actions, .band-actions, .actions')
      && !(n.matches('div') && q(n, 'a.btn')));
    const cell = cellOf(proseNodes, page);
    if (cell) rows.push([cell]);
  }
  if (actionEls.length) {
    const links = actionEls.map((a) => {
      const href = mapHref(a.getAttribute('href'), page);
      const cls = a.getAttribute('class') || '';
      const inner = `<a href="${href}">${escText(a.textContent.trim())}</a>`;
      return /btn-primary/.test(cls) ? `<strong>${inner}</strong>` : inner;
    });
    rows.push([`<p>${links.join(' ')}</p>`]);
  }
  const name = hasTrailingLabel ? `band ${variant} sublabel-last` : `band ${variant}`;
  return { type: 'block', name, rows };
}

// ---- quote ------------------------------------------------------------------
function quoteUnit(sectionEl, page) {
  const bq = q(sectionEl, 'blockquote');
  if (!bq) return null;
  const rows = [];
  const p = q(bq, 'p');
  if (p) rows.push([cleanHTML(p, page).trim()]);
  const cite = q(bq, 'cite');
  if (cite) rows.push([`<p>${escText(cite.textContent.trim())}</p>`]);
  const links = qa(sectionEl, 'a').filter((a) => !a.closest('figure') && !a.closest('blockquote') && !q(a, 'img'));
  if (links.length) {
    rows.push([`<p>${links.map((a) => `<a href="${mapHref(a.getAttribute('href'), page)}">${escText(a.textContent.trim())}</a>`).join(' ')}</p>`]);
  }
  // master-quote cites are plain prose voice (no .label) — quote's plain-cite CSS variant
  const plainCite = cite && !/(^|\s)label(\s|$)/.test(cite.getAttribute('class') || '');
  return { type: 'block', name: plainCite ? 'quote plain-cite' : 'quote', rows };
}

// ---- related-links ----------------------------------------------------------
function relatedLinksUnit(cols, page, variant) {
  const rows = cols.map((col) => {
    const parts = [];
    const img = q(col, 'img');
    if (img) {
      const src = mapImgSrc(img.getAttribute('src'), page);
      if (src) parts.push(`<img src="${src}" alt="${escText(img.getAttribute('alt') || '')}">`);
    }
    const h = q(col, 'h3, h2, h4');
    if (h) parts.push(`<h3>${escText(h.textContent.trim())}</h3>`);
    const ul = q(col, 'ul');
    if (ul) parts.push(cleanHTML(ul, page).trim());
    return [parts.join('\n')];
  }).filter((r) => r[0]);
  const name = variant ? `related-links ${variant}` : 'related-links';
  return { type: 'block', name, rows };
}

// ---- steps / faq / stats / tiles / books ------------------------------------
function stepsUnit(ol, page) {
  const rows = qa(ol, ':scope > li').map((li) => [cellOf([...li.children].length ? [...li.children] : [pOf(li)], page)]);
  return { type: 'block', name: 'steps', rows };
}

function faqUnit(sectionEl, page) {
  const rows = qa(sectionEl, 'details').map((d) => {
    const s = q(d, 'summary');
    const qCell = escText(s ? s.textContent.trim() : '');
    const aNodes = [...d.children].filter((c) => c.tagName !== 'SUMMARY');
    return [qCell, cellOf(aNodes, page)];
  });
  if (!rows.length) return null;
  return { type: 'block', name: 'faq', rows };
}

// ---- form (connect) ----------------------------------------------------------
function formUnit(formEl, page) {
  const rows = [];
  qa(formEl, 'input, select, textarea').forEach((f) => {
    const type = f.tagName === 'SELECT' ? 'select' : (f.getAttribute('type') || 'text');
    if (type === 'hidden' || type === 'submit') return;
    const id = f.getAttribute('id');
    const lblEl = (id && q(formEl, `label[for="${id}"]`))
      || f.closest('p, .field, .consent, .et_pb_contact_field')?.querySelector('label');
    let label = (lblEl?.textContent || f.getAttribute('placeholder') || f.getAttribute('name') || '').replace(/\s+/g, ' ').trim();
    const required = f.hasAttribute('required');
    const star = label.startsWith('*') ? '' : (required ? '* ' : '');
    if (type === 'checkbox') {
      // LABEL is a dropped tag — move its inline content (incl. links) into a <p>
      let html = escText(label);
      if (lblEl) {
        const p = lblEl.ownerDocument.createElement('p');
        while (lblEl.firstChild) p.append(lblEl.firstChild);
        html = cellOf([p], page).replace(/^<p>|<\/p>$/g, '').replace(/\s+/g, ' ').trim();
      }
      rows.push([`${star}${html}`, 'checkbox']);
    } else {
      rows.push([`${star}${escText(label)}`, type === 'email' ? 'email' : type]);
    }
  });
  // non-field prose in the form (consent paragraph, with links) → `note` rows
  qa(formEl, ':scope > p').forEach((p) => {
    const doc = p.ownerDocument;
    const holder = doc.createElement('p');
    while (p.firstChild) holder.append(p.firstChild);
    const html = cellOf([holder], page).replace(/^<p>|<\/p>$/g, '').replace(/\s+/g, ' ').trim();
    if (html) rows.push([html, 'note']);
  });
  const submit = q(formEl, 'button, input[type="submit"]');
  if (submit) rows.push([escText((submit.textContent || submit.getAttribute('value') || 'Submit').trim()), 'submit']);
  return { type: 'block', name: 'form', rows };
}

// ---- the generic section walker ----------------------------------------------
const GRID_SEL = '.card-grid, .news-grid, .tile-grid, .events-grid, .workshop-grid';

/**
 * Walk one migrated <section> generically: section-head → default content;
 * prose → text; facades → media; card grids → cards; figure runs → gallery;
 * details → faq; ol → steps; forms → form. `opts` tunes variants.
 */
export function walkSection(sectionEl, page, opts = {}) {
  const units = [];
  const wrap = q(sectionEl, ':scope > .wrap') || sectionEl;
  const doc = sectionEl.ownerDocument;

  if (opts.flowAll) {
    // per-page override: flatten the whole section into ONE text block in
    // reading order (mixed narrow containers — e.g. spiritual-guide intro);
    // facades become plain links (roles preserved; media facade waived, logged)
    const parts = [];
    const walkAll = (el) => {
      for (const n of [...el.children]) {
        if (n.matches('span.rule, .gold-rule')) continue;
        if (n.matches('a.facade')) {
          const href = mapHref(n.getAttribute('href'), page);
          const t = (n.getAttribute('aria-label') || '').replace(/^play video:?\s*/i, '').trim() || 'Play video';
          parts.push(`<p><a href="${href}">${escText(t)}</a></p>`);
        } else if (n.matches('img')) {
          const html = cleanHTML(n, page);
          if (html) parts.push(html);
        } else if (n.matches('figure, div')) {
          walkAll(n);
        } else if (n.matches('h1, h2, h3, h4, p, ul, ol, blockquote, a')) {
          if (n.tagName === 'BLOCKQUOTE') fixBlockquote(n);
          const cls = n.getAttribute('class') || '';
          const html = cleanHTML(n, page);
          if (html && html.trim()) {
            parts.push(n.tagName === 'A' ? `<p>${/btn-primary/.test(cls) ? `<strong>${html.trim()}</strong>` : html.trim()}</p>` : html.trim());
          }
        }
      }
    };
    walkAll(wrap);
    if (!parts.length) return units;
    return [{ type: 'block', name: `text ${opts.textVariant || 'prose'}`, rows: [[parts.join('\n')]], sel: opts.secSel }];
  }
  let flow = [];
  const textVariant = opts.textVariant || 'prose';
  const secSel = opts.secSel || null;
  const sub = (s) => (secSel ? `${secSel} ${s}` : null);

  const flushFlow = () => {
    if (!flow.length) return;
    // a flow of only <ul>s directly after a text block = its feature list — fold in
    const onlyUls = flow.every((n) => n.nodeType === 1 && n.tagName === 'UL');
    const last = units[units.length - 1];
    if (onlyUls && last && last.type === 'block' && last.name.startsWith('text')) {
      const ulHtml = flow.map((n) => cleanHTML(n, page)).filter(Boolean).join('\n');
      if (ulHtml) last.rows[0][0] += `\n${ulHtml}`;
      flow = [];
      return;
    }
    const u = textUnit(flow, page, textVariant);
    if (u) {
      // scope flow text to its own container (.narrow etc.) whenever it has
      // one — a bare secSel overlaps sibling units when the section later
      // grows more blocks (repeated .narrow heads pair by document order)
      const hasBlock = units.some((x) => x.type === 'block');
      const parent = flow[0]?.parentElement;
      const cls = parent && parent !== wrap ? (parent.getAttribute('class') || '').split(/\s+/)[0] : '';
      if (cls) u.sel = sub(`.${cls}`);
      else u.sel = hasBlock ? sub('.wrap > p') : secSel;
      units.push(u);
    }
    flow = [];
  };

  const children = [...wrap.children];
  let figureRun = [];
  const flushFigures = () => {
    if (!figureRun.length) return;
    if (figureRun.length === 1) {
      // a lone editorial figure between prose chunks rides the text flow inline
      const f = figureRun[0];
      const img = q(f, 'img');
      const cap = q(f, 'figcaption');
      const last = [...units].reverse().find((u) => u.type === 'block' && u.name.startsWith('text'));
      if (last && !flow.length) {
        const parts = [];
        if (img) { const h = cleanHTML(img, page); if (h) parts.push(h); }
        if (cap && cap.textContent.trim()) parts.push(`<p>${escText(cap.textContent.trim())}</p>`);
        if (parts.length) last.rows[0][0] += `\n${parts.join('\n')}`;
      } else if (flow.length) {
        if (img) flow.push(img);
        if (cap && cap.textContent.trim()) flow.push(pOf(cap));
      } else if (img) {
        // no text to ride: a standalone editorial image → gallery single
        const g = galleryUnit([f], page, 'single');
        if (g) { g.sel = sub('figure:not(:has(a))'); units.push(g); }
      }
      figureRun = [];
      return;
    }
    const u = galleryUnit(figureRun, page, opts.galleryVariant || inferGalleryVariant(figureRun, opts.onNavy));
    if (u) { u.sel = secSel; units.push(u); }
    figureRun = [];
  };

  for (const child of children) {
    if (child.matches('span.rule')) continue;

    if (child.matches('figure') && !q(child, 'a.facade')) { figureRun.push(child); continue; }
    if (!child.matches('figure')) flushFigures();

    if (child.matches('.section-head')) {
      flushFlow();
      units.push(headUnit(child, page));
    } else if (child.matches('.prose')) {
      flushFlow();
      const innerForm = q(child, 'form');
      if (innerForm) {
        const nonForm = [...child.children].filter((n) => n !== innerForm);
        if (nonForm.length) {
          const u0 = textUnit(nonForm, page, opts.proseVariant || textVariant);
          if (u0) { u0.sel = sub('.prose'); units.push(u0); }
        }
        const fu = formUnit(innerForm, page);
        fu.sel = nonForm.length ? sub('form') : sub('.prose');
        units.push(fu);
      } else {
        const u = textUnit([...child.children], page, opts.proseVariant || textVariant);
        if (u) { u.sel = sub('.prose'); units.push(u); }
      }
    } else if (child.matches('figure') && q(child, 'a.facade')) {
      flushFlow();
      const u = mediaSingleUnit(child, page);
      if (u) { u.sel = sub('figure:has(a)'); units.push(u); }
    } else if (child.matches('.figure-grid') || (child.matches('div') && qa(child, ':scope > figure').length >= 2 && !q(child, '.prose')
        && !qa(child, ':scope > h1, :scope > h2, :scope > h3, :scope > p, :scope > span').length)) {
      // figure-ONLY container → gallery; a mixed .narrow (heading + prose +
      // report figures) walks generically so its text survives
      flushFlow();
      const figs = qa(child, ':scope > figure');
      const u = galleryUnit(figs, page, opts.galleryVariant || inferGalleryVariant(figs, opts.onNavy));
      if (u) { u.sel = sub(`.${(child.getAttribute('class') || 'figure-grid').split(/\s+/)[0]}`); units.push(u); }
    } else if (child.matches(GRID_SEL) || q(child, ':scope > article.card')) {
      flushFlow();
      const u = child.matches('.testimonial-grid') ? testimonialUnit(child, page)
        : cardsUnit(child, page, opts.cardsVariant);
      if (u) { u.sel = sub(`.${(child.getAttribute('class') || '').split(/\s+/)[0] || 'card-grid'}`); units.push(u); }
    } else if (child.matches('.testimonial-grid')) {
      flushFlow();
      const u = testimonialUnit(child, page);
      if (u) { u.sel = sub('.testimonial-grid'); units.push(u); }
    } else if (child.matches('form') || q(child, 'form') || q(child, 'input, select, textarea')) {
      flushFlow();
      const head = q(child, ':scope > h2, :scope > .headline, :scope > .section-head');
      if (head) units.push(headUnit(head.matches('.section-head') ? head : wrapEl(head), page));
      const fu = formUnit(child.matches('form') ? child : (q(child, 'form') || child), page);
      fu.sel = secSel;
      units.push(fu);
    } else if (child.matches('.addr-grid') || qa(child, 'address').length) {
      // address cards (connect "Find a Center") → cards grid rows
      flushFlow();
      const rows = qa(child, ':scope > div').map((cardEl) => {
        const parts = [];
        const label = q(cardEl, '.label');
        if (label) parts.push(`<p><strong>${escText(label.textContent.trim())}</strong></p>`);
        const h = q(cardEl, 'h3, h2');
        if (h) parts.push(`<h3>${escText(h.textContent.trim())}</h3>`);
        const addr = q(cardEl, 'address');
        if (addr) {
          const doc = cardEl.ownerDocument;
          const p = doc.createElement('p');
          while (addr.firstChild) p.append(addr.firstChild);
          parts.push(cellOf([p], page));
        }
        return [parts.join('\n')];
      }).filter((r) => r[0]);
      if (rows.length) units.push({ type: 'block', name: 'cards grid', rows, sel: sub('.addr-grid') });
    } else if (child.matches('[data-dynamic]') || q(child, '[data-dynamic]')) {
      flushFlow();
      const dyn = child.matches('[data-dynamic]') ? child : q(child, '[data-dynamic]');
      const grid = q(dyn, GRID_SEL) || (q(dyn, 'article.card') ? dyn : null);
      if (grid) {
        const u = cardsUnit(grid, page, opts.cardsVariant);
        if (u) { u.sel = secSel; units.push(u); }
      } else {
        unmapped.push({ page, what: `empty dynamic region ${dyn.getAttribute('data-dynamic')} (skipped — integration point)` });
      }
    } else if (q(child, 'details')) {
      flushFlow();
      const u = faqUnit(child, page);
      if (u) { u.sel = secSel; units.push(u); }
    } else if (child.matches('ol') || (child.matches('div') && q(child, ':scope > ol'))) {
      flushFlow();
      units.push({ ...stepsUnit(child.matches('ol') ? child : q(child, 'ol'), page), sel: sub('ol') });
    } else if (child.matches('.quote-band')) {
      flushFlow();
      const u = quoteUnit(child, page);
      if (u) { u.sel = sub('.quote-band'); units.push(u); }
    } else if (child.matches('blockquote')) {
      flushFlow();
      const u = quoteUnit(child.parentElement === wrap ? wrapBQ(child, doc) : child, page);
      if (u) { u.sel = sub('blockquote'); units.push(u); }
    } else if (child.matches('div') && qa(child, ':scope > figure, :scope > img').length <= 1
        && (q(child, ':scope > .prose')
          || (q(child, ':scope > figure') && qa(child, ':scope > div').some((d) => !q(d, 'img, figure') && d.textContent.trim()))
          || (q(child, ':scope > img') && q(child, ':scope > div')))) {
      // split-grid container (why-grid, init-row, speaker…): ONE media + a prose side.
      // Mixed flow containers (.narrow with several report figures) walk generically.
      flushFlow();
      const u = splitUnit(child, page);
      if (u) { u.sel = sub(`.${(child.getAttribute('class') || '').split(/\s+/)[0] || 'split'}`); units.push(u); }
      // any feature <ul> inside the container but outside prose
      const ul = qa(child, ':scope > ul');
      ul.forEach((u2) => flow.push(u2));
    } else if (child.matches('nav.pagination') || (child.matches('nav') && q(child, '.page-num'))) {
      // pagination → trailing row of the preceding cards block (news exemplar shape)
      flushFlow();
      const lastCards = [...units].reverse().find((u) => u.type === 'block' && u.name.startsWith('cards'));
      if (lastCards) {
        const current = q(child, '.page-current')?.textContent.trim() || '1';
        const nums = qa(child, 'a.page-num').filter((a) => !/next|last|prev|first/i.test(a.textContent));
        const words = qa(child, 'a.page-num').filter((a) => /next|last|prev|first/i.test(a.textContent));
        const mk = (a) => `<a href="${mapHref(a.getAttribute('href'), page)}">${escText(a.textContent.trim())}</a>`;
        const parts = [`<p>${escText(current)}</p>`];
        if (nums.length) parts.push(`<p>${nums.map(mk).join(' ')}</p>`);
        if (words.length) parts.push(`<p>${words.map(mk).join(' ')}</p>`);
        lastCards.rows.push([parts.join('\n')]);
      } else {
        unmapped.push({ page, what: 'pagination with no preceding cards block' });
      }
    } else if (child.matches('a.text-link, a')) {
      // section-level trailing text link → trailing link-only row of the cards block
      flushFlow();
      const href = mapHref(child.getAttribute('href'), page);
      const link = `<p><a href="${href}">${escText(child.textContent.trim())}</a></p>`;
      const lastCards = [...units].reverse().find((u) => u.type === 'block' && u.name.startsWith('cards'));
      if (lastCards) lastCards.rows.push([link]);
      else units.push({ type: 'default', html: link });
    } else if (child.matches('span.label, span')) {
      if (child.textContent.trim()) flow.push(pOf(child));
    } else if (child.matches('h1, h2, h3, h4, p, ul, ol')) {
      flow.push(child);
    } else if (child.matches('div') && isLinkRunDiv(child)) {
      // read-more / actions div → trailing link row of the preceding cards block
      flushFlow();
      const links = qa(child, 'a').map((a) => {
        const inner = `<a href="${mapHref(a.getAttribute('href'), page)}">${escText(a.textContent.trim())}</a>`;
        return /btn-primary/.test(a.getAttribute('class') || '') ? `<strong>${inner}</strong>` : inner;
      });
      const row = [`<p>${links.join(' ')}</p>`];
      const lastCards = [...units].reverse().find((u) => u.type === 'block' && u.name.startsWith('cards'));
      if (lastCards) lastCards.rows.push(row);
      else units.push({ type: 'default', html: row[0] });
    } else if (child.matches('div') && child.children.length) {
      // unknown container: recurse its children into flow
      flow.push(...child.children);
    } else if (child.textContent.trim()) {
      unmapped.push({ page, what: `unhandled node <${child.tagName.toLowerCase()} class="${child.getAttribute('class')}"> in section ${sectionEl.getAttribute('data-section')}` });
    }
  }
  flushFigures();
  flushFlow();
  return units;
}

function wrapBQ(bq, doc) {
  const d = doc.createElement('div');
  bq.replaceWith(d);
  d.append(bq);
  return d;
}

/** a div whose visible text is entirely link text (read-more / actions rows) */
function isLinkRunDiv(el) {
  const links = qa(el, 'a');
  if (!links.length) return false;
  const linkText = links.map((a) => a.textContent).join('').replace(/\s/g, '');
  if (!linkText) return false; // image-only anchors (sponsor logo walls) are not a link run
  return el.textContent.replace(/\s/g, '') === linkText;
}

/** wrap a lone heading in a container so headUnit can walk it */
function wrapEl(el) {
  const d = el.ownerDocument.createElement('div');
  el.replaceWith(d);
  d.append(el);
  return d;
}

export {
  headUnit, mediaSingleUnit, cardsUnit, testimonialUnit, galleryUnit, textUnit, splitUnit,
  bandUnit, quoteUnit, relatedLinksUnit, stepsUnit, faqUnit, formUnit, escText, cellOf, q, qa,
};
