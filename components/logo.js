import { html, icon, raw } from '../js/core/dom.js';
import { state } from '../js/core/state.js';

export const ACCOUNT_TYPES = {
  bank: { label: 'Bank account', icon: 'landmark' },
  mobile_wallet: { label: 'Mobile wallet', icon: 'smartphone' },
  cash: { label: 'Cash / On hand', icon: 'banknote' },
  savings: { label: 'Savings', icon: 'piggy-bank' },
  other: { label: 'Other', icon: 'wallet' },
};
export const CATEGORY_ICONS = ['utensils', 'car', 'shopping-bag', 'wifi', 'receipt', 'megaphone', 'user', 'code', 'package', 'gift', 'trending-up', 'dumbbell', 'heart-pulse', 'graduation-cap', 'plane', 'zap', 'film', 'briefcase', 'store', 'tag', 'circle-ellipsis'];
export const SWATCHES = ['#E8B04A', '#34D399', '#60A5FA', '#A78BFA', '#F472B6', '#FB7185', '#F59E0B', '#22D3EE', '#94A3B8'];

/** Account logo: uploaded image → official logo file dropped in assets/logos → type icon. */
export function accountLogo(a, size = '') {
  const t = ACCOUNT_TYPES[a.type] || ACCOUNT_TYPES.other;
  let img = '';
  if (a.logoData) img = html`<img class="cover" data-logo src="${a.logoData}" alt="" decoding="async">`;
  else if (a.logoKey && state.logos.has(a.logoKey)) img = html`<img data-logo src="assets/logos/${state.logos.get(a.logoKey)}" alt="" loading="lazy" decoding="async">`;
  return html`<span class="alogo ${size} ${img ? 'has-img' : ''}" style="--c:${a.color || '#E8B04A'}">${icon(t.icon)}${img}</span>`;
}
export const categoryTile = (c, size = '') => html`<span class="cico ${size}" style="--c:${c ? c.color : '#94A3B8'}">${icon(c ? c.icon : 'tag')}</span>`;

/** If an <img data-logo> fails to load, fall back to the icon underneath. Registered once by app.js. */
export function installLogoFallback() {
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img && img.tagName === 'IMG' && img.hasAttribute('data-logo')) { img.parentElement && img.parentElement.classList.remove('has-img'); img.remove(); }
  }, true);
}
export { raw };
