import { $, $$, html, icon, mount, delegate, debounce, raw } from '../js/core/dom.js';
import { api } from '../js/core/api.js';
import { todayStr, addDays, dateShort, dateFull } from '../js/core/format.js';
import { sanitize } from '../js/core/sanitize.js';
import { emptyState } from '../components/emptyState.js';
import { openModal, confirmDialog, withLoading } from '../components/modal.js';
import { createEditor } from '../components/richEditor.js';
import { errorBox } from '../components/forms.js';
import { toast } from '../components/toast.js';

const WHEN = [['', 'Any time'], ['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days']];
const mem = { q: '', category: '', pinned: false, when: '' };
const bounds = (w) => { const t = todayStr(); return { today: [t, t], '7d': [addDays(t, -6), t], '30d': [addDays(t, -29), t] }[w] || ['', '']; };
const dayOf = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: undefined }).format(new Date(iso));

export async function openNoteEditor({ id = null, categories = [], onSaved }) {
  let note = null;
  if (id) { try { note = (await api.get(`/notes/${id}`)).note; } catch (e) { toast(e.message, { type: 'error' }); return; } }
  const initial = { title: note?.title || '', category: note?.category || '', pinned: !!note?.pinned, body: note?.body || '' };
  let pinned = initial.pinned; let editor = null; let saved = false;
  const dirty = () => { if (saved || !editor) return false; const f = $('#nf', m.el); return f.elements.title.value.trim() !== initial.title || f.elements.category.value.trim() !== initial.category || pinned !== initial.pinned || editor.getHtml() !== sanitize(initial.body); };
  const m = openModal({ title: id ? 'Edit note' : 'New note', size: 'wide', mobile: 'sheet', labelledBy: 'note-title',
    canClose: async () => !dirty() || confirmDialog({ title: 'Discard changes?', message: 'You have unsaved changes in this note.', confirmText: 'Discard', cancelText: 'Keep editing' }),
    body: html`<form id="nf" novalidate autocomplete="off"><div class="stack"><div data-err></div>
      <input class="input note-title-input" name="title" maxlength="120" placeholder="Title" aria-label="Note title" value="${initial.title}">
      <div class="field-row" style="grid-template-columns:1fr auto;align-items:end"><div class="field"><label for="n-cat">Category <span class="opt">optional</span></label><input class="input" id="n-cat" name="category" maxlength="30" list="n-cats" value="${initial.category}" placeholder="e.g. Ideas, Work"><datalist id="n-cats">${categories.map((c) => html`<option value="${c}">`)}</datalist></div>
        <button class="btn pin-btn ${pinned ? 'on' : ''}" type="button" data-pin aria-pressed="${pinned}" style="height:48px">${icon('pin', 'i-sm')} ${pinned ? 'Pinned' : 'Pin'}</button></div>
      <div data-editor></div>${note ? html`<div class="hint">Created ${dateFull(dayOf(note.createdAt))} · Updated ${dateFull(dayOf(note.updatedAt))}</div>` : ''}</div></form>`,
    footer: html`${id ? html`<button class="btn btn-ghost" type="button" data-del style="color:var(--neg);flex:0 0 auto">${icon('trash-2', 'i-sm')} Delete</button>` : ''}<button class="btn btn-primary" type="submit" form="nf" data-save>${id ? 'Save changes' : 'Save note'}</button>`,
    onClose: () => editor && editor.destroy() });
  editor = createEditor($('[data-editor]', m.el), { html: initial.body, placeholder: 'Write your note…' });
  setTimeout(() => (id ? editor.focus() : $('[name=title]', m.el).focus()), 60);
  const showErr = (x) => mount($('[data-err]', m.el), errorBox(x));
  $('[data-pin]', m.el).addEventListener('click', (e) => { pinned = !pinned; const b = e.currentTarget; b.classList.toggle('on', pinned); b.setAttribute('aria-pressed', pinned); mount(b, html`${icon('pin', 'i-sm')} ${pinned ? 'Pinned' : 'Pin'}`); });
  $('#nf', m.el).addEventListener('input', () => showErr(''));
  $('#nf', m.el).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target;
    const body = { title: f.elements.title.value.trim(), body: editor.getHtml(), category: f.elements.category.value.trim(), pinned };
    if (!body.title && editor.isEmpty()) return showErr('Write a title or some text first.');
    try { await withLoading($('[data-save]', m.el), () => (id ? api.put(`/notes/${id}`, body) : api.post('/notes', body))); saved = true; m.close(); toast(id ? 'Note saved' : 'Note created'); onSaved && onSaved(); }
    catch (err) { showErr(err.message); }
  });
  const del = $('[data-del]', m.el);
  if (del) del.addEventListener('click', async () => {
    if (!await confirmDialog({ title: 'Delete this note?', message: `"${note.title || 'Untitled'}" will be removed. You can undo this right after.` })) return;
    try { await api.del(`/notes/${id}`); saved = true; m.close(); onSaved && onSaved(); toast('Note deleted', { type: 'info', action: { label: 'Undo', onClick: async () => { try { await api.post(`/notes/${id}/restore`); toast('Restored'); onSaved && onSaved(); } catch (er) { toast(er.message, { type: 'error' }); } } } }); }
    catch (er) { toast(er.message, { type: 'error' }); }
  });
}

export default async function notes(el, { refresh }) {
  let items = []; let pag = null; let cats = []; let seq = 0;
  mount(el, html`<div class="page-head"><p>Quick notes with simple formatting. Pin what matters.</p><div class="page-actions"><button class="btn btn-primary" type="button" data-new>${icon('plus')} New note</button></div></div>
    <div class="toolbar"><div class="search">${icon('search')}<input class="input" type="search" placeholder="Search notes" data-q maxlength="80" aria-label="Search notes" value="${mem.q}"></div>
      <div class="chips" data-cats></div><div class="chips" data-when>${WHEN.map(([k, l]) => html`<button class="chip" type="button" data-w="${k}" aria-pressed="${mem.when === k}">${k ? icon('calendar', 'i-sm') : ''} ${l}</button>`)}</div></div><div data-list></div>`);
  const drawCats = () => mount($('[data-cats]', el), html`<button class="chip" type="button" data-c="" aria-pressed="${!mem.category && !mem.pinned}">All</button><button class="chip" type="button" data-pinned aria-pressed="${mem.pinned}">${icon('pin', 'i-sm')} Pinned</button>${cats.map((c) => html`<button class="chip" type="button" data-c="${c}" aria-pressed="${mem.category.toLowerCase() === c.toLowerCase()}">${c}</button>`)}`);
  const card = (n) => html`<div class="note ${n.pinned ? 'pinned' : ''}" data-note="${n.id}" role="button" tabindex="0"><button class="icon-btn sm pin-btn ${n.pinned ? 'on' : ''}" type="button" data-pinnote="${n.id}" data-state="${n.pinned}" aria-label="${n.pinned ? 'Unpin' : 'Pin'} note" aria-pressed="${n.pinned}">${icon('pin', 'i-sm')}</button>
    <div class="note-title">${n.title || 'Untitled'}</div>${n.preview ? html`<div class="note-text">${n.preview}</div>` : ''}<div class="note-foot">${n.category ? html`<span class="pill gold">${n.category}</span>` : ''}<span>${dateShort(dayOf(n.updatedAt))}</span></div></div>`;
  function draw() {
    const box = $('[data-list]', el); drawCats();
    if (!items.length) { const f = mem.q || mem.category || mem.pinned || mem.when; mount(box, html`<div class="card">${emptyState({ art: f ? 'search' : 'receipt', title: f ? 'No notes match' : 'No notes yet', text: f ? 'Try a different search or clear the filters.' : 'Capture an idea, a plan or a list. It saves to your account and is available on every device.', action: f ? html`<button class="btn" type="button" data-reset>Clear filters</button>` : html`<button class="btn btn-primary" type="button" data-new>${icon('plus')} New note</button>` })}</div>`); return; }
    mount(box, html`<div class="notes-grid">${items.map(card)}</div>${pag && pag.page < pag.pages ? html`<div class="load-more"><button class="btn" type="button" data-more>Load more</button></div>` : ''}`);
  }
  async function load(reset = true) {
    const my = ++seq; if (reset) { items = []; mount($('[data-list]', el), html`<div class="notes-grid">${[1, 2, 3].map(() => html`<div class="skeleton" style="height:130px;margin-bottom:14px;border-radius:22px"></div>`)}</div>`); }
    const [from, to] = bounds(mem.when);
    try { const page = reset ? 1 : pag.page + 1; const r = await api.get('/notes', { q: mem.q, category: mem.category, pinned: mem.pinned ? 'true' : '', from, to, page, limit: 24 }); if (my !== seq) return; items = reset ? r.items : items.concat(r.items); pag = r.pagination; cats = r.categories; } catch (e) { toast(e.message, { type: 'error' }); }
    if (my === seq) draw();
  }
  const search = debounce((v) => { mem.q = v.trim(); load(); }, 300);
  const open = (id) => openNoteEditor({ id, categories: cats, onSaved: () => load() });
  const off = [
    delegate(el, 'click', '[data-new]', () => openNoteEditor({ categories: cats, onSaved: () => load() })),
    delegate(el, 'click', '[data-pinnote]', async (e, b) => { e.stopPropagation(); try { await api.put(`/notes/${b.dataset.pinnote}/pin`, { pinned: b.dataset.state !== 'true' }); load(); } catch (er) { toast(er.message, { type: 'error' }); } }),
    delegate(el, 'click', '[data-note]', (e, n) => { if (!e.target.closest('[data-pinnote]')) open(n.dataset.note); }),
    delegate(el, 'keydown', '[data-note]', (e, n) => { if (e.key === 'Enter') open(n.dataset.note); }),
    delegate(el, 'input', '[data-q]', (e, i) => search(i.value)),
    delegate(el, 'click', '[data-c]', (e, b) => { mem.category = b.dataset.c; mem.pinned = false; load(); }),
    delegate(el, 'click', '[data-pinned]', () => { mem.pinned = !mem.pinned; if (mem.pinned) mem.category = ''; load(); }),
    delegate(el, 'click', '[data-w]', (e, b) => { mem.when = b.dataset.w; $$('[data-w]', el).forEach((x) => x.setAttribute('aria-pressed', x === b)); load(); }),
    delegate(el, 'click', '[data-reset]', () => { Object.assign(mem, { q: '', category: '', pinned: false, when: '' }); $('[data-q]', el).value = ''; $$('[data-w]', el).forEach((x) => x.setAttribute('aria-pressed', x.dataset.w === '')); load(); }),
    delegate(el, 'click', '[data-more]', (e, b) => { b.classList.add('is-loading'); load(false); }),
  ];
  await load();
  void raw; void refresh;
  return () => { off.forEach((x) => x()); search.cancel(); seq++; };
}
