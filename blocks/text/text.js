/*
 * text — prose/statement block. Variants:
 *   intro    — the evergreen centered statement below the home carousel: eyebrow
 *              label, the page's single <h1>, lede, actions (primary btn + text link).
 *              Schema: stardust/eds-schema/index.json § intro.
 *   prose    — article prose measure (72ch): optional kicker, headline, running
 *              copy, gold-rule blockquotes (spiritual-growth archetype).
 *   centered — centered hook paragraph(s), 62ch (meditation-learn "opening").
 * Decode tier: reconstructive.
 *
 * Classification is by content, never index (#48/#51): the eyebrow is the short
 * text BEFORE the heading; the lede is the text AFTER it; CTAs are link-run
 * nodes cloned as-is (never manufactured — the runtime's decorateButton owns
 * .btn classes; plain anchors become text links via CSS).
 */

function collectNodes(block) {
  const out = [];
  block.querySelectorAll(':scope > div > div').forEach((cell) => {
    const kids = [...cell.children];
    if (kids.length) out.push(...kids);
    else if (cell.textContent.trim()) {
      const p = document.createElement('p');
      p.textContent = cell.textContent.trim();
      out.push(p);
    }
  });
  return out.length ? out : [...block.children];
}

const isHeading = (n) => n.matches('h1, h2, h3, h4, h5, h6');

// a node whose visible text is entirely anchor text (a CTA / link run)
function isLinkRun(n) {
  if (n.matches('a')) return true;
  const links = [...n.querySelectorAll('a')];
  if (!links.length) return false;
  const linkText = links.map((a) => a.textContent).join('').replace(/\s/g, '');
  return n.textContent.replace(/\s/g, '') === linkText;
}

function decorateIntro(block, nodes) {
  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  const headingIdx = nodes.findIndex(isHeading);
  const heading = headingIdx >= 0 ? nodes[headingIdx] : null;

  nodes.forEach((n, i) => {
    if (n === heading) return;
    if (isLinkRun(n)) return; // handled below
    if (!n.textContent.trim()) return;
    if (heading && i < headingIdx) {
      const label = document.createElement('span');
      label.className = 'label';
      label.append(...n.childNodes);
      wrap.append(label);
    } else {
      wrap.append(n); // lede paragraph(s), in order
    }
  });

  // heading placed after the eyebrow label, before the lede — rebuild order
  if (heading) {
    const label = wrap.querySelector(':scope > .label');
    if (label) label.after(heading);
    else wrap.prepend(heading);
  }

  const ctas = nodes.filter((n) => n !== heading && isLinkRun(n));
  if (ctas.length) {
    const actions = document.createElement('div');
    actions.className = 'intro-actions';
    ctas.forEach((c) => {
      if (c.matches('a')) actions.append(c);
      else actions.append(...c.childNodes);
    });
    wrap.append(actions);
  }
  block.replaceChildren(wrap);
}

function decorateProse(block, nodes, centered) {
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  const prose = document.createElement('div');
  prose.className = centered ? 'opening-body' : 'prose';

  const headingIdx = nodes.findIndex(isHeading);
  nodes.forEach((n, i) => {
    if (headingIdx >= 0 && i < headingIdx && n.textContent.trim().length < 80 && !isLinkRun(n)) {
      // short pre-heading text = kicker (#76 — buffer, don't drop)
      const kicker = document.createElement('span');
      kicker.className = 'kicker label';
      kicker.append(...n.childNodes);
      prose.append(kicker);
      return;
    }
    if (isHeading(n)) {
      n.classList.add(i === headingIdx ? 'headline' : 'title');
    }
    prose.append(n);
  });

  wrap.append(prose);
  block.replaceChildren(wrap);
}

export default async function decorate(block) {
  const nodes = collectNodes(block);
  if (!nodes.length) return;
  if (block.classList.contains('intro')) decorateIntro(block, nodes);
  else decorateProse(block, nodes, block.classList.contains('centered'));
}
