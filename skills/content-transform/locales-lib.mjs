/*
 * locales-lib.mjs — shared helpers for the localization-wave transform
 * (live Divi DOM → DA body fragments). Companion to locales-transform.mjs.
 */
import { readFileSync } from 'node:fs';

export const SOS_ROOT = '/Users/paolo/stardust/semrush/sos';
export const REPO = '/Users/paolo/stardust/semrush/sos-org-repo';
export const DA_MEDIA = 'https://content.da.live/paolomoz/sos-org/media';

// srcPath (decoded, no trailing slash) -> daPath for internal link rewriting
const inv = JSON.parse(readFileSync(`${SOS_ROOT}/stardust/inventory/locales-urls.json`, 'utf8'));
const pathMap = new Map();
for (const r of inv) {
  const key = decodeURIComponent(r.srcPath).replace(/\/+$/, '');
  pathMap.set(key, `/${r.daPath}/`);
}

export const neededImages = new Map(); // daSub -> { srcUrl, pages: [] }
export const notes = [];

export function escText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function escAttr(s) {
  return escText(s).replace(/"/g, '&quot;');
}

const encSeg = (seg) => encodeURIComponent(seg);

/** Map a live img src to an authored DA media URL; registers the needed upload. */
export function mapImgSrc(rawSrc, page) {
  if (!rawSrc || rawSrc.startsWith('data:')) return null;
  let u;
  try { u = new URL(rawSrc, 'https://www.sos.org/'); } catch { return null; }
  // unwrap wp.com CDN (i0.wp.com/www.sos.org/wp-content/...)
  if (/^i\d+\.wp\.com$/.test(u.hostname)) {
    const inner = u.pathname.replace(/^\//, '');
    try { u = new URL(`https://${inner}`); } catch { return null; }
  }
  let daSub;
  const m = decodeURIComponent(u.pathname).match(/\/wp-content\/uploads\/(.+)$/);
  if (m && /(^|\.)sos\.org$/.test(u.hostname)) {
    daSub = `uploads/${m[1].toLowerCase()}`;
  } else {
    // external / non-uploads asset → rehost under locales-ext
    const host = u.hostname.toLowerCase().replace(/[^a-z0-9.-]/g, '');
    const p = decodeURIComponent(u.pathname).toLowerCase()
      .replace(/[^a-z0-9./-]+/g, '-').replace(/\/+/g, '/').replace(/^\//, '');
    if (!p || p.endsWith('/')) return null;
    daSub = `uploads/locales-ext/${host}/${p}`;
  }
  if (!/\.(jpe?g|png|webp|gif|svg)$/i.test(daSub)) return null; // non-image (or query-string asset)
  if (!neededImages.has(daSub)) neededImages.set(daSub, { srcUrl: u.href, daSub, pages: [] });
  neededImages.get(daSub).pages.push(page);
  return `${DA_MEDIA}/${daSub.split('/').map(encSeg).join('/')}`;
}

/** Normalize an anchor href for authored content. */
export function mapHref(rawHref, locale) {
  if (!rawHref) return null;
  const href = rawHref.trim();
  if (/^(mailto:|tel:|#)/i.test(href)) return href;
  let u;
  try { u = new URL(href, 'https://www.sos.org/'); } catch { return href; }
  const isSos = /(^|\.)sos\.org$/.test(u.hostname);
  if (!isSos) {
    // youtube link-block opt-out
    if (/(^|\.)youtube\.com$/.test(u.hostname) && !u.hash) return `${u.href}#_dnb`;
    return u.href;
  }
  // internal: path-only; map crawled locale paths to their DA paths
  const decoded = decodeURIComponent(u.pathname).replace(/\/+$/, '');
  if (pathMap.has(decoded)) return pathMap.get(decoded) + (u.hash || '');
  // wp artifacts (feeds, oembed, page_id) — keep as absolute source URLs
  if (/\/feed$|wp-json|\?page_id|\/wp-content\//.test(u.pathname + u.search)) return u.href;
  const p = u.pathname.replace(/\/+$/, '') || '/';
  return (p === '/' ? '/' : `${p.toLowerCase()}/`) + (u.search || '') + (u.hash || '');
}

/** True when a module/element is hidden for locales or display:none'd inline. */
export function isHiddenForLocale(el) {
  const cls = el.getAttribute('class') || '';
  if (/sos-hide-for-all-locales|sos-show-for-en/.test(cls)) return true;
  const style = el.getAttribute('style') || '';
  if (/display:\s*none/i.test(style)) return true;
  return false;
}
