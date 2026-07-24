/**
 * search — net-new site search (dynamic wave; audit F-015: the live site has none).
 * Page: /search. Index: repo-root /search-index.json (committed code, built by
 * tools/build-search-index.mjs — fetched root-relative from the code origin).
 *
 * Behavior: reads ?q= on load; input + button re-run the ranked client match
 * (title > headings > body — every query token must hit somewhere); results are
 * an accessible list; empty-prompt and no-results states; the URL ?q= is kept
 * in sync (history.replaceState) so results are shareable and the header
 * fragment's plain GET form (action="/search", name="q") needs no JS.
 *
 * Authoring rows: optional intro line(s), rendered above the controls.
 */

let indexPromise = null;

function fetchIndex() {
  if (!indexPromise) {
    indexPromise = fetch('/search-index.json').then((r) => {
      if (!r.ok) throw new Error(`search-index ${r.status}`);
      return r.json();
    }).catch((e) => { indexPromise = null; throw e; });
  }
  return indexPromise;
}

function rank(pages, query) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const scored = [];
  pages.forEach((p) => {
    const title = p.title.toLowerCase();
    const desc = (p.description || '').toLowerCase();
    let score = 0;
    const allHit = tokens.every((t) => {
      let s = 0;
      if (title.includes(t)) s += 5;
      if (p.headings.some((h) => h.includes(t))) s += 3;
      if (desc.includes(t)) s += 2;
      if (p.body.includes(t)) s += 1;
      score += s;
      return s > 0;
    });
    if (!allHit) return;
    if (title.startsWith(query.toLowerCase())) score += 4;
    scored.push({ page: p, score });
  });
  scored.sort((a, b) => b.score - a.score || a.page.title.localeCompare(b.page.title));
  return scored;
}

function renderResult({ page }) {
  const li = document.createElement('li');
  li.className = 'search-result';
  const a = document.createElement('a');
  a.className = 'search-result-title';
  a.href = page.path;
  a.textContent = page.title;
  const url = document.createElement('p');
  url.className = 'search-result-path';
  url.textContent = page.path;
  li.append(a, url);
  if (page.description) {
    const d = document.createElement('p');
    d.className = 'search-result-desc';
    d.textContent = page.description;
    li.append(d);
  }
  return li;
}

export default async function decorate(block) {
  // authored rows = optional intro copy
  const intro = document.createElement('div');
  intro.className = 'search-intro';
  [...block.children].forEach((row) => {
    [...row.children].forEach((cell) => {
      [...cell.childNodes].forEach((n) => intro.append(n));
    });
  });

  const form = document.createElement('form');
  form.className = 'search-controls';
  form.setAttribute('role', 'search');
  form.action = '/search';
  form.method = 'get';
  const label = document.createElement('label');
  label.className = 'search-label';
  label.setAttribute('for', 'site-search-q');
  label.textContent = 'Search sos.org';
  const input = document.createElement('input');
  input.type = 'search';
  input.id = 'site-search-q';
  input.name = 'q';
  input.placeholder = 'Search articles, talks, news…';
  input.autocomplete = 'off';
  const btn = document.createElement('button');
  btn.type = 'submit';
  btn.className = 'btn btn-primary';
  btn.textContent = 'Search';
  const row = document.createElement('div');
  row.className = 'search-controls-row';
  row.append(input, btn);
  form.append(label, row);

  const status = document.createElement('p');
  status.className = 'search-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const results = document.createElement('ol');
  results.className = 'search-results';

  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  wrap.append(intro, form, status, results);
  block.replaceChildren(wrap);

  const run = async (q, updateUrl) => {
    const query = q.trim();
    if (updateUrl) {
      const u = new URL(window.location.href);
      if (query) u.searchParams.set('q', query); else u.searchParams.delete('q');
      window.history.replaceState(null, '', u);
    }
    if (!query) {
      status.textContent = 'Type a word or phrase to search the site.';
      results.replaceChildren();
      return;
    }
    let idx;
    try {
      idx = await fetchIndex();
    } catch (e) {
      status.textContent = 'Search is unavailable right now. Please try again later.';
      results.replaceChildren();
      return;
    }
    const matches = rank(idx.pages, query);
    if (!matches.length) {
      status.textContent = `No results for “${query}”. Try a different word, or browse Articles and Videos from the menu.`;
      results.replaceChildren();
      return;
    }
    const shown = matches.slice(0, 20);
    status.textContent = `${matches.length} result${matches.length === 1 ? '' : 's'} for “${query}”${matches.length > shown.length ? ` (showing top ${shown.length})` : ''}`;
    results.replaceChildren(...shown.map(renderResult));
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run(input.value, true);
  });
  let debounce = null;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => run(input.value, true), 250);
  });

  const initial = new URLSearchParams(window.location.search).get('q') || '';
  if (initial) {
    input.value = initial;
    run(initial, false);
  } else {
    status.textContent = 'Type a word or phrase to search the site.';
  }
}
