import { $, $$, mount, html } from './dom.js';
import { errorState } from '../../components/emptyState.js';

let routes = {};
let current = { cleanup: null, name: null, params: {}, token: 0 };
let guard = () => true;

export const configure = (table, canEnter) => { routes = table; if (canEnter) guard = canEnter; };
export const navigate = (path) => { location.hash = `#/${path}`; };

const skeleton = () => html`<div class="page"><div class="skeleton" style="height:34px;width:40%;margin:8px 0 18px"></div>
  <div class="grid"><div class="skeleton col-12" style="height:170px;border-radius:22px"></div>
  <div class="skeleton col-6" style="height:120px;border-radius:22px"></div><div class="skeleton col-6" style="height:120px;border-radius:22px"></div>
  <div class="skeleton col-12" style="height:260px;border-radius:22px"></div></div></div>`;

export function parseHash() {
  const [name = '', query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  return { name, params: Object.fromEntries(new URLSearchParams(query)) };
}

export async function render({ keepScroll = false } = {}) {
  if (!guard()) return;
  let { name, params } = parseHash();
  if (!routes[name]) { name = 'dashboard'; history.replaceState(null, '', '#/dashboard'); params = {}; }
  const route = routes[name];
  const view = $('#view');
  const token = ++current.token;
  const scrollY = window.scrollY;

  $('#page-title').textContent = route.title;
  $('#page-sub').textContent = typeof route.sub === 'function' ? route.sub() : route.sub || '';
  document.title = `${route.title} · Grow More`;
  $$('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === (route.highlight || name)));

  const sameRoute = keepScroll && current.name === name;
  if (!sameRoute) mount(view, skeleton());
  try {
    const mod = await route.load();
    const holder = document.createElement('div');
    holder.className = 'page preparing'; // in the DOM (so charts can measure) but invisible until ready
    view.append(holder);
    let cleanup;
    try { cleanup = await mod.default(holder, { params, refresh: () => render({ keepScroll: true }) }); }
    catch (e) { holder.remove(); throw e; }
    if (token !== current.token) { holder.remove(); if (typeof cleanup === 'function') cleanup(); return; }
    if (typeof current.cleanup === 'function') current.cleanup();
    current = { cleanup, name, params, token };
    holder.classList.remove('preparing');
    if (sameRoute) holder.style.animation = 'none';
    [...view.children].forEach((c) => c !== holder && c.remove());
    window.scrollTo(0, sameRoute ? scrollY : 0);
  } catch (err) {
    if (token !== current.token || err.code === 'LOCKED') return;
    console.error(err);
    mount(view, html`<div class="page">${errorState(err.message || 'Something went wrong.')}</div>`);
    $('#view [data-retry]')?.addEventListener('click', () => render());
  }
}
export const refresh = () => render({ keepScroll: true });
export const start = () => { window.addEventListener('hashchange', () => render()); return render(); };
