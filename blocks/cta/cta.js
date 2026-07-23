/*
 * cta — the cta-band: one Caslon-voice line + actions (primary button authored
 * <strong><a>, companion text link authored as a plain <a>).
 * Decode tier: reconstructive.
 * Schema: stardust/eds-schema/index.json § cta-band (body + 2 ctas).
 *
 * CTAs are cloned as-is (#4 anti-pattern: never manufacture button anchors) —
 * the runtime's decorateButton applies .btn classes to strong/em-wrapped links;
 * plain anchors render as text links via block CSS.
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

function isLinkRun(n) {
  if (n.matches('a')) return true;
  const links = [...n.querySelectorAll('a')];
  if (!links.length) return false;
  const linkText = links.map((a) => a.textContent).join('').replace(/\s/g, '');
  return n.textContent.replace(/\s/g, '') === linkText;
}

export default async function decorate(block) {
  const nodes = collectNodes(block);
  if (!nodes.length) return;

  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  const actions = document.createElement('div');
  actions.className = 'cta-actions';

  nodes.forEach((n) => {
    if (isLinkRun(n)) {
      if (n.matches('a')) actions.append(n);
      else actions.append(...n.childNodes);
    } else if (n.textContent.trim()) {
      wrap.append(n);
    }
  });

  if (actions.childNodes.length) wrap.append(actions);
  block.replaceChildren(wrap);
}
