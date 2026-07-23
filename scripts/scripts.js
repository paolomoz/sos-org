import { loadArea, setConfig } from './ak.js';

const hostnames = ['authorkit.dev'];

// Path-prefix → lang map consumed by ak.js getLocale(): a page whose path
// starts with the prefix gets <html lang> set to the mapped lang (root = en).
// Covers the 9 deployed localized subtrees (localization wave).
const locales = {
  '': { lang: 'en' },
  '/de': { lang: 'de' },
  '/el': { lang: 'el' },
  '/es': { lang: 'es' },
  '/fr': { lang: 'fr' },
  '/hi': { lang: 'hi' },
  '/hu': { lang: 'hu' },
  '/it': { lang: 'it' },
  '/ja': { lang: 'ja' },
  '/nl': { lang: 'nl' },
};

const linkBlocks = [
  { fragment: '/fragments/' },
  { schedule: '/schedules/' },
  { youtube: 'https://www.youtube' },
];

// Blocks with self-managed styles
const components = ['fragment', 'schedule'];

// How to decorate an area before loading it
const decorateArea = ({ area = document }) => {
  const eagerLoad = (parent, selector) => {
    const img = parent.querySelector(selector);
    if (!img) return;
    img.removeAttribute('loading');
    img.fetchPriority = 'high';
  };

  eagerLoad(area, 'img');
};

export async function loadPage() {
  setConfig({ hostnames, locales, linkBlocks, components, decorateArea });
  await loadArea();
}
await loadPage();

(function da() {
  const { searchParams } = new URL(window.location.href);
  const hasPreview = searchParams.has('dapreview');
  if (hasPreview) import('../tools/da/da.js').then((mod) => mod.default(loadPage));
  const hasQE = searchParams.has('quick-edit');
  if (hasQE) import('../tools/quick-edit/quick-edit.js').then((mod) => mod.default());
}());
