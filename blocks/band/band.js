/**
 * band — full-width prose bands (reconstructive).
 * Schema: stardust/eds-schema/{meditation-learn-meditation,about-us,sant-rajinder-singh}.json
 * (index `about` band shape: stardust/eds-schema — other agent's page, this block decodes it)
 *
 * Variants:
 *   about      navy two-column value-proposition band (index)
 *   community  navy centered ask: rule + h2 + prose + actions (program)
 *   centers    navy band head: rule + h2 + two prose columns (institutional;
 *              the photo grid below it is the sibling `gallery` block)
 *   callout    light gold-bordered centered statement box (institutional)
 *   connect    navy channel grid + social follow (bio "Staying Connected")
 *
 * Authoring rows: first row = the band heading (h2); then one row per column /
 * channel / statement; a link-only row = the actions row (primary CTA authored
 * <strong><a>, text links plain <a>). Decode classifies by content (#48), never
 * by index; a link-only cell is one whose text is entirely link text.
 */
export default async function decorate(block) {
  const cells = [...block.querySelectorAll(':scope > div > div')];
  const nodes = [];
  cells.forEach((cell) => {
    const kids = [...cell.children];
    if (kids.length) nodes.push({ cell, kids });
    else if (cell.textContent.trim()) {
      const p = document.createElement('p');
      p.textContent = cell.textContent.trim();
      nodes.push({ cell, kids: [p] });
    }
  });

  const isLinkOnly = (cell) => {
    const links = [...cell.querySelectorAll('a')];
    if (!links.length) return false;
    const linkText = links.map((a) => a.textContent.trim()).join(' ').replace(/\s+/g, ' ');
    const cellText = cell.textContent.trim().replace(/\s+/g, ' ');
    return cellText.length <= linkText.length + 4;
  };

  const headingEl = block.querySelector('h1, h2, h3');
  const makeHeadline = () => {
    const h2 = document.createElement('h2');
    h2.className = 'headline';
    if (headingEl) [...headingEl.childNodes].forEach((n) => h2.append(n.cloneNode(true)));
    return h2;
  };
  const goldRule = () => {
    const r = document.createElement('span');
    r.className = 'rule';
    r.setAttribute('aria-hidden', 'true');
    return r;
  };
  // clone a cell's children, skipping the band heading element itself
  const cloneContent = (target, kids) => {
    kids.forEach((k) => {
      if (k === headingEl || k.contains?.(headingEl)) {
        // flattened shape: the heading shares a cell with body copy — skip it,
        // it is rendered by makeHeadline()
        if (k === headingEl) return;
      }
      target.append(k.cloneNode(true));
    });
  };

  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  if (block.classList.contains('callout')) {
    const box = document.createElement('div');
    box.className = 'callout-box';
    if (headingEl) {
      const h2 = document.createElement('h2');
      [...headingEl.childNodes].forEach((n) => h2.append(n.cloneNode(true)));
      box.append(h2);
    } else if (nodes.length) {
      const h2 = document.createElement('h2');
      h2.textContent = block.textContent.trim();
      box.append(h2);
    }
    wrap.append(box);
  } else if (block.classList.contains('connect')) {
    wrap.append(makeHeadline());
    const grid = document.createElement('div');
    grid.className = 'connect-grid';
    const social = document.createElement('div');
    social.className = 'connect-social';
    let inSocial = false;
    nodes.forEach(({ cell, kids }) => {
      if (cell.contains(headingEl) && cell.textContent.trim() === headingEl.textContent.trim()) return;
      const h3 = cell.querySelector('h3, h4');
      if (h3 && h3.querySelector('a') && !inSocial) {
        const item = document.createElement('div');
        cloneContent(item, kids);
        grid.append(item);
        return;
      }
      if (h3 && !h3.querySelector('a')) inSocial = true;
      if (isLinkOnly(cell)) {
        const follow = document.createElement('div');
        follow.className = 'follow';
        [...cell.querySelectorAll('a')].forEach((a) => {
          const wrapper = a.closest('strong, em');
          if (wrapper) {
            follow.append(wrapper.cloneNode(true));
            return;
          }
          const c = a.cloneNode(true);
          if (!c.classList.contains('btn')) c.classList.add('text-link');
          follow.append(c);
        });
        social.append(follow);
        return;
      }
      kids.forEach((k) => {
        const c = k.cloneNode(true);
        if (c.matches('p')) c.classList.add('fb-line');
        social.append(c);
      });
    });
    wrap.append(grid);
    if (social.childNodes.length) wrap.append(social);
  } else if (block.classList.contains('about') || block.classList.contains('centers')) {
    if (block.classList.contains('centers')) wrap.append(goldRule());
    wrap.append(makeHeadline());
    const cols = document.createElement('div');
    cols.className = block.classList.contains('centers') ? 'centers-cols' : 'about-cols';
    const colCells = nodes.filter(({ cell }) => !(cell.contains(headingEl)
      && cell.textContent.trim() === headingEl.textContent.trim()));
    if (colCells.length >= 2) {
      colCells.forEach(({ kids }) => {
        const col = document.createElement('div');
        cloneContent(col, kids);
        [...col.querySelectorAll('a')].forEach((a) => {
          if (!a.classList.contains('btn') && !a.closest('p, li')?.querySelector('picture')) a.classList.add('text-link');
        });
        cols.append(col);
      });
    } else if (colCells.length === 1) {
      // flattened: split the paragraph run evenly into two columns
      const kids = colCells[0].kids.filter((k) => k !== headingEl);
      const mid = Math.ceil(kids.length / 2);
      [kids.slice(0, mid), kids.slice(mid)].forEach((half) => {
        const col = document.createElement('div');
        half.forEach((k) => col.append(k.cloneNode(true)));
        cols.append(col);
      });
    }
    wrap.append(cols);
  } else {
    // community (default): rule + h2 + prose + actions
    wrap.append(goldRule(), makeHeadline());
    const actions = document.createElement('div');
    actions.className = 'community-actions';
    nodes.forEach(({ cell, kids }) => {
      if (cell.contains(headingEl) && cell.textContent.trim() === headingEl.textContent.trim()) return;
      if (isLinkOnly(cell)) {
        [...cell.querySelectorAll('a')].forEach((a) => {
          const wrapper = a.closest('strong, em'); // raw-authored shape (pre-decorator)
          if (wrapper) { actions.append(wrapper.cloneNode(true)); return; }
          const c = a.cloneNode(true);
          if (!c.classList.contains('btn')) c.classList.add('text-link');
          actions.append(c);
        });
        return;
      }
      kids.forEach((k) => { if (k !== headingEl) wrap.append(k.cloneNode(true)); });
    });
    if (actions.childNodes.length) wrap.append(actions);
  }

  block.replaceChildren(wrap);
}
