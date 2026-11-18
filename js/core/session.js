import { api } from './api.js';

/* Auto-lock after inactivity (client side for comfort; the server enforces the same window independently). */
let timer = null; let minutes = 5; let onIdle = () => {}; let lastPing = 0; let active = false;
const events = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'];

function activity() {
  if (!active) return;
  clearTimeout(timer);
  timer = setTimeout(onIdle, minutes * 60000);
  const now = Date.now();
  if (now - lastPing > 60000) { lastPing = now; api.get('/auth/status').catch(() => {}); } // keeps the server session in step with real activity
}
export function startIdleWatch(mins, cb) {
  stopIdleWatch(); minutes = mins; onIdle = cb; active = true; lastPing = Date.now();
  events.forEach((e) => window.addEventListener(e, activity, { passive: true, capture: true }));
  document.addEventListener('visibilitychange', onVisible);
  activity();
}
export const setIdleMinutes = (m) => { minutes = m; activity(); };
export function stopIdleWatch() {
  active = false; clearTimeout(timer);
  events.forEach((e) => window.removeEventListener(e, activity, { capture: true }));
  document.removeEventListener('visibilitychange', onVisible);
}
async function onVisible() {
  if (document.visibilityState !== 'visible' || !active) return;
  try { const s = await api.get('/auth/status'); if (!s.authenticated) onIdle(); else activity(); } catch { /* offline */ }
}
