/**
 * stats — settled counter tiles (TEMPLATE-SLOTTED, #95: fixed 4-tile composition).
 * Schema: stardust/eds-schema/about-us.json (section "stats", 4 uniform units)
 *
 * Authoring rows — one row per stat, two cells:
 *   value | label            e.g.  15K+ | Workshops
 * Flattened fallback (one cell): <strong>value</strong> then label text.
 * Values render as spans, labels as <h3> (the captured semantic shape).
 */
export default async function decorate(block) {
  const rows = [...block.children];
  const stats = [];

  rows.forEach((row) => {
    const cellEls = [...row.children];
    if (cellEls.length >= 2) {
      stats.push({
        value: cellEls[0].textContent.trim(),
        label: cellEls[1].textContent.trim(),
      });
      return;
    }
    const cell = cellEls[0] || row;
    const strong = cell.querySelector('strong');
    if (strong) {
      const value = strong.textContent.trim();
      const label = cell.textContent.replace(strong.textContent, '').trim();
      if (value && label) stats.push({ value, label });
      return;
    }
    // last-ditch: "15K+ Workshops" — leading numeric token is the value (#50)
    const m = cell.textContent.trim().match(/^([\d.,]+[KM]?\+?)\s+(.+)$/i);
    if (m) stats.push({ value: m[1], label: m[2] });
  });

  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  const grid = document.createElement('div');
  grid.className = 'stats-grid';
  stats.forEach(({ value, label }) => {
    const stat = document.createElement('div');
    stat.className = 'stat';
    const v = document.createElement('span');
    v.className = 'stat-value';
    v.textContent = value;
    const l = document.createElement('h3');
    l.className = 'stat-label title';
    l.textContent = label;
    stat.append(v, l);
    grid.append(stat);
  });
  wrap.append(grid);
  block.replaceChildren(wrap);
}
