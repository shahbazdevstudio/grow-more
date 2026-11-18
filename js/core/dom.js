/* Safe templating: every interpolated value is HTML-escaped unless it is itself the result of html`` or raw().
   This makes XSS from user-entered text (titles, notes, account names...) structurally impossible. */
export class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => MAP[c]);
export const raw = (s) => new Safe(String(s));
const part = (v) => (v instanceof Safe ? v.s : Array.isArray(v) ? v.map(part).join('') : v === null || v === undefined || v === false ? '' : esc(v));
export const html = (strings, ...vals) => new Safe(strings.reduce((a, s, i) => a + s + (i < vals.length ? part(vals[i]) : ''), ''));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const mount = (el, safe) => { el.innerHTML = String(safe); return el; };

export const icon = (name, cls = '') => raw(`<svg class="i ${esc(cls)}" aria-hidden="true" focusable="false"><use href="assets/icons/sprite.svg#${esc(name)}"></use></svg>`);

export function delegate(root, type, selector, handler) {
  const fn = (e) => { const t = e.target.closest(selector); if (t && root.contains(t)) handler(e, t); };
  root.addEventListener(type, fn);
  return () => root.removeEventListener(type, fn);
}
export const debounce = (fn, ms = 250) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.cancel = () => clearTimeout(t); return d; };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
