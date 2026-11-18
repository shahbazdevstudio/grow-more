import { $, html, icon, mount } from '../js/core/dom.js';

export function toast(message, { type = 'success', action, duration } = {}) {
  const root = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  mount(el, html`${icon(type === 'error' ? 'circle-alert' : type === 'info' ? 'info' : 'circle-check')}<span>${message}</span>${action ? html`<button type="button">${action.label}</button>` : ''}`);
  root.append(el);
  let done = false;
  const close = () => { if (done) return; done = true; el.classList.add('out'); setTimeout(() => el.remove(), 220); };
  if (action) el.querySelector('button').addEventListener('click', () => { close(); action.onClick(); });
  setTimeout(close, duration || (action ? 6500 : type === 'error' ? 5500 : 3200));
  while (root.children.length > 3) root.firstChild.remove();
  return close;
}
