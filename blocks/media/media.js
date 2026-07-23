/*
 * media — video facades (no third-party embed until click-through). Variants:
 *   single — one featured facade (max 880px) with a caption line.
 *            Schema: stardust/eds-schema/index.json § featured-video.
 *   grid   — 3-up auto-fit facades, each captioned with a title + description.
 *            Schema: § featured-videos.
 * Decode tier: reconstructive.
 *
 * Authoring rows: one row per video — a plain <a href="…">Title</a> (the link
 * text IS the video title; NOT a button) plus an optional description text.
 * The facade is a styled anchor with an inline play glyph (SVG inline per
 * block — no shared utility); the title renders in the facade (single) or as
 * an <h3> figcaption title (grid), matching the prototype.
 */

const PLAY_SVG = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';

const isHeading = (n) => n.matches('h1, h2, h3, h4, h5, h6');

function embedUrl(href) {
  try {
    const u = new URL(href);
    if (u.hostname === 'player.vimeo.com') { u.searchParams.set('autoplay', '1'); return u.toString(); }
    if (u.hostname.endsWith('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean)[0];
      if (id) return `https://player.vimeo.com/video/${id}?autoplay=1`;
    }
    if (u.hostname.includes('youtube.com') || u.hostname === 'youtu.be') {
      const id = u.hostname === 'youtu.be' ? u.pathname.slice(1) : (u.searchParams.get('v') || u.pathname.split('/').pop());
      if (id) return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
    }
  } catch (e) { /* not a recognised video URL */ }
  return null;
}

async function loadPoster(a, href) {
  try {
    const u = new URL(href);
    let poster = null;
    if (u.hostname.includes('youtube.com') || u.hostname === 'youtu.be') {
      const id = u.hostname === 'youtu.be' ? u.pathname.slice(1) : (u.searchParams.get('v') || u.pathname.split('/').pop());
      if (id) poster = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    } else if (u.hostname.endsWith('vimeo.com')) {
      const resp = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(href)}&width=880`);
      if (resp.ok) poster = (await resp.json()).thumbnail_url;
    }
    if (poster) {
      const probe = new Image();
      probe.onload = () => { a.style.backgroundImage = `url("${poster}")`; a.classList.add('has-poster'); };
      probe.src = poster;
    }
  } catch (e) { /* facade gradient stays — poster is enhancement */ }
}

function playInline(a, title) {
  const src = embedUrl(a.href);
  if (!src) return false;
  const box = document.createElement('div');
  box.className = 'media-embed';
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.title = title;
  iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('loading', 'eager');
  box.append(iframe);
  a.replaceWith(box);
  return true;
}



function cellNodes(cell) {
  const kids = [...cell.children];
  if (kids.length) return kids;
  if (cell.textContent.trim()) {
    const p = document.createElement('p');
    p.textContent = cell.textContent.trim();
    return [p];
  }
  return [];
}

function absorbHead(block) {
  const bc = block.closest('.block-content');
  if (bc) {
    const prev = bc.previousElementSibling;
    if (prev && (prev.classList.contains('default-content') || prev.classList.contains('default-content-wrapper'))) {
      const nodes = [...prev.children];
      prev.remove();
      return nodes;
    }
    return [];
  }
  const buf = [];
  let p = block.previousElementSibling;
  while (p && p.tagName !== 'DIV') { buf.unshift(p); p = p.previousElementSibling; }
  buf.forEach((n) => n.remove());
  return buf;
}

function buildHead(nodes) {
  if (!nodes.length) return null;
  const head = document.createElement('div');
  head.className = 'section-head';
  nodes.forEach((n) => {
    if (isHeading(n)) n.classList.add('headline');
    head.append(n);
  });
  return head;
}

function facade(href, title, withTitleSpan) {
  const a = document.createElement('a');
  a.className = 'facade on-navy';
  a.href = href;
  a.setAttribute('aria-label', `Play video: ${title}`);
  const play = document.createElement('span');
  play.className = 'facade-play';
  play.setAttribute('aria-hidden', 'true');
  play.innerHTML = PLAY_SVG;
  a.append(play);
  if (withTitleSpan) {
    const t = document.createElement('span');
    t.className = 'facade-title';
    t.textContent = title;
    a.append(t);
  }
  loadPoster(a, href);
  a.addEventListener('click', (e) => {
    // plain left-click plays inline; modified clicks keep native link behavior
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (playInline(a, title)) e.preventDefault();
  });
  return a;
}

export default async function decorate(block) {
  const single = block.classList.contains('single');

  const rows = [...block.children].map((row) => {
    const cells = [...row.children];
    return cells.length ? cells.flatMap(cellNodes) : cellNodes(row);
  }).filter((r) => r.length);

  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  if (single) {
    // one video: anchor row + caption row (order-agnostic, classified by content)
    const flat = rows.flat();
    const anchor = flat.map((n) => (n.matches('a') ? n : n.querySelector('a'))).find(Boolean);
    if (!anchor) return;
    const title = anchor.textContent.trim();
    const caption = flat.find((n) => !n.matches('a') && !n.querySelector('a') && n.textContent.trim());
    const figure = document.createElement('figure');
    figure.append(facade(anchor.href, title, true));
    if (caption) {
      const figcap = document.createElement('figcaption');
      figcap.className = 'byline label';
      figcap.append(...caption.childNodes);
      figure.append(figcap);
    }
    wrap.append(figure);
    block.replaceChildren(wrap);
    return;
  }

  // grid: absorbed section head + one figure per row
  const head = buildHead(absorbHead(block));
  if (head) wrap.append(head);

  const grid = document.createElement('div');
  grid.className = 'videos-grid';
  rows.forEach((r) => {
    const anchor = r.map((n) => (n.matches('a') ? n : n.querySelector('a'))).find(Boolean);
    if (!anchor) return;
    const title = anchor.textContent.trim();
    const figure = document.createElement('figure');
    figure.append(facade(anchor.href, title, false));
    const figcap = document.createElement('figcaption');
    const authoredHeading = r.find(isHeading);
    if (authoredHeading) {
      authoredHeading.classList.add('title');
      figcap.append(authoredHeading);
    } else {
      const h = document.createElement('h3');
      h.className = 'title';
      h.textContent = title;
      figcap.append(h);
    }
    r.forEach((n) => {
      if (n === authoredHeading) return;
      if (n === anchor || n.contains(anchor)) return; // the link run became the facade
      if (n.textContent.trim()) figcap.append(n);
    });
    figure.append(figcap);
    grid.append(figure);
  });
  wrap.append(grid);
  block.replaceChildren(wrap);
}
