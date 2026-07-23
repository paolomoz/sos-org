/*
 * quote — the quote-band (emotional hook): gold rule, Caslon-voice italic
 * quote, cite, and companion text links ("Other Quotes" / social handle).
 * Decode tier: reconstructive.
 * Schema: stardust/eds-schema/index.json § quote-band (body, eyebrow-cite, 2 ctas).
 *
 * Authoring rows (classified by content, never index — #48):
 *   - quote text (the first link-free text)
 *   - cite line (subsequent link-free text, usually starting with an em dash or "by")
 *   - links: plain <a> anchors (text links, NOT buttons — no strong/em wrap)
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

export default async function decorate(block) {
  const nodes = collectNodes(block);
  if (!nodes.length) return;

  // a "link run" node carries only anchors (plus whitespace) — its links are the quote-links
  const isLinkRun = (n) => {
    const links = [...n.querySelectorAll('a')];
    if (!links.length) return false;
    const linkText = links.map((a) => a.textContent).join('').replace(/\s/g, '');
    return n.textContent.replace(/\s/g, '') === linkText;
  };
  const anchors = [];
  const texts = [];
  nodes.forEach((n) => {
    if (n.matches('a')) { anchors.push(n); return; }
    if (isLinkRun(n)) { anchors.push(...n.querySelectorAll('a')); return; }
    if (n.textContent.trim()) texts.push(n);
  });

  const blockquote = document.createElement('blockquote');
  const rule = document.createElement('span');
  rule.className = 'rule';
  rule.setAttribute('aria-hidden', 'true');
  blockquote.append(rule);

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

  const out = [blockquote];
  if (anchors.length) {
    const links = document.createElement('div');
    links.className = 'quote-links';
    anchors.forEach((a) => {
      a.classList.add('text-link');
      links.append(a);
    });
    out.push(links);
  }
  block.replaceChildren(...out);
}
