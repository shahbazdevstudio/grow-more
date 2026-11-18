import { $, $$, html, icon, mount, sleep } from '../js/core/dom.js';
import { mmss } from '../js/core/format.js';

export const REVEAL_MS = 1000; // each digit is shown for one second, then hidden behind a dot

/**
 * Four-digit PIN pad (used by the lock screen and the Change-PIN flow).
 *  - each digit is visible for 1s, then becomes a dot
 *  - the 4th digit triggers `onComplete(pin, ctl)` automatically (after its 1s reveal)
 *  - ctl.error(msg) / ctl.reset(msg) / ctl.lockout({lockedUntil, serverTime}) / ctl.done()
 */
export function mountPinPad(root, { onComplete, message = '' }) {
  mount(root, html`<div class="pin-slots" aria-hidden="true">${[0, 1, 2, 3].map((i) => html`<div class="pin-slot" data-i="${i}" data-state="empty"></div>`)}</div>
    <p class="sr-only" aria-live="polite" data-sr></p>
    <div class="lock-msg" role="status" data-msg>${message}</div>
    <div class="keypad" data-keypad>${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => html`<button class="key" type="button" data-k="${n}" aria-label="${n}">${n}</button>`)}
      <span class="key empty"></span><button class="key" type="button" data-k="0" aria-label="0">0</button>
      <button class="key ghost" type="button" data-k="del" aria-label="Delete last digit">${icon('delete', 'i-lg')}</button></div>`);

  const slots = $$('.pin-slot', root);
  const msg = $('[data-msg]', root);
  const pad = $('[data-keypad]', root);
  const slotsWrap = $('.pin-slots', root);
  let digits = [];
  let timers = [];
  let busy = false;
  let locked = false;
  let countdown = null;
  let destroyed = false;

  const paint = () => slots.forEach((s, i) => {
    if (i >= digits.length) { s.dataset.state = i === digits.length && !busy ? 'active' : 'empty'; s.textContent = ''; }
  });
  const setMsg = (text, cls = '') => { msg.className = `lock-msg ${cls}`; msg.textContent = text; };
  const clear = () => { timers.forEach(clearTimeout); timers = []; digits = []; slots.forEach((s) => { s.textContent = ''; s.dataset.state = 'empty'; }); paint(); };

  function press(k) {
    if (busy || locked || destroyed) return;
    if (k === 'del') {
      if (!digits.length) return;
      clearTimeout(timers[digits.length - 1]);
      digits.pop();
      const s = slots[digits.length]; s.textContent = ''; s.dataset.state = 'empty'; paint();
      setMsg('');
      return;
    }
    if (digits.length >= 4) return;
    const i = digits.length;
    digits.push(k);
    setMsg('');
    slots[i].textContent = k;
    slots[i].dataset.state = 'digit';
    if (navigator.vibrate) navigator.vibrate(8);
    timers[i] = setTimeout(() => { if (digits[i] !== undefined && slots[i].dataset.state === 'digit') { slots[i].textContent = ''; slots[i].dataset.state = 'dot'; } }, REVEAL_MS);
    paint();
    if (digits.length === 4) submit();
  }

  async function submit() {
    busy = true;
    paint();
    const pin = digits.join('');
    let outcome = null;
    const ctl = {
      error: (text, { retry = true } = {}) => { outcome = { type: 'error', text, retry }; },
      reset: (text = '') => { outcome = { type: 'reset', text }; },
      lockout: (info) => { outcome = { type: 'lock', info }; },
      done: () => { outcome = { type: 'done' }; },
    };
    // The 4th digit always stays visible for the full second, even if the server answers instantly.
    await Promise.all([Promise.resolve().then(() => onComplete(pin, ctl)).catch((e) => { outcome = { type: 'error', text: e.message || 'Something went wrong.', retry: true }; }), sleep(REVEAL_MS)]);
    if (destroyed) return;
    busy = false;
    if (!outcome || outcome.type === 'done') return;
    if (outcome.type === 'error') {
      slotsWrap.classList.add('shake');
      setMsg(outcome.text, 'error');
      await sleep(480);
      slotsWrap.classList.remove('shake');
      clear();
    } else if (outcome.type === 'reset') { clear(); setMsg(outcome.text); }
    else if (outcome.type === 'lock') { clear(); startLockout(outcome.info); }
  }

  function startLockout({ lockedUntil, serverTime }) {
    const offset = serverTime ? Date.parse(serverTime) - Date.now() : 0;
    const end = Date.parse(lockedUntil);
    locked = true;
    pad.classList.add('disabled');
    slots.forEach((s) => { s.dataset.state = 'empty'; });
    const tick = () => {
      const left = Math.ceil((end - (Date.now() + offset)) / 1000);
      if (left <= 0) { clearInterval(countdown); locked = false; pad.classList.remove('disabled'); setMsg('You can try again now.'); paint(); return; }
      msg.className = 'lock-msg locked';
      mount(msg, html`<span>Too many incorrect attempts. Try again in</span><span class="count">${mmss(left)}</span>`);
    };
    clearInterval(countdown); tick(); countdown = setInterval(tick, 1000);
  }

  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !root.isConnected || root.closest('[hidden]')) return;
    if (/^\d$/.test(e.key)) { press(e.key); flash(e.key); } else if (e.key === 'Backspace') press('del');
  };
  const flash = (k) => { const b = $(`[data-k="${k}"]`, root); if (b) { b.classList.add('pressed'); setTimeout(() => b.classList.remove('pressed'), 110); } };
  pad.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
  document.addEventListener('keydown', onKey);
  paint();

  return {
    reset: (text = '') => { clear(); setMsg(text); },
    lockout: startLockout,
    setMessage: setMsg,
    destroy: () => { destroyed = true; document.removeEventListener('keydown', onKey); clearInterval(countdown); timers.forEach(clearTimeout); },
  };
}
