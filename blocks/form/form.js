/**
 * form — the connect/mailing-list form (dynamic wave upgrade).
 * Source: stardust/migrated/connect/index.html (captured Divi et_pb_contact
 * form, DESIGN.json input component).
 *
 * ENDPOINT PROBE (2026-07-24, stardust/inventory/dynamic-probe.json): every live
 * form (connect ×2, introductory-material email/message/postal) is a Divi
 * et_pb_contact_form POSTing back to its own page URL with a WordPress nonce
 * (_wpnonce-et-pb-contact-form-submitted-N) + Divi validate token — foreign
 * posts without a fresh nonce are rejected server-side. Per the dynamic-wave
 * contract the form therefore stays NON-SUBMITTING to the WP endpoint; instead
 * it renders a real <form> for native client-side required-validation whose
 * submit composes a mailto: to the captured contact address (default
 * contact@sos.org — authorable via a `mailto` row). data-dynamic="contact-form"
 * remains the server-integration marker.
 *
 * Section head (h2) is authored as DEFAULT CONTENT and reabsorbed.
 * Authoring rows — one field per row, two cells:  label | type
 *   type ∈ text | email | select | checkbox | note | mailto | submit
 *   (leading "*" in the label marks required; checkbox/note labels may carry
 *   <a> links — preserved; the `mailto` row's label is the fallback address)
 */

const DEFAULT_MAILTO = 'contact@sos.org';

export default async function decorate(block) {
  const headEls = [];
  const bc = block.closest('.block-content');
  if (bc) {
    const prev = bc.previousElementSibling;
    if (prev && (prev.classList.contains('default-content') || prev.classList.contains('default-content-wrapper'))) {
      headEls.push(...prev.children);
      prev.remove();
    }
  } else {
    let n = block.previousElementSibling;
    while (n) { headEls.unshift(n); n = n.previousElementSibling; }
    headEls.forEach((el) => el.remove());
  }

  const AUTOCOMPLETE = [
    [/first\s*name/i, 'given-name'],
    [/last\s*name|^\*?\s*last$/i, 'family-name'],
    [/e-?mail/i, 'email'],
    [/country/i, 'country-name'],
    [/zip|pin|postal/i, 'postal-code'],
  ];

  const fields = [];
  [...block.children].forEach((row) => {
    const cellEls = [...row.children];
    if (!cellEls.length) return;
    const labelCell = cellEls[0];
    const type = (cellEls[1]?.textContent || 'text').trim().toLowerCase();
    fields.push({ labelCell, type });
  });

  const wrap = document.createElement('div');
  wrap.className = 'form-block';
  if (headEls.length) headEls.forEach((el) => wrap.append(el));

  // real <form> for native validation; submit is intercepted (never posts) —
  // the WP endpoint is nonce-protected (see probe note above).
  const holder = document.createElement('form');
  holder.dataset.dynamic = 'contact-form';
  holder.action = '#';
  const grid = document.createElement('div');
  grid.className = 'form-grid';
  const consents = [];
  const notes = [];
  const inputs = [];
  let submitLabel = 'Submit';
  let mailtoAddr = DEFAULT_MAILTO;

  fields.forEach(({ labelCell, type }, i) => {
    const labelText = labelCell.textContent.trim();
    if (type === 'submit') { submitLabel = labelText || 'Submit'; return; }
    if (type === 'mailto') {
      const addr = labelText.replace(/^mailto:/i, '').trim();
      if (addr.includes('@')) mailtoAddr = addr;
      return;
    }
    const required = labelText.startsWith('*');
    const slug = labelText.replace(/^\*\s*/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const id = `cf-${slug || i}`;

    if (type === 'note') {
      const p = document.createElement('p');
      p.className = 'form-consent';
      [...labelCell.childNodes].forEach((nd) => p.append(nd.cloneNode(true)));
      notes.push(p);
      return;
    }

    if (type === 'checkbox') {
      const consent = document.createElement('div');
      consent.className = 'consent';
      const input = document.createElement('input');
      input.id = id;
      input.name = slug;
      input.type = 'checkbox';
      if (required) input.required = true;
      const label = document.createElement('label');
      label.setAttribute('for', id);
      [...labelCell.childNodes].forEach((nd) => label.append(nd.cloneNode(true)));
      consent.append(input, label);
      consents.push(consent);
      return;
    }

    const field = document.createElement('div');
    field.className = 'field';
    if (type === 'email' || type === 'textarea') field.classList.add('wide');
    const label = document.createElement('label');
    label.setAttribute('for', id);
    label.textContent = labelText;
    let input;
    if (type === 'select') {
      input = document.createElement('select');
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = labelText.replace(/^\*\s*/, '');
      input.append(opt); // option list is server-populated at integration
    } else if (type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 5;
    } else {
      input = document.createElement('input');
      input.type = type === 'email' ? 'email' : 'text';
    }
    input.id = id;
    input.name = slug.replace(/-/g, '_');
    if (required) input.required = true;
    const ac = AUTOCOMPLETE.find(([re]) => re.test(labelText));
    if (ac) input.setAttribute('autocomplete', ac[1]);
    inputs.push({ input, label: labelText.replace(/^\*\s*/, '') });
    field.append(label, input);
    grid.append(field);
  });

  holder.append(grid);
  consents.forEach((c) => holder.append(c));
  notes.forEach((n) => holder.append(n));
  const btn = document.createElement('button');
  btn.className = 'btn btn-primary';
  btn.type = 'submit';
  btn.textContent = submitLabel;
  holder.append(btn);

  // captured-contact fallback line (always visible — the honest state of this form)
  const fallback = document.createElement('p');
  fallback.className = 'form-mailto-note';
  fallback.append('Submitting opens your email app — or write to us directly at ');
  const mailtoLink = document.createElement('a');
  mailtoLink.href = `mailto:${mailtoAddr}`;
  mailtoLink.textContent = mailtoAddr;
  fallback.append(mailtoLink, '.');
  holder.append(fallback);

  const pageTitle = headEls.map((el) => el.textContent.trim()).find(Boolean)
    || document.querySelector('h1')?.textContent.trim() || 'Website form';
  holder.addEventListener('submit', (e) => {
    e.preventDefault(); // never POSTs — WP endpoint is nonce-protected (probe note)
    if (!holder.reportValidity()) return;
    const lines = inputs
      .map(({ input, label }) => (input.value.trim() ? `${label}: ${input.value.trim()}` : null))
      .filter(Boolean);
    const subject = `sos.org — ${pageTitle}`;
    const href = `mailto:${mailtoAddr}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
    holder.dataset.mailto = href; // observable state for QA drives / integration
    window.location.href = href;
  });

  wrap.append(holder);

  const outer = document.createElement('div');
  outer.className = 'wrap';
  outer.append(wrap);
  block.replaceChildren(outer);
}
