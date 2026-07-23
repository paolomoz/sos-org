/**
 * steps — program technique as a semantic ordered list (reconstructive).
 * Schema: stardust/eds-schema/meditation-learn-meditation.json (section "technique",
 * 4 uniform units: h3 + p)
 *
 * Section head (h2 + lede paragraph) is authored as DEFAULT CONTENT before the
 * block and reabsorbed (zero pixel change). Rows: one step per row, cell =
 * <h3> + <p>. Flattened fallback: one cell, segmented on the most frequent
 * heading tag (#52).
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

  // collect step units — primary: one cell per row with a heading (#48)
  const cells = [...block.querySelectorAll(':scope > div > div')];
  const units = [];
  const cellHasHeading = cells.filter((c) => c.querySelector('h3, h4, h5'));
  if (cellHasHeading.length >= 2) {
    cellHasHeading.forEach((cell) => {
      const h = cell.querySelector('h3, h4, h5');
      const ps = [...cell.querySelectorAll('p')].filter((p) => !p.contains(h));
      units.push({ title: h.textContent.trim(), body: ps.map((p) => p.textContent.trim()).join(' ') || cell.textContent.replace(h.textContent, '').trim() });
    });
  } else {
    // flattened: segment the sibling run on the most frequent heading tag (#52)
    const nodes = [];
    cells.forEach((cell) => nodes.push(...cell.children));
    const counts = {};
    nodes.forEach((el) => { if (/^H[1-6]$/.test(el.tagName)) counts[el.tagName] = (counts[el.tagName] || 0) + 1; });
    const boundary = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    let current = null;
    nodes.forEach((el) => {
      if (el.tagName === boundary) {
        current = { title: el.textContent.trim(), body: '' };
        units.push(current);
      } else if (current && el.textContent.trim()) {
        current.body = `${current.body} ${el.textContent.trim()}`.trim();
      }
    });
  }

  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  if (headEls.length) {
    // headings stay in the .section-head; lede paragraphs render after it (prototype shape)
    const head = document.createElement('div');
    head.className = 'section-head';
    const ledes = [];
    headEls.forEach((el) => {
      if (el.matches('p')) {
        el.classList.add('lede');
        ledes.push(el);
      } else head.append(el);
    });
    if (head.childNodes.length) wrap.append(head);
    ledes.forEach((p) => wrap.append(p));
  }

  const ol = document.createElement('ol');
  ol.className = 'steps-list';
  units.forEach(({ title, body }) => {
    const li = document.createElement('li');
    const inner = document.createElement('div');
    const h3 = document.createElement('h3');
    h3.className = 'title';
    h3.textContent = title;
    inner.append(h3);
    if (body) {
      const p = document.createElement('p');
      p.textContent = body;
      inner.append(p);
    }
    li.append(inner);
    ol.append(li);
  });
  wrap.append(ol);

  block.replaceChildren(wrap);
}
