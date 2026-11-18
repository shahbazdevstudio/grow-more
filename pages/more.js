import { html, icon, mount, delegate } from '../js/core/dom.js';
import { SOON } from '../js/nav.js';

export default async function more(el) {
  const item = (href, ico, title, sub) => html`<a class="more-item" href="${href}"><span class="cico">${icon(ico)}</span><div class="row-main"><div class="row-title">${title}</div><div class="row-sub">${sub}</div></div>${icon('chevron-right')}</a>`;
  mount(el, html`<div class="page-head"><div><h2>More</h2></div></div><div class="more-list">
    ${item('#/accounts', 'wallet', 'Accounts', 'Banks, wallets and cash')}${item('#/coding', 'code', 'Coding', 'Client payments and profit')}${item('#/daraz', 'store', 'Daraz', 'Inventory, stock and profit')}${item('#/trading', 'trending-up', 'Trading', 'Crypto and investments')}${item('#/notes', 'notebook-pen', 'Notes', 'Your notes')}${item('#/todo', 'list-todo', 'To-Do', 'Daily tasks')}${item('#/savings', 'piggy-bank', 'Savings', 'Goals and monthly target')}${item('#/settings', 'settings', 'Settings', 'Theme, PIN, budgets, backup')}
    <button class="more-item" type="button" data-lock>${html`<span class="cico">${icon('lock')}</span>`}<div class="row-main"><div class="row-title">Lock app</div><div class="row-sub">Return to the PIN screen</div></div></button>
</div>`);
  const off = delegate(el, 'click', '[data-lock]', () => window.dispatchEvent(new Event('gm:lock-now')));
  return off;
}
