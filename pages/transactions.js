import { $, $$, html, icon, mount, delegate, debounce, raw } from '../js/core/dom.js';
import { api } from '../js/core/api.js';
import { state, accountById, categoryById, categoriesOf, reloadAccounts } from '../js/core/state.js';
import { money, dayLabel, dateFull, todayStr, addDays } from '../js/core/format.js';
import { txRow, TYPE_META, describeAccounts } from '../components/transactionRow.js';
import { emptyState } from '../components/emptyState.js';
import { openTransactionForm, deleteTransaction } from '../components/forms.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { categoryTile } from '../components/logo.js';
import { navigate } from '../js/core/router.js';

/* ---- detail sheet (also used from the dashboard) ---- */
export async function openTxDetail(id, { onChange } = {}) {
  let t;
  try { t = (await api.get(`/transactions/${id}`)).transaction; } catch (e) { toast(e.message, { type: 'error' }); return; }
  const cat = t.category ? categoryById(t.category) : null;
  const meta = TYPE_META[t.type];
  const row = (k, v) => (v ? html`<div><dt>${k}</dt><dd>${v}</dd></div>` : '');
  const amount = t.type === 'income' ? money(t.amount, { sign: true }) : t.type === 'expense' ? `-${money(t.amount)}` : money(t.amount);
  const m = openModal({ title: 'Transaction details', mobile: 'sheet',
    body: html`<div class="row-flex" style="gap:14px">${t.type === 'transfer' ? html`<span class="cico lg" style="--c:${meta.color}">${icon(meta.icon, 'i-lg')}</span>` : categoryTile(cat, 'lg')}
      <div class="row-main"><div style="font-size:19px;font-weight:800;letter-spacing:-.02em">${t.title}</div><span class="pill ${t.type}">${meta.label}</span></div></div>
      <div class="money ${meta.cls}" style="font-size:36px;font-weight:800">${amount}</div>
      ${t.module ? html`<div class="managed-note">${icon('info', 'i-sm')}<span>This transaction is managed by the ${MOD[t.module]} module. Edit or delete it there so your business records and balances stay in sync.</span></div>` : ''}
      <dl class="detail-grid">${row('Date', dateFull(t.date))}${row(t.type === 'income' ? 'Source' : 'Category', cat && cat.name)}${t.type === 'transfer' ? row('From', accountById(t.account)?.name || 'Removed account') : row('Account', describeAccounts(t))}${t.type === 'transfer' ? row('To', accountById(t.toAccount)?.name || 'Removed account') : ''}${row('Transfer source', t.source)}${row('Description', t.notes)}${row('Recorded', dateFull(t.createdAt.slice(0, 10)))}</dl>`,
    footer: t.module ? html`<button class="btn btn-primary" type="button" data-open>${icon('chevron-right', 'i-sm')} Open in ${MOD[t.module]}</button>` : html`<button class="btn btn-ghost" style="color:var(--neg);flex:0 0 auto" type="button" data-del>${icon('trash-2', 'i-sm')} Delete</button><button class="btn btn-primary" type="button" data-edit>${icon('pencil', 'i-sm')} Edit</button>` });
  if (t.module) $('[data-open]', m.el).addEventListener('click', () => { m.close(); navigate({ coding: 'coding?tab=records', daraz: 'daraz?tab=history', trading: 'trading?tab=trades' }[t.module]); });
  else {
    $('[data-edit]', m.el).addEventListener('click', () => { m.close(); openTransactionForm({ tx: t, onSaved: onChange }); });
    $('[data-del]', m.el).addEventListener('click', async () => { m.close(); await deleteTransaction(t, onChange); });
  }
}

const MOD = { coding: 'Coding', daraz: 'Daraz', trading: 'Trading' };
const PRESETS = [['all', 'All time'], ['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month']];
const rangeFor = (k) => {
  const t = todayStr();
  return { today: [t, t], '7d': [addDays(t, -6), t], '30d': [addDays(t, -29), t], month: [`${t.slice(0, 7)}-01`, t], all: ['', ''] }[k];
};

export default async function transactions(el, { params, refresh }) {
  await reloadAccounts();
  const f = { q: '', type: params.type || '', category: params.category || '', account: params.account || '', scope: params.scope || '', from: params.from || '', to: params.to || '', preset: 'all' };
  let page = 1; let reqSeq = 0;
  let items = []; let pagination = null; let summary = null; let loading = false;

  const activeCount = () => ['category', 'account', 'scope', 'from', 'to'].filter((k) => f[k]).length;
  const query = (p) => ({ q: f.q, type: f.type, category: f.category, account: f.account, scope: f.scope, from: f.from, to: f.to, page: p, limit: 25 });

  mount(el, html`
    <div class="page-head"><div><h2>Transactions</h2><p data-count>&nbsp;</p></div></div>
    <div class="toolbar">
      <div class="search">${icon('search')}<input class="input" type="search" placeholder="Search title, notes or source" aria-label="Search transactions" data-q maxlength="80"></div>
      <div class="tool-row"><div class="seg" role="group" aria-label="Type filter" data-type>${[['', 'All'], ['expense', 'Expenses'], ['income', 'Income'], ['transfer', 'Transfers']].map(([k, l]) => html`<button type="button" data-v="${k}" aria-pressed="${f.type === k}">${l}</button>`)}</div>
        <button class="btn" type="button" data-filters>${icon('list-filter', 'i-sm')} Filters <span class="filter-count" data-fc hidden></span></button></div>
      <div class="chips" data-active></div></div>
    <div class="sum-strip" data-sum></div>
    <div class="card tx-card" data-list></div>`);

  const listEl = $('[data-list]', el);
  const render = () => {
    $('[data-count]', el).textContent = pagination ? `${pagination.total} transaction${pagination.total === 1 ? '' : 's'}${activeCount() || f.q || f.type ? ' match your filters' : ''}` : '';
    const fc = $('[data-fc]', el); fc.hidden = !activeCount(); fc.textContent = activeCount();
    const chips = [];
    if (f.account) chips.push(['account', `Account: ${accountById(f.account)?.name || '…'}`]);
    if (f.scope) chips.push(['scope', { business: 'Business only', trading: 'Trading only', personal: 'Personal only' }[f.scope]]);
    if (f.category) chips.push(['category', `Category: ${categoryById(f.category)?.name || '…'}`]);
    if (f.from || f.to) chips.push(['date', `${f.from ? dateFull(f.from) : 'Start'} → ${f.to ? dateFull(f.to) : 'Today'}`]);
    mount($('[data-active]', el), html`${chips.map(([k, l]) => html`<button class="chip active" type="button" data-clear="${k}">${l} ${icon('x', 'i-sm')}</button>`)}`);
    if (summary) mount($('[data-sum]', el), html`<div><small>Income</small><b class="pos">${money(summary.income)}</b></div><div><small>Expenses</small><b class="neg">${money(summary.expense)}</b></div><div><small>Net</small><b class="${summary.net < 0 ? 'neg' : ''}">${money(summary.net, { sign: true })}</b></div>`);
    if (loading && !items.length) { mount(listEl, html`${[1, 2, 3, 4, 5].map(() => html`<div class="skeleton" style="height:58px;margin:10px 0"></div>`)}`); return; }
    if (!items.length) {
      const filtered = f.q || f.type || activeCount();
      mount(listEl, emptyState({ art: filtered ? 'search' : 'receipt', title: filtered ? 'Nothing matches' : 'No transactions yet', text: filtered ? 'Try a different search or clear some filters.' : 'Record an expense or income and it will appear here.', action: filtered ? html`<button class="btn" type="button" data-reset>Clear filters</button>` : html`<button class="btn btn-primary" type="button" data-add>${icon('plus')} Add transaction</button>` }));
      return;
    }
    let last = ''; const out = [];
    for (const t of items) { if (t.date !== last) { last = t.date; out.push(html`<div class="group-head"><span>${dayLabel(t.date)}</span><span>${dateFull(t.date)}</span></div>`); } out.push(txRow(t)); }
    mount(listEl, html`<div class="list">${out}</div>${pagination.page < pagination.pages ? html`<div class="load-more"><button class="btn" type="button" data-more>Load more</button></div>` : ''}`);
  };

  async function load(reset = true) {
    const seq = ++reqSeq; loading = true;
    if (reset) { page = 1; items = []; render(); }
    try {
      const r = await api.get('/transactions', query(page));
      if (seq !== reqSeq) return; // a newer search/filter superseded this one
      items = reset ? r.items : items.concat(r.items); pagination = r.pagination; summary = r.summary;
    } catch (e) { if (seq === reqSeq) toast(e.message, { type: 'error' }); }
    if (seq === reqSeq) { loading = false; render(); }
  }

  const openFilters = () => {
    const draft = { ...f };
    const m = openModal({ title: 'Filters', mobile: 'sheet', body: html`<div class="filter-panel">
      <div class="field"><span class="label">Date</span><div class="quick-dates">${PRESETS.map(([k, l]) => html`<button class="chip" type="button" data-preset="${k}">${l}</button>`)}</div></div>
      <div class="field-row"><div class="field"><label for="ff-from">From</label><input class="input" type="date" id="ff-from" value="${draft.from}"></div><div class="field"><label for="ff-to">To</label><input class="input" type="date" id="ff-to" value="${draft.to}"></div></div>
      <div class="field"><label for="ff-acc">Account</label><select class="select" id="ff-acc"><option value="">All accounts</option>${state.accounts.map((a) => html`<option value="${a.id}" ${a.id === draft.account ? raw('selected') : ''}>${a.name}</option>`)}</select></div>
      <div class="field"><label for="ff-scope">Money type</label><select class="select" id="ff-scope"><option value="">Personal &amp; business</option><option value="personal" ${draft.scope === 'personal' ? raw('selected') : ''}>Personal only</option><option value="business" ${draft.scope === 'business' ? raw('selected') : ''}>Business only (Coding &amp; Daraz)</option><option value="trading" ${draft.scope === 'trading' ? raw('selected') : ''}>Trading only</option></select></div>
      <div class="field"><label for="ff-cat">Category / source</label><select class="select" id="ff-cat"><option value="">All categories</option>
        <optgroup label="Expense categories">${categoriesOf('expense').map((c) => html`<option value="${c.id}" ${c.id === draft.category ? raw('selected') : ''}>${c.name}</option>`)}</optgroup>
        <optgroup label="Income sources">${categoriesOf('income').map((c) => html`<option value="${c.id}" ${c.id === draft.category ? raw('selected') : ''}>${c.name}</option>`)}</optgroup></select></div></div>`,
      footer: html`<button class="btn btn-ghost" type="button" data-clear-all>Clear all</button><button class="btn btn-primary" type="button" data-apply>Show results</button>` });
    m.el.addEventListener('click', (e) => { const p = e.target.closest('[data-preset]'); if (p) { const [a, b] = rangeFor(p.dataset.preset); $('#ff-from', m.el).value = a; $('#ff-to', m.el).value = b; } });
    $('[data-clear-all]', m.el).addEventListener('click', () => { Object.assign(f, { from: '', to: '', account: '', category: '', scope: '' }); m.close(); load(); });
    $('[data-apply]', m.el).addEventListener('click', () => {
      const from = $('#ff-from', m.el).value, to = $('#ff-to', m.el).value;
      if (from && to && from > to) { toast('"From" must be before "To".', { type: 'error' }); return; }
      Object.assign(f, { from, to, account: $('#ff-acc', m.el).value, category: $('#ff-cat', m.el).value, scope: $('#ff-scope', m.el).value }); m.close(); load();
    });
  };

  const search = debounce((v) => { f.q = v.trim(); load(); }, 300);
  const off = [
    delegate(el, 'input', '[data-q]', (e, i) => search(i.value)),
    delegate(el, 'click', '[data-type] [data-v]', (e, b) => { f.type = b.dataset.v; $$('[data-type] [data-v]', el).forEach((x) => x.setAttribute('aria-pressed', x === b)); load(); }),
    delegate(el, 'click', '[data-filters]', openFilters),
    delegate(el, 'click', '[data-clear]', (e, b) => { const k = b.dataset.clear; if (k === 'date') { f.from = ''; f.to = ''; } else f[k] = ''; load(); }),
    delegate(el, 'click', '[data-reset]', () => { Object.assign(f, { q: '', type: '', category: '', account: '', scope: '', from: '', to: '' }); $('[data-q]', el).value = ''; $$('[data-type] [data-v]', el).forEach((x) => x.setAttribute('aria-pressed', x.dataset.v === '')); load(); }),
    delegate(el, 'click', '[data-more]', async (e, b) => { b.classList.add('is-loading'); page += 1; await load(false); }),
    delegate(el, 'click', '[data-tx]', (e, b) => openTxDetail(b.dataset.tx, { onChange: () => load() })),
    delegate(el, 'click', '[data-add]', () => openTransactionForm({ onSaved: () => load() })),
  ];
  await load();
  return () => { off.forEach((x) => x()); search.cancel(); void refresh; };
}
