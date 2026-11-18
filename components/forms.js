import { $, $$, html, icon, mount, uuid, raw } from '../js/core/dom.js';
import { api } from '../js/core/api.js';
import { state, accountById, categoriesOf, savingsAccounts, reloadAccounts, reloadCategories, emit } from '../js/core/state.js';
import { money, symbol, todayStr } from '../js/core/format.js';
import { openModal, confirmDialog, withLoading } from './modal.js';
import { toast } from './toast.js';
import { accountLogo, ACCOUNT_TYPES, SWATCHES, CATEGORY_ICONS } from './logo.js';
import { emptyState } from './emptyState.js';

export const optionList = (items, selected, placeholder) => html`${placeholder ? html`<option value="">${placeholder}</option>` : ''}${items.map((o) => html`<option value="${o.value}" ${o.value === selected ? raw('selected') : ''}>${o.label}</option>`)}`;
export const errorBox = (msg) => (msg ? html`<div class="form-error" role="alert">${icon('circle-alert')}<span>${msg}</span></div>` : '');
export const cleanAmount = (v) => { let s = String(v).replace(/[^\d.]/g, ''); const i = s.indexOf('.'); if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '').slice(0, 2); return s; };
export const readForm = (form) => Object.fromEntries(new FormData(form).entries());

/* ============================ Transactions ============================ */
const LAST_ACCOUNT = 'gm_last_account'; // a harmless UI preference, not financial data
const SOURCE_SUGGESTIONS = ['Daraz profit', 'Coding income', 'Personal income', 'Salary'];

export function openTransactionForm({ tx = null, type = 'expense', preset = {}, onSaved } = {}) {
  const accounts = state.accounts;
  if (!accounts.length) {
    const m = openModal({ title: 'Add an account first', mobile: 'center', size: 'narrow',
      body: emptyState({ art: 'wallet', title: 'No accounts yet', text: 'Transactions belong to an account such as Meezan Bank, JazzCash or Cash. Create one to continue.', action: html`<button class="btn btn-primary" data-add type="button">${icon('plus')} Add account</button>` }) });
    $('[data-add]', m.el).addEventListener('click', () => { m.close(); openAccountForm({ onSaved }); });
    return;
  }
  let lastAcc = null; try { lastAcc = localStorage.getItem(LAST_ACCOUNT); } catch { /* ignore */ }
  const firstAcc = (accountById(lastAcc) || accounts[0]).id;
  const v = tx
    ? { type: tx.type, title: tx.title, amount: String(tx.amount), category: tx.category || '', account: tx.account, toAccount: tx.toAccount || '', date: tx.date, notes: tx.notes || '', source: tx.source || '' }
    : { type, title: preset.title || '', amount: preset.amount ? String(preset.amount) : '', category: '', account: preset.account || firstAcc, toAccount: preset.toAccount || '', date: todayStr(), notes: '', source: preset.source || '' };
  const requestId = uuid(); // same id on every retry → saving twice can never double-count
  let error = '';

  const typeSeg = () => html`<div class="seg seg-type seg-full" role="group" aria-label="Transaction type" style="grid-template-columns:repeat(3,1fr)">
    ${[['expense', 'Expense'], ['income', 'Income'], ['transfer', 'Transfer']].map(([k, l]) => html`<button type="button" data-v="${k}" aria-pressed="${v.type === k}">${l}</button>`)}</div>`;

  const fields = () => {
    const isT = v.type === 'transfer';
    const cats = categoriesOf(v.type === 'income' ? 'income' : 'expense');
    const accOpts = accounts.map((a) => ({ value: a.id, label: `${a.name} · ${money(a.balance)}` }));
    const toOpts = accounts.filter((a) => a.id !== v.account).map((a) => ({ value: a.id, label: `${a.name} · ${money(a.balance)}` }));
    const catSelected = cats.some((c) => c.id === v.category) ? v.category : '';
    return html`
      <div class="field"><label for="f-amount">Amount</label><div class="amount-wrap"><span class="cur">${symbol()}</span>
        <input class="input amount-input" id="f-amount" name="amount" inputmode="decimal" autocomplete="off" placeholder="0" value="${v.amount}" required></div>
        <div class="hint" data-hint></div></div>
      ${isT ? html`
        <div class="field"><label for="f-from">From account</label><select class="select" id="f-from" name="account">${optionList(accOpts, v.account)}</select></div>
        <div class="field"><label for="f-to">To account</label><select class="select" id="f-to" name="toAccount">${optionList(toOpts, v.toAccount, 'Choose destination')}</select></div>
        <div class="field"><label for="f-source">Source <span class="opt">optional</span></label><input class="input" id="f-source" name="source" list="src-list" maxlength="60" placeholder="e.g. Daraz profit" value="${v.source}">
          <datalist id="src-list">${SOURCE_SUGGESTIONS.map((s) => html`<option value="${s}">`)}</datalist>
          <div class="hint">Transfers move money between your own accounts. They are never counted as income or expenses.</div></div>
        <div class="field"><label for="f-title">Title <span class="opt">optional</span></label><input class="input" id="f-title" name="title" maxlength="120" placeholder="Transfer" value="${v.title}"></div>`
      : html`
        <div class="field"><label for="f-title">${v.type === 'income' ? 'Income title' : 'Expense title'}</label><input class="input" id="f-title" name="title" maxlength="120" required placeholder="${v.type === 'income' ? 'e.g. Website project payment' : 'e.g. Lunch'}" value="${v.title}"></div>
        <div class="field-row">
          <div class="field"><label for="f-cat">${v.type === 'income' ? 'Source' : 'Category'}</label><select class="select" id="f-cat" name="category" required>${optionList(cats.map((c) => ({ value: c.id, label: c.name })), catSelected, 'Select…')}</select></div>
          <div class="field"><label for="f-acc">${v.type === 'income' ? 'Receiving account' : 'Paid from'}</label><select class="select" id="f-acc" name="account">${optionList(accOpts, v.account)}</select></div>
        </div>`}
      <div class="field"><label for="f-date">Date</label><input class="input" type="date" id="f-date" name="date" value="${v.date}" required></div>
      <div class="field"><label for="f-notes">Description <span class="opt">optional</span></label><textarea class="textarea" id="f-notes" name="notes" maxlength="1000" placeholder="Add a note…">${v.notes}</textarea></div>`;
  };

  const modal = openModal({
    title: tx ? 'Edit transaction' : 'New transaction',
    body: html`<form id="tx-form" novalidate autocomplete="off"><div class="stack"><div data-type>${typeSeg()}</div><div data-err></div><div class="stack" data-fields>${fields()}</div></div></form>`,
    footer: html`${tx ? html`<button class="btn btn-ghost" type="button" data-del style="color:var(--neg);flex:0 0 auto">${icon('trash-2', 'i-sm')} Delete</button>` : ''}<button class="btn btn-primary" type="submit" form="tx-form" data-save></button>`,
  });
  const form = $('#tx-form', modal.el);
  const fieldsEl = $('[data-fields]', modal.el);
  const saveBtn = $('[data-save]', modal.el);
  const label = () => (saveBtn.textContent = tx ? 'Save changes' : v.type === 'transfer' ? 'Move money' : v.type === 'income' ? 'Save income' : 'Save expense');
  const showErr = (m) => { error = m; mount($('[data-err]', modal.el), errorBox(m)); };

  const syncValues = () => { Object.assign(v, readForm(form)); };
  const updateHint = () => {
    const el = $('[data-hint]', modal.el); if (!el) return;
    const acc = accountById(form.elements.account?.value);
    const amt = parseFloat(form.elements.amount.value);
    el.className = 'hint';
    if (!acc) { el.textContent = ''; return; }
    let avail = acc.balance;
    if (tx && tx.type !== 'income' && tx.account === acc.id) avail += tx.amount; // editing: the old amount is given back
    if (tx && tx.type === 'income' && tx.account === acc.id) avail -= tx.amount;
    el.textContent = `${acc.name} balance: ${money(acc.balance)}`;
    if (v.type !== 'income' && amt > avail) { el.className = 'hint warn'; el.textContent = `This is more than the ${money(avail)} available in ${acc.name}. The balance will go below zero.`; }
  };
  label(); updateHint();

  $('[data-type]', modal.el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]'); if (!b || b.dataset.v === v.type) return;
    syncValues(); v.type = b.dataset.v; v.category = ''; showErr('');
    mount($('[data-type]', modal.el), typeSeg()); mount(fieldsEl, fields()); label(); updateHint();
  });
  form.addEventListener('input', (e) => { if (e.target.name === 'amount') e.target.value = cleanAmount(e.target.value); if (e.target.name === 'amount' || e.target.name === 'account') updateHint(); });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'account' && v.type === 'transfer') { syncValues(); if (v.toAccount === v.account) v.toAccount = ''; mount(fieldsEl, fields()); }
    updateHint();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault(); syncValues(); showErr('');
    const amount = parseFloat(v.amount);
    const miss = (() => {
      if (!(amount > 0)) return 'Enter an amount greater than zero.';
      if (v.type !== 'transfer' && !v.title.trim()) return v.type === 'income' ? 'Enter an income title.' : 'Enter an expense title.';
      if (v.type !== 'transfer' && !v.category) return v.type === 'income' ? 'Choose the income source.' : 'Choose a category.';
      if (v.type === 'transfer' && !v.toAccount) return 'Choose the account you are moving money to.';
      if (!v.date) return 'Choose a date.';
      return '';
    })();
    if (miss) { showErr(miss); return; }
    const body = { type: v.type, title: v.title.trim(), amount, date: v.date, account: v.account, notes: v.notes.trim(), ...(v.type === 'transfer' ? { toAccount: v.toAccount, source: (v.source || '').trim() } : { category: v.category }) };
    try {
      await withLoading(saveBtn, async () => {
        if (tx) await api.put(`/transactions/${tx.id}`, body); else await api.post('/transactions', { ...body, clientRequestId: requestId });
        await reloadAccounts();
      });
      try { localStorage.setItem(LAST_ACCOUNT, v.account); } catch { /* ignore */ }
      modal.close();
      toast(tx ? 'Changes saved' : v.type === 'transfer' ? 'Money moved' : v.type === 'income' ? 'Income saved' : 'Expense saved');
      emit('data'); onSaved && onSaved();
    } catch (err) { showErr(err.message); }
  });

  const del = $('[data-del]', modal.el);
  if (del) del.addEventListener('click', async () => { modal.close(); await deleteTransaction(tx, onSaved); });
}

export async function deleteTransaction(tx, onDone) {
  const ok = await confirmDialog({ title: 'Delete transaction?', message: `"${tx.title}" (${money(tx.amount)}) will be removed and your account balance${tx.type === 'transfer' ? 's' : ''} will be corrected. You can undo this right after.`, confirmText: 'Delete' });
  if (!ok) return false;
  try {
    await api.del(`/transactions/${tx.id}`); await reloadAccounts(); emit('data'); onDone && onDone();
    toast('Transaction deleted', { type: 'info', action: { label: 'Undo', onClick: async () => { try { await api.post(`/transactions/${tx.id}/restore`); await reloadAccounts(); emit('data'); onDone && onDone(); toast('Restored'); } catch (e) { toast(e.message, { type: 'error' }); } } } });
    return true;
  } catch (e) { toast(e.message, { type: 'error' }); return false; }
}

/* ============================ Accounts ============================ */
export const ACCOUNT_PRESETS = [
  { name: 'Meezan Bank', type: 'bank', logoKey: 'meezan' },
  { name: 'JazzCash', type: 'mobile_wallet', logoKey: 'jazzcash' },
  { name: 'Easypaisa', type: 'mobile_wallet', logoKey: 'easypaisa' },
  { name: 'Cash', type: 'cash', logoKey: '' },
  { name: 'Savings', type: 'savings', logoKey: '' },
];

async function resizeToDataUri(file, size = 256) {
  if (!/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.type)) throw new Error('Choose a PNG, JPEG, WebP or SVG image.');
  // Read as a data: URL - the page CSP (img-src) blocks blob: URLs, which made every upload fail with "could not be read".
  const src = await new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result)); fr.onerror = () => reject(new Error('That image could not be read.')); fr.readAsDataURL(file); });
  const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('That image could not be read.')); i.src = src; });
  const w = img.naturalWidth || img.width || size; const h = img.naturalHeight || img.height || size; // SVGs without a size
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  const r = Math.min(size / w, size / h) * 0.8;
  ctx.drawImage(img, (size - w * r) / 2, (size - h * r) / 2, w * r, h * r);
  let out = c.toDataURL('image/webp', 0.88);
  if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', 0.88);
  if (out.length > 400000) throw new Error('That image is too detailed. Try a simpler one.');
  return out;
}

export function openAccountForm({ account = null, preset = null, onSaved } = {}) {
  const v = account
    ? { name: account.name, type: account.type, description: account.description || '', balance: String(account.openingBalance), color: account.color, logoKey: account.logoKey || '', logoData: account.logoData || '' }
    : { name: preset?.name || '', type: preset?.type || 'bank', description: '', balance: '', color: SWATCHES[0], logoKey: preset?.logoKey || '', logoData: '' };
  let error = '';
  const preview = () => accountLogo({ ...v, type: v.type }, 'lg');

  const body = () => html`<form id="acc-form" novalidate autocomplete="off"><div class="stack">
    ${account ? '' : html`<div class="field"><span class="label">Quick start</span><div class="preset-row">${ACCOUNT_PRESETS.map((p, i) => html`<button class="chip" type="button" data-preset="${i}">${p.name}</button>`)}</div></div>`}
    <div data-err></div>
    <div class="logo-pick"><span data-preview>${preview()}</span>
      <div style="display:grid;gap:8px"><div class="row-flex"><label class="btn btn-sm" style="cursor:pointer">${icon('image', 'i-sm')} Upload logo<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden data-file></label>
        <button class="btn btn-sm btn-ghost" type="button" data-nologo ${v.logoData || v.logoKey ? '' : raw('hidden')}>Remove</button></div>
        <span class="hint">Use the bank's official logo. It is resized and saved to cloud storage.</span></div></div>
    <div class="field"><label for="a-name">Account name</label><input class="input" id="a-name" name="name" maxlength="60" required placeholder="e.g. Meezan Bank" value="${v.name}"></div>
    <div class="field-row">
      <div class="field"><label for="a-type">Account type</label><select class="select" id="a-type" name="type">${optionList(Object.entries(ACCOUNT_TYPES).map(([k, t]) => ({ value: k, label: t.label })), v.type)}</select></div>
      <div class="field"><label for="a-bal">${account ? 'Opening balance' : 'Current balance'}</label><div class="amount-wrap"><input class="input" id="a-bal" name="balance" inputmode="decimal" placeholder="0" value="${v.balance}"></div></div>
    </div>
    ${account ? html`<div class="hint" style="margin-top:-8px">Balance = opening balance + your transactions. Currently ${money(account.balance)}.</div>` : ''}
    <div class="field"><label for="a-desc">Description <span class="opt">optional</span></label><input class="input" id="a-desc" name="description" maxlength="300" placeholder="e.g. Main business account" value="${v.description}"></div>
    <div class="field"><span class="label">Accent colour</span><div class="swatches">${SWATCHES.map((c) => html`<label><input type="radio" name="color" value="${c}" ${c === v.color ? raw('checked') : ''} aria-label="Colour ${c}"><span style="--c:${c}"></span></label>`)}</div></div>
  </div></form>`;

  const modal = openModal({ title: account ? 'Edit account' : 'Add account', body: body(), footer: html`<button class="btn btn-primary" type="submit" form="acc-form" data-save>${account ? 'Save changes' : 'Add account'}</button>` });
  const form = $('#acc-form', modal.el);
  const showErr = (m) => { error = m; mount($('[data-err]', modal.el), errorBox(m)); };
  const refreshPreview = () => { mount($('[data-preview]', modal.el), preview()); $('[data-nologo]', modal.el).hidden = !(v.logoData || v.logoKey); };
  const sync = () => Object.assign(v, readForm(form));

  modal.el.addEventListener('click', (e) => {
    const p = e.target.closest('[data-preset]');
    if (p) { const pr = ACCOUNT_PRESETS[+p.dataset.preset]; sync(); Object.assign(v, { name: pr.name, type: pr.type, logoKey: pr.logoKey, logoData: '' }); $('[name=name]', form).value = pr.name; $('[name=type]', form).value = pr.type; refreshPreview(); }
    if (e.target.closest('[data-nologo]')) { v.logoData = ''; v.logoKey = ''; refreshPreview(); }
  });
  form.addEventListener('input', (e) => { if (e.target.name === 'balance') e.target.value = e.target.value.replace(/[^\d.\-]/g, '').replace(/(?!^)-/g, '').replace(/(\.\d{0,2}).*/, '$1'); });
  form.addEventListener('change', (e) => { if (e.target.name === 'color' || e.target.name === 'type') { sync(); refreshPreview(); } });
  $('[data-file]', modal.el).addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { v.logoData = await resizeToDataUri(f); v.logoKey = ''; showErr(''); refreshPreview(); } catch (err) { showErr(err.message); }
    e.target.value = '';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); sync(); showErr('');
    if (!v.name.trim()) return showErr('Enter an account name.');
    if (v.balance !== '' && Number.isNaN(parseFloat(v.balance))) return showErr('Enter a valid balance.');
    const body = { name: v.name.trim(), type: v.type, description: v.description.trim(), openingBalance: v.balance === '' ? 0 : parseFloat(v.balance), color: v.color, logoKey: v.logoData ? '' : v.logoKey, logoData: v.logoData };
    try {
      await withLoading($('[data-save]', modal.el), () => (account ? api.put(`/accounts/${account.id}`, body) : api.post('/accounts', body)));
      await reloadAccounts(); modal.close(); toast(account ? 'Account updated' : 'Account added'); emit('data'); onSaved && onSaved();
    } catch (err) { showErr(err.message); }
  });
}

export async function deleteAccount(a, onDone) {
  const ok = await confirmDialog({ title: `Delete "${a.name}"?`, message: a.transactionCount ? `This account has ${a.transactionCount} transaction${a.transactionCount === 1 ? '' : 's'}, so it will be archived: hidden from your balances but kept in your history. You can restore it later.` : 'This account has no transactions and will be removed permanently.', confirmText: a.transactionCount ? 'Archive account' : 'Delete account' });
  if (!ok) return;
  try { const r = await api.del(`/accounts/${a.id}`); await reloadAccounts(); toast(r.archived ? 'Account archived' : 'Account deleted', { type: 'info' }); emit('data'); onDone && onDone(); }
  catch (e) { toast(e.message, { type: 'error', duration: 7000 }); }
}

/* ============================ Budget ============================ */
export function openBudgetForm({ onSaved } = {}) {
  const b = state.budget || {};
  const f = (name, label, val, hint) => html`<div class="field"><label for="b-${name}">${label}</label><div class="amount-wrap"><span class="cur" style="font-size:15px">${symbol()}</span><input class="input" style="padding-left:${symbol().length > 1 ? 52 : 38}px" id="b-${name}" name="${name}" inputmode="decimal" placeholder="Not set" value="${val ?? ''}"></div>${hint ? html`<div class="hint">${hint}</div>` : ''}</div>`;
  const modal = openModal({ title: 'Budget & targets', body: html`<form id="bud-form" novalidate><div class="stack"><div data-err></div>
    ${f('dailyLimit', 'Daily spending limit', b.dailyLimit, 'Used for "Remaining today" on your dashboard.')}
    ${f('monthlyLimit', 'Monthly spending limit', b.monthlyLimit)}
    ${f('savingsTarget', 'Monthly savings target', b.savingsTarget, 'Counted from money you move into savings accounts.')}
    <p class="hint">Leave a field empty to remove that limit. Business budgets (Daraz, coding, marketing) arrive with their modules.</p></div></form>`,
    footer: html`<button class="btn btn-primary" type="submit" form="bud-form" data-save>Save budget</button>` });
  const form = $('#bud-form', modal.el);
  form.addEventListener('input', (e) => { e.target.value = cleanAmount(e.target.value); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = readForm(form);
    const body = Object.fromEntries(Object.entries(d).map(([k, x]) => [k, x === '' ? null : parseFloat(x)]));
    try {
      const r = await withLoading($('[data-save]', modal.el), () => api.put('/budget', body));
      state.budget = r.budget; modal.close(); toast('Budget saved'); emit('data'); onSaved && onSaved();
    } catch (err) { mount($('[data-err]', modal.el), errorBox(err.message)); }
  });
}

/* ============================ Savings goal ============================ */
export function openGoalForm({ goal = null, onSaved } = {}) {
  const sav = savingsAccounts();
  const modal = openModal({ title: goal ? 'Edit goal' : 'New savings goal', body: html`<form id="goal-form" novalidate autocomplete="off"><div class="stack"><div data-err></div>
    <div class="field"><label for="g-title">Goal name</label><input class="input" id="g-title" name="title" maxlength="80" required placeholder="e.g. New laptop" value="${goal?.title || ''}"></div>
    <div class="field"><label for="g-target">Target amount</label><div class="amount-wrap"><span class="cur" style="font-size:15px">${symbol()}</span><input class="input" style="padding-left:${symbol().length > 1 ? 52 : 38}px" id="g-target" name="targetAmount" inputmode="decimal" required value="${goal?.targetAmount ?? ''}"></div></div>
    <div class="field-row"><div class="field"><label for="g-date">Target date <span class="opt">optional</span></label><input class="input" type="date" id="g-date" name="targetDate" value="${goal?.targetDate || ''}"></div>
      <div class="field"><label for="g-acc">Tracked in</label><select class="select" id="g-acc" name="account">${optionList(sav.map((a) => ({ value: a.id, label: a.name })), goal?.account || '', 'All savings accounts')}</select></div></div>
    <div class="field"><label for="g-notes">Notes <span class="opt">optional</span></label><input class="input" id="g-notes" name="notes" maxlength="300" value="${goal?.notes || ''}"></div></div></form>`,
    footer: html`<button class="btn btn-primary" type="submit" form="goal-form" data-save>${goal ? 'Save goal' : 'Create goal'}</button>` });
  const form = $('#goal-form', modal.el);
  form.addEventListener('input', (e) => { if (e.target.name === 'targetAmount') e.target.value = cleanAmount(e.target.value); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = readForm(form);
    const body = { title: d.title.trim(), targetAmount: parseFloat(d.targetAmount), targetDate: d.targetDate || null, account: d.account || null, notes: d.notes.trim() };
    if (!body.title) return mount($('[data-err]', modal.el), errorBox('Give your goal a name.'));
    if (!(body.targetAmount > 0)) return mount($('[data-err]', modal.el), errorBox('Enter a target amount.'));
    try {
      await withLoading($('[data-save]', modal.el), () => (goal ? api.put(`/savings/goals/${goal.id}`, body) : api.post('/savings/goals', body)));
      modal.close(); toast(goal ? 'Goal updated' : 'Goal created'); emit('data'); onSaved && onSaved();
    } catch (err) { mount($('[data-err]', modal.el), errorBox(err.message)); }
  });
}

/* ============================ Category ============================ */
export function openCategoryForm({ onSaved } = {}) {
  const v = { type: 'expense', icon: 'tag', color: SWATCHES[0] };
  const modal = openModal({ title: 'New category', size: 'narrow', mobile: 'center', body: html`<form id="cat-form" novalidate autocomplete="off"><div class="stack"><div data-err></div>
    <div class="seg seg-full" style="grid-template-columns:1fr 1fr" data-seg><button type="button" data-v="expense" aria-pressed="true">Expense</button><button type="button" data-v="income" aria-pressed="false">Income source</button></div>
    <div class="field"><label for="c-name">Name</label><input class="input" id="c-name" name="name" maxlength="40" required placeholder="e.g. Gym"></div>
    <div class="field"><span class="label">Icon</span><div class="swatches" data-icons>${CATEGORY_ICONS.map((n) => html`<label><input type="radio" name="icon" value="${n}" ${n === v.icon ? raw('checked') : ''} aria-label="${n}"><span style="--c:var(--glass-3);display:grid;place-items:center;color:var(--text)">${icon(n, 'i-sm')}</span></label>`)}</div></div>
    <div class="field"><span class="label">Colour</span><div class="swatches">${SWATCHES.map((c) => html`<label><input type="radio" name="color" value="${c}" ${c === v.color ? raw('checked') : ''} aria-label="${c}"><span style="--c:${c}"></span></label>`)}</div></div></div></form>`,
    footer: html`<button class="btn btn-primary" type="submit" form="cat-form" data-save>Add category</button>` });
  const form = $('#cat-form', modal.el);
  $('[data-seg]', modal.el).addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; v.type = b.dataset.v; $$('[data-v]', modal.el).forEach((x) => x.setAttribute('aria-pressed', x === b)); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const d = readForm(form);
    try {
      await withLoading($('[data-save]', modal.el), () => api.post('/categories', { name: d.name, type: v.type, icon: d.icon, color: d.color }));
      await reloadCategories(); modal.close(); toast('Category added'); onSaved && onSaved();
    } catch (err) { mount($('[data-err]', modal.el), errorBox(err.message)); }
  });
}
