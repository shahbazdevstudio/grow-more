import { $, $$, html, icon, mount, delegate } from '../js/core/dom.js';
import { api } from '../js/core/api.js';
import { state, reloadAccounts, accountById, savingsAccounts } from '../js/core/state.js';
import { money, dateFull, dateShort, plural, monthLabel } from '../js/core/format.js';
import { accountLogo } from '../components/logo.js';
import { emptyState } from '../components/emptyState.js';
import { openTransactionForm, openAccountForm, openGoalForm, openBudgetForm } from '../components/forms.js';
import { confirmDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { txRow } from '../components/transactionRow.js';
import { openTxDetail } from './transactions.js';
import { createChart, destroyAll, gridScale, xScale, palette } from '../components/charts.js';
import { tabsBar, rangeChips, bars } from '../components/businessUi.js';

async function savingsOverview(el, { refresh }) {
  const [, s, b] = await Promise.all([reloadAccounts(), api.get('/savings'), api.get('/budget')]);
  const sav = savingsAccounts();
  const bal = new Map(s.accounts.map((a) => [a.id, a.balance]));
  const target = b.savings;

  const goalCard = (g) => html`<div class="card goal"><div class="goal-top"><span class="cico" style="--c:${g.reached ? '#52DDA0' : '#E8B04A'}">${icon(g.reached ? 'circle-check' : 'target')}</span>
      <div class="row-main"><div class="row-title">${g.title}</div><div class="row-sub">${g.account ? accountById(g.account)?.name || 'Savings account' : 'All savings accounts'}</div></div>
      <button class="icon-btn sm" type="button" data-editgoal="${g.id}" aria-label="Edit ${g.title}">${icon('pencil', 'i-sm')}</button><button class="icon-btn sm danger" type="button" data-delgoal="${g.id}" aria-label="Delete ${g.title}">${icon('trash-2', 'i-sm')}</button></div>
    <div><div class="row-flex" style="align-items:baseline"><span class="money" style="font-size:24px">${money(g.current)}</span><span class="muted small">of ${money(g.targetAmount)}</span><span class="spacer"></span><b>${g.pct}%</b></div>
      <div class="progress" data-status="${g.reached ? 'done' : ''}" style="margin-top:10px" role="progressbar" aria-valuenow="${g.pct}" aria-valuemin="0" aria-valuemax="100"><i style="--w:${g.pct}%"></i></div></div>
    <div class="goal-meta"><span>${g.reached ? 'Goal reached 🎉' : `${money(g.remaining)} to go`}</span>${sav.length ? html`<button class="btn btn-sm" type="button" data-contribute="${g.id}">${icon('plus', 'i-sm')} Add money</button>` : ''}${g.targetDate ? html`<span>${g.overdue ? 'Past ' : ''}${dateFull(g.targetDate)}${g.daysLeft > 0 ? ` · ${plural(g.daysLeft, 'day')} left` : ''}</span>` : ''}</div>
    ${g.monthlyNeeded && !g.reached ? html`<div class="hint">Save about <b>${money(Math.ceil(g.monthlyNeeded))}</b> a month to get there on time.</div>` : ''}</div>`;

  mount(el, html`
    <div class="page-head"><div><h2>Savings</h2><p>Money you set aside — moving it here is never counted as income or spending.</p></div>
      <div class="page-actions">${sav.length ? html`<button class="btn btn-primary" type="button" data-move>${icon('arrow-left-right', 'i-sm')} Move to savings</button>` : html`<button class="btn btn-primary" type="button" data-newsav>${icon('plus')} Create savings account</button>`}</div></div>
    ${!sav.length ? html`<div class="card">${emptyState({ art: 'piggy', title: 'Start saving', text: 'Create a savings account (for example "Savings" or a bank savings pocket), then move money into it from any other account.' , action: html`<button class="btn btn-primary" type="button" data-newsav>${icon('plus')} Create savings account</button>` })}</div>` : html`
    <div class="grid">
      <div class="card hero col-7"><div class="eyebrow">Total savings</div><div class="hero-amount money">${money(s.totalSavings)}</div>
        <div class="hero-sub"><span>This month:</span><span class="pos">${money(s.month.contributed, { sign: true })} moved in</span>${s.month.withdrawn ? html`<span class="neg">${money(s.month.withdrawn)} taken out</span>` : ''}</div></div>
      <div class="card col-5"><div class="card-head"><h3 class="card-title">Monthly target</h3><button class="btn btn-sm" type="button" data-target>${icon('sliders-horizontal', 'i-sm')} ${target.target == null ? 'Set' : 'Edit'}</button></div>
        ${target.target == null ? html`<p class="muted">Set a monthly savings target to track how much you move into savings.</p>` : html`<div class="row-flex" style="gap:18px"><div class="ring" style="--p:${target.pct}" data-status="${target.status}"><span>${Math.round(target.pct)}%</span></div><div><div class="money" style="font-size:22px">${money(target.saved)}</div><div class="muted small">of ${money(target.target)} this month</div>${target.status === 'done' ? html`<span class="pill income" style="margin-top:6px">Target reached</span>` : html`<div class="small muted" style="margin-top:4px">${money(target.target - target.saved)} to go</div>`}</div></div>`}</div>
      <div class="col-12"><div class="card-head" style="margin:6px 4px 12px"><h3 class="card-title">Savings accounts</h3></div><div class="acct-grid">${sav.map((a) => html`<a class="acct" style="--c:${a.color}" href="#/transactions?account=${a.id}"><div class="acct-top">${accountLogo(a)}<div class="row-main"><div class="acct-name truncate">${a.name}</div><div class="acct-type">Savings</div></div></div><div class="acct-bal">${money(bal.get(a.id) ?? a.balance)}</div></a>`)}</div></div>
      <div class="col-12"><div class="card-head" style="margin:6px 4px 12px"><h3 class="card-title">Goals</h3><button class="btn btn-sm" type="button" data-newgoal>${icon('plus', 'i-sm')} New goal</button></div>
        ${s.goals.length ? html`<div class="goals-grid">${s.goals.map(goalCard)}</div>` : html`<div class="card">${emptyState({ art: 'chart', title: 'No goals yet', text: 'Set a target, an optional date and watch your progress fill up.', action: html`<button class="btn btn-primary" type="button" data-newgoal>${icon('plus', 'i-sm')} Create goal</button>` })}</div>`}</div>
      <div class="col-12"><div class="card"><div class="card-head"><h3 class="card-title">Recent savings activity</h3></div>${s.recent.length ? html`<div class="list">${s.recent.map((t) => txRow(t))}</div>` : html`<p class="muted">Transfers to or from your savings accounts show up here.</p>`}</div></div>
    </div>`}`);

  const off = [
    delegate(el, 'click', '[data-move]', () => openTransactionForm({ type: 'transfer', preset: { toAccount: sav[0].id, title: 'Move to savings' }, onSaved: refresh })),
    delegate(el, 'click', '[data-contribute]', (e, bt) => { const g = s.goals.find((x) => x.id === bt.dataset.contribute); openTransactionForm({ type: 'transfer', preset: { toAccount: g.account || sav[0].id, title: `Saving for ${g.title}` }, onSaved: refresh }); }),
    delegate(el, 'click', '[data-newsav]', () => openAccountForm({ preset: { name: 'Savings', type: 'savings' }, onSaved: refresh })),
    delegate(el, 'click', '[data-newgoal]', () => openGoalForm({ onSaved: refresh })),
    delegate(el, 'click', '[data-editgoal]', (e, bt) => openGoalForm({ goal: s.goals.find((g) => g.id === bt.dataset.editgoal), onSaved: refresh })),
    delegate(el, 'click', '[data-target]', () => openBudgetForm({ onSaved: refresh })),
    delegate(el, 'click', '[data-tx]', (e, bt) => openTxDetail(bt.dataset.tx, { onChange: refresh })),
    delegate(el, 'click', '[data-delgoal]', async (e, bt) => {
      const g = s.goals.find((x) => x.id === bt.dataset.delgoal);
      if (!await confirmDialog({ title: 'Delete goal?', message: `"${g.title}" will be removed. Your savings balances are not affected.`, confirmText: 'Delete goal' })) return;
      try { await api.del(`/savings/goals/${g.id}`); toast('Goal deleted', { type: 'info' }); refresh(); } catch (err) { toast(err.message, { type: 'error' }); }
    }),
  ];
  void state;
  return () => off.forEach((f) => f());
}


/* ------------------------------------------------------------------ page with tabs */
const SRC_RANGES = [['this_month', 'This month'], ['30d', 'Last 30 days'], ['all', 'All time']];
const mem = { src: 'all', source: '' };

export default async function savingsPage(el, ctx) {
  const { params, refresh } = ctx;
  let tab = params.tab === 'history' ? 'history' : 'overview'; let cleanup = null; const charts = []; let seq = 0;
  mount(el, html`<div data-tabs></div><div data-pane></div>`);
  const pane = $('[data-pane]', el);
  const drawTabs = () => mount($('[data-tabs]', el), tabsBar([['overview', 'Overview'], ['history', 'History']], tab));

  async function extras(host) {
    const sv = savingsAccounts(); if (!sv.length) return;
    const wrap = document.createElement('div'); wrap.className = 'grid'; wrap.style.marginTop = '16px'; host.append(wrap);
    const [trend] = await Promise.all([api.get('/savings/trend')]);
    mount(wrap, html`<div class="card col-6" data-sources></div><div class="card col-6"><div class="card-head"><h3 class="card-title">Saved each month</h3><span class="pill">${money(trend.averageMonthly)} / month avg</span></div>
      <div class="chart-box"><canvas id="ch-sv" role="img" aria-label="Money saved per month"></canvas></div>
      <div class="row-flex small muted" style="margin-top:10px;flex-wrap:wrap"><span>Saved in 12 months: <b class="money">${money(trend.totalSaved)}</b></span><span class="spacer"></span><span>${trend.overallRate == null ? 'No income recorded' : `${trend.overallRate}% of income`}</span></div></div>`);
    const loadSources = async () => {
      const r = await api.get('/savings/sources', { range: mem.src }); const box = $('[data-sources]', wrap);
      mount(box, html`<div class="card-head"><h3 class="card-title">Where your savings come from</h3></div>${rangeChips(SRC_RANGES, mem.src)}
        <div style="margin-top:14px">${r.items.length ? html`${bars(r.items.map((i) => ({ label: `${i.source} · ${i.pct}%`, amount: i.amount })))}<div class="row-flex small muted" style="margin-top:14px"><span>Total moved in <b class="money pos">${money(r.total)}</b></span><span class="spacer"></span>${r.withdrawn ? html`<span>Taken out <b class="money neg">${money(r.withdrawn)}</b></span>` : ''}</div>` : html`<p class="muted">Add a <b>Source</b> (like “Daraz profit” or “Coding income”) when you move money to savings, and this shows where it came from.</p>`}</div>`);
    };
    wrap.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) { mem.src = b.dataset.r; loadSources(); } });
    await loadSources();
    const p = palette();
    await createChart($('#ch-sv', wrap), { type: 'bar', data: { labels: trend.buckets.map((b) => monthLabel(b.key).replace(/ \d{4}$/, '')), datasets: [{ label: 'Saved', data: trend.buckets.map((b) => b.saved), backgroundColor: p.gold, borderRadius: 6, maxBarThickness: 24 }, { label: 'Taken out', data: trend.buckets.map((b) => b.withdrawn), backgroundColor: p.neg, borderRadius: 6, maxBarThickness: 24 }] },
      options: { scales: { x: { ...xScale(), ticks: { ...xScale().ticks, autoSkip: false, maxTicksLimit: 12, font: { size: 11 } } }, y: gridScale((v) => money(v, { compact: true })) }, plugins: { legend: { display: true, labels: { usePointStyle: true, boxWidth: 8, color: p.text } }, tooltip: { callbacks: { title: (i) => monthLabel(trend.buckets[i[0].dataIndex].key), label: (c) => ` ${c.dataset.label}: ${money(c.parsed.y)}` } } } } }, charts);
  }

  async function history() {
    const my = ++seq; mount(pane, html`<div class="skeleton" style="height:60px;margin:10px 0"></div>`);
    const [src, h] = await Promise.all([api.get('/savings/sources', { range: 'all' }), api.get('/savings/history', { source: mem.source, limit: 50 })]);
    if (my !== seq) return;
    const names = [...src.items.map((i) => i.source)];
    const row = (t) => { const inn = t.direction === 'in'; const out = t.direction === 'out';
      return html`<div class="row" data-tx="${t.id}" role="button" tabindex="0" style="cursor:pointer"><span class="cico" style="--c:${inn ? '#52DDA0' : out ? '#FF8585' : '#86B7FF'}">${icon(inn ? 'piggy-bank' : out ? 'hand-coins' : 'arrow-left-right')}</span>
        <div class="row-main"><div class="row-title truncate">${t.title}</div><div class="row-sub truncate">${t.source || 'No source'} · ${accountById(t.account)?.name || '—'} → ${accountById(t.toAccount)?.name || '—'} · ${dateShort(t.date)}</div></div>
        <div class="row-amt"><div class="tx-amt ${inn ? 'pos' : out ? 'neg' : 'info'}">${inn ? '+' : out ? '-' : ''}${money(t.amount)}</div><span class="pill ${inn ? 'income' : out ? 'expense' : 'transfer'}">${inn ? 'Saved' : out ? 'Withdrawn' : 'Between savings'}</span></div></div>`; };
    mount(pane, html`<div class="page-head"><p>Every move into or out of your savings accounts.</p></div>
      ${names.length ? html`<div class="chips" style="margin-bottom:14px"><button class="chip" type="button" data-src="" aria-pressed="${!mem.source}">All</button>${names.map((n) => html`<button class="chip" type="button" data-src="${n}" aria-pressed="${mem.source === n}">${n}</button>`)}</div>` : ''}
      <div class="card tx-card">${h.items.length ? html`<div class="list">${h.items.map(row)}</div>${h.pagination.pages > 1 ? html`<p class="hint" style="padding:12px 6px 4px">Showing the latest ${h.items.length} of ${h.pagination.total}.</p>` : ''}` : emptyState({ art: 'piggy', title: 'No savings activity yet', text: 'Move money to a savings account and it will appear here.' })}</div>`);
  }

  async function show() {
    cleanup && cleanup(); cleanup = null; destroyAll(charts); drawTabs();
    if (tab === 'history') { await history(); return; }
    const holder = document.createElement('div'); pane.replaceChildren(holder);
    cleanup = await savingsOverview(holder, { refresh });
    try { await extras(holder); } catch (e) { toast(e.message, { type: 'error' }); }
  }
  const off = [
    delegate(el, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; history_(tab); show(); }),
    delegate(el, 'click', '[data-src]', async (e, b) => { mem.source = b.dataset.src; await history(); }),
    delegate(el, 'click', '[data-tx]', (e, r) => openTxDetail(r.dataset.tx, { onChange: refresh })),
  ];
  function history_(t) { window.history.replaceState(null, '', `#/savings?tab=${t}`); }
  const onTheme = () => tab === 'overview' && show();
  window.addEventListener('gm:theme', onTheme);
  await show(); void $$; void plural;
  return () => { off.forEach((x) => x()); cleanup && cleanup(); window.removeEventListener('gm:theme', onTheme); destroyAll(charts); seq++; };
}
