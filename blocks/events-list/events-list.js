/**
 * events-list — the dynamic upcoming-events region (reconstructive).
 * Schema: stardust/eds-schema/upcoming-events.json (section "events-list")
 *
 * The captured feed (WP admin-ajax → Handlebars → Swiper) was empty at every
 * capture; per stardust/dynamic-blocks-map.md this block renders the EMPTY
 * data-dynamic container the feed integration later server-populates — NO
 * placeholder skeletons ship (the prototype's dashed cards are placeholder-
 * signed illustrations, deliberately dropped; recorded in the conversion log).
 *
 * Authoring rows:
 *   1. empty-state line (plain text)
 *   2. actions — primary CTA <strong><a>, secondary text link plain <a>
 */
export default async function decorate(block) {
  const cells = [...block.querySelectorAll(':scope > div > div')];
  let emptyText = '';
  let actionsCell = null;
  cells.forEach((cell) => {
    if (cell.querySelector('a')) { actionsCell = actionsCell || cell; return; }
    const t = cell.textContent.trim();
    if (t && !emptyText) emptyText = t;
  });

  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  // the integration point: server-rendered event-card items land here
  const grid = document.createElement('div');
  grid.className = 'events-grid';
  grid.dataset.dynamic = 'events-list';
  wrap.append(grid);

  const empty = document.createElement('div');
  empty.className = 'events-empty';
  if (emptyText) {
    const p = document.createElement('p');
    p.className = 'events-empty-line';
    p.textContent = emptyText;
    empty.append(p);
  }
  if (actionsCell) {
    const actions = document.createElement('div');
    actions.className = 'events-actions';
    [...actionsCell.querySelectorAll('a')].forEach((a) => {
      const wrapper = a.closest('strong, em'); // raw-authored shape (pre-decorator)
      if (wrapper) { actions.append(wrapper.cloneNode(true)); return; }
      const c = a.cloneNode(true);
      if (!c.classList.contains('btn')) c.classList.add('text-link');
      actions.append(c);
    });
    empty.append(actions);
  }
  wrap.append(empty);

  block.replaceChildren(wrap);
}
