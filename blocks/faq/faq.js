/**
 * faq — native details/summary accordion, CSS-only interaction (reconstructive).
 * Schema: stardust/eds-schema/meditation-learn-meditation.json (section "faq",
 * 9 Q/A units)
 *
 * Section head (h2) is authored as DEFAULT CONTENT and reabsorbed into the
 * split layout's left rail. Rows: one Q/A per row — question cell | answer
 * cell (answer may hold several <p>s). Flattened fallback: a text run where a
 * line ending in "?" opens a question and following text is its answer.
 * Keyboard: native <summary> is focusable and toggles on Enter/Space.
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

  const rows = [...block.children];
  const qas = [];
  rows.forEach((row) => {
    const cellEls = [...row.children];
    if (cellEls.length >= 2) {
      qas.push({ q: cellEls[0].textContent.trim(), a: [...cellEls[1].children].length ? [...cellEls[1].children] : [cellEls[1]] });
      return;
    }
    // flattened fallback (#50): question lines end in "?", following text answers
    const kids = [...(cellEls[0] || row).children];
    let current = null;
    kids.forEach((el) => {
      const t = el.textContent.trim();
      if (!t) return;
      if (/\?$/.test(t) && (!current || current.a.length)) {
        current = { q: t, a: [] };
        qas.push(current);
      } else if (current) current.a.push(el);
    });
  });

  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  const h2 = document.createElement('h2');
  h2.className = 'headline';
  const authoredHead = headEls.find((el) => el.matches('h1, h2, h3'));
  if (authoredHead) [...authoredHead.childNodes].forEach((nd) => h2.append(nd));
  else h2.textContent = 'Frequently Asked Questions';
  wrap.append(h2);

  const prose = document.createElement('div');
  prose.className = 'prose';
  qas.forEach(({ q, a }) => {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = q; // #79 textContent, never structural assumptions
    details.append(summary);
    a.forEach((el) => {
      if (el.matches?.('p')) details.append(el.cloneNode(true));
      else {
        const p = document.createElement('p');
        p.append(...(el.cloneNode(true).childNodes));
        details.append(p);
      }
    });
    prose.append(details);
  });
  wrap.append(prose);

  block.replaceChildren(wrap);
}
