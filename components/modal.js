import { $, html, icon, mount } from '../js/core/dom.js';

/**
 * Accessible modal built on <dialog> (focus trap + Esc + inert page for free).
 * On phones it becomes a bottom sheet. Returns { el, body, foot, close }.
 */
export function openModal({ title, body, footer, size = '', mobile = 'sheet', onClose, canClose, labelledBy = 'modal-title' }) {
  const dlg = document.createElement('dialog');
  dlg.className = `modal ${size} ${mobile === 'center' ? 'center-mobile' : ''}`;
  dlg.setAttribute('aria-labelledby', labelledBy);
  mount(dlg, html`<div class="modal-card"><div class="sheet-handle"></div>
    <div class="modal-head"><h2 id="${labelledBy}">${title}</h2><button class="icon-btn sm plain" type="button" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="modal-body">${body}</div>${footer ? html`<div class="modal-foot">${footer}</div>` : ''}</div>`);
  $('#modal-root').append(dlg);
  let closed = false;
  const close = (result) => { if (closed) return; closed = true; if (dlg.open) dlg.close(); dlg.remove(); document.documentElement.style.overflow = ''; onClose && onClose(result); };
  // a validation/server error disappears as soon as the user edits something
  const clearErr = () => dlg.querySelectorAll('[data-err] .form-error').forEach((e) => e.remove());
  dlg.addEventListener('input', clearErr); dlg.addEventListener('change', clearErr);
  // dismissing (Esc, backdrop, ✕) can be vetoed, e.g. to protect unsaved text; save paths call close() directly
  const requestClose = async () => { if (canClose && !(await canClose())) return; close(); };
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); requestClose(); });
  dlg.addEventListener('mousedown', (e) => { if (e.target === dlg && !canClose) close(); });
  dlg.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) requestClose(); });
  dlg.showModal();
  document.documentElement.style.overflow = 'hidden';
  return { el: dlg, body: $('.modal-body', dlg), foot: $('.modal-foot', dlg), close };
}

export function confirmDialog({ title, message, confirmText = 'Delete', cancelText = 'Cancel', danger = true }) {
  return new Promise((resolve) => {
    let answer = false;
    const m = openModal({
      title, size: 'narrow', mobile: 'center', labelledBy: 'confirm-title',
      body: html`<p class="muted" style="font-size:15px">${message}</p>`,
      footer: html`<button class="btn btn-ghost" type="button" data-close>${cancelText}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-ok>${confirmText}</button>`,
      onClose: () => resolve(answer),
    });
    $('[data-ok]', m.el).addEventListener('click', () => { answer = true; m.close(); });
    $('[data-close].btn', m.el).focus();
  });
}

export async function withLoading(btn, fn) {
  btn.classList.add('is-loading'); btn.disabled = true;
  try { return await fn(); } finally { btn.classList.remove('is-loading'); btn.disabled = false; }
}
