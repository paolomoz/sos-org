/**
 * events-list — the dynamic upcoming-events region (dynamic wave upgrade).
 * Schema: stardust/eds-schema/upcoming-events.json (section "events-list")
 *
 * Live-probe findings (2026-07-24, stardust/inventory/dynamic-probe.json):
 *   The live /upcoming-events/ page's own admin-ajax feed never fires on the
 *   generic page (its sos-upcoming-events-page.js POSTs to
 *   locationapi/events/<locationURL> only when a per-location url is present) —
 *   which is why every capture saw an empty feed. But the SAME first-party API,
 *   POST https://www2.sos.org/locationapi/searchAll (form-urlencoded
 *   radius=1000000&limitResultCount=1000000, CORS Access-Control-Allow-Origin: *),
 *   returns LocationType==="Event" rows with EventStartDate — 61 upcoming at probe
 *   time. This block client-fetches that feed and renders .event-card items.
 *
 * The authored empty state stays the no-JS/no-data fallback: it renders first,
 * and is replaced only when live events actually arrive (empty-state line is
 * removed; the actions row is kept below the grid).
 *
 * Authoring rows:
 *   1. empty-state line (plain text)
 *   2. actions — primary CTA <strong><a>, secondary text link plain <a>
 */

const API = 'https://www2.sos.org/locationapi/searchAll';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function eventUrl(loc) {
  const slug = (loc.LocationURL || '').trim();
  if (!slug) return null;
  if (slug.startsWith('http')) return slug;
  return `https://www.sos.org/event/${encodeURIComponent(slug)}`;
}

function renderEventCard(loc) {
  const card = document.createElement('article');
  card.className = 'event-card';

  const d = new Date(loc.EventStartDate);
  const date = document.createElement('p');
  date.className = 'byline event-date';
  date.textContent = `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`;
  card.append(date);

  const title = document.createElement('h3');
  title.className = 'title';
  title.textContent = (loc.LocationName || '').trim();
  card.append(title);

  const place = [loc.City, loc.State, loc.Country].filter((v) => v && v.trim()).join(', ');
  if (place) {
    const p = document.createElement('p');
    p.className = 'event-place';
    p.textContent = place;
    card.append(p);
  }
  if (loc.LocationTimings && loc.LocationTimings.trim()) {
    const t = document.createElement('p');
    t.className = 'event-timings';
    t.textContent = loc.LocationTimings.trim();
    card.append(t);
  }
  const url = eventUrl(loc);
  if (url) {
    const a = document.createElement('a');
    a.className = 'event-link-hint';
    a.href = url;
    a.textContent = 'Event details';
    a.setAttribute('aria-label', `Event details: ${loc.LocationName}`);
    card.append(a);
  }
  return card;
}

async function loadEvents(grid, empty) {
  let data;
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'radius=1000000&limitResultCount=1000000',
    });
    if (!r.ok) return;
    data = await r.json();
  } catch (e) {
    return; // designed empty state stays — the no-data fallback
  }
  const now = new Date();
  const events = (Array.isArray(data) ? data : [])
    .filter((l) => l.LocationType === 'Event' && l.Status === 'Active'
      && l.EventStartDate && new Date(l.EventStartDate) >= now)
    .sort((a, b) => new Date(a.EventStartDate) - new Date(b.EventStartDate));
  if (!events.length) return;
  grid.replaceChildren(...events.map(renderEventCard));
  const line = empty.querySelector('.events-empty-line');
  if (line) line.remove();
}

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

  // the integration point: event-card items land here from the live feed
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

  loadEvents(grid, empty); // fire-and-forget; fallback stays on any failure
}
