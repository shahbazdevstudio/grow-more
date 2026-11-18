import { $, html, icon, mount, delegate, raw } from '../js/core/dom.js';
import { api } from '../js/core/api.js';
import { state, reloadAccounts, reloadCategories } from '../js/core/state.js';
import { money, mmss } from '../js/core/format.js';
import { applyTheme, currentTheme } from '../js/core/theme.js';
import { setIdleMinutes } from '../js/core/session.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { mountPinPad } from '../components/pinPad.js';
import { openBudgetForm, openCategoryForm } from '../components/forms.js';
import { toast } from '../components/toast.js';
import { categoryTile } from '../components/logo.js';

void mmss;
const CURRENCIES = [['PKR', 'PKR — Pakistani Rupee'], ['USD', 'USD — US Dollar'], ['EUR', 'EUR — Euro'], ['GBP', 'GBP — Pound Sterling'], ['AED', 'AED — UAE Dirham'], ['SAR', 'SAR — Saudi Riyal'], ['INR', 'INR — Indian Rupee']];
const ZONES = ['Asia/Karachi', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Kolkata', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'UTC'];
const LOCKS = [[1, '1 minute'], [5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour']];

export async function saveSetting(patch) {
  const r = await api.put('/me/settings', patch);
  state.user.settings = r.settings;
  if (patch.theme) applyTheme(patch.theme);
  if (patch.autoLockMinutes) setIdleMinutes(patch.autoLockMinutes);
  return r.settings;
}

export function openChangePin() {
  let step = 0; let cur = ''; let next = '';
  const T = ['Enter your current PIN', 'Choose a new PIN', 'Confirm your new PIN'];
  let pad = null;
  const m = openModal({ title: 'Change PIN', size: 'narrow', mobile: 'sheet', onClose: () => pad && pad.destroy(),
    body: html`<div class="lock-card" style="margin:0 auto"><p class="lock-title" style="font-size:18px" data-step>${T[0]}</p><div data-pad></div></div>`, labelledBy: 'pin-title' });
  const setStep = (n) => { step = n; $('[data-step]', m.el).textContent = T[n]; };
  pad = mountPinPad($('[data-pad]', m.el), {
    onComplete: async (pin, ctl) => {
      if (step === 0) { cur = pin; setStep(1); return ctl.reset('Choose a new 4-digit PIN'); }
      if (step === 1) { if (pin === cur) return ctl.error('Your new PIN must be different from the current one.'); next = pin; setStep(2); return ctl.reset('Enter the new PIN again'); }
      if (pin !== next) { next = ''; setStep(1); return ctl.error('The PINs did not match. Choose your new PIN again.'); }
      try { await api.post('/me/pin', { currentPin: cur, newPin: next }); ctl.done(); m.close(); toast('PIN changed. Other devices were signed out.'); }
      catch (e) {
        if (e.code === 'LOCKED') { m.close(); toast('Too many incorrect attempts. The app is locked for a while.', { type: 'error' }); window.dispatchEvent(new Event('gm:session-ended')); return ctl.done(); }
        if (e.code === 'BAD_PIN') { cur = ''; next = ''; setStep(0); return ctl.error(`Your current PIN was incorrect (${e.data.attemptsLeft} attempt${e.data.attemptsLeft === 1 ? '' : 's'} left).`); }
        setStep(0); cur = ''; next = ''; return ctl.error(e.message);
      }
    },
  });
}

export default async function settings(el, { refresh }) {
  const [info, b] = await Promise.all([api.get('/info'), api.get('/budget'), reloadAccounts(), reloadCategories()]);
  const s = state.user.settings;
  const bu = b.budget;
  const set = (v) => (v == null ? 'Not set' : money(v));
  const opts = (list, cur) => list.map(([k, l]) => html`<option value="${k}" ${String(k) === String(cur) ? raw('selected') : ''}>${l}</option>`);
  const zones = ZONES.includes(s.timezone) ? ZONES : [s.timezone, ...ZONES];
  const catChips = (type) => state.categories.filter((c) => c.type === type).map((c) => html`<span class="cat-chip" style="--c:${c.color}"><i class="dot"></i>${c.name}<button type="button" data-delcat="${c.id}" data-name="${c.name}" aria-label="Remove ${c.name}">${icon('x', 'i-sm')}</button></span>`);
  const row = (ico, title, sub, control) => html`<div class="set-row"><span class="cico sm">${icon(ico, 'i-sm')}</span><div class="row-main"><div class="row-title">${title}</div>${sub ? html`<div class="row-sub">${sub}</div>` : ''}</div>${control}</div>`;

  mount(el, html`<div class="page-head"><div><h2>Settings</h2><p>Everything here is saved to your account.</p></div></div>
  <div class="settings-grid">
    <div class="card"><div class="card-head"><h3 class="card-title">Appearance</h3></div>
      ${row('palette', 'Theme', 'Dark is the default', html`<div class="seg" role="group" aria-label="Theme" data-theme>${[['dark', 'Dark', 'moon'], ['light', 'Light', 'sun']].map(([k, l, i]) => html`<button type="button" data-v="${k}" aria-pressed="${currentTheme() === k}">${icon(i, 'i-sm')} ${l}</button>`)}</div>`)}</div>

    <div class="card"><div class="card-head"><h3 class="card-title">Security</h3></div>
      ${row('key-round', 'PIN', 'Four digits, stored securely hashed', html`<button class="btn btn-sm" type="button" data-pin>Change PIN</button>`)}
      ${row('timer', 'Auto-lock', 'Ask for the PIN after inactivity', html`<select class="select" data-lock aria-label="Auto-lock time">${opts(LOCKS, s.autoLockMinutes)}</select>`)}
      ${row('lock', 'Lock now', 'Return to the PIN screen', html`<button class="btn btn-sm" type="button" data-locknow>Lock</button>`)}
      ${row('shield-check', 'Sign out other devices', 'Ends every other session', html`<button class="btn btn-sm" type="button" data-revoke>Sign out</button>`)}
      <p class="hint" style="margin-top:8px">After 3 wrong PINs, the 4th locks the app for 5 minutes (then 10, 15… on repeats). This is enforced by the server.</p></div>

    <div class="card"><div class="card-head"><h3 class="card-title">Budget & targets</h3><button class="btn btn-sm" type="button" data-budget>${icon('pencil', 'i-sm')} Edit</button></div>
      ${row('target', 'Daily spending limit', '', html`<b class="money">${set(bu.dailyLimit)}</b>`)}${row('calendar-days', 'Monthly spending limit', '', html`<b class="money">${set(bu.monthlyLimit)}</b>`)}${row('piggy-bank', 'Monthly savings target', '', html`<b class="money">${set(bu.savingsTarget)}</b>`)}</div>

    <div class="card"><div class="card-head"><h3 class="card-title">Currency & region</h3></div>
      ${row('coins', 'Currency', 'Display only — amounts are not converted', html`<select class="select" data-cur aria-label="Currency">${opts(CURRENCIES, s.currency)}</select>`)}
      ${row('globe', 'Time zone', 'Decides when "today" starts', html`<select class="select" data-tz aria-label="Time zone">${opts(zones.map((z) => [z, z.replace('_', ' ')]), s.timezone)}</select>`)}</div>

    <div class="card"><div class="card-head"><h3 class="card-title">Accounts</h3><a class="btn btn-sm" href="#/accounts">Manage</a></div>
      <p class="muted">${state.accounts.length ? `${state.accounts.length} active account${state.accounts.length === 1 ? '' : 's'}: ${state.accounts.map((a) => a.name).join(', ')}.` : 'You have no accounts yet.'} Add, edit or delete accounts on the Accounts page.</p></div>

    <div class="card"><div class="card-head"><h3 class="card-title">Categories</h3><button class="btn btn-sm" type="button" data-addcat>${icon('plus', 'i-sm')} Add</button></div>
      <div class="eyebrow" style="margin-bottom:8px">Expense</div><div class="cat-list">${catChips('expense')}</div>
      <div class="eyebrow" style="margin:16px 0 8px">Income sources</div><div class="cat-list">${catChips('income')}</div></div>

    <div class="card"><div class="card-head"><h3 class="card-title">Data backup & export</h3></div>
      ${row('file-json', 'Full backup (JSON)', 'Accounts, transactions, budgets, goals', html`<button class="btn btn-sm" type="button" data-export="json">${icon('download', 'i-sm')} Download</button>`)}
      ${row('file-spreadsheet', 'Transactions (CSV)', 'Opens in Excel / Google Sheets', html`<button class="btn btn-sm" type="button" data-export="csv">${icon('download', 'i-sm')} Download</button>`)}
      <p class="hint" style="margin-top:8px">Backups never contain your PIN. Keep them somewhere private.</p></div>

    <div class="card"><div class="card-head"><h3 class="card-title">About Grow More</h3></div>
      ${row('info', 'Version', `Phase ${info.phase} release`, html`<span class="pill gold">v${info.version}</span>`)}
      ${row('layout-dashboard', 'Available now', info.modules.available.join(' · '), '')}
      ${row('sparkles', 'Planned', info.modules.planned.join(' · '), '')}</div>
  </div>`);

  const guard = async (fn) => { try { await fn(); } catch (e) { toast(e.message, { type: 'error' }); refresh(); } };
  const off = [
    delegate(el, 'click', '[data-theme] [data-v]', (e, bt) => guard(async () => { await saveSetting({ theme: bt.dataset.v }); el.querySelectorAll('[data-theme] [data-v]').forEach((x) => x.setAttribute('aria-pressed', x === bt)); })),
    delegate(el, 'change', '[data-lock]', (e, s2) => guard(async () => { await saveSetting({ autoLockMinutes: Number(s2.value) }); toast('Auto-lock updated'); })),
    delegate(el, 'change', '[data-cur]', (e, s2) => guard(async () => { await saveSetting({ currency: s2.value }); toast('Currency updated'); refresh(); })),
    delegate(el, 'change', '[data-tz]', (e, s2) => guard(async () => { await saveSetting({ timezone: s2.value }); toast('Time zone updated'); })),
    delegate(el, 'click', '[data-pin]', openChangePin),
    delegate(el, 'click', '[data-locknow]', () => window.dispatchEvent(new Event('gm:lock-now'))),
    delegate(el, 'click', '[data-revoke]', async () => { if (await confirmDialog({ title: 'Sign out other devices?', message: 'Any other phone or computer signed in to Grow More will need the PIN again. This device stays signed in.', confirmText: 'Sign out', danger: false })) guard(async () => { await api.post('/me/sessions/revoke'); toast('Other devices signed out'); }); }),
    delegate(el, 'click', '[data-budget]', () => openBudgetForm({ onSaved: refresh })),
    delegate(el, 'click', '[data-addcat]', () => openCategoryForm({ onSaved: refresh })),
    delegate(el, 'click', '[data-delcat]', async (e, bt) => {
      if (!await confirmDialog({ title: `Remove "${bt.dataset.name}"?`, message: 'If past transactions use it, it is hidden from new entries but your history is kept.', confirmText: 'Remove' })) return;
      guard(async () => { await api.del(`/categories/${bt.dataset.delcat}`); await reloadCategories(); toast('Category removed', { type: 'info' }); refresh(); });
    }),
    delegate(el, 'click', '[data-export]', (e, bt) => guard(async () => { bt.classList.add('is-loading'); try { await (bt.dataset.export === 'json' ? api.download('/data/export.json', 'grow-more-backup.json') : api.download('/data/transactions.csv', 'grow-more-transactions.csv')); toast('Download started'); } finally { bt.classList.remove('is-loading'); } })),
  ];
  void categoryTile;
  return () => off.forEach((f) => f());
}
