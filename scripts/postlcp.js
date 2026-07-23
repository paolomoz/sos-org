import { getMetadata } from './ak.js';

async function loadStaticFragment(name) {
  const el = document.querySelector(name);
  if (!el) return;
  if (getMetadata(name) === 'off') { el.remove(); return; }
  try {
    const resp = await fetch(`/fragments/${name}.html`);
    if (!resp.ok) return;
    const html = await resp.text();
    el.className = name;          // so header.header / footer.footer match (deploy skill mandatory edit #21)
    el.innerHTML = html;
  } catch (e) { /* chrome is progressive enhancement; page content stands alone */ }
}

export default async function loadPostLCP() {
  await Promise.all([loadStaticFragment('header'), loadStaticFragment('footer')]);
}
