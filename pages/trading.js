import { $, $$, html, icon, mount, delegate } from '../js/core/dom.js';
import { api } from '../js/core/api.js';
import { accountById, reloadAccounts } from '../js/core/state.js';
import { money, dateShort, monthLabel } from '../js/core/format.js';
import { emptyState } from '../components/emptyState.js';
import { toast } from '../components/toast.js';
import { createChart, destroyAll, gridScale, xScale, palette } from '../components/charts.js';
import { tabsBar, rangeChips, tile, signCls } from '../components/businessUi.js';
import { openAssetForm, openTradeForm, openPriceForm, ASSET_PRESETS, ASSET_TYPES, qty, price, plPct } from '../components/tradingForms.js';

const RANGES = [['all', 'All time'], ['this_month', 'This month'], ['last_month', 'Last month'], ['30d', 'Last 30 days']];
const PALETTE = ['#E8B04A', '#52DDA0', '#86B7FF', '#A78BFA', '#F472B6', '#FB7185', '#22D3EE', '#94A3B8'];
const mem = { range: 'all', asset: '', type: '' };

export default async function trading(el, { params, refresh }) {
  await reloadAccounts();
  const charts = []; let tab = ['portfolio', 'trades'].includes(params.tab) ? params.tab : 'portfolio';
  let range = mem.range; let S = null; let assets = []; let archived = []; let seq = 0; const tmap = new Map(); let list = { items: [], pag: null };
  mount(el, html`<div class="page-head"><p>Crypto and investments, tracked by hand — no live prices, no automatic trading.</p><div class="page-actions"><button class="btn btn-primary" type="button" data-trade="buy">${icon('plus')} Record buy</button><button class="btn" type="button" data-trade="sell">${icon('arrow-down-to-line', 'i-sm')} Record sell</button></div></div><div data-tabs></div><div data-body></div>`);
  const body = $('[data-body]', el);
  const drawTabs = () => mount($('[data-tabs]', el), tabsBar([['portfolio', 'Portfolio'], ['trades', 'Trades']], tab));
  const load = async () => { const [a, b, s] = await Promise.all([api.get('/trading/assets'), api.get('/trading/assets', { archived: 'true' }), api.get('/trading/summary', { range })]); assets = a.assets; archived = b.assets; S = s; };

  function card(a) {
    const s = a.stats; const sym = a.symbol || a.name.slice(0, 3).toUpperCase();
    return html`<div class="asset"><div class="asset-top"><span class="coin">${sym.slice(0, 4)}</span><div class="row-main"><div class="prod-name truncate">${a.name}</div><div class="row-sub">${ASSET_TYPES[a.type]}${a.notes ? ` · ${a.notes}` : ''}</div></div><button class="icon-btn sm" type="button" data-editasset="${a.id}" aria-label="Edit ${a.name}">${icon('pencil', 'i-sm')}</button></div>
      <div class="prod-kv"><div><small>Held</small><b>${qty(s.qty)}</b></div><div><small>Avg buy</small><b>${s.qty > 0 ? price(s.avgPrice) : '—'}</b></div><div><small>Price</small><b>${s.currentPrice != null ? price(s.currentPrice) : 'Not set'}</b></div></div>
      <div class="row-flex"><div class="row-main"><div class="small muted">Value</div><div class="money" style="font-size:20px">${money(s.valueOrCost)}${s.value == null && s.qty > 0 ? html` <span class="pill warn">at cost</span>` : ''}</div></div>
        <div style="text-align:right"><div class="small muted">Unrealised</div>${s.unrealized != null ? html`<div class="money ${signCls(s.unrealized)}">${money(s.unrealized, { sign: true })} <span class="small">${plPct(s.unrealizedPct)}</span></div>` : html`<div class="muted small">Set a price</div>`}</div></div>
      <div class="row-flex small muted"><span>Realised <b class="money ${signCls(s.realized)}">${money(s.realized, { sign: true })}</b></span><span class="spacer"></span><span>${a.tradeCount} trade${a.tradeCount === 1 ? '' : 's'}</span></div>
      <div class="prod-actions"><button class="btn btn-sm" type="button" data-price="${a.id}">Update price</button><button class="btn btn-sm" type="button" data-buy="${a.id}">Buy</button><button class="btn btn-sm btn-primary" type="button" data-sell="${a.id}" ${s.qty <= 0 ? 'disabled' : ''}>Sell</button></div></div>`;
  }

  async function portfolio() {
    destroyAll(charts);
    if (!assets.length) { mount(body, html`<div class="card">${emptyState({ art: 'chart', title: 'Track your first investment', text: 'Add an asset such as Bitcoin, then record what you bought and sold. Profit, return and portfolio value are calculated for you.', action: html`<div class="preset-row" style="justify-content:center">${ASSET_PRESETS.map((p, i) => html`<button class="btn btn-sm" type="button" data-preset="${i}">${icon('plus', 'i-sm')} ${p.name}</button>`)}<button class="btn btn-sm btn-primary" type="button" data-addasset>Other asset</button></div>` })}</div>`); return; }
    const s = S; const pf = s.portfolio;
    mount(body, html`${rangeChips(RANGES, range)}
      <div class="stats" style="margin:14px 0 16px">
        ${tile({ label: 'Portfolio value', value: money(pf.value), sub: `Cost ${money(pf.costBasis)}${pf.unpriced ? ` · ${pf.unpriced} unpriced` : ''}`, ico: 'chart-line', color: '#A78BFA' })}
        ${tile({ label: 'Unrealised P/L', value: pf.unpriced === pf.holdings && pf.holdings ? '—' : money(pf.unrealized, { sign: true }), sub: pf.unrealizedPct == null ? 'Set prices to see this' : plPct(pf.unrealizedPct), cls: signCls(pf.unrealized), ico: 'trending-up', color: '#52DDA0' })}
        ${tile({ label: 'Realised P/L', value: money(s.realized, { sign: true }), sub: `${s.trades} sale${s.trades === 1 ? '' : 's'} in range`, cls: signCls(s.realized), ico: 'badge-dollar-sign', color: '#E8B04A' })}
        ${tile({ label: 'Fees paid', value: money(s.fees), sub: 'Buy + sell fees', ico: 'receipt', color: '#FF8585' })}
        ${tile({ label: 'Win rate', value: s.winRate == null ? '—' : `${s.winRate}%`, sub: s.trades ? `${s.wins} won · ${s.losses} lost` : 'No sales yet', ico: 'target', color: '#86B7FF' })}</div>
      <div class="grid">
        <div class="card col-4"><div class="card-head"><h3 class="card-title">Allocation</h3></div>${s.allocation.length ? html`<div class="chart-box donut"><canvas id="ch-alloc" role="img" aria-label="Portfolio allocation"></canvas></div><div class="alloc-legend legend">${s.allocation.map((x, i) => html`<div class="lg" style="--c:${PALETTE[i % PALETTE.length]}"><i class="sw"></i><span class="row-main truncate">${x.name}</span><span class="money small">${money(x.value)}</span><span class="muted small" style="width:46px;text-align:right">${x.pct}%</span></div>`)}</div>` : html`<p class="muted">You do not hold anything right now.</p>`}</div>
        <div class="card col-8"><div class="card-head"><h3 class="card-title">Realised profit by month</h3>${s.bestAsset ? html`<span class="pill gold">Best: ${s.bestAsset.name}</span>` : ''}</div><div class="chart-box"><canvas id="ch-pl" role="img" aria-label="Realised profit and loss by month"></canvas></div></div>
        <div class="col-12"><div class="card-head" style="margin:6px 4px 12px"><h3 class="card-title">Holdings &amp; assets</h3><button class="btn btn-sm" type="button" data-addasset>${icon('plus', 'i-sm')} Add asset</button></div><div class="prod-grid">${assets.map(card)}</div></div>
        ${archived.length ? html`<div class="col-12"><h3 class="card-title" style="margin:10px 4px 12px">Archived</h3><div class="card"><div class="list">${archived.map((a) => html`<div class="row"><span class="coin" style="width:38px;height:38px">${(a.symbol || a.name).slice(0, 3)}</span><div class="row-main"><div class="row-title">${a.name}</div><div class="row-sub">Realised ${money(a.stats.realized, { sign: true })}</div></div><button class="btn btn-sm" type="button" data-restoreasset="${a.id}">${icon('archive-restore', 'i-sm')} Restore</button></div>`)}</div></div></div>` : ''}
        <div class="col-12"><div class="card-flat row-flex">${icon('info', 'i-lg')}<div class="row-main"><div class="row-sub">Buys and sells move money in your accounts but are <b>not</b> counted as income or expenses — your profit is measured here. Prices are entered by you; Grow More never trades or fetches live prices.</div></div></div></div>
      </div>`);
    const p = palette();
    if ($('#ch-alloc', el)) await createChart($('#ch-alloc', el), { type: 'doughnut', data: { labels: s.allocation.map((x) => x.name), datasets: [{ data: s.allocation.map((x) => x.value), backgroundColor: s.allocation.map((x, i) => PALETTE[i % PALETTE.length]), borderColor: p.surface, borderWidth: 3, hoverOffset: 6 }] }, options: { cutout: '70%', plugins: { tooltip: { callbacks: { label: (c) => ` ${c.label}: ${money(c.parsed)}` } } } } }, charts);
    await createChart($('#ch-pl', el), { type: 'bar', data: { labels: s.realizedByMonth.map((b) => monthLabel(b.key).replace(/ \d{4}$/, '')), datasets: [{ label: 'Realised P/L', data: s.realizedByMonth.map((b) => b.net), backgroundColor: s.realizedByMonth.map((b) => (b.net >= 0 ? p.pos : p.neg)), borderRadius: 6, maxBarThickness: 26 }] }, options: { scales: { x: { ...xScale(), ticks: { ...xScale().ticks, autoSkip: false, maxTicksLimit: 12, font: { size: 11 } } }, y: gridScale((v) => money(v, { compact: true })) }, plugins: { tooltip: { displayColors: false, callbacks: { title: (i) => monthLabel(s.realizedByMonth[i[0].dataIndex].key), label: (c) => money(c.parsed.y, { sign: true }) } } } } }, charts);
  }

  const skel = () => html`${[1, 2, 3, 4].map(() => html`<div class="skeleton" style="height:60px;margin:10px 0"></div>`)}`;
  const tradeRow = (t) => {
    const a = [...assets, ...archived].find((x) => x.id === t.asset) || { name: 'Removed asset' }; const acc = t.account ? accountById(t.account) : null; const sell = t.type === 'sell'; const c = t.calc;
    return html`<div class="row" data-tr="${t.id}" role="button" tabindex="0" style="cursor:pointer"><span class="cico" style="--c:${sell ? '#52DDA0' : '#F5B94A'}">${icon(sell ? 'arrow-down-to-line' : 'plus')}</span>
      <div class="row-main"><div class="row-title truncate">${sell ? 'Sold' : 'Bought'} ${qty(t.quantity)} ${a.symbol || a.name}</div><div class="row-sub truncate">@ ${price(t.price)} · ${dateShort(t.date)} · ${acc ? acc.name : 'No account'}${t.fee ? ` · fee ${money(t.fee)}` : ''}</div></div>
      <div class="row-amt"><div class="tx-amt ${sell ? 'pos' : 'neg'}">${sell ? '+' : '-'}${money(t.quantity * t.price)}</div>${sell && c.net != null ? html`<div class="small ${signCls(c.net)}" style="font-weight:700">${money(c.net, { sign: true })} ${c.returnPct != null ? `· ${plPct(c.returnPct)}` : ''}</div>` : ''}</div></div>`;
  };
  async function loadTrades(reset = true) {
    const my = ++seq; const box = $('[data-list]', el); if (reset) { list = { items: [], pag: null }; box && mount(box, skel()); }
    try { const page = reset ? 1 : list.pag.page + 1; const r = await api.get('/trading/trades', { asset: mem.asset, type: mem.type, page, limit: 25 }); if (my !== seq) return; list.items = reset ? r.items : list.items.concat(r.items); list.pag = r.pagination; list.items.forEach((x) => tmap.set(x.id, x)); } catch (e) { toast(e.message, { type: 'error' }); }
    const b = $('[data-list]', el); if (!b || my !== seq) return;
    if (!list.items.length) mount(b, emptyState({ art: 'receipt', title: 'No trades', text: 'Record a buy or sell to see it here.', action: html`<button class="btn btn-primary" type="button" data-trade="buy">${icon('plus')} Record buy</button>` }));
    else mount(b, html`<div class="list">${list.items.map(tradeRow)}</div>${list.pag.page < list.pag.pages ? html`<div class="load-more"><button class="btn" type="button" data-more>Load more</button></div>` : ''}`);
  }
  function trades() {
    mount(body, html`<div class="toolbar"><div class="tool-row"><select class="select" data-fasset aria-label="Asset" style="max-width:260px"><option value="">All assets</option>${[...assets, ...archived].map((a) => html`<option value="${a.id}" ${a.id === mem.asset ? 'selected' : ''}>${a.name}</option>`)}</select></div>
      <div class="chips">${[['', 'All'], ['buy', 'Buys'], ['sell', 'Sells']].map(([k, l]) => html`<button class="chip" type="button" data-ft="${k}" aria-pressed="${mem.type === k}">${l}</button>`)}</div></div><div class="card tx-card" data-list></div>`);
    loadTrades(true);
  }
  async function show() { drawTabs(); destroyAll(charts); mount(body, html`<div class="skeleton" style="height:150px;border-radius:22px"></div>`); await load(); drawTabs(); tab === 'portfolio' ? await portfolio() : trades(); }

  const off = [
    delegate(el, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; history.replaceState(null, '', `#/trading?tab=${tab}`); show(); }),
    delegate(el, 'click', '[data-r]', async (e, b) => { range = mem.range = b.dataset.r; S = await api.get('/trading/summary', { range }); await portfolio(); }),
    delegate(el, 'click', '[data-trade]', (e, b) => openTradeForm({ type: b.dataset.trade, onSaved: refresh })),
    delegate(el, 'click', '[data-buy]', (e, b) => openTradeForm({ type: 'buy', assetId: b.dataset.buy, onSaved: refresh })),
    delegate(el, 'click', '[data-sell]', (e, b) => openTradeForm({ type: 'sell', assetId: b.dataset.sell, onSaved: refresh })),
    delegate(el, 'click', '[data-price]', (e, b) => openPriceForm({ asset: assets.find((a) => a.id === b.dataset.price), onSaved: refresh })),
    delegate(el, 'click', '[data-addasset]', () => openAssetForm({ onSaved: refresh })),
    delegate(el, 'click', '[data-preset]', (e, b) => openAssetForm({ preset: ASSET_PRESETS[+b.dataset.preset], onSaved: refresh })),
    delegate(el, 'click', '[data-editasset]', (e, b) => {
      const a = assets.find((x) => x.id === b.dataset.editasset); openAssetForm({ asset: a, onSaved: refresh });
    }),
    delegate(el, 'click', '[data-restoreasset]', async (e, b) => { try { await api.post(`/trading/assets/${b.dataset.restoreasset}/restore`); toast('Asset restored'); refresh(); } catch (er) { toast(er.message, { type: 'error' }); } }),
    delegate(el, 'click', '[data-tr]', (e, r) => openTradeForm({ trade: tmap.get(r.dataset.tr), onSaved: refresh })),
    delegate(el, 'change', '[data-fasset]', (e, s) => { mem.asset = s.value; loadTrades(true); }),
    delegate(el, 'click', '[data-ft]', (e, b) => { mem.type = b.dataset.ft; $$('[data-ft]', el).forEach((x) => x.setAttribute('aria-pressed', x === b)); loadTrades(true); }),
    delegate(el, 'click', '[data-more]', async (e, b) => { b.classList.add('is-loading'); await loadTrades(false); }),
  ];
  const onTheme = () => tab === 'portfolio' && S && assets.length && portfolio();
  window.addEventListener('gm:theme', onTheme);
  await show();
  return () => { off.forEach((x) => x()); window.removeEventListener('gm:theme', onTheme); destroyAll(charts); seq++; };
}
