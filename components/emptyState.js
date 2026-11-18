import { html, icon, raw } from '../js/core/dom.js';

/* Original line illustrations (drawn for this app, theme-aware via CSS variables). */
const G = 'var(--gold)', S = 'var(--stroke-2)', F = 'var(--glass-2)';
const ART = {
  wallet: `<svg class="art" viewBox="0 0 160 120" fill="none" aria-hidden="true"><rect x="22" y="30" width="116" height="74" rx="18" fill="${F}" stroke="${S}" stroke-width="2"/><path d="M22 52h116" stroke="${S}" stroke-width="2"/><rect x="96" y="66" width="42" height="26" rx="10" fill="${F}" stroke="${G}" stroke-width="2.5"/><circle cx="108" cy="79" r="4" fill="${G}"/><path d="M40 30l52-14a8 8 0 0 1 10 6l2 8" stroke="${G}" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  receipt: `<svg class="art" viewBox="0 0 160 120" fill="none" aria-hidden="true"><path d="M44 14h72v92l-12-8-12 8-12-8-12 8-12-8-12 8z" fill="${F}" stroke="${S}" stroke-width="2" stroke-linejoin="round"/><path d="M58 38h44M58 54h30M58 70h38" stroke="${G}" stroke-width="2.5" stroke-linecap="round"/><circle cx="122" cy="92" r="16" fill="var(--surface-solid)" stroke="${G}" stroke-width="2.5"/><path d="M122 85v14M115 92h14" stroke="${G}" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  chart: `<svg class="art" viewBox="0 0 160 120" fill="none" aria-hidden="true"><rect x="20" y="16" width="120" height="88" rx="18" fill="${F}" stroke="${S}" stroke-width="2"/><path d="M38 84l24-26 20 14 38-44" stroke="${G}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M110 28h14v14" stroke="${G}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M38 96h84" stroke="${S}" stroke-width="2" stroke-linecap="round"/></svg>`,
  piggy: `<svg class="art" viewBox="0 0 160 120" fill="none" aria-hidden="true"><ellipse cx="78" cy="70" rx="44" ry="32" fill="${F}" stroke="${S}" stroke-width="2"/><path d="M114 60l14-8v22l-12-4" stroke="${S}" stroke-width="2" stroke-linejoin="round"/><circle cx="96" cy="62" r="3" fill="${G}"/><path d="M62 104v-10M92 104v-10" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/><rect x="64" y="34" width="28" height="6" rx="3" fill="${G}"/><circle cx="78" cy="20" r="10" fill="var(--surface-solid)" stroke="${G}" stroke-width="2.5"/><path d="M78 16v8" stroke="${G}" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  search: `<svg class="art" viewBox="0 0 160 120" fill="none" aria-hidden="true"><circle cx="72" cy="54" r="30" fill="${F}" stroke="${S}" stroke-width="2"/><path d="M94 76l28 28" stroke="${G}" stroke-width="4" stroke-linecap="round"/><path d="M60 54h24" stroke="${G}" stroke-width="2.5" stroke-linecap="round"/></svg>`,
};

export function emptyState({ art = 'wallet', title, text, action }) {
  return html`<div class="empty">${raw(ART[art] || ART.wallet)}<h3>${title}</h3>${text ? html`<p>${text}</p>` : ''}${action || ''}</div>`;
}
export function errorState(message) {
  return html`<div class="card err-card">${icon('triangle-alert', 'i-xl')}<h3>We couldn't load this</h3><p class="muted">${message}</p><button class="btn btn-primary" data-retry type="button">${icon('refresh-cw', 'i-sm')} Try again</button></div>`;
}
