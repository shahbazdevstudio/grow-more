import { html, icon, mount, delegate } from '../js/core/dom.js';
import { api } from '../js/core/api.js';
import { state, reloadAccounts, accountById } from '../js/core/state.js';
import { money } from '../js/core/format.js';
import { accountLogo, ACCOUNT_TYPES } from '../components/logo.js';
import { emptyState } from '../components/emptyState.js';
import { openAccountForm, deleteAccount, openTransactionForm, ACCOUNT_PRESETS } from '../components/forms.js';
import { toast } from '../components/toast.js';
import { navigate } from '../js/core/router.js';

const card = (a) => html`<div class="acct" style="--c:${a.color}">
  <div class="acct-top">${accountLogo(a)}<div class="row-main"><div class="acct-name truncate">${a.name}</div><div class="acct-type">${ACCOUNT_TYPES[a.type].label}</div></div></div>
  <div><div class="acct-bal ${a.balance < 0 ? 'neg' : ''}">${money(a.balance)}</div>${a.description ? html`<div class="acct-desc" style="margin-top:6px">${a.description}</div>` : ''}</div>
  <div class="acct-actions"><button class="btn btn-sm" type="button" data-txs="${a.id}">${icon('history', 'i-sm')} Activity</button><button class="icon-btn" type="button" data-edit="${a.id}" aria-label="Edit ${a.name}">${icon('pencil', 'i-sm')}</button><button class="icon-btn danger" type="button" data-delete="${a.id}" aria-label="Delete ${a.name}">${icon('trash-2', 'i-sm')}</button></div></div>`;

export default async function accounts(el, { refresh }) {
  const [, arch] = await Promise.all([reloadAccounts(), api.get('/accounts', { archived: 'true' })]);
  const list = state.accounts;
  const total = list.reduce((s, a) => s + a.balance, 0);

  mount(el, html`
    <div class="page-head"><div><h2>Accounts</h2><p>${list.length ? html`${list.length} account${list.length === 1 ? '' : 's'} · <b class="money">${money(total)}</b> in total` : 'Everything you hold money in'}</p></div>
      <div class="page-actions"><button class="btn btn-primary" type="button" data-add>${icon('plus')} Add account</button></div></div>
    ${list.length ? html`<div class="acct-grid">${list.map(card)}</div>
      <div class="row-flex" style="margin-top:18px">${list.length > 1 ? html`<button class="btn" type="button" data-transfer>${icon('arrow-left-right', 'i-sm')} Transfer between accounts</button>` : ''}</div>`
      : html`<div class="card">${emptyState({ art: 'wallet', title: 'Add your first account', text: 'Create an account for each place you keep money. Each one tracks its own balance from your transactions.',
          action: html`<div class="preset-row" style="justify-content:center">${ACCOUNT_PRESETS.map((p, i) => html`<button class="btn btn-sm" type="button" data-preset="${i}">${icon('plus', 'i-sm')} ${p.name}</button>`)}</div>` })}</div>`}
    ${arch.accounts.length ? html`<h3 class="card-title" style="margin:28px 4px 12px">Archived</h3><div class="card"><div class="list">${arch.accounts.map((a) => html`<div class="row">${accountLogo(a, 'sm')}<div class="row-main"><div class="row-title">${a.name}</div><div class="row-sub">${a.transactionCount} transactions kept in history</div></div><button class="btn btn-sm" type="button" data-restore="${a.id}">${icon('archive-restore', 'i-sm')} Restore</button></div>`)}</div></div>` : ''}`);

  const off = [
    delegate(el, 'click', '[data-add]', () => openAccountForm({ onSaved: refresh })),
    delegate(el, 'click', '[data-preset]', (e, b) => openAccountForm({ preset: ACCOUNT_PRESETS[+b.dataset.preset], onSaved: refresh })),
    delegate(el, 'click', '[data-edit]', (e, b) => openAccountForm({ account: accountById(b.dataset.edit), onSaved: refresh })),
    delegate(el, 'click', '[data-delete]', (e, b) => deleteAccount(accountById(b.dataset.delete), refresh)),
    delegate(el, 'click', '[data-txs]', (e, b) => navigate(`transactions?account=${b.dataset.txs}`)),
    delegate(el, 'click', '[data-transfer]', () => openTransactionForm({ type: 'transfer', onSaved: refresh })),
    delegate(el, 'click', '[data-restore]', async (e, b) => { try { await api.post(`/accounts/${b.dataset.restore}/restore`); await reloadAccounts(); toast('Account restored'); refresh(); } catch (err) { toast(err.message, { type: 'error' }); } }),
  ];
  return () => off.forEach((f) => f());
}
