/*
 * books — the Master's book-cover rail. Decode tier: reconstructive.
 * Schema: stardust/eds-schema/index.json § books (5× FIGURE, 1 img each).
 *
 * Authoring rows: one row per book, each cell holding ONE <img>/<picture>
 * whose alt names the book ("Book cover: …"). Section head (h2) is default
 * content the block reabsorbs.
 */

const isHeading = (n) => n.matches('h1, h2, h3, h4, h5, h6');

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
  const media = [...block.querySelectorAll(':scope > div')]
    .map((row) => row.querySelector('picture, img'))
    .filter(Boolean);

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

  const rail = document.createElement('div');
  rail.className = 'books-rail';
  media.forEach((m) => {
    const figure = document.createElement('figure');
    figure.append(m);
    rail.append(figure);
  });

  wrap.append(rail);
  block.replaceChildren(wrap);
}
