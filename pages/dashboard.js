import { html, icon, mount, delegate, raw } from '../js/core/dom.js';
import { api } from '../js/core/api.js';
import { state, reloadAccounts } from '../js/core/state.js';
import { money, weekday, monthLong, clamp } from '../js/core/format.js';
import { accountLogo, ACCOUNT_TYPES } from '../components/logo.js';
import { txRow } from '../components/transactionRow.js';
import { emptyState } from '../components/emptyState.js';
import { openTransactionForm, openAccountForm, openBudgetForm, ACCOUNT_PRESETS } from '../components/forms.js';
import { openTxDetail } from './transactions.js';
import { navigate } from '../js/core/router.js';

const statusText = { warning: 'Heads up — you are close to your limit.', exceeded: 'You have gone over your limit.' };

function stat({ label, ico, value, sub, color, cls = '', action }) {
  return html`<div class="stat glass" ${action ? raw(`data-go="${action}" role="button" tabindex="0" style="cursor:pointer"`) : ''}><div class="stat-top"><span class="cico sm" style="--c:${color}">${icon(ico, 'i-sm')}</span>${label}</div><div><div class="stat-val ${cls}">${value}</div><div class="stat-sub">${sub}</div></div></div>`;
}

function budgetCard(b) {
  const line = (title, o, extra) => o.limit == null ? '' : html`<div class="budget-line"><div class="budget-top"><span>${title}</span><span class="money small ${o.status === 'exceeded' ? 'neg' : ''}">${money(o.spent)} <span class="muted">/ ${money(o.limit)}</span></span></div>
    <div class="progress" data-status="${o.status}" role="progressbar" aria-valuenow="${Math.round(o.pct)}" aria-valuemin="0" aria-valuemax="100" aria-label="${title}"><i style="--w:${clamp(o.pct, 0, 100)}%"></i></div>
    <div class="row-flex small muted"><span>${o.remaining >= 0 ? `${money(o.remaining)} left` : `${money(-o.remaining)} over`}</span><span class="spacer"></span><span>${extra}</span></div></div>`;
  const none = b.daily.limit == null && b.monthly.limit == null && b.savings.target == null;
  const worst = [b.daily, b.monthly].find((x) => x.status === 'exceeded') || [b.daily, b.monthly].find((x) => x.status === 'warning');
  return html`<div class="card col-5 d-budget"><div class="card-head"><h3 class="card-title">Budget</h3><button class="btn btn-sm" type="button" data-budget>${icon('sliders-horizontal', 'i-sm')} ${none ? 'Set budget' : 'Edit'}</button></div>
    ${none ? html`<p class="muted">Set a daily or monthly limit and Grow More will track your personal spending against it, with a warning as you get close. Business costs (Coding, Daraz) are tracked in their own modules.</p>` : html`
      ${line('Today', b.daily, `${Math.round(b.daily.pct)}% used`)}
      ${line('This month', b.monthly, b.monthly.safeDailySpend != null ? `${money(b.monthly.safeDailySpend)}/day to stay on track` : '')}
      ${b.savings.target != null ? html`<div class="budget-line"><div class="budget-top"><span>Savings this month</span><span class="money small">${money(b.savings.saved)} <span class="muted">/ ${money(b.savings.target)}</span></span></div>
        <div class="progress" data-status="${b.savings.status}"><i style="--w:${b.savings.pct}%"></i></div></div>` : ''}
      ${worst ? html`<div class="alert ${worst.status}">${icon('triangle-alert', 'i-sm')}<span>${statusText[worst.status]}</span></div>` : ''}`}</div>`;
}

export default async function dashboard(el, { refresh }) {
  const [d] = await Promise.all([api.get('/dashboard'), reloadAccounts()]);
  const accounts = state.accounts;
  const t = d.totals;
  const bd = d.budget;
  const max = Math.max(...d.last7.map((x) => x.expense), 1);
  const rem = bd.daily;
  const remainingVal = rem.limit == null ? 'Not set' : rem.remaining >= 0 ? money(rem.remaining) : `-${money(-rem.remaining)}`;

  const hero = accounts.length ? html`<div class="card hero col-7">
      <div class="label-row"><span class="eyebrow">Total balance</span><span class="pill gold">${accounts.length} account${accounts.length === 1 ? '' : 's'}</span></div>
      <div class="hero-amount money ${t.totalBalance < 0 ? 'neg' : ''}">${money(t.totalBalance)}</div>
      <div class="hero-sub"><span>${monthLong(d.month.from)}:</span><span class="pos">${money(d.month.income, { sign: true })} in</span><span class="neg">${money(d.month.expense)} out</span></div>
      <div class="spark" aria-label="Spending over the last 7 days">${d.last7.map((x, i) => html`<div class="b ${i === 6 ? 'today' : ''}" title="${weekday(x.date)}: ${money(x.expense)}"><i style="height:${Math.max(4, (x.expense / max) * 100)}%;animation-delay:${i * 50}ms"></i><span>${i === 6 ? 'Today' : weekday(x.date)}</span></div>`)}</div></div>`
    : html`<div class="card hero col-12">${emptyState({ art: 'wallet', title: 'Welcome to Grow More', text: 'Start by adding the accounts you use every day — then record your first expense or income. Every number here is calculated from your real transactions.',
        action: html`<div class="preset-row" style="justify-content:center">${ACCOUNT_PRESETS.slice(0, 4).map((p, i) => html`<button class="btn btn-sm" type="button" data-preset="${i}">${icon('plus', 'i-sm')} ${p.name}</button>`)}<button class="btn btn-sm btn-primary" type="button" data-addacc>Custom account</button></div>` })}</div>`;

  mount(el, html`
    <div class="grid">
      ${hero}
      ${accounts.length ? budgetCard(bd) : ''}
      <div class="col-12 d-stats"><div class="stats">
        ${stat({ label: 'Income', ico: 'arrow-down-left', color: '#52DDA0', value: money(t.income), sub: 'This month', cls: 'pos' })}
        ${stat({ label: 'Expenses', ico: 'arrow-up-right', color: '#FF8585', value: money(t.expenses), sub: 'This month' })}
        ${stat({ label: 'Savings', ico: 'piggy-bank', color: '#E8B04A', value: money(t.savings), sub: 'In savings accounts', action: 'savings' })}
        ${stat({ label: 'Spent today', ico: 'receipt', color: '#86B7FF', value: money(t.todaySpent), sub: rem.limit == null ? 'Personal · no limit set' : `Personal · ${Math.round(rem.pct)}% of ${money(rem.limit)}` })}
        ${stat({ label: 'Coding income', ico: 'code', color: '#34D399', value: money(d.business.codingIncome), sub: 'This month', cls: d.business.codingIncome ? 'pos' : '', action: 'coding' })}
        ${stat({ label: 'Daraz balance', ico: 'store', color: '#F5B94A', value: money(d.business.daraz.balance, { sign: true }), sub: d.business.daraz.pendingCount ? `${money(d.business.daraz.pendingPayouts)} payout pending` : 'Received − spent', cls: d.business.daraz.balance < 0 ? 'neg' : d.business.daraz.balance > 0 ? 'pos' : '', action: 'daraz' })}
        ${stat({ label: 'Trading portfolio', ico: 'trending-up', color: '#A78BFA', value: money(d.portfolio.value), sub: !d.portfolio.holdings ? 'No holdings yet' : d.portfolio.unrealizedPct == null ? 'Set prices to see P/L' : `${money(d.portfolio.unrealized, { sign: true })} · ${d.portfolio.unrealizedPct > 0 ? '+' : ''}${d.portfolio.unrealizedPct}%`, cls: d.portfolio.unrealized < 0 ? 'neg' : d.portfolio.unrealized > 0 ? 'pos' : '', action: 'trading' })}
        ${stat({ label: 'Tasks', ico: 'list-todo', color: '#86B7FF', value: `${d.tasks.dueToday + d.tasks.overdue} due`, sub: d.tasks.overdue ? `${d.tasks.overdue} overdue · ${d.tasks.pending} pending` : `${d.tasks.pending} pending`, cls: d.tasks.overdue ? 'neg' : '', action: 'todo' })}
        ${stat({ label: 'Left today', ico: 'target', color: rem.status === 'exceeded' ? '#FF8585' : '#52DDA0', value: remainingVal, sub: rem.limit == null ? 'Set a daily budget' : rem.status === 'exceeded' ? 'Over your daily limit' : 'Daily budget remaining', cls: rem.status === 'exceeded' ? 'neg' : '' })}
      </div></div>
      ${accounts.length ? html`
      <div class="col-12 d-acc"><div class="card-head" style="margin:6px 4px 12px"><h3 class="card-title">Accounts</h3><a class="btn btn-sm btn-ghost" href="#/accounts">Manage ${icon('chevron-right', 'i-sm')}</a></div>
        <div class="acct-scroll">${accounts.map((a) => html`<a class="acct" style="--c:${a.color}" href="#/transactions?account=${a.id}"><div class="acct-top">${accountLogo(a)}<div class="row-main"><div class="acct-name truncate">${a.name}</div><div class="acct-type">${ACCOUNT_TYPES[a.type].label}</div></div></div><div class="acct-bal ${a.balance < 0 ? 'neg' : ''}">${money(a.balance)}</div></a>`)}</div></div>` : ''}
      <div class="col-12 d-recent"><div class="card"><div class="card-head"><h3 class="card-title">Recent activity</h3>${d.recent.length ? html`<a class="btn btn-sm btn-ghost" href="#/transactions">See all ${icon('chevron-right', 'i-sm')}</a>` : ''}</div>
        ${d.recent.length ? html`<div class="list">${d.recent.map((x) => txRow(x))}</div>` : emptyState({ art: 'receipt', title: 'No transactions yet', text: accounts.length ? 'Record your first expense or income to see it here.' : 'Add an account first, then record your first transaction.', action: accounts.length ? html`<button class="btn btn-primary" data-add type="button">${icon('plus')} Add transaction</button>` : '' })}</div></div>
    </div>`);

  const off = [
    delegate(el, 'click', '[data-tx]', (e, b) => openTxDetail(b.dataset.tx, { onChange: () => dashboardRefresh() })),
    delegate(el, 'click', '[data-budget]', () => openBudgetForm({ onSaved: dashboardRefresh })),
    delegate(el, 'click', '[data-add]', () => openTransactionForm({ onSaved: dashboardRefresh })),
    delegate(el, 'click', '[data-addacc]', () => openAccountForm({ onSaved: dashboardRefresh })),
    delegate(el, 'click', '[data-preset]', (e, b) => openAccountForm({ preset: ACCOUNT_PRESETS[+b.dataset.preset], onSaved: dashboardRefresh })),
    delegate(el, 'click', '[data-go]', (e, b) => navigate(b.dataset.go)),
  ];
  const dashboardRefresh = refresh;
  return () => off.forEach((f) => f());
}
