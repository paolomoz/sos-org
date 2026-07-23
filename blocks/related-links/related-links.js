/**
 * related-links — article/bio pre-footer link columns (reconstructive).
 * Schema: stardust/eds-schema/{spiritual-growth,sant-rajinder-singh}.json
 * (section "related-links")
 *
 * Variants:
 *   (default)  white cards, hairline-separated link list (article archetype)
 *   ledger     open columns with a gold-topped link ledger (bio archetype)
 *   circles    centered columns with gold-ringed circular photo tiles above the
 *              topic + link list (institutional "Learn More" band, white ground)
 *
 * Section head (h2 "Related Links" / "Learn More") is authored as DEFAULT
 * CONTENT and reabsorbed. Rows: one column per row — cell = [optional
 * picture/img (circles)] + <h3> topic + <ul> of links (decode collects links
 * generically, so a flattened link run still works). Links are text links,
 * never buttons (plain <a>).
 */
export default async function decorate(block) {
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

  const ledger = block.classList.contains('ledger');
  const circles = block.classList.contains('circles');
  const cols = [];
  [...block.querySelectorAll(':scope > div > div')].forEach((cell) => {
    const h = cell.querySelector('h3, h4, h2');
    const media = cell.querySelector('picture, img'); // #53/#72
    const links = [...cell.querySelectorAll('a')];
    if (!links.length && !h) return;
    cols.push({ title: h ? h.textContent.trim() : '', links, media });
  });

  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  const head = document.createElement('div');
  head.className = 'section-head';
  const h2 = document.createElement('h2');
  h2.className = 'headline';
  const authoredHead = headEls.find((el) => el.matches('h1, h2, h3'));
  if (authoredHead) [...authoredHead.childNodes].forEach((nd) => h2.append(nd));
  else h2.textContent = 'Related Links';
  head.append(h2);
  wrap.append(head);

  let gridClass = 'related-grid';
  if (ledger) gridClass = 'cols';
  if (circles) gridClass = 'lm-grid';
  let listClass = 'related-list';
  if (ledger) listClass = 'link-ledger';
  if (circles) listClass = 'lm-links';
  const grid = document.createElement('div');
  grid.className = gridClass;
  cols.forEach(({ title, links, media }) => {
    const list = document.createElement('ul');
    list.className = listClass;
    links.forEach((a) => {
      const li = document.createElement('li');
      const c = a.cloneNode(true);
      c.classList.remove('btn', 'btn-primary', 'btn-secondary');
      if (!ledger && !circles) c.classList.add('text-link');
      li.append(c);
      list.append(li);
    });
    const h3 = document.createElement('h3');
    h3.className = 'title';
    h3.textContent = title;
    if (circles) {
      const col = document.createElement('div');
      col.className = 'lm-col';
      if (media) {
        (media.matches('img') ? media : media.querySelector('img'))?.classList.add('lm-tile');
        col.append(media);
      }
      col.append(h3, list);
      grid.append(col);
    } else if (ledger) {
      const col = document.createElement('div');
      col.append(h3, list);
      grid.append(col);
    } else {
      const card = document.createElement('div');
      card.className = 'card';
      const body = document.createElement('div');
      body.className = 'card-body';
      body.append(h3, list);
      card.append(body);
      grid.append(card);
    }
  });
  wrap.append(grid);

  block.replaceChildren(wrap);
}
