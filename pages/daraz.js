import { $, $$, html, icon, mount, delegate, debounce } from '../js/core/dom.js';
import { api } from '../js/core/api.js';
import { accountById, reloadAccounts } from '../js/core/state.js';
import { money, dateShort, dateFull } from '../js/core/format.js';
import { emptyState } from '../components/emptyState.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { tabsBar, rangeChips, tile, bars, signCls } from '../components/businessUi.js';
import { openProductForm, openMovementForm, openDarazExpenseForm, openReceiveForm, thumb, MOVE_LABEL, DARAZ_EXPENSE } from '../components/businessForms.js';

const RANGES = [['all', 'All time'], ['this_month', 'This month'], ['last_month', 'Last month'], ['30d', 'Last 30 days'], ['7d', '7 days']];
const TABS = ['overview', 'products', 'history', 'expenses'];
const MOVE_ICON = { purchase: ['package-plus', '#F5B94A'], sale: ['shopping-cart', '#52DDA0'], writeoff: ['package-minus', '#FF8585'], adjust_in: ['package-check', '#86B7FF'] };
const stockPill = (s) => (s.status === 'out' ? html`<span class="pill expense">Out of stock</span>` : s.status === 'low' ? html`<span class="pill warn">Low · ${s.stock}</span>` : html`<span class="pill income">${s.stock} in stock</span>`);

const mem = { range: 'all', hf: { product: '', type: '', payout: '' }, ef: { category: '', q: '' } };

export default async function daraz(el, { params, refresh }) {
  await reloadAccounts();
  let tab = TABS.includes(params.tab) ? params.tab : 'overview';
  let range = mem.range; let S = null; let products = []; let archived = []; let seq = 0;
  const pmap = new Map(); const mmap = new Map(); const emap = new Map();
  const hf = mem.hf; const ef = mem.ef; let psearch = '';

  mount(el, html`<div class="page-head"><p>Products, stock, business costs and real profit.</p><div class="page-actions"><button class="btn btn-primary" type="button" data-move="sale">${icon('shopping-cart', 'i-sm')} Record sale</button><button class="btn" type="button" data-move="purchase">${icon('package-plus', 'i-sm')} Buy stock</button></div></div><div data-tabs></div><div data-body></div>`);
  const body = $('[data-body]', el);
  const drawTabs = () => mount($('[data-tabs]', el), tabsBar([['overview', 'Overview'], ['products', 'Products', products.length || ''], ['history', 'Stock history'], ['expenses', 'Expenses']], tab));
  const loadProducts = async () => { const [a, b] = await Promise.all([api.get('/daraz/products'), api.get('/daraz/products', { archived: 'true' })]); products = a.products; archived = b.products; pmap.clear(); [...products, ...archived].forEach((p) => pmap.set(p.id, p)); };
  const loadSummary = async () => { S = await api.get('/daraz/summary', { range }); };
  const skel = (n = 4) => html`${Array.from({ length: n }, () => html`<div class="skeleton" style="height:60px;margin:10px 0"></div>`)}`;

  /* ---------------------------------- Overview ---------------------------------- */
  function overview() {
    const s = S; const ex = s.expenseBreakdown.filter((x) => x.key !== 'fees');
    const line = (label, val, cls = '', kind = '') => html`<div class="ln ${kind}"><span>${label}</span><span class="money ${cls}">${val}</span></div>`;
    mount(body, html`${rangeChips(RANGES, range)}
      <div class="stats" style="margin:14px 0 16px">
        ${tile({ label: 'Total investment', value: money(s.totalInvestment), sub: `Stock ${money(s.purchases)} + costs ${money(s.expenses)}`, ico: 'boxes', color: '#F5B94A' })}
        ${tile({ label: 'Revenue', value: money(s.revenue), sub: 'Sales (before costs)', cls: 'pos', ico: 'shopping-cart', color: '#52DDA0' })}
        ${tile({ label: 'Net profit', value: money(s.netProfit, { sign: true }), sub: s.marginPct == null ? 'No sales yet' : `${s.marginPct}% of revenue`, cls: signCls(s.netProfit), ico: 'badge-dollar-sign', color: '#E8B04A' })}
        ${tile({ label: 'Stock value', value: money(s.stock.value), sub: `${s.stock.units} unit${s.stock.units === 1 ? '' : 's'} · ${s.stock.products} product${s.stock.products === 1 ? '' : 's'}`, ico: 'warehouse', color: '#86B7FF' })}
        ${tile({ label: 'Business balance', value: money(s.balance.balance, { sign: true }), sub: `${money(s.balance.received)} in − ${money(s.balance.spent)} out`, cls: signCls(s.balance.balance), ico: 'wallet', color: '#A78BFA' })}</div>
      <div class="grid">
        <div class="card col-7"><div class="card-head"><h3 class="card-title">Profit &amp; loss</h3><span class="pill">${s.range.from ? `${dateShort(s.range.from)} – ${dateShort(s.range.to)}` : 'All time'}</span></div>
          <div class="pnl">${line('Revenue (sales)', money(s.revenue))}${line('Cost of goods sold', `-${money(s.cogs)}`, 'neg')}${line('Gross profit', money(s.grossProfit, { sign: true }), signCls(s.grossProfit), 'sum')}
            ${line('Business expenses', `-${money(s.expenses)}`, s.expenses ? 'neg' : '')}${ex.map((x) => line(x.label, money(x.amount), '', 'sub'))}
            ${s.platformFees ? line('Daraz fees & commission', `-${money(s.platformFees)}`, 'neg') : ''}${s.writeoffLoss ? line('Stock written off', `-${money(s.writeoffLoss)}`, 'neg') : ''}
            ${line('Net profit', money(s.netProfit, { sign: true }), signCls(s.netProfit), 'total')}</div>
          <p class="hint" style="margin-top:10px">Stock bought but not yet sold is not a cost here — it sits in “Stock value” until it sells. Cost is the weighted-average price you paid.</p></div>
        <div class="card col-5"><div class="card-head"><h3 class="card-title">Money</h3></div>
          <div class="kv-grid"><div><small>Total invested (all time)</small><b>${money(s.allTime.invested)}</b></div><div><small>Revenue (all time)</small><b class="pos">${money(s.allTime.revenue)}</b></div></div>
          ${s.allTime.recoveredPct != null ? html`<div style="margin-top:16px"><div class="budget-top"><span>Investment recovered</span><b>${s.allTime.recoveredPct}%</b></div><div class="progress" data-status="${s.allTime.recoveredPct >= 100 ? 'done' : ''}" style="margin-top:8px"><i style="--w:${s.allTime.recoveredPct}%"></i></div></div>` : ''}
          <div class="row-flex" style="margin-top:16px;padding:12px 14px;border-radius:14px;background:var(--glass)">${icon('hourglass', 'i-lg')}<div class="row-main"><div class="row-title">${money(s.balance.pendingPayouts)} awaiting payout</div><div class="row-sub">${s.balance.pendingCount} sale${s.balance.pendingCount === 1 ? '' : 's'} not yet received</div></div>${s.balance.pendingCount ? html`<button class="btn btn-sm" type="button" data-pending>View</button>` : ''}</div></div>
        <div class="card col-6"><div class="card-head"><h3 class="card-title">Stock alerts</h3></div>${s.stock.low.length ? html`<div class="stack" style="gap:10px">${s.stock.low.slice(0, 6).map((l) => html`<div class="alert-row ${l.status}">${icon('triangle-alert', 'i-sm')}<span class="row-main truncate">${l.name}</span><span>${l.status === 'out' ? 'Out of stock' : `${l.stock} left`}</span><button class="btn btn-sm" type="button" data-buy="${l.id}">Buy</button></div>`)}</div>` : html`<p class="muted">${s.stock.products ? 'Every product is above its low-stock level.' : 'Add products to track stock.'}</p>`}</div>
        <div class="card col-6"><div class="card-head"><h3 class="card-title">Best products</h3></div>${s.topProducts.length ? html`<div class="list">${s.topProducts.map((t) => html`<div class="row" style="padding:8px 2px">${thumb(pmap.get(t.id) || {}, 'sm')}<div class="row-main"><div class="row-title truncate">${t.name}</div><div class="row-sub">Revenue ${money(t.revenue)}</div></div><b class="money ${signCls(t.net)}">${money(t.net, { sign: true })}</b></div>`)}</div>` : html`<p class="muted">Profit by product shows up after your first sale.</p>`}</div>
        ${ex.length || s.platformFees ? html`<div class="card col-12"><div class="card-head"><h3 class="card-title">Where costs go</h3></div>${bars(s.expenseBreakdown, 'var(--neg)')}</div>` : ''}
      </div>`);
  }

  /* ---------------------------------- Products ---------------------------------- */
  function prodCard(p) {
    const s = p.stats;
    return html`<div class="prod" data-prod="${p.id}" role="button" tabindex="0"><div class="prod-top">${thumb(p)}<div class="row-main"><div class="prod-name truncate">${p.name}</div><div class="row-sub truncate">${[p.sku, p.category].filter(Boolean).join(' · ') || 'No SKU'}</div></div>${stockPill(s)}</div>
      <div class="prod-kv"><div><small>Avg cost</small><b>${money(s.avgCost)}</b></div><div><small>Price</small><b>${money(p.sellingPrice)}</b></div><div><small>Stock value</small><b>${money(s.stockValue)}</b></div></div>
      <div class="row-flex small muted"><span>${s.sold} sold</span><span class="spacer"></span><span>Profit <b class="money ${signCls(s.netProfit)}">${money(s.netProfit, { sign: true })}</b></span></div>
      <div class="prod-actions"><button class="btn btn-sm btn-primary" type="button" data-sell="${p.id}" ${s.stock <= 0 ? 'disabled' : ''}>Sell</button><button class="btn btn-sm" type="button" data-buy="${p.id}">Buy stock</button></div></div>`;
  }
  function products_() {
    const q = psearch.toLowerCase(); const list = products.filter((p) => !q || [p.name, p.sku, p.category, p.supplierName].join(' ').toLowerCase().includes(q));
    mount(body, html`<div class="toolbar"><div class="search">${icon('search')}<input class="input" type="search" placeholder="Search name, SKU, category or supplier" data-psearch maxlength="80" aria-label="Search products" value="${psearch}"></div><div class="tool-row"><button class="btn btn-primary" type="button" data-addprod>${icon('plus', 'i-sm')} Add product</button></div></div>
      ${list.length ? html`<div class="prod-grid" data-pgrid>${list.map(prodCard)}</div>` : html`<div class="card">${products.length ? emptyState({ art: 'search', title: 'No products match', text: 'Try a different search.' }) : emptyState({ art: 'wallet', title: 'Add your first product', text: 'Create the products you sell on Daraz, then record stock purchases and sales. Stock, cost and profit are calculated for you.', action: html`<button class="btn btn-primary" type="button" data-addprod>${icon('plus')} Add product</button>` })}</div>`}
      ${archived.length ? html`<h3 class="card-title" style="margin:26px 4px 12px">Archived</h3><div class="card"><div class="list">${archived.map((p) => html`<div class="row">${thumb(p, 'sm')}<div class="row-main"><div class="row-title">${p.name}</div><div class="row-sub">${p.stats.sold} sold · history kept</div></div><button class="btn btn-sm" type="button" data-restoreprod="${p.id}">${icon('archive-restore', 'i-sm')} Restore</button></div>`)}</div></div>` : ''}`);
  }
  async function openDetail(id) {
    let p, mv;
    try { [p, mv] = await Promise.all([api.get(`/daraz/products/${id}`).then((r) => r.product), api.get('/daraz/movements', { product: id, limit: 6 })]); } catch (e) { toast(e.message, { type: 'error' }); return; }
    const s = p.stats; const kv = (l, v, c = '') => html`<div><small>${l}</small><b class="${c}">${v}</b></div>`;
    const m = openModal({ title: p.name, size: 'wide', body: html`<div class="row-flex" style="gap:14px">${thumb(p, 'lg')}<div class="row-main"><div class="row-sub">${[p.sku && `SKU ${p.sku}`, p.category].filter(Boolean).join(' · ') || 'No SKU'}</div><div style="margin-top:6px">${stockPill(s)}</div>${p.supplierName ? html`<div class="row-sub" style="margin-top:6px">Supplier: ${p.supplierName}${p.supplierContact ? ` · ${p.supplierContact}` : ''}</div>` : ''}</div></div>
      <div class="kv-grid">${kv('In stock', s.stock)}${kv('Average cost', money(s.avgCost))}${kv('Stock value', money(s.stockValue))}${kv('Selling price', money(p.sellingPrice))}${kv('Units bought', s.purchased)}${kv('Units sold', s.sold)}${kv('Invested in stock', money(s.invested))}${kv('Revenue', money(s.revenue), 'pos')}${kv('Cost of goods sold', money(s.cogs))}${kv('Gross profit', money(s.grossProfit, { sign: true }), signCls(s.grossProfit))}${kv('Linked expenses', money(s.linkedExpenses))}${kv('Net profit', `${money(s.netProfit, { sign: true })}${s.marginPct != null ? ` · ${s.marginPct}%` : ''}`, signCls(s.netProfit))}</div>
      <div><div class="card-head" style="margin-bottom:6px"><h3 class="card-title" style="font-size:15px">Recent stock activity</h3></div>${mv.items.length ? html`<div class="list">${mv.items.map(mvRow)}</div>` : html`<p class="muted">No stock entries yet.</p>`}</div>`,
      footer: html`<button class="btn btn-ghost" type="button" data-archive style="color:var(--neg);flex:0 0 auto">${icon('archive', 'i-sm')} Archive</button><button class="btn" type="button" data-edit>${icon('pencil', 'i-sm')} Edit</button><button class="btn" type="button" data-writeoff>Write off</button><button class="btn btn-primary" type="button" data-dbuy>Buy stock</button>` });
    mv.items.forEach((x) => mmap.set(x.id, x));
    $('[data-edit]', m.el).addEventListener('click', () => { m.close(); openProductForm({ product: p, onSaved: refresh }); });
    $('[data-dbuy]', m.el).addEventListener('click', () => { m.close(); openMovementForm({ type: 'purchase', productId: p.id, onSaved: refresh }); });
    $('[data-writeoff]', m.el).addEventListener('click', () => { m.close(); openMovementForm({ type: 'writeoff', productId: p.id, onSaved: refresh }); });
    $('[data-archive]', m.el).addEventListener('click', async () => {
      try { const r = await api.del(`/daraz/products/${p.id}`); m.close(); toast(r.archived ? 'Product archived' : 'Product deleted', { type: 'info' }); refresh(); } catch (e) { toast(e.message, { type: 'error', duration: 7000 }); }
    });
    m.el.addEventListener('click', (e) => { const r = e.target.closest('[data-mv]'); if (r) { m.close(); openMovementForm({ movement: mmap.get(r.dataset.mv), onSaved: refresh }); } });
  }

  /* ---------------------------------- Stock history ---------------------------------- */
  function mvRow(m, { actions = false } = {}) {
    const p = pmap.get(m.product) || { name: 'Removed product' }; const [ic, color] = MOVE_ICON[m.type]; const acc = m.account ? accountById(m.account) : null; const c = m.calc || {};
    const total = m.type === 'purchase' ? m.quantity * m.unitCost : m.type === 'sale' ? m.quantity * m.unitPrice - (m.fees || 0) : 0;
    const unit = m.type === 'purchase' ? `× ${money(m.unitCost)}` : m.type === 'sale' ? `× ${money(m.unitPrice)}` : '';
    const pending = m.type === 'sale' && !m.account;
    const amt = m.type === 'purchase' ? html`<div class="tx-amt neg">-${money(total)}</div>` : m.type === 'sale' ? html`<div class="tx-amt pos">+${money(total)}</div>` : m.type === 'writeoff' ? html`<div class="tx-amt neg">-${money(c.loss || 0)}</div>` : html`<div class="tx-amt info">+${m.quantity}</div>`;
    const extra = m.type === 'sale' ? `Profit ${money((c.gross || 0) - (m.fees || 0), { sign: true })}` : m.type === 'purchase' ? (acc ? acc.name : 'Existing stock') : (m.reason || '');
    return html`<div class="row" data-mv="${m.id}" role="button" tabindex="0" style="cursor:pointer"><span class="cico" style="--c:${color}">${icon(ic)}</span>
      <div class="row-main"><div class="row-title truncate">${MOVE_LABEL[m.type]}: ${p.name}</div><div class="row-sub truncate">${m.quantity} ${unit} · ${dateShort(m.date)}${extra ? ` · ${extra}` : ''}${m.orderRef ? ` · #${m.orderRef}` : ''}${c.qtyAfter != null ? ` · ${c.qtyAfter} left` : ''}</div></div>
      <div class="row-amt">${amt}${pending ? html`<span class="pill warn">Payout pending</span>` : ''}</div>${actions && pending ? html`<button class="btn btn-sm btn-primary" type="button" data-payout="${m.id}">Received</button>` : ''}</div>`;
  }
  function paged({ path, params: pr, render, empty, getBox, store }) {
    let page = 1; let pag = null; let items = []; const my = () => seq;
    const draw = () => { const box = getBox(); if (!box) return; if (!items.length) return mount(box, empty()); mount(box, html`<div class="list">${items.map(render)}</div>${pag && pag.page < pag.pages ? html`<div class="load-more"><button class="btn" type="button" data-more>Load more</button></div>` : ''}`); };
    const load = async (reset = true) => {
      const s = ++seq; if (reset) { page = 1; items = []; const b = getBox(); if (b) mount(b, skel()); } else page += 1;
      try { const r = await api.get(path, { ...pr(), page, limit: 25 }); if (s !== seq) return; items = reset ? r.items : items.concat(r.items); pag = r.pagination; items.forEach((x) => store.set(x.id, x)); paged.summary = r.summary; } catch (e) { toast(e.message, { type: 'error' }); }
      if (s === seq) draw(); return my();
    };
    return { load };
  }
  let histList = null; let expList = null;
  function history() {
    mount(body, html`<div class="toolbar"><div class="tool-row"><select class="select" data-hprod aria-label="Product" style="max-width:260px"><option value="">All products</option>${[...products, ...archived].map((p) => html`<option value="${p.id}" ${p.id === hf.product ? 'selected' : ''}>${p.name}</option>`)}</select></div>
      <div class="chips" data-htype>${[['', 'All'], ['purchase', 'Purchases'], ['sale', 'Sales'], ['writeoff', 'Write-offs'], ['adjust_in', 'Added']].map(([k, l]) => html`<button class="chip" type="button" data-ht="${k}" aria-pressed="${hf.type === k && !hf.payout}">${l}</button>`)}<button class="chip" type="button" data-hpay aria-pressed="${!!hf.payout}">${icon('hourglass', 'i-sm')} Pending payouts</button></div></div><div class="card tx-card" data-list></div>`);
    histList = paged({ path: '/daraz/movements', store: mmap, params: () => ({ product: hf.product, type: hf.payout ? '' : hf.type, payout: hf.payout }), getBox: () => $('[data-list]', el), render: (m) => mvRow(m, { actions: true }), empty: () => emptyState({ art: 'receipt', title: hf.payout ? 'No pending payouts' : 'No stock entries', text: hf.payout ? 'Sales you have not yet been paid for appear here.' : 'Buy stock or record a sale to build your stock history.', action: html`<button class="btn btn-primary" type="button" data-move="${hf.payout ? 'sale' : 'purchase'}">${icon('plus')} ${hf.payout ? 'Record sale' : 'Buy stock'}</button>` }) });
    histList.load();
  }

  /* ---------------------------------- Expenses ---------------------------------- */
  function expRow(e) {
    const acc = e.account ? accountById(e.account) : null; const p = e.product ? pmap.get(e.product) : null;
    return html`<div class="row" data-exp="${e.id}" role="button" tabindex="0" style="cursor:pointer"><span class="cico" style="--c:#FB7185">${icon(e.category === 'shipping' ? 'truck' : e.category === 'flyer_bags' ? 'shopping-bag' : e.category === 'packaging' ? 'package' : 'receipt')}</span>
      <div class="row-main"><div class="row-title truncate">${e.title}</div><div class="row-sub truncate">${DARAZ_EXPENSE[e.category]}${p ? ` · ${p.name}` : ''} · ${acc ? acc.name : 'Not deducted'} · ${dateShort(e.date)}</div></div><div class="row-amt"><div class="tx-amt neg">-${money(e.amount)}</div></div></div>`;
  }
  function expenses() {
    mount(body, html`<div class="toolbar"><div class="search">${icon('search')}<input class="input" type="search" placeholder="Search expenses" data-eq maxlength="80" aria-label="Search expenses" value="${ef.q}"></div>
      <div class="chips">${[['', 'All'], ...Object.entries(DARAZ_EXPENSE)].map(([k, l]) => html`<button class="chip" type="button" data-ec="${k}" aria-pressed="${ef.category === k}">${l}</button>`)}<button class="chip active" type="button" data-addexp style="margin-left:auto">${icon('plus', 'i-sm')} Add expense</button></div></div><div class="sum-strip" data-esum style="grid-template-columns:1fr"></div><div class="card tx-card" data-list></div>`);
    expList = paged({ path: '/daraz/expenses', store: emap, params: () => ({ category: ef.category, q: ef.q }), getBox: () => $('[data-list]', el), render: expRow, empty: () => emptyState({ art: 'receipt', title: 'No expenses', text: 'Record flyer bags, packaging, shipping and other costs — they are deducted from the account you choose and counted in your profit.', action: html`<button class="btn btn-primary" type="button" data-addexp>${icon('plus')} Add expense</button>` }) });
    expList.load().then(() => { const b = $('[data-esum]', el); if (b && paged.summary) mount(b, html`<div><small>Total in this view</small><b class="neg">${money(paged.summary.total)}</b></div>`); });
  }

  async function show() {
    drawTabs(); const s = ++seq;
    if (tab === 'overview') { mount(body, html`<div class="skeleton" style="height:140px;border-radius:22px"></div>`); await Promise.all([loadSummary(), loadProducts()]); if (s !== seq) return; drawTabs(); overview(); }
    else { if (!pmap.size && !products.length) { await loadProducts(); drawTabs(); } ({ products: products_, history, expenses })[tab](); }
  }

  const psrch = debounce((v) => { psearch = v.trim(); products_(); $('[data-psearch]', el)?.focus(); }, 200);
  const esrch = debounce((v) => { ef.q = v.trim(); expList.load(); }, 300);
  const onSaved = refresh;
  const off = [
    delegate(el, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; window.history.replaceState(null, '', `#/daraz?tab=${tab}`); show(); }),
    delegate(el, 'click', '[data-r]', async (e, b) => { range = mem.range = b.dataset.r; await loadSummary(); overview(); }),
    delegate(el, 'click', '[data-move]', (e, b) => openMovementForm({ type: b.dataset.move, onSaved })),
    delegate(el, 'click', '[data-sell]', (e, b) => { e.stopPropagation(); openMovementForm({ type: 'sale', productId: b.dataset.sell, onSaved }); }),
    delegate(el, 'click', '[data-buy]', (e, b) => { e.stopPropagation(); openMovementForm({ type: 'purchase', productId: b.dataset.buy, onSaved }); }),
    delegate(el, 'click', '[data-addprod]', () => openProductForm({ onSaved })),
    delegate(el, 'click', '[data-prod]', (e, c) => { if (!e.target.closest('button')) openDetail(c.dataset.prod); }),
    delegate(el, 'keydown', '[data-prod]', (e, c) => { if (e.key === 'Enter') openDetail(c.dataset.prod); }),
    delegate(el, 'click', '[data-restoreprod]', async (e, b) => { try { await api.post(`/daraz/products/${b.dataset.restoreprod}/restore`); toast('Product restored'); refresh(); } catch (er) { toast(er.message, { type: 'error' }); } }),
    delegate(el, 'click', '[data-pending]', () => { hf.payout = 'pending'; tab = 'history'; window.history.replaceState(null, '', '#/daraz?tab=history'); show(); }),
    delegate(el, 'input', '[data-psearch]', (e, i) => psrch(i.value)),
    delegate(el, 'change', '[data-hprod]', (e, s) => { hf.product = s.value; histList.load(); }),
    delegate(el, 'click', '[data-ht]', (e, b) => { hf.type = b.dataset.ht; hf.payout = ''; $$('[data-ht]', el).forEach((x) => x.setAttribute('aria-pressed', x === b)); $('[data-hpay]', el).setAttribute('aria-pressed', 'false'); histList.load(); }),
    delegate(el, 'click', '[data-hpay]', (e, b) => { hf.payout = hf.payout ? '' : 'pending'; b.setAttribute('aria-pressed', !!hf.payout); $$('[data-ht]', el).forEach((x) => x.setAttribute('aria-pressed', !hf.payout && x.dataset.ht === hf.type)); histList.load(); }),
    delegate(el, 'click', '[data-payout]', (e, b) => { e.stopPropagation(); const m = mmap.get(b.dataset.payout); openReceiveForm({ title: 'Payout received', amount: m.quantity * m.unitPrice - (m.fees || 0), label: 'Paid into', path: `/daraz/movements/${m.id}/payout`, onSaved }); }),
    delegate(el, 'click', '[data-mv]', (e, r) => { if (!e.target.closest('[data-payout]') && mmap.get(r.dataset.mv)) openMovementForm({ movement: mmap.get(r.dataset.mv), onSaved }); }),
    delegate(el, 'click', '[data-exp]', (e, r) => openDarazExpenseForm({ expense: emap.get(r.dataset.exp), onSaved })),
    delegate(el, 'click', '[data-addexp]', () => openDarazExpenseForm({ onSaved })),
    delegate(el, 'click', '[data-ec]', (e, b) => { ef.category = b.dataset.ec; $$('[data-ec]', el).forEach((x) => x.setAttribute('aria-pressed', x === b)); expList.load(); }),
    delegate(el, 'input', '[data-eq]', (e, i) => esrch(i.value)),
    delegate(el, 'click', '[data-more]', async (e, b) => { b.classList.add('is-loading'); await (tab === 'history' ? histList : expList).load(false); }),
  ];
  await show();
  void dateFull;
  return () => { off.forEach((x) => x()); psrch.cancel(); esrch.cancel(); seq++; };
}
