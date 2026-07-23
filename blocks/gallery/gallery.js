/**
 * gallery — captioned photo grids (reconstructive).
 * Schema: stardust/eds-schema/{about-us,sant-rajinder-singh}.json
 * (sections core-tenets, sos-centers grid, conferences, global-reach, awards)
 *
 * Variants:
 *   centers   3-col 3/2 grid, light captions (sits inside the navy centers section)
 *   wide      2-col 16/10 captioned pair (conferences)
 *   single    one uncaptioned graphic on a white band (core tenets)
 *   reach     4-col 400/284 grid on the GOLD band (bio global-reach) — the
 *             silken thread recolors navy on gold so it never vanishes
 *   awards    4-col grid on white + trailing gold quote-frame (bio awards)
 *
 * Section head (h2/lede above the grid) is authored as DEFAULT CONTENT and
 * reabsorbed here (zero pixel change); rows are one figure per row (cell =
 * picture/img + optional caption text). A trailing imageless row with long
 * text = the quote-frame (awards).
 */
export default async function decorate(block) {
  // ── reabsorb the section head (runtime .default-content OR raw harness siblings)
  const headEls = [];
  const bc = block.closest('.block-content');
  if (bc) {
    const prev = bc.previousElementSibling;
    if (prev && (prev.classList.contains('default-content') || prev.classList.contains('default-content-wrapper'))) {
      headEls.push(...prev.children);
      prev.remove();
    }
  } else {
    let n = block.previousElementSibling;
    while (n) { headEls.unshift(n); n = n.previousElementSibling; }
    headEls.forEach((el) => el.remove());
  }

  const cells = [...block.querySelectorAll(':scope > div > div')];
  const figures = [];
  let quote = null;
  cells.forEach((cell) => {
    const media = cell.querySelector('picture, img'); // #53/#72
    if (media) {
      const caption = [...cell.querySelectorAll('p')]
        .map((p) => (p.contains(media) ? '' : p.textContent.trim()))
        .filter(Boolean)
        .join(' ')
        // caption may share the media's <p>: fall back to the cell's non-alt text
        || cell.textContent.trim();
      figures.push({ media, caption });
      return;
    }
    const text = cell.textContent.trim();
    if (text) quote = cell; // imageless row = the quote-frame (awards)
  });

  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  if (headEls.length) {
    const head = document.createElement('div');
    head.className = 'section-head';
    headEls.forEach((el) => head.append(el));
    wrap.append(head);
  }

  const grid = document.createElement('div');
  grid.className = 'gallery-grid';
  figures.forEach(({ media, caption }) => {
    const fig = document.createElement('figure');
    fig.append(media);
    if (caption) {
      const cap = document.createElement('figcaption');
      cap.textContent = caption;
      fig.append(cap);
    }
    grid.append(fig);
  });
  wrap.append(grid);

  if (quote) {
    const bq = document.createElement('blockquote');
    bq.className = 'quote-frame';
    [...quote.children].forEach((el) => bq.append(el.cloneNode(true)));
    if (!bq.childNodes.length) {
      const p = document.createElement('p');
      p.textContent = quote.textContent.trim();
      bq.append(p);
    }
    wrap.append(bq);
  }

  block.replaceChildren(wrap);
}
