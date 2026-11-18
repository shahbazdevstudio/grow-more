import { $, $$, html, icon, mount, raw } from '../js/core/dom.js';
import { sanitize } from '../js/core/sanitize.js';

const TOOLS = [['bold', 'bold', 'Bold'], ['italic', 'italic', 'Italic'], ['underline', 'underline', 'Underline'], ['insertUnorderedList', 'list', 'Bulleted list'], ['insertOrderedList', 'list-ordered', 'Numbered list'], ['removeFormat', 'eraser', 'Clear formatting']];

/**
 * Small, mobile-friendly rich-text editor: bold, italic, underline, bullet/numbered lists.
 * contenteditable + execCommand works on every browser including Android; paste is forced to plain text.
 */
export function createEditor(root, { html: initial = '', placeholder = 'Start writing…', onInput } = {}) {
  mount(root, html`<div class="editor-wrap"><div class="editor-bar" role="toolbar" aria-label="Text formatting">${TOOLS.map(([cmd, ic, label]) => html`<button type="button" class="ed-btn" data-cmd="${cmd}" aria-label="${label}" title="${label}">${icon(ic, 'i-sm')}</button>`)}</div>
    <div class="editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Note text" data-placeholder="${placeholder}" spellcheck="true">${raw(sanitize(initial))}</div></div>`);
  const ed = $('.editor', root);
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* ignore */ }
  const sync = () => $$('.ed-btn', root).forEach((b) => { let on = false; try { on = !['removeFormat'].includes(b.dataset.cmd) && document.queryCommandState(b.dataset.cmd); } catch { /* ignore */ } b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  // keep the text selection when tapping toolbar buttons
  root.addEventListener('mousedown', (e) => { if (e.target.closest('.ed-btn')) e.preventDefault(); });
  root.addEventListener('touchstart', (e) => { if (e.target.closest('.ed-btn')) e.preventDefault(); }, { passive: false });
  root.addEventListener('click', (e) => { const b = e.target.closest('.ed-btn'); if (!b) return; ed.focus(); document.execCommand(b.dataset.cmd, false, null); sync(); onInput && onInput(); });
  ed.addEventListener('input', () => { sync(); onInput && onInput(); });
  ed.addEventListener('paste', (e) => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t); });
  ed.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) setTimeout(sync, 0); });
  const onSel = () => { if (document.activeElement === ed) sync(); };
  document.addEventListener('selectionchange', onSel);
  return { getHtml: () => sanitize(ed.innerHTML), isEmpty: () => !ed.textContent.trim(), focus: () => ed.focus(), destroy: () => document.removeEventListener('selectionchange', onSel) };
}
