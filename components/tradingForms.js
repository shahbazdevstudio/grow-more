import { $, html, icon, mount, raw } from '../js/core/dom.js';
import { api } from '../js/core/api.js';
import { state, accountById, emit, reloadAccounts } from '../js/core/state.js';
import { money, symbol, todayStr } from '../js/core/format.js';
import { openModal, confirmDialog, withLoading } from './modal.js';
import { toast } from './toast.js';
import { optionList, errorBox, readForm, openAccountForm } from './forms.js';
import { emptyState } from './emptyState.js';

export const ASSET_TYPES = { crypto: 'Cryptocurrency', stock: 'Stock', other: 'Other investment' };
export const ASSET_PRESETS = [{ name: 'Bitcoin', symbol: 'BTC', type: 'crypto' }, { name: 'Ethereum', symbol: 'ETH', type: 'crypto' }, { name: 'Solana', symbol: 'SOL', type: 'crypto' }];
const LAST = 'gm_last_account';

/** Trim a quantity/price to at most `dp` decimals while typing. */
export const cleanDecimal = (v, dp = 8) => { let s = String(v).replace(/[^\d.]/g, ''); const i = s.indexOf('.'); if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '').slice(0, dp); return s; };
/** Quantities: up to 8 decimals, no trailing zeros. */
export const qty = (n) => { const v = Number(n) || 0; return v.toLocaleString('en-US', { maximumFractionDigits: 8 }); };
/** Unit prices keep more precision when they are small. */
export const price = (n) => { const v = Number(n) || 0; return money(v).includes('.') || v >= 1 ? money(v) : `${symbol()} ${v.toFixed(6).replace(/0+$/, '')}`; };
export const plPct = (n) => (n == null ? '' : `${n > 0 ? '+' : ''}${n}%`);

const lastAcc = () => { let l = null; try { l = localStorage.getItem(LAST); } catch { /* ignore */ } return (accountById(l) || state.accounts[0] || {}).id || ''; };
const accOptions = (sel, none) => html`<option value="">${none}</option>${optionList(state.accounts.map((a) => ({ value: a.id, label: `${a.name} · ${money(a.balance)}` })), sel)}`;
const finish = async (m, msg, cb) => { await reloadAccounts(); m.close(); toast(msg); emit('data'); cb && cb(); };

export function openAssetForm({ asset = null, preset = null, onSaved } = {}) {
  const f = (k, d = '') => (asset ? asset[k] ?? d : preset ? preset[k] ?? d : d);
  const m = openModal({ title: asset ? 'Edit asset' : 'Add asset', mobile: 'sheet', body: html`<form id="af" novalidate autocomplete="off"><div class="stack"><div data-err></div>
    ${asset ? '' : html`<div class="field"><span class="label">Quick start</span><div class="preset-row">${ASSET_PRESETS.map((p, i) => html`<button class="chip" type="button" data-preset="${i}">${p.name}</button>`)}</div></div>`}
    <div class="field-row"><div class="field"><label for="a-name">Name</label><input class="input" id="a-name" name="name" maxlength="60" required value="${f('name')}" placeholder="e.g. Bitcoin"></div><div class="field"><label for="a-sym">Symbol <span class="opt">optional</span></label><input class="input" id="a-sym" name="symbol" maxlength="12" value="${f('symbol')}" placeholder="BTC" style="text-transform:uppercase"></div></div>
    <div class="field"><label for="a-type">Type</label><select class="select" id="a-type" name="type">${optionList(Object.entries(ASSET_TYPES).map(([value, label]) => ({ value, label })), f('type', 'crypto'))}</select></div>
    <div class="field"><label for="a-price">Current price per unit <span class="opt">optional</span></label><div class="amount-wrap"><span class="cur" style="font-size:15px">${symbol()}</span><input class="input" style="padding-left:${symbol().length > 1 ? 52 : 38}px" id="a-price" name="currentPrice" inputmode="decimal" value="${asset && asset.currentPrice != null ? asset.currentPrice : ''}" placeholder="You enter prices yourself"></div><div class="hint">Used for portfolio value. Grow More does not fetch live prices — update it whenever you like.</div></div>
    <div class="field"><label for="a-notes">Notes <span class="opt">optional</span></label><input class="input" id="a-notes" name="notes" maxlength="500" value="${f('notes')}" placeholder="e.g. Held on Binance"></div></div></form>`,
    footer: html`${asset ? html`<button class="btn btn-ghost" type="button" data-del style="color:var(--neg);flex:0 0 auto">${icon('archive', 'i-sm')} Archive</button>` : ''}<button class="btn btn-primary" type="submit" form="af" data-save>${asset ? 'Save changes' : 'Add asset'}</button>` });
  const form = $('#af', m.el);
  const delBtn = $('[data-del]', m.el);
  if (delBtn) delBtn.addEventListener('click', async () => {
    m.close();
    if (!await confirmDialog({ title: `Remove ${asset.name}?`, message: asset.tradeCount ? 'It has trades, so it will be archived (history kept) once you hold none of it.' : 'It has no trades and will be removed.', confirmText: asset.tradeCount ? 'Archive' : 'Remove' })) return;
    try { const r = await api.del(`/trading/assets/${asset.id}`); toast(r.archived ? 'Asset archived' : 'Asset removed', { type: 'info' }); emit('data'); onSaved && onSaved(); } catch (er) { toast(er.message, { type: 'error', duration: 7000 }); }
  }); const showErr = (x) => mount($('[data-err]', m.el), errorBox(x));
  m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-preset]'); if (!b) return; const p = ASSET_PRESETS[+b.dataset.preset]; form.elements.name.value = p.name; form.elements.symbol.value = p.symbol; form.elements.type.value = p.type; });
  form.addEventListener('input', (e) => { if (e.target.name === 'currentPrice') e.target.value = cleanDecimal(e.target.value); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const d = readForm(form);
    if (!d.name.trim()) return showErr('Enter a name for this asset.');
    const body = { name: d.name.trim(), symbol: d.symbol.trim(), type: d.type, currentPrice: d.currentPrice === '' ? null : parseFloat(d.currentPrice), notes: d.notes.trim() };
    try { await withLoading($('[data-save]', m.el), () => (asset ? api.put(`/trading/assets/${asset.id}`, body) : api.post('/trading/assets', body))); m.close(); toast(asset ? 'Asset updated' : 'Asset added'); emit('data'); onSaved && onSaved(); }
    catch (err) { showErr(err.message); }
  });
}

export function openPriceForm({ asset, onSaved }) {
  const m = openModal({ title: `Update ${asset.symbol || asset.name} price`, size: 'narrow', mobile: 'sheet', body: html`<form id="pf2" novalidate><div class="stack"><div data-err></div>
    <div class="field"><label for="pp">Price per unit</label><div class="amount-wrap"><span class="cur">${symbol()}</span><input class="input amount-input" id="pp" name="price" inputmode="decimal" autocomplete="off" value="${asset.currentPrice ?? ''}" placeholder="0" required></div>
      <div class="hint">${asset.stats.qty > 0 ? `You hold ${qty(asset.stats.qty)} ${asset.symbol || ''}.` : 'You do not hold any right now.'}${asset.priceUpdatedAt ? ` Last updated ${new Date(asset.priceUpdatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.` : ''}</div></div></div></form>`,
    footer: html`<button class="btn btn-primary" type="submit" form="pf2" data-save>Save price</button>` });
  const form = $('#pf2', m.el); form.addEventListener('input', (e) => { e.target.value = cleanDecimal(e.target.value); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const v = parseFloat(form.elements.price.value);
    if (Number.isNaN(v) || v < 0) return mount($('[data-err]', m.el), errorBox('Enter a valid price.'));
    try { await withLoading($('[data-save]', m.el), () => api.put(`/trading/assets/${asset.id}/price`, { price: v })); m.close(); toast('Price updated'); onSaved && onSaved(); } catch (err) { mount($('[data-err]', m.el), errorBox(err.message)); }
  });
}

export async function openTradeForm({ type = 'buy', assetId = '', trade = null, onSaved } = {}) {
  let assets = [];
  try { assets = (await api.get('/trading/assets')).assets; } catch (e) { toast(e.message, { type: 'error' }); return; }
  if (!assets.length) {
    const m = openModal({ title: 'Add an asset first', size: 'narrow', mobile: 'center', body: emptyState({ art: 'chart', title: 'No assets yet', text: 'Add Bitcoin, a stock or any investment, then record your buys and sells.', action: html`<button class="btn btn-primary" data-add type="button">${icon('plus')} Add asset</button>` }) });
    $('[data-add]', m.el).addEventListener('click', () => { m.close(); openAssetForm({ onSaved: () => openTradeForm({ type, onSaved }) }); });
    return;
  }
  const asset = (id) => assets.find((a) => a.id === id);
  const first = asset(trade?.asset) || asset(assetId) || assets[0];
  const v = trade
    ? { type: trade.type, asset: trade.asset, quantity: String(trade.quantity), price: String(trade.price), fee: trade.fee ? String(trade.fee) : '', account: trade.account || '', date: trade.date, notes: trade.notes || '' }
    : { type, asset: first.id, quantity: '', price: first.currentPrice != null ? String(first.currentPrice) : '', fee: '', account: lastAcc(), date: todayStr(), notes: '' };
  const money_ = (id, name, label, val, req = false, hint = '') => html`<div class="field"><label for="${id}">${label}</label><div class="amount-wrap"><span class="cur" style="font-size:15px">${symbol()}</span><input class="input" style="padding-left:${symbol().length > 1 ? 52 : 38}px" id="${id}" name="${name}" inputmode="decimal" autocomplete="off" ${req ? raw('required') : ''} value="${val}" placeholder="0"></div>${hint ? html`<div class="hint">${hint}</div>` : ''}</div>`;
  const seg = () => html`<div class="seg seg-full" data-types style="grid-template-columns:1fr 1fr">${[['buy', 'Buy'], ['sell', 'Sell']].map(([k, l]) => html`<button type="button" data-t="${k}" aria-pressed="${v.type === k}" ${k === 'buy' ? '' : ''}>${l}</button>`)}</div>`;
  const fields = () => html`
    <div class="field"><label for="t-asset">Asset</label><select class="select" id="t-asset" name="asset" ${trade ? raw('disabled') : ''}>${optionList(assets.map((a) => ({ value: a.id, label: `${a.name}${a.symbol ? ` (${a.symbol})` : ''} · ${qty(a.stats.qty)} held` })), v.asset)}</select></div>
    <div class="field-row"><div class="field"><label for="t-qty">Quantity</label><input class="input" id="t-qty" name="quantity" inputmode="decimal" autocomplete="off" required placeholder="0" value="${v.quantity}"><div class="hint" data-hold></div></div>${money_('t-price', 'price', v.type === 'buy' ? 'Buy price (per unit)' : 'Sell price (per unit)', v.price, true)}</div>
    ${money_('t-fee', 'fee', 'Transaction fee', v.fee, false, 'Optional. Exchange or broker fee for this trade.')}
    <div class="glass" style="border-radius:16px;padding:12px 14px" data-calc></div>
    <div class="field"><label for="t-acc">${v.type === 'buy' ? 'Paid from' : 'Proceeds received in'}</label><select class="select" id="t-acc" name="account">${accOptions(v.account, v.type === 'buy' ? 'No account – I already hold this' : 'No account – don’t credit anywhere')}</select><div class="hint" data-acchint></div></div>
    <div class="field"><label for="t-date">${v.type === 'buy' ? 'Purchase date' : 'Selling date'}</label><input class="input" type="date" id="t-date" name="date" value="${v.date}" required></div>
    <div class="field"><label for="t-notes">Notes <span class="opt">optional</span></label><input class="input" id="t-notes" name="notes" maxlength="500" value="${v.notes}"></div>`;
  const m = openModal({ title: trade ? `Edit ${trade.type}` : 'Record a trade', body: html`<form id="tf" novalidate autocomplete="off"><div class="stack">${trade ? '' : html`<div data-seg>${seg()}</div>`}<div data-err></div><div class="stack" data-fields>${fields()}</div></div></form>`,
    footer: html`${trade ? html`<button class="btn btn-ghost" type="button" data-del style="color:var(--neg);flex:0 0 auto">${icon('trash-2', 'i-sm')} Delete</button>` : ''}<button class="btn btn-primary" type="submit" form="tf" data-save></button>` });
  const form = $('#tf', m.el); const showErr = (x) => mount($('[data-err]', m.el), errorBox(x));
  const sync = () => { const d = readForm(form); if (trade) d.asset = v.asset; Object.assign(v, d); };
  const label = () => { $('[data-save]', m.el).textContent = trade ? 'Save changes' : v.type === 'buy' ? 'Record purchase' : 'Record sale'; };
  const calc = () => {
    const a = asset(v.asset); const q = parseFloat(v.quantity) || 0; const p = parseFloat(v.price) || 0; const fee = parseFloat(v.fee) || 0; const box = $('[data-calc]', m.el); const hold = $('[data-hold]', m.el); const ah = $('[data-acchint]', m.el);
    const held = a ? a.stats.qty : 0; const row = (l, val, cls = '') => html`<div class="row-flex"><span class="muted">${l}</span><span class="spacer"></span><b class="money ${cls}">${val}</b></div>`;
    if (hold) { hold.className = 'hint'; hold.textContent = `You hold ${qty(held)} ${a?.symbol || ''}`; if (!trade && v.type === 'sell' && q > held + 1e-9) { hold.className = 'hint warn'; hold.textContent = `You only hold ${qty(held)} — you cannot sell ${qty(q)}.`; } }
    if (trade) { mount(box, html`<div class="muted small">Profit and return are recalculated when you save.</div>`); }
    else if (v.type === 'buy') mount(box, html`<div style="display:grid;gap:6px">${row('Purchase cost', money(q * p))}${fee ? row('Fee', money(fee)) : ''}${row('Total investment', money(q * p + fee))}</div>`);
    else {
      const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100; // same rounding as the server, so the preview matches what is saved
      const avg = a ? a.stats.avgPrice : 0; const pc = r2(q * avg); const bf = held > 0 ? r2((q / held) * (a.stats.feePool || 0)) : 0; const value = r2(q * p); const net = r2(value - pc - bf - fee); const ret = pc > 0 ? Math.round((net / pc) * 10000) / 100 : null;
      mount(box, html`<div style="display:grid;gap:6px">${row('Selling value', money(value))}${row(`Purchase cost (avg ${price(avg)})`, `-${money(pc)}`)}${row('Fees (buy share + this sale)', `-${money(bf + fee)}`)}${row('Profit / loss', money(net, { sign: true }), net < 0 ? 'neg' : 'pos')}${ret != null ? row('Return', `${ret > 0 ? '+' : ''}${ret}%`, ret < 0 ? 'neg' : 'pos') : ''}</div>`);
    }
    if (ah) ah.textContent = v.account ? (v.type === 'buy' ? `${money(q * p + fee)} will be deducted from this account.` : `${money(Math.max(0, q * p - fee))} (after the fee) will be added to this account.`) : 'No account balance will change.';
  };
  label(); calc();
  m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b || b.dataset.t === v.type) return; sync(); v.type = b.dataset.t; showErr(''); mount($('[data-seg]', m.el), seg()); mount($('[data-fields]', m.el), fields()); label(); calc(); });
  form.addEventListener('input', (e) => { if (['quantity', 'price', 'fee'].includes(e.target.name)) e.target.value = cleanDecimal(e.target.value, e.target.name === 'fee' ? 2 : 8); sync(); calc(); });
  form.addEventListener('change', (e) => { if (e.target.name === 'asset' && !trade) { sync(); const a = asset(v.asset); if (a.currentPrice != null) v.price = String(a.currentPrice); mount($('[data-fields]', m.el), fields()); } sync(); calc(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); sync(); showErr('');
    const q = parseFloat(v.quantity); if (!(q > 0)) return showErr('Enter the quantity.');
    if (v.price === '' || Number.isNaN(parseFloat(v.price))) return showErr('Enter the price per unit.');
    const body = { type: v.type, asset: v.asset, quantity: q, price: parseFloat(v.price), fee: parseFloat(v.fee) || 0, date: v.date, account: v.account || null, notes: (v.notes || '').trim() };
    try { await withLoading($('[data-save]', m.el), () => (trade ? api.put(`/trading/trades/${trade.id}`, body) : api.post('/trading/trades', body))); if (body.account) { try { localStorage.setItem(LAST, body.account); } catch { /* ignore */ } } await finish(m, trade ? 'Changes saved' : v.type === 'buy' ? 'Purchase recorded' : 'Sale recorded', onSaved); }
    catch (err) { showErr(err.message); }
  });
  const del = $('[data-del]', m.el);
  if (del) del.addEventListener('click', () => { m.close(); deleteTrade(trade, onSaved); });
}

export async function deleteTrade(t, onDone) {
  if (!await confirmDialog({ title: 'Delete this trade?', message: `This ${t.type} of ${qty(t.quantity)} will be removed${t.transaction ? ' and the account balance corrected' : ''}. You can undo this right after.` })) return;
  try { await api.del(`/trading/trades/${t.id}`); await reloadAccounts(); emit('data'); onDone && onDone(); toast('Trade deleted', { type: 'info', action: { label: 'Undo', onClick: async () => { try { await api.post(`/trading/trades/${t.id}/restore`); await reloadAccounts(); emit('data'); onDone && onDone(); toast('Restored'); } catch (e) { toast(e.message, { type: 'error', duration: 7000 }); } } } }); }
  catch (e) { toast(e.message, { type: 'error', duration: 8000 }); }
}
void openAccountForm;
