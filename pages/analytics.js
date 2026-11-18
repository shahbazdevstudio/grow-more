import { $, $$, html, icon, mount, delegate } from '../js/core/dom.js';
import { api } from '../js/core/api.js';
import { state, reloadAccounts, categoryById } from '../js/core/state.js';
import { money, dateShort, dateFull, monthLabel, weekday } from '../js/core/format.js';
import { createChart, destroyAll, gridScale, xScale, palette, loadChartLib } from '../components/charts.js';
import { emptyState } from '../components/emptyState.js';
import { toast } from '../components/toast.js';
import { tabsBar } from '../components/businessUi.js';

const RANGES = [['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['this_month', 'This month'], ['last_month', 'Previous month'], ['custom', 'Custom']];
const SERIES = ['#E8B04A', '#52DDA0', '#86B7FF', '#A78BFA', '#F472B6', '#FB7185', '#22D3EE', '#94A3B8'];

const bucketLabel = (g, k) => (g === 'day' ? `${weekday(k)} ${dateShort(k)}` : g === 'week' ? `Week of ${dateShort(k)}` : monthLabel(k));
const shortLabel = (g, k) => (g === 'day' ? dateShort(k) : g === 'week' ? dateShort(k) : monthLabel(k));
const compact = (v) => money(v, { compact: true });

export default async function analytics(el) {
  await reloadAccounts();
  const charts = [];
  let view = 'overview'; let scope = 'all'; let range = '30d'; let from = ''; let to = ''; let gran = 'day'; let data = null; let insightsData = null; let seq = 0;

  mount(el, html`<div class="page-head"><div><h2>Analytics</h2><p data-sub>Loading…</p></div></div>
    <div data-views></div>
    <div class="range-bar"><div class="seg" data-scope role="group" aria-label="Money type" style="max-width:340px">${[['all', 'All'], ['personal', 'Personal'], ['business', 'Business']].map(([k, l]) => html`<button type="button" data-sc="${k}" aria-pressed="${k === scope}">${l}</button>`)}</div><div class="chips" data-ranges role="group" aria-label="Date range">${RANGES.map(([k, l]) => html`<button class="chip" type="button" data-r="${k}" aria-pressed="${k === range}">${l}</button>`)}</div>
      <div class="custom-range" data-custom hidden><div class="field"><label for="c-from">From</label><input class="input" type="date" id="c-from"></div><div class="field"><label for="c-to">To</label><input class="input" type="date" id="c-to"></div><button class="btn btn-primary" type="button" data-apply>Apply</button></div></div>
    <div data-body></div>`);
  const body = $('[data-body]', el);

  const delta = (pct) => (pct == null ? '' : html`<span class="delta ${pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat'}">${icon(pct > 0 ? 'trending-up' : 'trending-down', 'i-sm')} ${Math.round(Math.abs(pct))}% vs prior</span>`);

  function summaryHtml(s) {
    const tile = (label, val, sub, cls = '') => html`<div class="stat glass"><div class="stat-top">${label}</div><div><div class="stat-val ${cls}">${val}</div><div class="stat-sub">${sub}</div></div></div>`;
    return html`<div class="stats" style="margin-bottom:16px">
      ${tile('Income', money(s.income), `${s.count} transactions`, 'pos')}
      ${tile('Expenses', money(s.expense), delta(s.expenseChangePct) || 'No previous data')}
      ${tile('Net', money(s.net, { sign: true }), s.savingsRate == null ? 'No income in range' : `${s.savingsRate}% of income kept`, s.net < 0 ? 'neg' : 'pos')}
      ${tile('Avg per day', money(s.avgDailyExpense), `over ${s.days} day${s.days === 1 ? '' : 's'}`)}
      ${tile('Top category', s.topCategory ? s.topCategory.name : '—', s.topCategory ? `${money(s.topCategory.amount)} · ${s.topCategory.pct}%` : 'No expenses')}</div>`;
  }

  async function draw() {
    destroyAll(charts);
    const { summary: s, categories, accounts } = data;
    $('[data-sub]', el).textContent = `${dateFull(s.from)} – ${dateFull(s.to)}`;
    const noData = s.count === 0 && !accounts.items.length;
    if (noData) { mount(body, html`<div class="card">${emptyState({ art: 'chart', title: 'Nothing to chart yet', text: 'Add accounts and record a few transactions. These charts are built only from your real data.' })}</div>`); return; }
    const flowG = s.days <= 31 ? 'day' : s.days <= 180 ? 'week' : 'month';
    const flow = data[flowG === 'day' ? 'daily' : flowG === 'week' ? 'weekly' : 'monthly'];
    mount(body, html`${summaryHtml(s)}<div class="grid">
      <div class="card col-8"><div class="card-head"><h3 class="card-title">Spending over time</h3><div class="seg" data-gran role="group" aria-label="Group by">${[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']].map(([k, l]) => html`<button type="button" data-g="${k}" aria-pressed="${k === gran}">${l}</button>`)}</div></div>
        <div class="chart-box"><canvas id="ch-spend" role="img" aria-label="Expenses over time"></canvas></div><p class="hint" data-trunc hidden style="margin-top:8px">Showing the latest 120 days of this range.</p></div>
      <div class="card col-4"><div class="card-head"><h3 class="card-title">By category</h3></div>${categories.items.length ? html`<div class="chart-box donut"><canvas id="ch-cat" role="img" aria-label="Expenses by category"></canvas></div>
        <div class="legend">${categories.items.slice(0, 6).map((c, i) => html`<div class="lg" style="--c:${c.color || SERIES[i]}"><i class="sw"></i><span class="row-main truncate">${c.name}</span><span class="money small">${money(c.amount)}</span><span class="muted small" style="width:44px;text-align:right">${c.pct}%</span></div>`)}</div>` : emptyState({ art: 'chart', title: 'No expenses', text: 'No spending in this range.' })}</div>
      <div class="card col-8"><div class="card-head"><h3 class="card-title">Income vs expenses</h3><span class="pill">${flowG === 'day' ? 'Daily' : flowG === 'week' ? 'Weekly' : 'Monthly'}</span></div><div class="chart-box"><canvas id="ch-flow" role="img" aria-label="Income versus expenses"></canvas></div></div>
      <div class="card col-4"><div class="card-head"><h3 class="card-title">Where your money is</h3></div>${accounts.items.length ? html`<div class="chart-box donut"><canvas id="ch-acc" role="img" aria-label="Balance by account"></canvas></div>
        <div class="legend">${accounts.items.map((a, i) => html`<div class="lg" style="--c:${a.color || SERIES[i]}"><i class="sw"></i><span class="row-main truncate">${a.name}</span><span class="money small">${money(a.balance)}</span><span class="muted small" style="width:44px;text-align:right">${a.pct}%</span></div>`)}</div>` : emptyState({ art: 'wallet', title: 'No balances', text: 'Accounts with a positive balance appear here.' })}</div>
      <div class="card col-12" data-savings></div></div>`);
    await loadChartLib();
    await drawSpend();
    const p = palette();
    const gl = (k) => shortLabel(flowG, k);
    if ($('#ch-flow', el)) await createChart($('#ch-flow', el), { type: 'bar', data: { labels: flow.buckets.map((b) => gl(b.key)), datasets: [{ label: 'Income', data: flow.buckets.map((b) => b.income), backgroundColor: p.pos, borderRadius: 6, maxBarThickness: 22 }, { label: 'Expenses', data: flow.buckets.map((b) => b.expense), backgroundColor: p.neg, borderRadius: 6, maxBarThickness: 22 }] },
      options: { scales: { x: xScale(), y: gridScale(compact) }, plugins: { legend: { display: true, labels: { usePointStyle: true, boxWidth: 8, color: p.text } }, tooltip: { callbacks: { title: (i) => bucketLabel(flowG, flow.buckets[i[0].dataIndex].key), label: (c) => ` ${c.dataset.label}: ${money(c.parsed.y)}` } } } } }, charts);
    if ($('#ch-cat', el)) await createChart($('#ch-cat', el), { type: 'doughnut', data: { labels: categories.items.map((c) => c.name), datasets: [{ data: categories.items.map((c) => c.amount), backgroundColor: categories.items.map((c, i) => c.color || SERIES[i % SERIES.length]), borderColor: p.surface, borderWidth: 3, hoverOffset: 6 }] }, options: { cutout: '70%', plugins: { tooltip: { callbacks: { label: (c) => ` ${c.label}: ${money(c.parsed)}` } } } } }, charts);
    if ($('#ch-acc', el)) await createChart($('#ch-acc', el), { type: 'doughnut', data: { labels: accounts.items.map((a) => a.name), datasets: [{ data: accounts.items.map((a) => a.balance), backgroundColor: accounts.items.map((a, i) => a.color || SERIES[i % SERIES.length]), borderColor: p.surface, borderWidth: 3, hoverOffset: 6 }] }, options: { cutout: '70%', plugins: { tooltip: { callbacks: { label: (c) => ` ${c.label}: ${money(c.parsed)}` } } } } }, charts);
    drawSavings();
  }

  async function drawSpend() {
    const old = charts.find((c) => c.canvas && c.canvas.id === 'ch-spend'); if (old) { old.destroy(); charts.splice(charts.indexOf(old), 1); }
    const ser = data[gran === 'day' ? 'daily' : gran === 'week' ? 'weekly' : 'monthly'];
    $('[data-trunc]', el).hidden = !ser.truncated;
    const p = palette();
    await createChart($('#ch-spend', el), { type: 'bar', data: { labels: ser.buckets.map((b) => shortLabel(gran, b.key)), datasets: [{ label: 'Expenses', data: ser.buckets.map((b) => b.expense), backgroundColor: p.gold, borderRadius: 7, maxBarThickness: 30 }] },
      options: { scales: { x: xScale(), y: gridScale(compact) }, plugins: { tooltip: { displayColors: false, callbacks: { title: (i) => bucketLabel(gran, ser.buckets[i[0].dataIndex].key), label: (c) => `Spent ${money(c.parsed.y)}` } } } } }, charts);
  }

  async function drawSavings() {
    const box = $('[data-savings]', el); if (!box) return;
    try {
      const sv = await api.get('/savings');
      mount(box, html`<div class="card-head"><h3 class="card-title">Savings progress</h3><a class="btn btn-sm btn-ghost" href="#/savings">Open savings ${icon('chevron-right', 'i-sm')}</a></div>
        ${sv.goals.length || sv.totalSavings ? html`<div class="row-flex" style="flex-wrap:wrap;gap:20px;align-items:flex-start"><div><div class="eyebrow">Total saved</div><div class="money" style="font-size:30px;font-weight:800">${money(sv.totalSavings)}</div><div class="small muted">${money(sv.month.net, { sign: true })} net this month</div></div>
          <div style="flex:1;min-width:240px;display:grid;gap:14px">${sv.goals.length ? sv.goals.slice(0, 4).map((g) => html`<div><div class="budget-top"><span>${g.title}</span><span class="small muted">${money(g.current)} / ${money(g.targetAmount)} · ${g.pct}%</span></div><div class="progress" data-status="${g.reached ? 'done' : ''}" style="margin-top:6px"><i style="--w:${g.pct}%"></i></div></div>`) : html`<p class="muted">Create a savings goal to track your progress towards it.</p>`}</div></div>` : emptyState({ art: 'piggy', title: 'No savings yet', text: 'Create a savings account and move money into it to see progress here.' })}`);
    } catch (e) { mount(box, html`<p class="muted">Could not load savings progress.</p>`); }
  }

  const drawViews = () => mount($('[data-views]', el), tabsBar([['overview', 'Overview'], ['insights', 'Insights']], view));
  drawViews();

  async function drawInsights(d) {
    destroyAll(charts);
    const { netWorth, monthly, weekday, topExpenses, forecast: f } = d; const p = palette();
    $('[data-sub]', el).textContent = `${dateFull(d.range.from)} – ${dateFull(d.range.to)}`;
    const maxAvg = Math.max(...weekday.map((w) => w.avg));
    const meterMax = Math.max(f.monthlyLimit || 0, f.projected, 1);
    mount(body, html`<div class="grid">
      <div class="card col-8"><div class="card-head"><h3 class="card-title">Net worth</h3><span class="pill ${netWorth.change >= 0 ? 'income' : 'expense'}">${money(netWorth.change, { sign: true })} in 12 months</span></div><div class="row-flex" style="align-items:baseline;margin:-6px 0 6px;flex-wrap:wrap"><span class="money ${netWorth.current.total < 0 ? 'neg' : ''}" style="font-size:28px;font-weight:800">${money(netWorth.current.total)}</span><span class="muted small">accounts ${money(netWorth.current.balance)} + investments ${money(netWorth.current.investments)} (at cost)</span></div><div class="chart-box"><canvas id="ch-nw" role="img" aria-label="Net worth over 12 months"></canvas></div></div>
      <div class="card col-4"><div class="card-head"><h3 class="card-title">This month’s forecast</h3></div>
        <div class="money" style="font-size:28px;font-weight:800">${money(f.projected)}</div><div class="muted small">projected personal spending by month end</div>
        <div class="forecast-meter" role="img" aria-label="Spent so far versus projected"><i style="width:${Math.min(100, (f.projected / meterMax) * 100)}%;background:${f.status === 'over' ? 'var(--neg-soft)' : 'var(--gold-soft)'}"></i><i style="width:${Math.min(100, (f.spent / meterMax) * 100)}%;background:${f.status === 'over' ? 'var(--neg)' : 'var(--gold)'}"></i>${f.monthlyLimit ? html`<i style="left:${Math.min(100, (f.monthlyLimit / meterMax) * 100)}%;width:3px;border-radius:0;background:var(--text)"></i>` : ''}</div>
        <div class="row-flex small muted"><span>Spent ${money(f.spent)}</span><span class="spacer"></span><span>${money(f.dailyAverage)}/day · day ${f.daysElapsed} of ${f.daysInMonth}</span></div>
        ${f.status === 'unset' ? html`<div class="alert" style="background:var(--glass);color:var(--muted)">${icon('info', 'i-sm')}<span>Set a monthly limit in Settings to compare your pace with it.</span></div>` : html`<div class="alert ${f.status === 'over' ? 'exceeded' : f.status === 'close' ? 'warning' : 'done'}">${icon(f.status === 'ok' ? 'circle-check' : 'triangle-alert', 'i-sm')}<span>${f.status === 'over' ? `At this pace you will be ${money(f.difference)} over your ${money(f.monthlyLimit)} limit.` : f.status === 'close' ? `Close to your ${money(f.monthlyLimit)} limit at this pace.` : `On track — about ${money(-f.difference)} under your ${money(f.monthlyLimit)} limit.`}</span></div>`}</div>
      <div class="card col-8"><div class="card-head"><h3 class="card-title">Monthly cash flow &amp; savings rate</h3><span class="pill">${scope === 'all' ? 'Personal + business' : scope}</span></div><div class="chart-box tall"><canvas id="ch-mf" role="img" aria-label="Monthly income, expenses and savings rate"></canvas></div></div>
      <div class="card col-4"><div class="card-head"><h3 class="card-title">Spending by weekday</h3></div><div class="chart-box tall"><canvas id="ch-wd" role="img" aria-label="Average spending by weekday"></canvas></div><p class="hint" style="margin-top:8px">Average per ${'day'} in the selected range.</p></div>
      <div class="card col-12"><div class="card-head"><h3 class="card-title">Biggest expenses</h3></div>${topExpenses.length ? html`<div class="list">${topExpenses.map((t) => { const c = t.category ? categoryById(t.category) : null; return html`<div class="row"><span class="cico sm" style="--c:${c ? c.color : '#94A3B8'}">${icon(c ? c.icon : 'tag', 'i-sm')}</span><div class="row-main"><div class="row-title truncate">${t.title}</div><div class="row-sub">${c ? c.name : 'Uncategorised'} · ${dateShort(t.date)}${t.module ? ` · ${{ coding: 'Coding', daraz: 'Daraz' }[t.module]}` : ''}</div></div><b class="money neg">-${money(t.amount)}</b></div>`; })}</div>` : emptyState({ art: 'receipt', title: 'No expenses in this range', text: 'Try a wider date range.' })}</div></div>`);
    await loadChartLib();
    await createChart($('#ch-nw', el), { type: 'line', data: { labels: netWorth.series.map((x) => monthLabel(x.key).replace(/ \d{4}$/, '')), datasets: [{ label: 'Net worth', data: netWorth.series.map((x) => x.total), borderColor: p.gold, backgroundColor: `${p.gold}22`, fill: true, tension: 0.3, pointRadius: 3, pointBackgroundColor: p.gold, borderWidth: 2.5 }, { label: 'Accounts only', data: netWorth.series.map((x) => x.balance), borderColor: p.info, borderDash: [5, 5], fill: false, tension: 0.3, pointRadius: 0, borderWidth: 1.8 }] }, options: { scales: { x: { ...xScale(), ticks: { ...xScale().ticks, autoSkip: false, maxTicksLimit: 12, font: { size: 11 } } }, y: gridScale((v) => money(v, { compact: true })) }, plugins: { legend: { display: true, labels: { usePointStyle: true, boxWidth: 8, color: p.text } }, tooltip: { callbacks: { title: (i) => monthLabel(netWorth.series[i[0].dataIndex].key), label: (c) => ` ${c.dataset.label}: ${money(c.parsed.y)}` } } } } }, charts);
    await createChart($('#ch-mf', el), { data: { labels: monthly.map((m) => monthLabel(m.key).replace(/ \d{4}$/, '')), datasets: [{ type: 'bar', label: 'Income', data: monthly.map((m) => m.income), backgroundColor: p.pos, borderRadius: 5, maxBarThickness: 18, yAxisID: 'y' }, { type: 'bar', label: 'Expenses', data: monthly.map((m) => m.expense), backgroundColor: p.neg, borderRadius: 5, maxBarThickness: 18, yAxisID: 'y' }, { type: 'line', label: 'Savings rate %', data: monthly.map((m) => m.savingsRate), borderColor: p.info, backgroundColor: p.info, tension: 0.3, pointRadius: 3, borderWidth: 2, yAxisID: 'y2', spanGaps: true }] },
      options: { scales: { x: { ...xScale(), ticks: { ...xScale().ticks, autoSkip: false, maxTicksLimit: 12, font: { size: 11 } } }, y: gridScale((v) => money(v, { compact: true })), y2: { position: 'right', grid: { display: false }, border: { display: false }, ticks: { color: p.text, maxTicksLimit: 5, callback: (v) => `${v}%` } } }, plugins: { legend: { display: true, labels: { usePointStyle: true, boxWidth: 8, color: p.text } }, tooltip: { callbacks: { title: (i) => monthLabel(monthly[i[0].dataIndex].key), label: (c) => (c.dataset.yAxisID === 'y2' ? ` Savings rate: ${c.parsed.y == null ? '—' : `${c.parsed.y}%`}` : ` ${c.dataset.label}: ${money(c.parsed.y)}`) } } } } }, charts);
    await createChart($('#ch-wd', el), { type: 'bar', data: { labels: weekday.map((w) => w.label), datasets: [{ label: 'Average', data: weekday.map((w) => w.avg), backgroundColor: weekday.map((w) => (w.avg === maxAvg && maxAvg > 0 ? p.gold : `${p.gold}66`)), borderRadius: 7, maxBarThickness: 30 }] }, options: { scales: { x: xScale(), y: gridScale((v) => money(v, { compact: true })) }, plugins: { tooltip: { displayColors: false, callbacks: { label: (c) => `Avg ${money(c.parsed.y)} · total ${money(weekday[c.dataIndex].total)}` } } } } }, charts);
  }

  async function load() {
    const my = ++seq;
    if (view === 'insights') {
      try { const d = await api.get('/analytics/insights', { scope, range, from: range === 'custom' ? from : '', to: range === 'custom' ? to : '' }); if (my !== seq) return; data = null; await drawInsights(d); insightsData = d; } catch (e) { if (my === seq) toast(e.message, { type: 'error' }); }
      return;
    }
    try {
      const d = await api.get('/analytics', { scope, range, from: range === 'custom' ? from : '', to: range === 'custom' ? to : '' });
      if (my !== seq) return; data = d; await draw();
    } catch (e) { if (my === seq) { toast(e.message, { type: 'error' }); } }
  }

  const themeHandler = () => (view === 'insights' ? insightsData && drawInsights(insightsData) : data && draw());
  window.addEventListener('gm:theme', themeHandler);
  const off = [
    delegate(el, 'click', '[data-r]', (e, b) => { range = b.dataset.r; $$('[data-r]', el).forEach((x) => x.setAttribute('aria-pressed', x === b)); $('[data-custom]', el).hidden = range !== 'custom'; if (range !== 'custom') load(); }),
    delegate(el, 'click', '[data-apply]', () => { from = $('#c-from', el).value; to = $('#c-to', el).value; if (!from || !to) return toast('Choose both dates.', { type: 'error' }); if (from > to) return toast('The start date must be before the end date.', { type: 'error' }); load(); }),
    delegate(el, 'click', '[data-tab]', (e, b) => { view = b.dataset.tab; drawViews(); load(); }),
    delegate(el, 'click', '[data-sc]', (e, b) => { scope = b.dataset.sc; $$('[data-sc]', el).forEach((x) => x.setAttribute('aria-pressed', x === b)); load(); }),
    delegate(el, 'click', '[data-g]', async (e, b) => { gran = b.dataset.g; $$('[data-g]', el).forEach((x) => x.setAttribute('aria-pressed', x === b)); await drawSpend(); }),
  ];
  await load();
  void state;
  return () => { off.forEach((f) => f()); window.removeEventListener('gm:theme', themeHandler); destroyAll(charts); seq++; };
}
