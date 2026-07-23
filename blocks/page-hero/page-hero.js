/**
 * page-hero — the page's single <h1> hero (template-slotted, #95).
 * Schema: stardust/eds-schema/{spiritual-growth,meditation-learn-meditation,about-us,sant-rajinder-singh}.json
 *
 * Variants (authored on the block class):
 *   banner        article archetype — full-bleed banner image, then centered gold rule + h1
 *   photo         program archetype — photo behind navy scrim, left-aligned h1 + h2 lede
 *   photo plate   institutional archetype — photo, bottom navy plate carrying kicker + h1
 *   panel         bio archetype — navy split band: cropped portrait window |
 *                 kicker + h1 + rule (named `panel`, not `band`, so the variant
 *                 class never collides with the `band` BLOCK's CSS/decode)
 *
 * Authoring rows (queried, never hard-indexed — #42):
 *   - <picture>/<img> anywhere = the hero image
 *   - text BEFORE the heading = kicker/eyebrow (#76 pendingEyebrow)
 *   - the first heading = the page h1 (unwrapped per #55 — never nested headings)
 *   - heading/text AFTER the h1 = lede (photo variant)
 */
export default async function decorate(block) {
  const media = block.querySelector('picture, img'); // #72 picture OR bare img
  const headings = [...block.querySelectorAll('h1, h2, h3, h4, h5, h6')];
  const titleEl = headings[0] || null;

  // classify remaining text cells by position relative to the heading (#76, #79)
  let kicker = '';
  let lede = null; // element (may be a heading) or string
  const cells = [...block.querySelectorAll(':scope > div > div')];
  let seenTitle = false;
  cells.forEach((cell) => {
    if (cell.contains(media)) { if (cell.querySelector('h1,h2,h3')) seenTitle = true; return; }
    if (titleEl && cell.contains(titleEl)) { seenTitle = true; }
    const isTitleCell = titleEl && cell.contains(titleEl) && cell.textContent.trim() === titleEl.textContent.trim();
    if (isTitleCell) return;
    const txt = cell.textContent.trim();
    if (!txt || (titleEl && cell.contains(titleEl))) return;
    if (!seenTitle) { if (!kicker) kicker = txt; } // pre-heading text buffers as kicker
    else if (!lede) { lede = cell.querySelector('h2, h3, p') || cell; }
  });

  const h1 = document.createElement('h1');
  if (titleEl) {
    // unwrap: clone the heading's CHILDREN, never the heading itself (#55)
    [...titleEl.childNodes].forEach((n) => h1.append(n.cloneNode(true)));
  }

  const isBand = block.classList.contains('panel');
  const isPhoto = block.classList.contains('photo');
  const isPlate = block.classList.contains('plate');

  const wrap = document.createElement('div');

  if (isBand) {
    // bio navy split band — verbatim prototype composition
    wrap.className = 'hero-grid';
    const mediaBox = document.createElement('div');
    mediaBox.className = 'hero-media';
    if (media) mediaBox.append(media);
    const panel = document.createElement('div');
    panel.className = 'hero-panel';
    const inner = document.createElement('h1');
    if (kicker) {
      const k = document.createElement('span');
      k.className = 'h1-kicker';
      k.textContent = kicker;
      inner.append(k);
    }
    const name = document.createElement('span');
    name.className = 'h1-name';
    [...h1.childNodes].forEach((n) => name.append(n));
    inner.append(name);
    const rule = document.createElement('span');
    rule.className = 'hero-rule';
    rule.setAttribute('aria-hidden', 'true');
    panel.append(inner, rule);
    wrap.append(mediaBox, panel);
  } else if (isPhoto && isPlate) {
    // institutional photo + bottom navy plate
    wrap.className = 'hero-photo plate';
    if (media) {
      media.classList.add('hero-bg');
      wrap.append(media);
    }
    const plate = document.createElement('div');
    plate.className = 'hero-plate';
    const inner = document.createElement('div');
    inner.className = 'wrap';
    const plateH1 = document.createElement('h1');
    if (kicker) {
      const k = document.createElement('span');
      k.className = 'hero-kicker';
      k.textContent = kicker;
      plateH1.append(k, ' ');
    }
    [...h1.childNodes].forEach((n) => plateH1.append(n));
    inner.append(plateH1);
    plate.append(inner);
    wrap.append(plate);
  } else if (isPhoto) {
    // program photo hero — scrim + left content
    wrap.className = 'hero-photo';
    if (media) {
      media.classList.add('hero-bg');
      wrap.append(media);
    }
    const scrim = document.createElement('div');
    scrim.className = 'hero-scrim';
    scrim.setAttribute('aria-hidden', 'true');
    const content = document.createElement('div');
    content.className = 'wrap hero-content';
    content.append(h1);
    if (lede) {
      const l = document.createElement('h2');
      l.className = 'hero-lede';
      l.textContent = (lede.textContent || String(lede)).trim();
      content.append(l);
    }
    wrap.append(scrim, content);
  } else {
    // banner (article) — full-bleed image, then centered rule + h1
    wrap.className = 'hero-banner';
    if (media) {
      const mediaBox = document.createElement('div');
      mediaBox.className = 'banner-media';
      mediaBox.append(media);
      wrap.append(mediaBox);
    }
    const plate = document.createElement('div');
    plate.className = 'wrap head-plate';
    const rule = document.createElement('span');
    rule.className = 'rule';
    rule.setAttribute('aria-hidden', 'true');
    plate.append(rule, h1);
    wrap.append(plate);
  }

  block.replaceChildren(wrap);
}
