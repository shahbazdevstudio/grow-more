import { $, html, icon, mount, uuid, raw } from '../js/core/dom.js';
import { api } from '../js/core/api.js';
import { state, accountById, emit, reloadAccounts } from '../js/core/state.js';
import { money, symbol, todayStr } from '../js/core/format.js';
import { openModal, confirmDialog, withLoading } from './modal.js';
import { toast } from './toast.js';
import { optionList, errorBox, cleanAmount, readForm, openAccountForm } from './forms.js';
import { emptyState } from './emptyState.js';

export const CODING_INCOME = { client_payment: 'Client payment', project_income: 'Project income', retainer: 'Retainer / maintenance', other_income: 'Other income' };
export const CODING_EXPENSE = { hosting: 'Hosting', domain: 'Domain', marketing: 'Marketing', advertising: 'Advertising', tools: 'Tools & subscriptions', other_expense: 'Other' };
export const CODING_LABEL = { ...CODING_INCOME, ...CODING_EXPENSE };
export const DARAZ_EXPENSE = { flyer_bags: 'Flyer bags', packaging: 'Packaging', shipping: 'Shipping', other: 'Other' };
export const MOVE_LABEL = { purchase: 'Purchase', sale: 'Sale', writeoff: 'Write-off', adjust_in: 'Stock added' };
const LAST = 'gm_last_account';

const accOptions = (selectedId, noneLabel) => {
  const list = state.accounts.map((a) => ({ value: a.id, label: `${a.name} · ${money(a.balance)}` }));
  return html`${noneLabel ? html`<option value="">${noneLabel}</option>` : ''}${optionList(list, selectedId)}`;
};
const lastAccount = () => { let l = null; try { l = localStorage.getItem(LAST); } catch { /* ignore */ } return (accountById(l) || state.accounts[0] || {}).id || ''; };
const remember = (id) => { try { if (id) localStorage.setItem(LAST, id); } catch { /* ignore */ } };
const needAccount = (onSaved) => {
  const m = openModal({ title: 'Add an account first', size: 'narrow', mobile: 'center', body: emptyState({ art: 'wallet', title: 'No accounts yet', text: 'Business money moves through your accounts. Create one to continue.', action: html`<button class="btn btn-primary" data-add type="button">${icon('plus')} Add account</button>` }) });
  $('[data-add]', m.el).addEventListener('click', () => { m.close(); openAccountForm({ onSaved }); });
};
const amountField = (id, name, label, val, { required = true, hint = '' } = {}) => html`<div class="field"><label for="${id}">${label}</label><div class="amount-wrap"><span class="cur" style="font-size:15px">${symbol()}</span><input class="input" style="padding-left:${symbol().length > 1 ? 52 : 38}px" id="${id}" name="${name}" inputmode="decimal" autocomplete="off" ${required ? raw('required') : ''} value="${val ?? ''}" placeholder="0">${''}</div>${hint ? html`<div class="hint">${hint}</div>` : ''}</div>`;

async function finish(modal, msg, onSaved) { await reloadAccounts(); modal.close(); toast(msg); emit('data'); onSaved && onSaved(); }
async function undoable(kind, label, path, onDone) {
  toast(`${label} deleted`, { type: 'info', action: { label: 'Undo', onClick: async () => { try { await api.post(`${path}/restore`); await reloadAccounts(); emit('data'); onDone && onDone(); toast('Restored'); } catch (e) { toast(e.message, { type: 'error', duration: 7000 }); } } } });
  void kind;
}

/* ================================ CODING ================================ */
export function openCodingForm({ record = null, kind = 'income', onSaved } = {}) {
  if (!state.accounts.length) return needAccount(onSaved);
  const v = record
    ? { kind: record.kind, status: record.status, category: record.category, title: record.title, client: record.client || '', project: record.project || '', amount: String(record.amount), account: record.account || lastAccount(), date: record.date, dueDate: record.dueDate || '', notes: record.notes || '' }
    : { kind, status: 'paid', category: kind === 'income' ? 'client_payment' : 'hosting', title: '', client: '', project: '', amount: '', account: lastAccount(), date: todayStr(), dueDate: '', notes: '' };
  const isInc = () => v.kind === 'income';
  const seg = (name, items, cur) => html`<div class="seg seg-full" data-seg="${name}" style="grid-template-columns:repeat(${items.length},1fr)">${items.map(([k, l]) => html`<button type="button" data-v="${k}" aria-pressed="${cur === k}">${l}</button>`)}</div>`;
  const fields = () => html`
    <div class="field"><label for="c-amount">Amount</label><div class="amount-wrap"><span class="cur">${symbol()}</span><input class="input amount-input" id="c-amount" name="amount" inputmode="decimal" autocomplete="off" placeholder="0" value="${v.amount}" required></div></div>
    <div class="field"><label for="c-title">${isInc() ? 'Description' : 'What was it for?'}</label><input class="input" id="c-title" name="title" maxlength="120" required placeholder="${isInc() ? 'e.g. Website design – first half' : 'e.g. VPS server, 1 year'}" value="${v.title}"></div>
    <div class="field-row"><div class="field"><label for="c-cat">${isInc() ? 'Income type' : 'Expense type'}</label><select class="select" id="c-cat" name="category">${optionList(Object.entries(isInc() ? CODING_INCOME : CODING_EXPENSE).map(([value, label]) => ({ value, label })), v.category)}</select></div>
      ${v.status === 'paid' ? html`<div class="field"><label for="c-acc">${isInc() ? 'Received in' : 'Paid from'}</label><select class="select" id="c-acc" name="account">${accOptions(v.account)}</select></div>` : html`<div class="field"><label for="c-due">Due date <span class="opt">optional</span></label><input class="input" type="date" id="c-due" name="dueDate" value="${v.dueDate}"></div>`}</div>
    ${isInc() ? html`<div class="field-row"><div class="field"><label for="c-client">Client <span class="opt">optional</span></label><input class="input" id="c-client" name="client" maxlength="80" value="${v.client}"></div><div class="field"><label for="c-proj">Project <span class="opt">optional</span></label><input class="input" id="c-proj" name="project" maxlength="80" value="${v.project}"></div></div>` : ''}
    <div class="field"><label for="c-date">${v.status === 'pending' ? 'Invoice date' : isInc() ? 'Date received' : 'Date'}</label><input class="input" type="date" id="c-date" name="date" value="${v.date}" required></div>
    <div class="field"><label for="c-notes">Notes <span class="opt">optional</span></label><textarea class="textarea" id="c-notes" name="notes" maxlength="1000" style="min-height:64px">${v.notes}</textarea></div>
    ${v.status === 'pending' ? html`<p class="hint">A pending payment does not change any balance. When the client pays, tap “Mark received” and choose the account.</p>` : isInc() ? html`<p class="hint">This amount will be added to the account you choose, and counted as coding income.</p>` : ''}`;
  const modal = openModal({ title: record ? 'Edit coding record' : isInc() ? 'Add coding income' : 'Add coding expense',
    body: html`<form id="cf" novalidate autocomplete="off"><div class="stack"><div data-kind>${seg('kind', [['income', 'Income'], ['expense', 'Expense']], v.kind)}</div><div data-status ${isInc() ? '' : raw('hidden')}>${seg('status', [['paid', 'Received'], ['pending', 'Pending payment']], v.status)}</div><div data-err></div><div class="stack" data-fields>${fields()}</div></div></form>`,
    footer: html`${record ? html`<button class="btn btn-ghost" type="button" data-del style="color:var(--neg);flex:0 0 auto">${icon('trash-2', 'i-sm')} Delete</button>` : ''}<button class="btn btn-primary" type="submit" form="cf" data-save>${record ? 'Save changes' : 'Save'}</button>` });
  const form = $('#cf', modal.el); const showErr = (m) => mount($('[data-err]', modal.el), errorBox(m));
  const sync = () => Object.assign(v, readForm(form));
  const redraw = () => { mount($('[data-fields]', modal.el), fields()); $('[data-status]', modal.el).hidden = !isInc(); mount($('[data-kind]', modal.el), seg('kind', [['income', 'Income'], ['expense', 'Expense']], v.kind)); mount($('[data-status]', modal.el), seg('status', [['paid', 'Received'], ['pending', 'Pending payment']], v.status)); };
  modal.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-seg] [data-v]'); if (!b) return; sync();
    const which = b.parentElement.dataset.seg;
    if (which === 'kind' && v.kind !== b.dataset.v) { v.kind = b.dataset.v; v.category = isInc() ? 'client_payment' : 'hosting'; if (!isInc()) v.status = 'paid'; redraw(); }
    if (which === 'status' && v.status !== b.dataset.v) { v.status = b.dataset.v; redraw(); }
  });
  form.addEventListener('input', (e) => { if (e.target.name === 'amount') e.target.value = cleanAmount(e.target.value); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); sync(); showErr('');
    const amount = parseFloat(v.amount);
    if (!(amount > 0)) return showErr('Enter an amount greater than zero.');
    if (!v.title.trim()) return showErr('Add a short description.');
    const body = { kind: v.kind, status: v.status, category: v.category, title: v.title.trim(), client: (v.client || '').trim(), project: (v.project || '').trim(), amount, date: v.date, notes: (v.notes || '').trim(), ...(v.status === 'paid' ? { account: v.account } : { dueDate: v.dueDate || null }) };
    try { await withLoading($('[data-save]', modal.el), () => (record ? api.put(`/coding/records/${record.id}`, body) : api.post('/coding/records', body))); if (v.status === 'paid') remember(v.account); await finish(modal, record ? 'Changes saved' : v.status === 'pending' ? 'Pending payment added' : isInc() ? 'Income recorded' : 'Expense recorded', onSaved); }
    catch (err) { showErr(err.message); }
  });
  const del = $('[data-del]', modal.el);
  if (del) del.addEventListener('click', () => { modal.close(); deleteCodingRecord(record, onSaved); });
}

export async function deleteCodingRecord(r, onDone) {
  const paid = r.status === 'paid';
  if (!await confirmDialog({ title: 'Delete this record?', message: `"${r.title}" (${money(r.amount)}) will be removed${paid ? ' and the account balance corrected' : ''}. You can undo this right after.` })) return;
  try { await api.del(`/coding/records/${r.id}`); await reloadAccounts(); emit('data'); onDone && onDone(); undoable('coding', 'Record', `/coding/records/${r.id}`, onDone); }
  catch (e) { toast(e.message, { type: 'error' }); }
}

/** Shared “money arrived” dialog: pending coding invoice or Daraz payout. */
export function openReceiveForm({ title, amount, path, label = 'Received in', onSaved }) {
  if (!state.accounts.length) return needAccount(onSaved);
  const m = openModal({ title, size: 'narrow', mobile: 'sheet', body: html`<form id="rf" novalidate><div class="stack"><div data-err></div><div class="money" style="font-size:30px;font-weight:800">${money(amount)}</div>
    <div class="field"><label for="r-acc">${label}</label><select class="select" id="r-acc" name="account">${accOptions(lastAccount())}</select></div>
    <div class="field"><label for="r-date">Date received</label><input class="input" type="date" id="r-date" name="date" value="${todayStr()}" required></div>
    <p class="hint">The amount is added to this account’s balance.</p></div></form>`, footer: html`<button class="btn btn-primary" type="submit" form="rf" data-save>Mark received</button>` });
  $('#rf', m.el).addEventListener('submit', async (e) => {
    e.preventDefault(); const d = readForm(e.target);
    try { await withLoading($('[data-save]', m.el), () => api.post(path, { account: d.account, date: d.date })); remember(d.account); await finish(m, 'Payment received', onSaved); }
    catch (err) { mount($('[data-err]', m.el), errorBox(err.message)); }
  });
}

/* ================================ DARAZ ================================ */
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('That image could not be read.'));
    fr.readAsDataURL(file);
  });
}
async function squareThumb(file, size = 480) {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error('Choose a PNG, JPEG or WebP photo.');
  const src = await readAsDataUrl(file); // a data: URL (the page CSP blocks blob: images)
  const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('That image could not be read.')); i.src = src; });
  const c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d');
  const s = Math.min(img.width, img.height); ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
  let out = c.toDataURL('image/webp', 0.8); if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', 0.8);
  if (out.length > 400000) throw new Error('That photo is too detailed. Try another one.');
  return out;
}
export const thumb = (p, cls = '') => (p.image ? html`<span class="thumb ${cls}"><img src="${p.image}" alt="" loading="lazy" decoding="async"></span>` : html`<span class="thumb ${cls} ph">${icon('package')}</span>`);

export function openProductForm({ product = null, onSaved } = {}) {
  const v = { image: product?.image || '' };
  const f = (k, d = '') => (product ? product[k] ?? d : d);
  const modal = openModal({ title: product ? 'Edit product' : 'Add product', body: html`<form id="pf" novalidate autocomplete="off"><div class="stack"><div data-err></div>
    <div class="logo-pick"><span data-preview>${thumb(v, 'lg')}</span><div style="display:grid;gap:8px"><div class="row-flex"><label class="btn btn-sm" style="cursor:pointer">${icon('image', 'i-sm')} Product photo<input type="file" accept="image/png,image/jpeg,image/webp" hidden data-file></label><button class="btn btn-sm btn-ghost" type="button" data-noimg ${v.image ? '' : raw('hidden')}>Remove</button></div><span class="hint">Square photos look best. It is resized and saved to cloud storage.</span></div></div>
    <div class="field"><label for="p-name">Product name</label><input class="input" id="p-name" name="name" maxlength="120" required value="${f('name')}" placeholder="e.g. Phone case – iPhone 13"></div>
    <div class="field-row"><div class="field"><label for="p-sku">SKU <span class="opt">optional</span></label><input class="input" id="p-sku" name="sku" maxlength="40" value="${f('sku')}"></div><div class="field"><label for="p-cat">Category <span class="opt">optional</span></label><input class="input" id="p-cat" name="category" maxlength="40" value="${f('category')}" placeholder="e.g. Accessories"></div></div>
    <div class="field-row">${amountField('p-buy', 'purchasePrice', 'Purchase price', f('purchasePrice', ''), { required: false, hint: 'Per unit' })}${amountField('p-sell', 'sellingPrice', 'Selling price', f('sellingPrice', ''), { required: false, hint: 'Per unit' })}</div>
    <div class="field-row"><div class="field"><label for="p-low">Low-stock alert at</label><input class="input" id="p-low" name="lowStockAt" inputmode="numeric" value="${f('lowStockAt', 3)}"></div><div class="field"><label for="p-sup">Supplier <span class="opt">optional</span></label><input class="input" id="p-sup" name="supplierName" maxlength="80" value="${f('supplierName')}"></div></div>
    <div class="field"><label for="p-supc">Supplier contact <span class="opt">optional</span></label><input class="input" id="p-supc" name="supplierContact" maxlength="120" value="${f('supplierContact')}" placeholder="Phone or address"></div>
    <div class="field"><label for="p-notes">Notes <span class="opt">optional</span></label><input class="input" id="p-notes" name="notes" maxlength="500" value="${f('notes')}"></div></div></form>`,
    footer: html`<button class="btn btn-primary" type="submit" form="pf" data-save>${product ? 'Save changes' : 'Add product'}</button>` });
  const showErr = (m) => mount($('[data-err]', modal.el), errorBox(m));
  const paint = () => { mount($('[data-preview]', modal.el), thumb(v, 'lg')); $('[data-noimg]', modal.el).hidden = !v.image; };
  $('[data-file]', modal.el).addEventListener('change', async (e) => { const file = e.target.files[0]; if (!file) return; try { v.image = await squareThumb(file); showErr(''); paint(); } catch (err) { showErr(err.message); } e.target.value = ''; });
  $('[data-noimg]', modal.el).addEventListener('click', () => { v.image = ''; paint(); });
  const form = $('#pf', modal.el);
  form.addEventListener('input', (e) => { if (['purchasePrice', 'sellingPrice'].includes(e.target.name)) e.target.value = cleanAmount(e.target.value); if (e.target.name === 'lowStockAt') e.target.value = e.target.value.replace(/\D/g, ''); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const d = readForm(form);
    if (!d.name.trim()) return showErr('Enter the product name.');
    const body = { name: d.name.trim(), sku: d.sku.trim(), category: d.category.trim(), image: v.image, purchasePrice: parseFloat(d.purchasePrice) || 0, sellingPrice: parseFloat(d.sellingPrice) || 0, lowStockAt: parseInt(d.lowStockAt, 10) || 0, supplierName: d.supplierName.trim(), supplierContact: d.supplierContact.trim(), notes: d.notes.trim() };
    try { await withLoading($('[data-save]', modal.el), () => (product ? api.put(`/daraz/products/${product.id}`, body) : api.post('/daraz/products', body))); await finish(modal, product ? 'Product updated' : 'Product added', onSaved); }
    catch (err) { showErr(err.message); }
  });
}

export async function openMovementForm({ type = 'sale', productId = '', movement = null, onSaved } = {}) {
  let products = [];
  try { products = (await api.get('/daraz/products')).products; } catch (e) { toast(e.message, { type: 'error' }); return; }
  if (!products.length) {
    const m = openModal({ title: 'Add a product first', size: 'narrow', mobile: 'center', body: emptyState({ art: 'wallet', title: 'No products yet', text: 'Add the products you sell on Daraz, then record stock purchases and sales against them.', action: html`<button class="btn btn-primary" data-add type="button">${icon('plus')} Add product</button>` }) });
    $('[data-add]', m.el).addEventListener('click', () => { m.close(); openProductForm({ onSaved: () => openMovementForm({ type, onSaved }) }); });
    return;
  }
  if ((type === 'purchase' || type === 'sale' || movement) && !state.accounts.length && !movement) { /* accounts are optional for module stock entries */ }
  const prod = (id) => products.find((p) => p.id === id);
  const first = prod(movement?.product) || prod(productId) || products[0];
  const v = movement
    ? { type: movement.type, product: movement.product, quantity: String(movement.quantity), unitCost: String(movement.unitCost || ''), unitPrice: String(movement.unitPrice || ''), fees: movement.fees ? String(movement.fees) : '', account: movement.account || '', date: movement.date, supplier: movement.supplier || '', orderRef: movement.orderRef || '', reason: movement.reason || '', notes: movement.notes || '' }
    : { type, product: first.id, quantity: '', unitCost: first.purchasePrice ? String(first.purchasePrice) : '', unitPrice: first.sellingPrice ? String(first.sellingPrice) : '', fees: '', account: type === 'sale' || type === 'purchase' ? lastAccount() : '', date: todayStr(), supplier: first.supplierName || '', orderRef: '', reason: '', notes: '' };
  const TYPES = [['purchase', 'Buy stock'], ['sale', 'Sale'], ['writeoff', 'Write-off'], ['adjust_in', 'Add stock']];
  const reasons = ['Damaged', 'Lost', 'Expired', 'Own use', 'Returned to supplier', 'Other'];

  const fields = () => {
    const p = prod(v.product); const t = v.type;
    return html`
      <div class="field"><label for="m-prod">Product</label><select class="select" id="m-prod" name="product" ${movement ? raw('disabled') : ''}>${optionList(products.map((x) => ({ value: x.id, label: `${x.name} · ${x.stats.stock} in stock` })), v.product)}</select></div>
      <div class="field-row"><div class="field"><label for="m-qty">Quantity</label><input class="input" id="m-qty" name="quantity" inputmode="numeric" autocomplete="off" required placeholder="0" value="${v.quantity}"><div class="hint" data-stockhint>${p ? `In stock now: ${p.stats.stock}` : ''}</div></div>
        ${t === 'purchase' ? amountField('m-cost', 'unitCost', 'Cost per unit', v.unitCost) : t === 'sale' ? amountField('m-price', 'unitPrice', 'Selling price per unit', v.unitPrice) : html`<div></div>`}</div>
      ${t === 'sale' ? amountField('m-fees', 'fees', 'Daraz fees / commission (total)', v.fees, { required: false, hint: 'Optional. Deducted from the payout.' }) : ''}
      ${t === 'purchase' || t === 'sale' ? html`<div class="glass" style="border-radius:16px;padding:12px 14px" data-calc></div>` : ''}
      ${t === 'purchase' || t === 'sale' ? html`<div class="field"><label for="m-acc">${t === 'purchase' ? 'Paid from' : 'Money received in'}</label><select class="select" id="m-acc" name="account">${accOptions(v.account, t === 'purchase' ? 'No account – stock I already own' : 'Not paid out yet (pending payout)')}</select>
        <div class="hint" data-acchint></div></div>` : ''}
      ${t === 'purchase' ? html`<div class="field"><label for="m-sup">Supplier <span class="opt">optional</span></label><input class="input" id="m-sup" name="supplier" maxlength="80" value="${v.supplier}"></div>` : ''}
      ${t === 'sale' ? html`<div class="field"><label for="m-ord">Daraz order no. <span class="opt">optional</span></label><input class="input" id="m-ord" name="orderRef" maxlength="60" value="${v.orderRef}"></div>` : ''}
      ${t === 'writeoff' ? html`<div class="field"><label for="m-rs">Reason</label><select class="select" id="m-rs" name="reason">${optionList(reasons.map((r) => ({ value: r, label: r })), v.reason || 'Damaged')}</select><div class="hint">Written-off stock is counted as a loss at its average cost. No account balance changes.</div></div>` : ''}
      ${t === 'adjust_in' ? html`<div class="field"><label for="m-rs2">Reason <span class="opt">optional</span></label><input class="input" id="m-rs2" name="reason" maxlength="80" value="${v.reason}" placeholder="e.g. Found in storage"><div class="hint">Added at the current average cost. No account balance changes.</div></div>` : ''}
      <div class="field"><label for="m-date">Date</label><input class="input" type="date" id="m-date" name="date" value="${v.date}" required></div>
      <div class="field"><label for="m-notes">Notes <span class="opt">optional</span></label><input class="input" id="m-notes" name="notes" maxlength="500" value="${v.notes}"></div>`;
  };

  const modal = openModal({ title: movement ? `Edit ${MOVE_LABEL[movement.type].toLowerCase()}` : 'Stock entry',
    body: html`<form id="mf" novalidate autocomplete="off"><div class="stack">${movement ? '' : html`<div data-types><div class="seg seg-full" style="grid-template-columns:repeat(4,1fr)">${TYPES.map(([k, l]) => html`<button type="button" data-t="${k}" aria-pressed="${v.type === k}">${l}</button>`)}</div></div>`}<div data-err></div><div class="stack" data-fields>${fields()}</div></div></form>`,
    footer: html`${movement ? html`<button class="btn btn-ghost" type="button" data-del style="color:var(--neg);flex:0 0 auto">${icon('trash-2', 'i-sm')} Delete</button>` : ''}<button class="btn btn-primary" type="submit" form="mf" data-save></button>` });
  const form = $('#mf', modal.el); const showErr = (m) => mount($('[data-err]', modal.el), errorBox(m));
  const sync = () => { const d = readForm(form); if (movement) d.product = v.product; Object.assign(v, d); };
  const label = () => { $('[data-save]', modal.el).textContent = movement ? 'Save changes' : { purchase: 'Record purchase', sale: 'Record sale', writeoff: 'Write off stock', adjust_in: 'Add stock' }[v.type]; };

  const recalc = () => {
    const q = parseInt(v.quantity, 10) || 0; const p = prod(v.product); const box = $('[data-calc]', modal.el); const hint = $('[data-acchint]', modal.el);
    const sh = $('[data-stockhint]', modal.el);
    if (sh && p) { const avail = p.stats.stock + (movement ? (movement.type === 'sale' || movement.type === 'writeoff' ? movement.quantity : -movement.quantity) : 0); sh.className = 'hint'; sh.textContent = `In stock${movement ? ' (before this entry)' : ' now'}: ${avail}`; if ((v.type === 'sale' || v.type === 'writeoff') && q > avail) { sh.className = 'hint warn'; sh.textContent = `Only ${avail} in stock — you cannot ${v.type === 'sale' ? 'sell' : 'write off'} ${q}.`; } }
    if (v.type === 'purchase' && box) { const tot = q * (parseFloat(v.unitCost) || 0); mount(box, html`<div class="row-flex"><span class="muted">Total cost</span><span class="spacer"></span><b class="money">${money(tot)}</b></div>`); if (hint) hint.textContent = v.account ? 'This amount will be deducted from the account.' : 'No balance will change — use this to record stock you already own.'; }
    if (v.type === 'sale' && box) {
      const gross = q * (parseFloat(v.unitPrice) || 0); const fees = parseFloat(v.fees) || 0; const net = gross - fees; const cogs = q * (p ? p.stats.avgCost : 0); const prof = gross - cogs - fees;
      mount(box, html`<div style="display:grid;gap:6px"><div class="row-flex"><span class="muted">Sale total</span><span class="spacer"></span><b class="money">${money(gross)}</b></div>${fees ? html`<div class="row-flex"><span class="muted">You receive (after fees)</span><span class="spacer"></span><b class="money">${money(net)}</b></div>` : ''}<div class="row-flex"><span class="muted">Estimated profit <span class="xs">(cost ${money(p ? p.stats.avgCost : 0)} each)</span></span><span class="spacer"></span><b class="money ${prof < 0 ? 'neg' : 'pos'}">${money(prof, { sign: true })}</b></div></div>`);
      if (hint) hint.textContent = v.account ? 'The amount you receive is added to this account.' : 'Revenue is recorded now. The money is added to an account when you mark the payout as received.';
    }
  };
  label(); recalc();

  modal.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]'); if (!b || b.dataset.t === v.type) return; sync(); v.type = b.dataset.t;
    if (v.type === 'sale' || v.type === 'purchase') v.account = v.account || lastAccount(); showErr('');
    mount($('[data-types]', modal.el), html`<div class="seg seg-full" style="grid-template-columns:repeat(4,1fr)">${TYPES.map(([k, l]) => html`<button type="button" data-t="${k}" aria-pressed="${v.type === k}">${l}</button>`)}</div>`);
    mount($('[data-fields]', modal.el), fields()); label(); recalc();
  });
  form.addEventListener('input', (e) => {
    const n = e.target.name; if (['unitCost', 'unitPrice', 'fees'].includes(n)) e.target.value = cleanAmount(e.target.value); if (n === 'quantity') e.target.value = e.target.value.replace(/\D/g, '');
    sync(); recalc();
  });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'product' && !movement) { sync(); const p = prod(v.product); v.unitCost = p.purchasePrice ? String(p.purchasePrice) : ''; v.unitPrice = p.sellingPrice ? String(p.sellingPrice) : ''; v.supplier = p.supplierName || ''; mount($('[data-fields]', modal.el), fields()); }
    sync(); recalc();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); sync(); showErr('');
    const q = parseInt(v.quantity, 10);
    if (!(q > 0)) return showErr('Enter a quantity (a whole number).');
    if (v.type === 'sale' && !(parseFloat(v.unitPrice) > 0)) return showErr('Enter the selling price.');
    if (v.type === 'purchase' && v.unitCost === '') return showErr('Enter the cost per unit.');
    const body = { type: v.type, product: v.product, quantity: q, date: v.date, notes: (v.notes || '').trim(), unitCost: parseFloat(v.unitCost) || 0, unitPrice: parseFloat(v.unitPrice) || 0, fees: parseFloat(v.fees) || 0, account: (v.type === 'purchase' || v.type === 'sale') && v.account ? v.account : null, supplier: (v.supplier || '').trim(), orderRef: (v.orderRef || '').trim(), reason: (v.reason || (v.type === 'writeoff' ? 'Damaged' : '')).trim() };
    try { await withLoading($('[data-save]', modal.el), () => (movement ? api.put(`/daraz/movements/${movement.id}`, body) : api.post('/daraz/movements', body))); if (body.account) remember(body.account); await finish(modal, movement ? 'Changes saved' : { purchase: 'Purchase recorded', sale: 'Sale recorded', writeoff: 'Stock written off', adjust_in: 'Stock added' }[v.type], onSaved); }
    catch (err) { showErr(err.message); }
  });
  const del = $('[data-del]', modal.el);
  if (del) del.addEventListener('click', () => { modal.close(); deleteMovement(movement, onSaved); });
}

export async function deleteMovement(m, onDone) {
  if (!await confirmDialog({ title: 'Delete this stock entry?', message: `${MOVE_LABEL[m.type]} of ${m.quantity} unit${m.quantity === 1 ? '' : 's'} will be removed${m.transaction ? ' and the account balance corrected' : ''}. You can undo this right after.` })) return;
  try { await api.del(`/daraz/movements/${m.id}`); await reloadAccounts(); emit('data'); onDone && onDone(); undoable('move', 'Stock entry', `/daraz/movements/${m.id}`, onDone); }
  catch (e) { toast(e.message, { type: 'error', duration: 8000 }); }
}

export async function openDarazExpenseForm({ expense = null, productId = '', onSaved } = {}) {
  let products = []; try { products = (await api.get('/daraz/products')).products; } catch { /* optional */ }
  const e0 = expense; const v = e0 ? { category: e0.category, title: e0.title, amount: String(e0.amount), date: e0.date, product: e0.product || '', account: e0.account || '', notes: e0.notes || '' } : { category: 'packaging', title: '', amount: '', date: todayStr(), product: productId, account: lastAccount(), notes: '' };
  const modal = openModal({ title: expense ? 'Edit expense' : 'Add Daraz expense', body: html`<form id="ef" novalidate autocomplete="off"><div class="stack"><div data-err></div>
    ${amountField('e-amt', 'amount', 'Amount', v.amount)}
    <div class="field-row"><div class="field"><label for="e-cat">Type</label><select class="select" id="e-cat" name="category">${optionList(Object.entries(DARAZ_EXPENSE).map(([value, label]) => ({ value, label })), v.category)}</select></div><div class="field"><label for="e-date">Date</label><input class="input" type="date" id="e-date" name="date" value="${v.date}" required></div></div>
    <div class="field"><label for="e-title">Description</label><input class="input" id="e-title" name="title" maxlength="120" required value="${v.title}" placeholder="e.g. 100 flyer bags"></div>
    <div class="field"><label for="e-acc">Paid from</label><select class="select" id="e-acc" name="account">${accOptions(v.account, 'No account – already paid / don’t deduct')}</select></div>
    <div class="field"><label for="e-prod">For one product <span class="opt">optional</span></label><select class="select" id="e-prod" name="product"><option value="">Whole business</option>${optionList(products.map((p) => ({ value: p.id, label: p.name })), v.product)}</select><div class="hint">Linking a product counts this cost against that product’s profit.</div></div>
    <div class="field"><label for="e-notes">Notes <span class="opt">optional</span></label><input class="input" id="e-notes" name="notes" maxlength="500" value="${v.notes}"></div></div></form>`,
    footer: html`${expense ? html`<button class="btn btn-ghost" type="button" data-del style="color:var(--neg);flex:0 0 auto">${icon('trash-2', 'i-sm')} Delete</button>` : ''}<button class="btn btn-primary" type="submit" form="ef" data-save>${expense ? 'Save changes' : 'Save expense'}</button>` });
  const form = $('#ef', modal.el); const showErr = (m) => mount($('[data-err]', modal.el), errorBox(m));
  form.addEventListener('input', (e) => { if (e.target.name === 'amount') e.target.value = cleanAmount(e.target.value); });
  form.addEventListener('change', (e) => { if (e.target.name === 'category') { const t = form.elements.title; if (!t.value.trim()) t.placeholder = `e.g. ${DARAZ_EXPENSE[e.target.value]}`; } });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const d = readForm(form); const amount = parseFloat(d.amount);
    if (!(amount > 0)) return showErr('Enter an amount greater than zero.');
    if (!d.title.trim()) d.title = DARAZ_EXPENSE[d.category];
    const body = { category: d.category, title: d.title.trim(), amount, date: d.date, product: d.product || null, account: d.account || null, notes: d.notes.trim() };
    try { await withLoading($('[data-save]', modal.el), () => (expense ? api.put(`/daraz/expenses/${expense.id}`, body) : api.post('/daraz/expenses', body))); if (body.account) remember(body.account); await finish(modal, expense ? 'Changes saved' : 'Expense saved', onSaved); }
    catch (err) { showErr(err.message); }
  });
  const del = $('[data-del]', modal.el);
  if (del) del.addEventListener('click', async () => { modal.close(); if (!await confirmDialog({ title: 'Delete this expense?', message: `"${expense.title}" (${money(expense.amount)}) will be removed${expense.transaction ? ' and the account balance corrected' : ''}. You can undo this right after.` })) return; try { await api.del(`/daraz/expenses/${expense.id}`); await reloadAccounts(); emit('data'); onSaved && onSaved(); undoable('exp', 'Expense', `/daraz/expenses/${expense.id}`, onSaved); } catch (er) { toast(er.message, { type: 'error' }); } });
}
