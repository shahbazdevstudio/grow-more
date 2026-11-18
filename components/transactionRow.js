import { html, icon } from '../js/core/dom.js';
import { accountById, categoryById } from '../js/core/state.js';
import { money } from '../js/core/format.js';
import { categoryTile } from './logo.js';

export const TYPE_META = {
  income: { label: 'Income', icon: 'arrow-down-left', cls: 'pos', color: '#52DDA0' },
  expense: { label: 'Expense', icon: 'arrow-up-right', cls: 'neg', color: '#FF8585' },
  transfer: { label: 'Transfer', icon: 'arrow-left-right', cls: 'info', color: '#86B7FF' },
};

export function describeAccounts(t) {
  const a = accountById(t.account);
  const b = t.toAccount && accountById(t.toAccount);
  const name = (x, id) => (x ? x.name : id ? 'Removed account' : '');
  return t.type === 'transfer' ? `${name(a, t.account)} → ${name(b, t.toAccount)}` : name(a, t.account);
}

export function txRow(t, { showDate = false } = {}) {
  const cat = t.category ? categoryById(t.category) : null;
  const meta = TYPE_META[t.type];
  const tile = t.type === 'transfer'
    ? html`<span class="cico" style="--c:${meta.color}">${icon(meta.icon)}</span>`
    : categoryTile(cat);
  const amount = t.type === 'income' ? money(t.amount, { sign: true }) : t.type === 'expense' ? `-${money(t.amount)}` : money(t.amount);
  return html`<button class="row tx" type="button" data-tx="${t.id}">${tile}
    <div class="row-main"><div class="row-title">${t.title}</div>
      <div class="row-sub"><span>${t.type === 'transfer' ? (t.source || 'Transfer') : cat ? cat.name : 'Uncategorised'}</span><i class="dot"></i><span class="truncate">${describeAccounts(t)}</span>${t.module ? html`<span class="pill mod">${{ coding: 'Coding', daraz: 'Daraz', trading: 'Trading' }[t.module]}</span>` : ''}</div></div>
    <div class="row-amt"><div class="tx-amt ${meta.cls}">${amount}</div></div></button>`;
}
