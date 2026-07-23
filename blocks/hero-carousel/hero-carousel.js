/*
 * hero-carousel — captured 6-slide manual carousel, CSS-only radio mechanism.
 * Decode tier: TEMPLATE-SLOTTED (#95) — the prototype's radio/track/arrows/dots
 * DOM is held here verbatim and authored slide images are slotted in by role.
 * Schema: stardust/eds-schema/index.json § hero (6× DIV.hs-slide, 1 img each).
 *
 * Authoring rows: one row per slide, each cell holding ONE <img> (or <picture>)
 * whose alt text transcribes the banner's baked-in text verbatim. No headings —
 * the page <h1> lives in the `text intro` section (approved prototype); slide
 * text rides aria-labels/alt only. Keyboard: native radio arrow keys. Dots are
 * 44px targets. Reduced motion honored via the global reduce rule + block CSS.
 */

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export default async function decorate(block) {
  const media = [...block.querySelectorAll(':scope > div')]
    .map((row) => row.querySelector('picture, img'))
    .filter(Boolean);
  const n = media.length;
  if (!n) return;

  const imgs = media.map((m) => (m.matches('img') ? m : m.querySelector('img')));

  // radios (the CSS-only mechanism's state; focusable for keyboard arrows)
  const radios = media.map((_, i) => {
    const r = el('input', 'hs-radio');
    r.type = 'radio';
    r.name = 'hero-slide';
    r.id = `hs${i + 1}`;
    if (i === 0) r.checked = true;
    r.setAttribute('aria-label', `Slide ${i + 1} of ${n}: ${imgs[i]?.alt || ''}`);
    return r;
  });

  // viewport / track / slides
  const viewport = el('div', 'hs-viewport');
  const track = el('div', 'hs-track');
  viewport.append(track);
  media.forEach((m, i) => {
    const img = imgs[i];
    if (img) {
      if (i === 0) {
        img.setAttribute('loading', 'eager');
        img.setAttribute('fetchpriority', 'high');
      } else {
        img.setAttribute('loading', 'lazy');
      }
    }
    const slide = el('div', 'hs-slide');
    slide.append(m);
    track.append(slide);
  });

  // arrows — for the checked slide i, show prev→i-1 and next→i+1 (wrapping)
  const arrows = el('div', 'hs-arrows');
  media.forEach((_, i) => {
    const prev = el('label', 'hs-prev');
    prev.setAttribute('for', `hs${((i - 1 + n) % n) + 1}`);
    prev.setAttribute('aria-hidden', 'true');
    prev.innerHTML = '&#8249;';
    const next = el('label', 'hs-next');
    next.setAttribute('for', `hs${((i + 1) % n) + 1}`);
    next.setAttribute('aria-hidden', 'true');
    next.innerHTML = '&#8250;';
    arrows.append(prev, next);
  });

  // dots — 44px labels, 12px dot
  const dots = el('div', 'hs-dots');
  media.forEach((_, i) => {
    const label = el('label');
    label.setAttribute('for', `hs${i + 1}`);
    const dot = el('span', 'dot');
    dot.setAttribute('aria-hidden', 'true');
    label.append(dot);
    dots.append(label);
  });

  // count-dependent CSS (the prototype hard-codes 6 slides; generate for N)
  const w = (100 / n).toFixed(4);
  const rules = [
    `.hero-carousel .hs-track { width: ${n * 100}%; }`,
    `.hero-carousel .hs-slide { width: ${w}%; }`,
  ];
  for (let i = 1; i <= n; i += 1) {
    const prev = ((i - 2 + n) % n) + 1;
    const next = (i % n) + 1;
    rules.push(`.hero-carousel #hs${i}:checked ~ .hs-viewport .hs-track { transform: translateX(-${(((i - 1) * 100) / n).toFixed(4)}%); }`);
    rules.push(`.hero-carousel #hs${i}:checked ~ .hs-arrows label[for="hs${prev}"].hs-prev, .hero-carousel #hs${i}:checked ~ .hs-arrows label[for="hs${next}"].hs-next { display: flex; }`);
    rules.push(`.hero-carousel #hs${i}:checked ~ .hs-dots label[for="hs${i}"] .dot { background: var(--color-gold); border-color: var(--color-accent); transform: scale(1.15); }`);
    rules.push(`.hero-carousel #hs${i}:focus-visible ~ .hs-dots label[for="hs${i}"] { outline: 2px solid var(--color-gold); outline-offset: 2px; border-radius: 50%; }`);
  }
  let style = document.head.querySelector('#hero-carousel-slides');
  if (!style) {
    style = el('style');
    style.id = 'hero-carousel-slides';
    document.head.append(style);
  }
  style.textContent = rules.join('\n');

  block.replaceChildren(...radios, viewport, arrows, dots);
}
