import { html, icon } from '../js/core/dom.js';
import { money, clamp } from '../js/core/format.js';

export const tabsBar = (tabs, cur) => html`<div class="tabs"><div class="seg" role="tablist" data-tabs>${tabs.map(([k, l, n]) => html`<button type="button" role="tab" data-tab="${k}" aria-pressed="${cur === k}" aria-selected="${cur === k}">${l}${n ? html` <span class="count">${n}</span>` : ''}</button>`)}</div></div>`;
export const rangeChips = (ranges, cur) => html`<div class="chips" data-ranges role="group" aria-label="Date range">${ranges.map(([k, l]) => html`<button class="chip" type="button" data-r="${k}" aria-pressed="${cur === k}">${l}</button>`)}</div>`;
export const tile = ({ label, value, sub = '', cls = '', ico, color = '#E8B04A', go }) => html`<div class="stat glass"><div class="stat-top">${ico ? html`<span class="cico sm" style="--c:${color}">${icon(ico, 'i-sm')}</span>` : ''}${label}</div><div><div class="stat-val ${cls}">${value}</div><div class="stat-sub">${sub}</div></div></div>`;
export const bars = (items, color = 'var(--gold)') => {
  const max = Math.max(...items.map((i) => i.amount), 1);
  return html`<div class="bars">${items.map((i) => html`<div class="bar-row"><div class="bar-top"><span>${i.label}</span><span class="money">${money(i.amount)}</span></div><div class="progress"><i style="--w:${clamp((i.amount / max) * 100, 2, 100)}%;background:${color}"></i></div></div>`)}</div>`;
};
export const signCls = (n) => (n < 0 ? 'neg' : n > 0 ? 'pos' : '');
