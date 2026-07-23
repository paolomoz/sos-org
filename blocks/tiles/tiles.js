/*
 * tiles — webinar circular tiles (whole-tile anchors: circle photo, workshop
 * label, title). Decode tier: reconstructive.
 * Schema: stardust/eds-schema/index.json § webinars (3× A.webinar-tile).
 *
 * Authoring rows: one row per tile — <img>, a label text ("Free Online
 * Workshop"), and a plain <a href="…">Title</a> (the link text is the tile
 * title; the whole tile becomes the anchor — NOT a button, #12).
 * Section head (h2) is default content the block reabsorbs.
 */

const isHeading = (n) => n.matches('h1, h2, h3, h4, h5, h6');
const getMedia = (n) => (n.matches('picture, img') ? n : n.querySelector('picture, img'));

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

export default async function decorate(block) {
  const rows = [...block.children].map((row) => {
    const cells = [...row.children];
    return cells.length ? cells.flatMap(cellNodes) : cellNodes(row);
  }).filter((r) => r.length);

  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  const headNodes = absorbHead(block);
  if (headNodes.length) {
    const head = document.createElement('div');
    head.className = 'section-head';
    headNodes.forEach((n) => {
      if (isHeading(n)) n.classList.add('headline');
      head.append(n);
    });
    wrap.append(head);
  }

  const grid = document.createElement('div');
  grid.className = 'webinar-grid';

  rows.forEach((r) => {
    const media = r.map(getMedia).find(Boolean);
    const anchor = r.map((n) => (n.matches('a') ? n : n.querySelector('a'))).find(Boolean);
    if (!anchor) return;
    const tile = document.createElement('a');
    tile.className = 'webinar-tile';
    tile.href = anchor.href;
    if (media) tile.append(media);
    // label = the link-free text run; title = the anchor's text
    const labelSrc = r.find((n) => n !== media && !getMedia(n) && !n.contains(anchor) && !n.matches('a') && n.textContent.trim());
    if (labelSrc) {
      const label = document.createElement('span');
      label.className = 'label';
      label.append(...labelSrc.childNodes);
      tile.append(label);
    }
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = anchor.textContent.trim();
    tile.append(title);
    grid.append(tile);
  });

  wrap.append(grid);
  block.replaceChildren(wrap);
}
