/*
 * insights — the Spiritual Insights side-rail: gold-rule quote + featured
 * insight card (7fr) beside a thumbnail link list (5fr).
 * Decode tier: TEMPLATE-SLOTTED (#95) — the prototype's grid skeleton is held
 * here and authored values are slotted by role.
 * Schema: stardust/eds-schema/index.json § spiritual-insights (5× LI + quote + card).
 *
 * Authoring rows (classified by content, never index — #48):
 *   - quote row: link-free text (+ "by …" cite line), no image
 *   - featured row: <img> + <h3> title + byline text + <a> read link
 *   - list rows: <img> + <a> title (link text) + byline text
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

  const findAnchor = (r) => r.map((n) => (n.matches('a') ? n : n.querySelector('a'))).find(Boolean);

  // classify rows by content
  let quoteRow = null;
  let featuredRow = null;
  const listRows = [];
  rows.forEach((r) => {
    const hasMedia = r.some((n) => getMedia(n));
    const hasHeading = r.some(isHeading);
    if (!quoteRow && !hasMedia && !hasHeading) { quoteRow = r; return; }
    if (!featuredRow && hasHeading) { featuredRow = r; return; }
    if (findAnchor(r)) listRows.push(r);
  });

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
  grid.className = 'insights-grid';
  const main = document.createElement('div');

  // ── quote slot ──
  if (quoteRow) {
    const blockquote = document.createElement('blockquote');
    const texts = quoteRow.filter((n) => n.textContent.trim());
    if (texts[0]) {
      const p = document.createElement('p');
      p.append(...texts[0].childNodes);
      blockquote.append(p);
    }
    if (texts[1]) {
      const cite = document.createElement('cite');
      cite.className = 'label byline';
      cite.append(...texts[1].childNodes);
      blockquote.append(cite);
    }
    main.append(blockquote);
  }

  // ── featured card slot ──
  if (featuredRow) {
    const card = document.createElement('article');
    card.className = 'card';
    const media = featuredRow.map(getMedia).find(Boolean);
    if (media) card.append(media);
    const body = document.createElement('div');
    body.className = 'card-body';
    const heading = featuredRow.find(isHeading);
    if (heading) {
      heading.classList.add('title');
      body.append(heading);
    }
    const anchor = findAnchor(featuredRow.filter((n) => n !== heading));
    featuredRow.forEach((n) => {
      if (n === heading || n === media || getMedia(n) === media) return;
      if (n === anchor || (anchor && n.contains(anchor))) return;
      if (!n.textContent.trim()) return;
      const byline = document.createElement('span');
      byline.className = 'byline';
      byline.append(...n.childNodes);
      body.append(byline);
    });
    if (anchor) {
      anchor.classList.add('card-link');
      body.append(anchor);
    }
    card.append(body);
    main.append(card);
  }
  grid.append(main);

  // ── list slot ──
  if (listRows.length) {
    const ul = document.createElement('ul');
    ul.className = 'insight-list';
    listRows.forEach((r) => {
      const li = document.createElement('li');
      const anchor = findAnchor(r);
      const a = document.createElement('a');
      a.href = anchor.href;
      const media = r.map(getMedia).find(Boolean);
      if (media) a.append(media);
      const span = document.createElement('span');
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = anchor.textContent.trim();
      span.append(title);
      const bylineSrc = r.find((n) => !getMedia(n) && n !== anchor && !n.contains(anchor) && n.textContent.trim());
      if (bylineSrc) {
        const byline = document.createElement('span');
        byline.className = 'byline';
        byline.append(...bylineSrc.childNodes);
        span.append(byline);
      }
      a.append(span);
      li.append(a);
      ul.append(li);
    });
    grid.append(ul);
  }

  wrap.append(grid);
  block.replaceChildren(wrap);
}
