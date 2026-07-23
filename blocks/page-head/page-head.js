/**
 * page-head — listing/events page title: centered gold rule + h1 + optional
 * category-filter nav (reconstructive).
 * Schema: stardust/eds-schema/{news,upcoming-events}.json
 *
 * Variants:
 *   (default)  gold rule above the h1 (news listing / article-shell heads)
 *   plain      no rule, tighter bottom padding, narrow measure (events title)
 *
 * Authoring:
 *   - first heading = the page's single <h1> (unwrapped, #55)
 *   - any links = filter chips; the ACTIVE filter is authored <em><a> (the
 *     runtime decorator turns that into a.btn-secondary before decorate runs,
 *     the raw harness keeps the <em>) — both shapes decode to aria-current.
 */
export default async function decorate(block) {
  const titleEl = block.querySelector('h1, h2, h3');
  const links = [...block.querySelectorAll('a')];

  const h1 = document.createElement('h1');
  if (titleEl) [...titleEl.childNodes].forEach((n) => h1.append(n.cloneNode(true)));

  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  if (!block.classList.contains('plain')) {
    const rule = document.createElement('span');
    rule.className = 'rule';
    rule.setAttribute('aria-hidden', 'true');
    wrap.append(rule);
  }
  wrap.append(h1);

  if (links.length) {
    const nav = document.createElement('nav');
    nav.className = 'filters';
    nav.setAttribute('aria-label', 'Categories');
    const ul = document.createElement('ul');
    links.forEach((a) => {
      const current = !!a.closest('em') || a.classList.contains('btn-secondary');
      const li = document.createElement('li');
      const chip = document.createElement('a');
      chip.className = 'label';
      chip.href = a.getAttribute('href') || '#';
      chip.textContent = a.textContent.trim();
      if (current) chip.setAttribute('aria-current', 'true');
      li.append(chip);
      ul.append(li);
    });
    nav.append(ul);
    wrap.append(nav);
  }

  block.replaceChildren(wrap);
}
