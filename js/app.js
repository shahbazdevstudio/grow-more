import { $, $$, html, icon, mount } from './core/dom.js';
import { api } from './core/api.js';
import { state, setBootstrap, clearState } from './core/state.js';
import { applyTheme, currentTheme } from './core/theme.js';
import { startIdleWatch, stopIdleWatch } from './core/session.js';
import * as router from './core/router.js';
import { ROUTES, SOON } from './nav.js';
import { mountPinPad } from '../components/pinPad.js';
import { installLogoFallback } from '../components/logo.js';
import { openTransactionForm } from '../components/forms.js';
import { toast } from '../components/toast.js';
import { saveSetting } from '../pages/settings.js';
import { sleep } from './core/dom.js';

const MARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l6-7 4 4 8-9"/><path d="M15 5h6v6"/></svg>';
let pad = null;
let shellBuilt = false;

/* ---------------- Navigation shell ---------------- */
function buildShell() {
  if (shellBuilt) return;
  const link = ([k, r]) => html`<a class="nav-item" href="#/${k}" data-route="${k}">${icon(r.icon)}<span>${r.title}</span></a>`;
  const main = Object.entries(ROUTES).filter(([, r]) => r.main && !r.group);
  const biz = Object.entries(ROUTES).filter(([, r]) => r.group === 'business');
  const prod = Object.entries(ROUTES).filter(([, r]) => r.group === 'productivity');
  mount($('#side-nav'), html`${main.map(link)}<div class="nav-label">Business</div>${biz.map(link)}
    <div class="nav-label">Productivity</div>${prod.map(link)}
    ${SOON.length ? html`<div class="nav-label">Coming soon</div>` : ''}${SOON.map((s) => html`<div class="nav-item" aria-disabled="true" title="${s.title} arrives in Phase ${s.phase}">${icon(s.icon)}<span>${s.title}</span><span class="pill">Soon</span></div>`)}`);
  const t = (k) => { const r = ROUTES[k]; return html`<a class="tab" href="#/${k}" data-route="${k}">${icon(r.icon)}<span>${r.tab}</span></a>`; };
  mount($('#tabbar'), html`${t('dashboard')}${t('transactions')}<button class="fab" type="button" data-fab aria-label="Add transaction">${icon('plus')}</button>${t('analytics')}${t('more')}`);
  $('#tabbar [data-fab]').addEventListener('click', () => openTransactionForm({ onSaved: () => router.refresh() }));
  $('#btn-add').addEventListener('click', () => openTransactionForm({ onSaved: () => router.refresh() }));
  $$('[data-lock-btn]').forEach((b) => b.addEventListener('click', lock));
  $('#btn-theme').addEventListener('click', async () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next); syncThemeIcon();
    try { await saveSetting({ theme: next }); } catch (e) { toast(e.message, { type: 'error' }); }
  });
  window.addEventListener('scroll', () => $('.topbar').classList.toggle('is-stuck', window.scrollY > 6), { passive: true });
  shellBuilt = true;
}
const syncThemeIcon = () => mount($('#btn-theme'), icon(currentTheme() === 'dark' ? 'sun' : 'moon'));

/* ---------------- Lock screen ---------------- */
function showLock(status = {}, message = '') {
  stopIdleWatch();
  $$('dialog.modal').forEach((d) => { d.close(); d.remove(); });
  document.documentElement.style.overflow = '';
  $('#app').hidden = true;
  mount($('#view'), '');
  clearState();
  const lock = $('#lock');
  lock.hidden = false;
  mount(lock, html`<div class="lock-card"><div class="lock-brand"><span class="logomark">${raw(MARK)}</span><div><h1 class="lock-title">Grow More</h1><p class="lock-sub" data-sub>${message || 'Enter your PIN'}</p></div></div><div data-pad></div></div>`);
  pad && pad.destroy();
  pad = mountPinPad($('[data-pad]', lock), { onComplete: login });
  if (status.setupRequired) pad.setMessage('Grow More is not set up yet. Run "npm run setup" on your server.', 'error');
  else if (status.locked) pad.lockout(status);
}
import { raw } from './core/dom.js';

async function login(pin, ctl) {
  try {
    await api.post('/auth/login', { pin });
    ctl.done();
    await enterApp();
  } catch (e) {
    if (e.code === 'LOCKED') return ctl.lockout(e.data);
    if (e.code === 'BAD_PIN') { const n = e.data.attemptsLeft; return ctl.error(n === 1 ? 'Incorrect PIN. One more wrong attempt will lock the app.' : `Incorrect PIN. ${n} attempts left.`); }
    ctl.error(e.message);
  }
}

async function lock() {
  try { await api.post('/auth/logout'); } catch { /* already locked */ }
  showLock({});
}

/* ---------------- Enter app ---------------- */
async function enterApp() {
  const boot = await api.get('/bootstrap');
  setBootstrap(boot);
  applyTheme(boot.user.settings.theme);
  buildShell(); syncThemeIcon();
  pad && pad.destroy(); pad = null;
  $('#lock').hidden = true;
  const app = $('#app'); app.hidden = false;
  app.animate([{ opacity: 0, transform: 'scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.22,.8,.24,1)' });
  startIdleWatch(boot.user.settings.autoLockMinutes, () => lock());
  const desktop = matchMedia('(min-width: 1024px)').matches;
  router.configure(ROUTES, () => !$('#app').hidden);
  if (!location.hash || (desktop && location.hash === '#/more')) location.hash = '#/dashboard';
  if (!enterApp.started) { enterApp.started = true; router.start(); } else router.render();
}

window.addEventListener('gm:session-ended', () => showLock({}, 'Locked for your security. Enter your PIN.'));
window.addEventListener('gm:lock-now', lock);

/* ---------------- Boot ---------------- */
async function loadLogoIndex() {
  try { const r = await fetch('assets/logos/index.json', { cache: 'no-cache' }); if (r.ok) (await r.json()).forEach((f) => state.logos.set(f.replace(/\.[^.]+$/, ''), f)); } catch { /* optional */ }
}

(async function boot() {
  installLogoFallback();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const t0 = performance.now();
  const [status] = await Promise.all([api.get('/auth/status').catch((e) => ({ error: e })), loadLogoIndex()]);
  await sleep(Math.max(0, 1300 - (performance.now() - t0))); // let the brand animation finish
  const splash = $('#splash');
  if (status.error) showLock({}, 'Cannot reach the server'); else if (status.authenticated) { try { await enterApp(); } catch { showLock({}); } } else showLock(status);
  if (status.error) pad.setMessage(status.error.message, 'error');
  splash.classList.add('out'); setTimeout(() => splash.remove(), 600);
})();
