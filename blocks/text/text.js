/*
 * text — prose/statement block. Variants:
 *   intro    — the evergreen centered statement below the home carousel: eyebrow
 *              label, the page's single <h1>, lede, actions (primary btn + text link).
 *              Schema: stardust/eds-schema/index.json § intro.
 *   prose    — article prose measure (72ch): optional kicker, headline, running
 *              copy, gold-rule blockquotes (spiritual-growth archetype).
 *   centered — centered hook paragraph(s), 62ch (meditation-learn "opening").
 *   split    — media + prose split (5fr/7fr; .right inverts) — migrated split-media sections.
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
    if (i === 0 && headingIdx > 0 && n.textContent.trim().length < 80 && !isLinkRun(n)) {
      // wave-final one-rule fix (logged): the kicker is only ever the CELL'S
      // FIRST node (the archetype "Introduction:" shape) — a short body line
      // that merely precedes a mid-prose <h3> is prose, not a kicker (it
      // painted as an uppercase label on find-local-center).
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

  // wave-final one-rule fix (logged): DA strips <cite> from authored cells, so
  // the pull-quote byline arrives as a plain trailing <p> — rebuild the <cite>
  // (the .text .prose blockquote cite label paint depends on it).
  prose.querySelectorAll('blockquote').forEach((bq) => {
    const ps = [...bq.querySelectorAll(':scope > p')];
    const last = ps[ps.length - 1];
    if (ps.length >= 2 && last && !last.querySelector('a, cite')
        && last.textContent.trim().length < 90) {
      const cite = document.createElement('cite');
      cite.className = 'label byline';
      cite.append(...last.childNodes);
      last.replaceWith(cite);
    }
  });

  wrap.append(prose);
  block.replaceChildren(wrap);
}


function decorateSplit(block, nodes) {
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  const grid = document.createElement('div');
  grid.className = 'split-grid';
  const prose = document.createElement('div');
  prose.className = 'prose';
  let pic = null;
  nodes.forEach((n) => {
    if (!pic) {
      const found = n.matches('picture, img') ? n : n.querySelector('picture, img');
      if (found) {
        pic = found.closest('picture') || found;
        if (n !== pic && n.contains(pic)) pic.remove();
        if (n === pic) return;
      }
    }
    if (n === pic) return;
    if (n.textContent.trim() || n.querySelector('a')) {
      if (isHeading(n)) n.classList.add('title');
      prose.append(n);
    }
  });
  if (pic) grid.append(pic);
  grid.append(prose);
  wrap.append(grid);
  block.replaceChildren(wrap);
}

export default async function decorate(block) {
  const nodes = collectNodes(block);
  if (!nodes.length) return;
  if (block.classList.contains('intro')) decorateIntro(block, nodes);
  else if (block.classList.contains('split')) decorateSplit(block, nodes);
  else decorateProse(block, nodes, block.classList.contains('centered'));
}
