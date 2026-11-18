import { state } from './state.js';

const SYMBOL = { PKR: 'Rs', USD: '$', EUR: '€', GBP: '£', AED: 'AED', SAR: 'SAR', INR: '₹' };
const LOCALE = { PKR: 'en-PK', INR: 'en-IN' };
const nfCache = new Map();
const nf = (cur, frac) => {
  const k = `${cur}|${frac}`;
  if (!nfCache.has(k)) nfCache.set(k, new Intl.NumberFormat(LOCALE[cur] || 'en-US', { minimumFractionDigits: frac, maximumFractionDigits: frac }));
  return nfCache.get(k);
};
export const currency = () => (state.user && state.user.settings.currency) || 'PKR';
export const timezone = () => (state.user && state.user.settings.timezone) || 'Asia/Karachi';

/** money(1500) → "Rs 1,500"   money(-20.5) → "-Rs 20.50"   money(5, {sign:true}) → "+Rs 5" */
export function money(n, { sign = false, compact = false } = {}) {
  const v = Number(n) || 0;
  const cur = currency();
  const sym = SYMBOL[cur] || cur;
  const abs = Math.abs(v);
  let body;
  if (compact && abs >= 1000) {
    const units = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    const [d, s] = units.find(([d]) => abs >= d);
    body = `${(abs / d).toFixed(abs / d >= 100 ? 0 : 1).replace(/\.0$/, '')}${s}`;
  } else body = nf(cur, Number.isInteger(abs) ? 0 : 2).format(abs);
  const space = sym.length > 1 ? ' ' : '';
  const prefix = v < 0 ? '-' : sign && v > 0 ? '+' : '';
  return `${prefix}${sym}${space}${body}`;
}
export const symbol = () => SYMBOL[currency()] || currency();

const parse = (s) => new Date(`${s}T00:00:00Z`);
const fmt = (opts) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts });
const F = { full: fmt({ day: 'numeric', month: 'short', year: 'numeric' }), short: fmt({ day: 'numeric', month: 'short' }), group: fmt({ weekday: 'short', day: 'numeric', month: 'short' }), wd: fmt({ weekday: 'short' }), month: fmt({ month: 'short', year: 'numeric' }), monthLong: fmt({ month: 'long', year: 'numeric' }) };

export function todayStr() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone(), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
export const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dateFull = (s) => (s ? F.full.format(parse(s)) : '');
export const dateShort = (s) => F.short.format(parse(s));
export const weekday = (s) => F.wd.format(parse(s));
export const monthLabel = (key) => F.month.format(parse(`${key}-01`));
export const monthLong = (s) => F.monthLong.format(parse(s));
export function dayLabel(s) {
  const t = todayStr();
  if (s === t) return 'Today';
  if (s === addDays(t, -1)) return 'Yesterday';
  return F.group.format(parse(s));
}
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export function mmss(sec) { const m = Math.floor(sec / 60); const s = sec % 60; return `${m}:${String(s).padStart(2, '0')}`; }
