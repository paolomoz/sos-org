/**
 * location-search — interactive center/program finder (dynamic wave).
 * Pages: /find-center, /find-local-center (alias), /find-local-programs (variant `programs`).
 *
 * Live-probe findings (2026-07-24, stardust/inventory/dynamic-probe.json):
 *   API: POST https://www2.sos.org/locationapi/searchAll
 *        content-type: application/x-www-form-urlencoded
 *        body: radius=1000000&limitResultCount=1000000  (returns the FULL dataset;
 *        the live widget geocodes the query with Google Places and filters client-side)
 *   CORS: Access-Control-Allow-Origin: * (verified with our aem.live Origin) — a
 *        form-urlencoded POST is a "simple request", no preflight needed.
 *   Response: JSON array — LocationID, LocationName, LocationType (Satsang|Center|Event),
 *        Address1/2, City, State, Country, ZipCode, Latitude, Longitude, ContactName,
 *        LocationTimings, LocationURL, IsPrivate, Status, EventStartDate, distance.
 *
 * This block does NOT load Google Maps (the live API key stays out of our markup —
 * map view + geocoded radius search are a documented follow-up). Search is a ranked
 * text match over name/address/city/state/country/zip; distance is haversine from the
 * best text match's coordinates ("near <anchor>"), which also surfaces nearby locations.
 *
 * Authoring rows = verbatim intro copy (headings/paragraphs/links, rendered in order).
 * State is local; only the status line + results list re-render per search.
 */

const API = 'https://www2.sos.org/locationapi/searchAll';
const LIVE_FINDER = 'https://www.sos.org/find-center/';
let datasetPromise = null;

function fetchLocations() {
  if (!datasetPromise) {
    datasetPromise = fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'radius=1000000&limitResultCount=1000000',
    }).then((r) => {
      if (!r.ok) throw new Error(`locationapi ${r.status}`);
      return r.json();
    }).catch((e) => { datasetPromise = null; throw e; });
  }
  return datasetPromise;
}

const TYPE_LABEL = { Center: 'Meditation Center', Satsang: 'Meditation Group', Event: 'Program / Event' };

function haversineMiles(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function coords(loc) {
  const lat = Number(loc.Latitude);
  const lng = Number(loc.Longitude);
  if (!lat && !lng) return null; // 0,0 = ungeocoded
  return { lat, lng };
}

function detailUrl(loc) {
  const slug = (loc.LocationURL || '').trim();
  if (!slug) return null;
  if (slug.startsWith('http')) return slug;
  const base = loc.LocationType === 'Event' ? 'event' : 'location';
  return `https://www.sos.org/${base}/${encodeURIComponent(slug)}`;
}

function searchLocations(all, query, type) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { matches: [] };
  const pool = all.filter((l) => l.Status === 'Active'
    && (type === 'all' || l.LocationType === type));
  const scored = [];
  pool.forEach((l) => {
    const city = (l.City || '').toLowerCase();
    const hay = [l.LocationName, l.Address1, l.Address2, l.City, l.State, l.Country, l.ZipCode]
      .map((v) => (v || '').toLowerCase()).join(' | ');
    let score = 0;
    const allHit = tokens.every((t) => {
      if (!hay.includes(t)) return false;
      if (city === t) score += 6;
      else if (city.startsWith(t)) score += 4;
      else if ((l.State || '').toLowerCase().startsWith(t) || (l.Country || '').toLowerCase().startsWith(t)) score += 2;
      else score += 1;
      return true;
    });
    if (allHit) scored.push({ loc: l, score });
  });
  scored.sort((a, b) => b.score - a.score);

  // anchor = best-scored match with real coordinates → distances + nearby extras
  const anchorEntry = scored.find((s) => coords(s.loc));
  const anchor = anchorEntry ? coords(anchorEntry.loc) : null;
  if (anchor) {
    scored.forEach((s) => {
      const c = coords(s.loc);
      s.miles = c ? haversineMiles(anchor, c) : null;
    });
    scored.sort((a, b) => (b.score - a.score) || ((a.miles ?? 1e9) - (b.miles ?? 1e9)));
    const seen = new Set(scored.map((s) => s.loc.LocationID));
    const nearby = pool
      .filter((l) => !seen.has(l.LocationID) && coords(l))
      .map((l) => ({ loc: l, score: 0, miles: haversineMiles(anchor, coords(l)) }))
      .filter((s) => s.miles <= 100)
      .sort((a, b) => a.miles - b.miles)
      .slice(0, 12);
    return { matches: scored.concat(nearby), anchorName: `${anchorEntry.loc.City || anchorEntry.loc.LocationName}`.trim() };
  }
  return { matches: scored };
}

function renderCard({ loc, miles, score }, anchorName) {
  const li = document.createElement('li');
  li.className = 'ls-card';
  const type = document.createElement('p');
  type.className = 'ls-card-type';
  type.textContent = TYPE_LABEL[loc.LocationType] || loc.LocationType;
  const name = document.createElement('h3');
  name.className = 'ls-card-name';
  name.textContent = loc.LocationName;
  li.append(type, name);

  const addrParts = [loc.Address1, loc.Address2,
    [loc.City, loc.State].filter(Boolean).join(', '),
    [loc.ZipCode, loc.Country].filter(Boolean).join(' ')].filter((p) => p && p.trim());
  if (addrParts.length) {
    const addr = document.createElement('p');
    addr.className = 'ls-card-addr';
    addr.textContent = addrParts.join(' · ');
    li.append(addr);
  }
  if (loc.LocationTimings && loc.LocationTimings.trim()) {
    const t = document.createElement('p');
    t.className = 'ls-card-timings';
    t.textContent = loc.LocationTimings.trim();
    li.append(t);
  }
  if (typeof miles === 'number' && miles > 0.5) {
    const d = document.createElement('p');
    d.className = 'ls-card-distance';
    d.textContent = `${Math.round(miles)} mi from ${anchorName}${score === 0 ? ' (nearby)' : ''}`;
    li.append(d);
  }
  const url = detailUrl(loc);
  if (url) {
    const a = document.createElement('a');
    a.className = 'text-link';
    a.href = url;
    a.textContent = 'View details';
    a.setAttribute('aria-label', `View details: ${loc.LocationName}`);
    li.append(a);
  }
  return li;
}

export default async function decorate(block) {
  const isPrograms = block.classList.contains('programs');

  // authored rows = verbatim intro
  const intro = document.createElement('div');
  intro.className = 'ls-intro';
  [...block.children].forEach((row) => {
    [...row.children].forEach((cell) => {
      [...cell.childNodes].forEach((n) => intro.append(n));
    });
  });

  const form = document.createElement('form');
  form.className = 'ls-controls';
  form.setAttribute('role', 'search');
  const label = document.createElement('label');
  label.className = 'ls-label';
  label.setAttribute('for', 'ls-q');
  label.textContent = isPrograms ? 'Search programs by city, zip code, or address' : 'Search locations by city, zip code, or address';
  const input = document.createElement('input');
  input.type = 'search';
  input.id = 'ls-q';
  input.name = 'q';
  input.placeholder = 'Search by City, Zip, Address...';
  input.autocomplete = 'off';
  const select = document.createElement('select');
  select.id = 'ls-type';
  select.setAttribute('aria-label', 'Location type');
  const types = isPrograms
    ? [['all', 'All types'], ['Event', 'Programs & events'], ['Center', 'Meditation centers'], ['Satsang', 'Meditation groups']]
    : [['all', 'All types'], ['Center', 'Meditation centers'], ['Satsang', 'Meditation groups']];
  types.forEach(([v, t]) => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = t;
    select.append(o);
  });
  const btn = document.createElement('button');
  btn.type = 'submit';
  btn.className = 'btn btn-primary';
  btn.textContent = 'Search';
  const controlsRow = document.createElement('div');
  controlsRow.className = 'ls-controls-row';
  controlsRow.append(input, select, btn);
  form.append(label, controlsRow);

  const status = document.createElement('p');
  status.className = 'ls-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const results = document.createElement('ul');
  results.className = 'ls-results';

  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  wrap.append(intro, form, status, results);
  block.replaceChildren(wrap);

  const showUnavailable = () => {
    status.textContent = 'Location search is unavailable on this preview.';
    results.replaceChildren();
    const li = document.createElement('li');
    li.className = 'ls-card ls-unavailable';
    const p = document.createElement('p');
    p.textContent = 'Please use the finder on the live site:';
    const a = document.createElement('a');
    a.className = 'text-link';
    a.href = LIVE_FINDER;
    a.textContent = 'Find a location on sos.org';
    li.append(p, a);
    results.replaceChildren(li);
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) {
      status.textContent = 'Type a city, zip code, or address to search.';
      results.replaceChildren();
      return;
    }
    status.textContent = 'Searching…';
    let all;
    try {
      all = await fetchLocations();
    } catch (err) {
      showUnavailable();
      return;
    }
    const { matches, anchorName } = searchLocations(all, q, select.value);
    if (!matches.length) {
      status.textContent = `No locations found for “${q}”. Try a city, state, or country name.`;
      results.replaceChildren();
      return;
    }
    const shown = matches.slice(0, 30);
    status.textContent = `${matches.length} location${matches.length === 1 ? '' : 's'} found for “${q}”${matches.length > shown.length ? ` (showing ${shown.length})` : ''}`;
    results.replaceChildren(...shown.map((m) => renderCard(m, anchorName)));
  });

  // warm the dataset on first interaction (keeps initial page load network-free)
  input.addEventListener('focus', () => { fetchLocations().catch(() => {}); }, { once: true });
}
