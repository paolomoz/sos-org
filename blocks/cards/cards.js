/*
 * cards — insight-card grids. Variants:
 *   talks     — 2-up cards on Silence (white) ground: image, date label, title,
 *               clamp-4 excerpt, card link; trailing "View All Posts" text link.
 *               Schema: stardust/eds-schema/index.json § recent-talks.
 *   news      — 3-up auto-fit cards: image, clamp-3 title, card link; trailing
 *               "See all happenings" text link. Schema: § happenings.
 *   grid      — 3-up auto-fit cards: image, title, clamp-3 excerpt, card link.
 *               Schema: § articles.
 *   offerings — whole-card photo anchors (image + title), centered head, 1000px
 *               grid (meditation-learn "workshops" archetype).
 *   listing   — 2-up news archive cards: image, category label, title, date,
 *               card link; trailing pagination row (news archetype).
 *
 * Decode tier: reconstructive. Section head (eyebrow/heading/lede above the
 * grid) is DEFAULT CONTENT the block reabsorbs (zero pixel change) with an
 * in-table fallback (#56). Cards are classified by content, never index (#48):
 * one row per card is the authored default; the DA-flattened single-cell shape
 * is segmented on the most frequent heading tag (#52). Card links are cloned,
 * never manufactured. Media matches `picture, img` (#53/#72); text fields are
 * read per element, never via querySelectorAll('p') alone (#79).
 */

const VARIANTS = {
  talks: { grid: 'talks-grid', excerptClamp: 'clamp-4' },
  news: { grid: 'card-grid', titleClamp: 'clamp-3' },
  grid: { grid: 'card-grid', excerptClamp: 'clamp-3' },
  offerings: { grid: 'workshop-grid', anchorCard: true },
  listing: { grid: 'news-grid', pagination: true },
};

const isHeading = (n) => n.matches('h1, h2, h3, h4, h5, h6');
const getMedia = (n) => (n.matches('picture, img') ? n : n.querySelector('picture, img'));

function isLinkRun(n) {
  if (n.matches('a')) return true;
  const links = [...n.querySelectorAll('a')];
  if (!links.length) return false;
  const linkText = links.map((a) => a.textContent).join('').replace(/\s/g, '');
  return n.textContent.replace(/\s/g, '') === linkText;
}

// cell → flat element list (recovers text-only cells; #62 cascade collector)
function cellNodes(cell) {
  const kids = [...cell.children];
  if (kids.length) return kids;
  if (cell.textContent.trim()) {
    const p = document.createElement('p');
    p.textContent = cell.textContent.trim();
    return [p];
  }
  return [];
}

// Section head = default content before the block (live: .default-content
// sibling of .block-content; harness/raw: preceding non-div siblings).
function absorbHead(block) {
  const bc = block.closest('.block-content');
  if (bc) {
    const prev = bc.previousElementSibling;
    if (prev && (prev.classList.contains('default-content') || prev.classList.contains('default-content-wrapper'))) {
      const nodes = [...prev.children];
      prev.remove();
      return nodes;
    }
    return [];
  }
  const buf = [];
  let p = block.previousElementSibling;
  while (p && p.tagName !== 'DIV') { buf.unshift(p); p = p.previousElementSibling; }
  buf.forEach((n) => n.remove());
  return buf;
}

function buildHead(nodes) {
  if (!nodes.length) return null;
  const head = document.createElement('div');
  head.className = 'section-head';
  const hIdx = nodes.findIndex(isHeading);
  nodes.forEach((n, i) => {
    if (isHeading(n)) {
      n.classList.add('headline');
      head.append(n);
    } else if (hIdx >= 0 && i < hIdx) {
      const label = document.createElement('span');
      label.className = 'label';
      label.append(...n.childNodes);
      head.append(label);
    } else {
      head.append(n);
    }
  });
  return head;
}

// One card from its flat node list.
function buildCard(nodes, v) {
  const media = nodes.map(getMedia).find(Boolean);
  const heading = nodes.find(isHeading);
  const linkRuns = nodes.filter((n) => !isHeading(n) && isLinkRun(n));
  const link = linkRuns.length ? linkRuns[linkRuns.length - 1].querySelector('a') || linkRuns[linkRuns.length - 1] : null;

  const hIdx = nodes.indexOf(heading);
  const texts = nodes.filter((n) => n !== heading && !isLinkRun(n) && !getMedia(n) && n.textContent.trim());
  const pre = hIdx >= 0 ? texts.filter((n) => nodes.indexOf(n) < hIdx) : [];
  const post = texts.filter((n) => !pre.includes(n));

  if (v.anchorCard) {
    // offerings: the whole card is the anchor
    const card = document.createElement('a');
    card.className = 'card workshop-card';
    if (link) card.href = link.href;
    else if (heading && heading.querySelector('a')) card.href = heading.querySelector('a').href;
    if (media) card.append(media);
    const body = document.createElement('div');
    body.className = 'card-body';
    if (heading) {
      heading.classList.add('title');
      const inner = heading.querySelector('a');
      if (inner) heading.replaceChildren(...inner.childNodes);
      body.append(heading);
    }
    card.append(body);
    return card;
  }

  const card = document.createElement('article');
  card.className = 'card';
  if (media) card.append(media);
  const body = document.createElement('div');
  body.className = 'card-body';

  // short date/category text before the title = label (#76 — buffered, not dropped)
  pre.forEach((n) => {
    const label = document.createElement('span');
    label.className = 'label byline';
    label.append(...n.childNodes);
    body.append(label);
  });

  if (heading) {
    heading.classList.add('title');
    if (v.titleClamp) heading.classList.add(v.titleClamp);
    body.append(heading);
  }

  post.forEach((n) => {
    const isDate = /^\w+ \d{1,2}, \d{4}$/.test(n.textContent.trim());
    if (isDate) {
      const date = document.createElement('span');
      date.className = 'byline news-date';
      date.append(...n.childNodes);
      body.append(date);
    } else {
      if (v.excerptClamp) n.classList.add(v.excerptClamp);
      body.append(n);
    }
  });

  if (link) {
    link.classList.add('card-link');
    body.append(link);
  }
  card.append(body);
  return card;
}

// Segment a flat node list into cards on the most frequent heading tag (#52).
function segmentFlat(nodes) {
  const counts = {};
  nodes.filter(isHeading).forEach((h) => { counts[h.tagName] = (counts[h.tagName] || 0) + 1; });
  const boundary = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  if (!boundary) return null;
  const groups = [];
  let current = null;
  let pending = []; // pre-heading nodes (media/label) buffered for the NEXT card (#76)
  nodes.forEach((n) => {
    if (n.tagName === boundary) {
      current = [...pending, n];
      pending = [];
      groups.push(current);
    } else if (!current || (getMedia(n) && current.some(getMedia))) {
      pending.push(n);
    } else {
      current.push(n);
    }
  });
  if (pending.length && groups.length) groups[groups.length - 1].push(...pending);
  return groups.length ? groups : null;
}

export default async function decorate(block) {
  const v = Object.keys(VARIANTS).find((k) => block.classList.contains(k));
  const conf = VARIANTS[v] || VARIANTS.grid;

  const rows = [...block.children].map((row) => {
    const cells = [...row.children];
    return cells.length ? cells.flatMap(cellNodes) : cellNodes(row);
  }).filter((r) => r.length);

  const isCardRow = (r) => r.some(isHeading) || (r.some((n) => getMedia(n)) && r.some((n) => isLinkRun(n) || n.querySelector('a')));
  const isPaginationRow = (r) => {
    const links = r.flatMap((n) => (n.matches('a') ? [n] : [...n.querySelectorAll('a')]));
    return links.length >= 3 && !r.some(isHeading) && !r.some((n) => getMedia(n));
  };
  const isTrailingLinkRow = (r) => r.every((n) => isLinkRun(n)) && !r.some(isHeading) && !r.some((n) => getMedia(n));

  let cardGroups = [];
  const headRows = [];
  const tailNodes = [];
  let pagination = null;

  const cardRows = rows.filter(isCardRow);
  if (cardRows.length >= 2 || (cardRows.length === 1 && rows.length > 1)) {
    // one row per card (authored default)
    let seenCard = false;
    rows.forEach((r) => {
      if (isCardRow(r)) { cardGroups.push(r); seenCard = true; return; }
      // wave-final one-rule fix (logged): pagination detection is shape-based
      // (>=3 links, no heading/media), not variant-gated — sos-global/videos
      // archives paginate on the `news`/`grid` variants too.
      if (seenCard && isPaginationRow(r)) { pagination = r; return; }
      if (seenCard && isTrailingLinkRow(r)) { tailNodes.push(...r); return; }
      if (!seenCard) headRows.push(...r); // in-table head fallback (#56)
      else tailNodes.push(...r);
    });
  } else {
    // DA-flattened single cell (#52)
    const flat = rows.flat();
    const groups = segmentFlat(flat);
    if (groups) cardGroups = groups;
  }

  const headNodes = [...absorbHead(block), ...headRows];
  const head = buildHead(headNodes);

  const grid = document.createElement('div');
  grid.className = conf.grid;
  cardGroups.forEach((g) => grid.append(buildCard(g, conf)));

  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  if (head) wrap.append(head);
  wrap.append(grid);

  tailNodes.forEach((n) => {
    const a = n.matches('a') ? n : n.querySelector('a');
    if (a) {
      a.classList.add('text-link');
      wrap.append(a);
    }
  });

  if (pagination) {
    const nav = document.createElement('nav');
    nav.className = 'pagination';
    nav.setAttribute('aria-label', 'Pagination');
    const ul = document.createElement('ul');
    pagination.flatMap((n) => (n.matches('a') ? [n] : [...n.querySelectorAll('a')])).forEach((a) => {
      const li = document.createElement('li');
      a.classList.add('page-num');
      if (/^\D+$/.test(a.textContent.trim())) a.classList.add('page-word');
      li.append(a);
      ul.append(li);
    });
    nav.append(ul);
    wrap.append(nav);
  }

  block.replaceChildren(wrap);
}
