/**
 * form — the connect/mailing-list form (reconstructive).
 * Source: stardust/migrated/connect/index.html (captured Divi et_pb_contact
 * form, DESIGN.json input component).
 *
 * CSP RULE (#20): EDS's delivered CSP makes inline handlers inert and a real
 * <form> would POST + reload — so this renders a NON-SUBMITTING <div> wrapper
 * (data-dynamic="contact-form" marks the server-integration point) and a
 * <button type="button">. The WP endpoint wiring happens at integration, not here.
 *
 * Section head (h2) is authored as DEFAULT CONTENT and reabsorbed.
 * Authoring rows — one field per row, two cells:  label | type
 *   type ∈ text | email | select | checkbox | submit  (leading "*" in the
 *   label marks required; the checkbox label may carry <a> links — preserved)
 */
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
    [/last\s*name/i, 'family-name'],
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

  const holder = document.createElement('div');
  holder.dataset.dynamic = 'contact-form';
  const grid = document.createElement('div');
  grid.className = 'form-grid';
  let consent = null;
  let submitLabel = 'Submit';

  fields.forEach(({ labelCell, type }, i) => {
    const labelText = labelCell.textContent.trim();
    if (type === 'submit') { submitLabel = labelText || 'Submit'; return; }
    const required = labelText.startsWith('*');
    const slug = labelText.replace(/^\*\s*/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const id = `cf-${slug || i}`;

    if (type === 'checkbox') {
      consent = document.createElement('div');
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
      return;
    }

    const field = document.createElement('div');
    field.className = 'field';
    if (type === 'email') field.classList.add('wide');
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
    } else {
      input = document.createElement('input');
      input.type = type === 'email' ? 'email' : 'text';
    }
    input.id = id;
    input.name = slug.replace(/-/g, '_');
    if (required) input.required = true;
    const ac = AUTOCOMPLETE.find(([re]) => re.test(labelText));
    if (ac) input.setAttribute('autocomplete', ac[1]);
    field.append(label, input);
    grid.append(field);
  });

  holder.append(grid);
  if (consent) holder.append(consent);
  const btn = document.createElement('button');
  btn.className = 'btn btn-primary';
  btn.type = 'button'; // non-submitting by design (CSP rule)
  btn.textContent = submitLabel;
  holder.append(btn);
  wrap.append(holder);

  const outer = document.createElement('div');
  outer.className = 'wrap';
  outer.append(wrap);
  block.replaceChildren(outer);
}
