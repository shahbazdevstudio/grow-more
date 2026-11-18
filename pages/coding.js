import { $, $$, html, icon, mount, delegate, debounce } from '../js/core/dom.js';
import { api } from '../js/core/api.js';
import { state, accountById, reloadAccounts } from '../js/core/state.js';
import { money, dateFull, dateShort, monthLabel, todayStr } from '../js/core/format.js';
import { emptyState } from '../components/emptyState.js';
import { toast } from '../components/toast.js';
import { createChart, destroyAll, gridScale, xScale, palette } from '../components/charts.js';
import { tabsBar, rangeChips, tile, bars, signCls } from '../components/businessUi.js';
import { openCodingForm, openReceiveForm, CODING_LABEL } from '../components/businessForms.js';

const RANGES = [['all', 'All time'], ['this_month', 'This month'], ['last_month', 'Last month'], ['30d', 'Last 30 days']];

const recRow = (r, { pendingActions = false } = {}) => {
  const acc = r.account ? accountById(r.account) : null;
  const overdue = r.status === 'pending' && r.dueDate && r.dueDate < todayStr();
  const inc = r.kind === 'income';
  return html`<div class="row" data-rec="${r.id}" role="button" tabindex="0" style="cursor:pointer"><span class="cico" style="--c:${inc ? '#52DDA0' : '#FF8585'}">${icon(r.status === 'pending' ? 'hourglass' : inc ? 'arrow-down-left' : 'arrow-up-right')}</span>
    <div class="row-main"><div class="row-title truncate">${r.title}</div><div class="row-sub truncate">${CODING_LABEL[r.category]}${r.client ? ` · ${r.client}` : ''}${r.project ? ` · ${r.project}` : ''} · ${r.status === 'pending' ? (r.dueDate ? `due ${dateShort(r.dueDate)}` : 'no due date') : `${acc ? acc.name : ''} · ${dateShort(r.date)}`}</div></div>
    <div class="row-amt"><div class="tx-amt ${inc ? 'pos' : 'neg'}">${inc ? '+' : '-'}${money(r.amount)}</div>${r.status === 'pending' ? html`<span class="pill ${overdue ? 'expense' : 'warn'}">${overdue ? 'Overdue' : 'Pending'}</span>` : ''}</div>
    ${pendingActions ? html`<button class="btn btn-sm btn-primary" type="button" data-recv="${r.id}">Received</button>` : ''}</div>`;
};

const mem = { range: 'all', period: 'month' }; // survives in-place refreshes (after saving something)

export default async function coding(el, { params, refresh }) {
  await reloadAccounts();
  const charts = [];
  let tab = ['overview', 'records', 'pending'].includes(params.tab) ? params.tab : 'overview';
  let range = mem.range; let period = mem.period; let S = null; let recs = []; let pag = null; let loading = false; let seq = 0;
  const f = { kind: '', q: '' };
  const byId = new Map();

  mount(el, html`<div class="page-head"><p>Client payments, project income and business costs.</p><div class="page-actions"><button class="btn btn-primary" type="button" data-add="income">${icon('plus')} Add income</button><button class="btn" type="button" data-add="expense">${icon('minus', 'i-sm')} Add expense</button></div></div><div data-tabs></div><div data-body></div>`);
  const body = $('[data-body]', el);
  const tabsEl = $('[data-tabs]', el);
  const drawTabs = () => mount(tabsEl, tabsBar([['overview', 'Overview'], ['records', 'Records'], ['pending', 'Pending', S && S.pending.count]], tab));

  async function loadSummary() { S = await api.get('/coding/summary', { range }); }

  async function overview() {
    destroyAll(charts);
    const [rep] = await Promise.all([api.get('/coding/report', { period })]);
    const s = S;
    const sub = s.pending.overdueCount ? `${s.pending.overdueCount} overdue · ${money(s.pending.overdueTotal)}` : `${s.pending.count} waiting`;
    mount(body, html`${rangeChips(RANGES, range)}
      <div class="stats" style="margin:14px 0 16px">
        ${tile({ label: 'Income', value: money(s.income), sub: `${s.incomeCount} payment${s.incomeCount === 1 ? '' : 's'}`, cls: 'pos', ico: 'arrow-down-left', color: '#52DDA0' })}
        ${tile({ label: 'Expenses', value: money(s.expenses), sub: `${s.expenseCount} cost${s.expenseCount === 1 ? '' : 's'}`, ico: 'arrow-up-right', color: '#FF8585' })}
        ${tile({ label: 'Net profit', value: money(s.net, { sign: true }), sub: s.margin == null ? 'No income yet' : `${s.margin}% margin`, cls: signCls(s.net), ico: 'badge-dollar-sign', color: '#E8B04A' })}
        ${tile({ label: 'Pending payments', value: money(s.pending.total), sub, cls: s.pending.overdueCount ? 'neg' : '', ico: 'hourglass', color: '#F5B94A' })}
        ${tile({ label: 'Available cash', value: money(s.availableCash), sub: 'All-time income − costs', cls: signCls(s.availableCash), ico: 'wallet', color: '#86B7FF' })}</div>
      <div class="grid">
        <div class="card col-8"><div class="card-head"><h3 class="card-title">Income vs expenses</h3><div class="seg" data-period role="group" aria-label="Report period">${[['month', 'Monthly'], ['year', 'Yearly']].map(([k, l]) => html`<button type="button" data-p="${k}" aria-pressed="${period === k}">${l}</button>`)}</div></div>
          <div class="chart-box"><canvas id="ch-rep" role="img" aria-label="Coding income and expenses by ${period === 'month' ? 'month' : 'year'}"></canvas></div></div>
        <div class="card col-4"><div class="card-head"><h3 class="card-title">Expenses by type</h3></div>${s.expenseByCategory.length ? bars(s.expenseByCategory.map((x) => ({ label: x.label, amount: x.amount })), 'var(--neg)') : html`<p class="muted">No coding expenses in this range.</p>`}
          <div class="card-head" style="margin:22px 0 12px"><h3 class="card-title">Top clients</h3></div>${s.topClients.length ? html`<div class="list">${s.topClients.map((c) => html`<div class="row" style="padding:8px 2px"><span class="cico sm">${icon('users', 'i-sm')}</span><div class="row-main"><div class="row-title">${c.client}</div><div class="row-sub">${c.count} payment${c.count === 1 ? '' : 's'}</div></div><b class="money pos">${money(c.amount)}</b></div>`)}</div>` : html`<p class="muted">Add a client name when recording income to see your top clients.</p>`}</div>
        <div class="card col-12"><div class="card-head"><h3 class="card-title">${period === 'month' ? 'Monthly report — last 12 months' : 'Yearly report'}</h3><span class="pill">${money(rep.totals.net, { sign: true })} net</span></div>
          <div class="table-scroll"><table class="rep-table"><thead><tr><th>${period === 'month' ? 'Month' : 'Year'}</th><th>Income</th><th>Expenses</th><th>Net</th></tr></thead><tbody>${[...rep.buckets].reverse().map((b) => html`<tr><td>${period === 'month' ? monthLabel(b.key) : b.key}</td><td class="pos">${money(b.income)}</td><td>${money(b.expense)}</td><td class="${signCls(b.net)}">${money(b.net, { sign: true })}</td></tr>`)}</tbody><tfoot><tr><td><b>Total</b></td><td class="pos">${money(rep.totals.income)}</td><td>${money(rep.totals.expense)}</td><td class="${signCls(rep.totals.net)}">${money(rep.totals.net, { sign: true })}</td></tr></tfoot></table></div></div>
      </div>`);
    const p = palette();
    await createChart($('#ch-rep', el), { type: 'bar', data: { labels: rep.buckets.map((b) => (period === 'month' ? monthLabel(b.key).replace(/ \d{4}$/, '') : b.key)), datasets: [{ label: 'Income', data: rep.buckets.map((b) => b.income), backgroundColor: p.pos, borderRadius: 6, maxBarThickness: 26 }, { label: 'Expenses', data: rep.buckets.map((b) => b.expense), backgroundColor: p.neg, borderRadius: 6, maxBarThickness: 26 }] },
      options: { scales: { x: { ...xScale(), ticks: { ...xScale().ticks, maxTicksLimit: 12, autoSkip: false, font: { size: 11 } } }, y: gridScale((v) => money(v, { compact: true })) }, plugins: { legend: { display: true, labels: { usePointStyle: true, boxWidth: 8, color: p.text } }, tooltip: { callbacks: { title: (i) => (period === 'month' ? monthLabel(rep.buckets[i[0].dataIndex].key) : rep.buckets[i[0].dataIndex].key), label: (c) => ` ${c.dataset.label}: ${money(c.parsed.y)}` } } } } }, charts);
  }

  const skel = () => html`${[1, 2, 3, 4].map(() => html`<div class="skeleton" style="height:60px;margin:10px 0"></div>`)}`;
  async function loadRecords(reset = true, status = '') {
    const my = ++seq; loading = true;
    if (reset) { recs = []; mount($('[data-list]', el) || body, skel()); }
    try {
      const page = reset ? 1 : (pag ? pag.page + 1 : 1);
      const r = await api.get('/coding/records', { kind: f.kind, q: f.q, status, page, limit: 25 });
      if (my !== seq) return; recs = reset ? r.items : recs.concat(r.items); pag = r.pagination; recs.forEach((x) => byId.set(x.id, x));
    } catch (e) { toast(e.message, { type: 'error' }); }
    loading = false; if (my === seq) drawRecords(status);
  }
  function drawRecords(status) {
    const box = $('[data-list]', el); if (!box) return;
    if (!recs.length) { mount(box, emptyState({ art: status ? 'receipt' : 'chart', title: status ? 'No pending payments' : f.q || f.kind ? 'Nothing matches' : 'No records yet', text: status ? 'Record an invoice you are waiting to be paid, and track it here until it arrives.' : f.q || f.kind ? 'Try a different search.' : 'Record a client payment or a business cost to get started.', action: html`<button class="btn btn-primary" type="button" data-add="${status ? 'pending' : 'income'}">${icon('plus')} ${status ? 'Add pending payment' : 'Add income'}</button>` })); return; }
    mount(box, html`<div class="list">${recs.map((r) => recRow(r, { pendingActions: status === 'pending' }))}</div>${pag && pag.page < pag.pages ? html`<div class="load-more"><button class="btn" type="button" data-more>Load more</button></div>` : ''}`);
  }
  function recordsShell(status) {
    mount(body, html`${status ? '' : html`<div class="toolbar"><div class="search">${icon('search')}<input class="input" type="search" placeholder="Search description, client or project" data-q maxlength="80" aria-label="Search records" value="${f.q}"></div>
      <div class="seg" data-kind style="max-width:420px">${[['', 'All'], ['income', 'Income'], ['expense', 'Expenses']].map(([k, l]) => html`<button type="button" data-k="${k}" aria-pressed="${f.kind === k}">${l}</button>`)}</div></div>`}<div class="card tx-card" data-list></div>`);
    loadRecords(true, status);
  }

  async function show() {
    drawTabs(); destroyAll(charts);
    if (tab === 'overview') { mount(body, html`<div class="skeleton" style="height:140px;border-radius:22px"></div>`); await loadSummary(); drawTabs(); await overview(); }
    else { if (!S) { await loadSummary(); drawTabs(); } recordsShell(tab === 'pending' ? 'pending' : ''); }
  }

  const search = debounce((v) => { f.q = v.trim(); loadRecords(true, ''); }, 300);
  const open = (id) => openCodingForm({ record: byId.get(id), onSaved: refresh });
  const off = [
    delegate(el, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; history.replaceState(null, '', `#/coding?tab=${tab}`); show(); }),
    delegate(el, 'click', '[data-r]', async (e, b) => { range = mem.range = b.dataset.r; await loadSummary(); drawTabs(); await overview(); }),
    delegate(el, 'click', '[data-p]', async (e, b) => { period = mem.period = b.dataset.p; await overview(); }),
    delegate(el, 'click', '[data-add]', (e, b) => { const k = b.dataset.add; if (k === 'pending') { openCodingForm({ kind: 'income', onSaved: refresh }); } else openCodingForm({ kind: k, onSaved: refresh }); }),
    delegate(el, 'click', '[data-recv]', (e, b) => { e.stopPropagation(); const r = byId.get(b.dataset.recv); openReceiveForm({ title: 'Mark payment received', amount: r.amount, path: `/coding/records/${r.id}/receive`, onSaved: refresh }); }),
    delegate(el, 'click', '[data-rec]', (e, r) => { if (!e.target.closest('[data-recv]')) open(r.dataset.rec); }),
    delegate(el, 'keydown', '[data-rec]', (e, r) => { if (e.key === 'Enter') open(r.dataset.rec); }),
    delegate(el, 'click', '[data-k]', (e, b) => { f.kind = b.dataset.k; $$('[data-k]', el).forEach((x) => x.setAttribute('aria-pressed', x === b)); loadRecords(true, ''); }),
    delegate(el, 'click', '[data-more]', (e, b) => { b.classList.add('is-loading'); loadRecords(false, tab === 'pending' ? 'pending' : ''); }),
    delegate(el, 'input', '[data-q]', (e, i) => search(i.value)),
  ];
  const onTheme = () => tab === 'overview' && S && overview();
  window.addEventListener('gm:theme', onTheme);
  await show();
  void state; void dateFull;
  return () => { off.forEach((x) => x()); search.cancel(); window.removeEventListener('gm:theme', onTheme); destroyAll(charts); seq++; };
}
