import { $, $$, html, icon, mount, delegate } from '../js/core/dom.js';
import { api } from '../js/core/api.js';
import { todayStr, dateShort } from '../js/core/format.js';
import { emptyState } from '../components/emptyState.js';
import { openModal, confirmDialog, withLoading } from '../components/modal.js';
import { errorBox, readForm } from '../components/forms.js';
import { toast } from '../components/toast.js';

const mem = { status: 'pending' };

export function openTodoForm({ todo = null, onSaved } = {}) {
  const m = openModal({ title: todo ? 'Edit task' : 'New task', size: 'narrow', mobile: 'sheet', body: html`<form id="tdf" novalidate autocomplete="off"><div class="stack"><div data-err></div>
    <div class="field"><label for="td-t">Task</label><input class="input" id="td-t" name="title" maxlength="140" required value="${todo?.title || ''}" placeholder="What needs doing?"></div>
    <div class="field"><label for="td-d">Description <span class="opt">optional</span></label><textarea class="textarea" id="td-d" name="description" maxlength="1000" style="min-height:90px" placeholder="Details…">${todo?.description || ''}</textarea></div>
    <div class="field"><label for="td-due">Due date <span class="opt">optional</span></label><input class="input" type="date" id="td-due" name="dueDate" value="${todo?.dueDate || ''}"><div class="quick-dates" style="margin-top:6px">${[['Today', 0], ['Tomorrow', 1], ['Next week', 7]].map(([l, n]) => html`<button class="chip" type="button" data-q="${n}">${l}</button>`)}</div></div></div></form>`,
    footer: html`${todo ? html`<button class="btn btn-ghost" type="button" data-del style="color:var(--neg);flex:0 0 auto">${icon('trash-2', 'i-sm')} Delete</button>` : ''}<button class="btn btn-primary" type="submit" form="tdf" data-save>${todo ? 'Save changes' : 'Add task'}</button>` });
  const form = $('#tdf', m.el); const showErr = (x) => mount($('[data-err]', m.el), errorBox(x));
  setTimeout(() => form.elements.title.focus(), 60);
  m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (!b) return; const d = new Date(`${todayStr()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + Number(b.dataset.q)); form.elements.dueDate.value = d.toISOString().slice(0, 10); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const d = readForm(form); if (!d.title.trim()) return showErr('Give the task a title.');
    const body = { title: d.title.trim(), description: d.description.trim(), dueDate: d.dueDate || null };
    try { await withLoading($('[data-save]', m.el), () => (todo ? api.put(`/todos/${todo.id}`, body) : api.post('/todos', body))); m.close(); toast(todo ? 'Task updated' : 'Task added'); onSaved && onSaved(); } catch (err) { showErr(err.message); }
  });
  const del = $('[data-del]', m.el); if (del) del.addEventListener('click', () => { m.close(); deleteTodo(todo, onSaved); });
}

export async function deleteTodo(t, onDone) {
  if (!await confirmDialog({ title: 'Delete this task?', message: `"${t.title}" will be removed. You can undo this right after.` })) return;
  try { await api.del(`/todos/${t.id}`); onDone && onDone(); toast('Task deleted', { type: 'info', action: { label: 'Undo', onClick: async () => { try { await api.post(`/todos/${t.id}/restore`); toast('Restored'); onDone && onDone(); } catch (e) { toast(e.message, { type: 'error' }); } } } }); }
  catch (e) { toast(e.message, { type: 'error' }); }
}

export default async function todo(el, { refresh }) {
  let items = []; let counts = { pending: 0, completed: 0, overdue: 0, dueToday: 0 }; let today = todayStr(); let seq = 0; let pag = null; const byId = new Map();
  mount(el, html`<div class="page-head"><p>Keep the day simple. Add a task, tick it off.</p><div class="page-actions"><button class="btn btn-primary" type="button" data-new>${icon('plus')} Add task</button></div></div>
    <form class="todo-quick" data-quick autocomplete="off"><input class="input" name="title" maxlength="140" placeholder="Quick add — type a task and press Enter" aria-label="Quick add task"><button class="btn" type="submit">${icon('plus', 'i-sm')} Add</button></form>
    <div class="tabs" data-tabs></div><div data-list></div>`);
  const drawTabs = () => mount($('[data-tabs]', el), html`<div class="seg" role="tablist">${[['pending', 'Pending', counts.pending], ['completed', 'Completed', counts.completed], ['all', 'All', counts.pending + counts.completed]].map(([k, l, n]) => html`<button type="button" data-s="${k}" aria-pressed="${mem.status === k}">${l} <span class="muted xs">${n}</span></button>`)}</div>${counts.overdue ? html`<span class="pill expense" style="align-self:center;margin-left:12px">${counts.overdue} overdue</span>` : ''}`);
  const row = (t) => html`<div class="todo ${t.completed ? 'done' : ''}" data-id="${t.id}"><button class="check" type="button" data-check="${t.id}" aria-pressed="${t.completed}" aria-label="${t.completed ? 'Mark as not done' : 'Mark as done'}: ${t.title}">${icon('check', 'i-sm')}</button>
    <div class="row-main" data-edit="${t.id}" style="cursor:pointer"><div class="todo-title">${t.title}</div>${t.description ? html`<div class="todo-desc">${t.description}</div>` : ''}${t.dueDate ? html`<div style="margin-top:6px"><span class="pill ${t.overdue ? 'expense' : t.dueToday ? 'gold' : ''}">${icon('calendar', 'i-sm')} ${t.dueToday ? 'Today' : dateShort(t.dueDate)}${t.overdue ? ' · overdue' : ''}</span></div>` : ''}</div>
    <div class="todo-actions"><button class="icon-btn sm plain" type="button" data-edit="${t.id}" aria-label="Edit task">${icon('pencil', 'i-sm')}</button><button class="icon-btn sm plain danger" type="button" data-del="${t.id}" aria-label="Delete task">${icon('trash-2', 'i-sm')}</button></div></div>`;
  function draw() {
    drawTabs(); const box = $('[data-list]', el);
    if (!items.length) { mount(box, html`<div class="card">${emptyState({ art: 'receipt', title: mem.status === 'completed' ? 'Nothing completed yet' : 'All clear', text: mem.status === 'completed' ? 'Tick a task and it appears here.' : 'No pending tasks. Add one above to get started.' })}</div>`); return; }
    let groups;
    if (mem.status === 'pending') groups = [['Overdue', items.filter((t) => t.overdue)], ['Today', items.filter((t) => t.dueToday)], ['Upcoming', items.filter((t) => t.dueDate && t.dueDate > today)], ['No date', items.filter((t) => !t.dueDate)]].filter(([, g]) => g.length);
    else groups = [[null, items]];
    mount(box, html`${groups.map(([name, g]) => html`<div class="todo-group">${name ? html`<div class="group-head" style="padding-top:6px"><span>${name}</span><span>${g.length}</span></div>` : ''}<div class="card" style="padding:6px 10px">${g.map(row)}</div></div>`)}${pag && pag.page < pag.pages ? html`<div class="load-more"><button class="btn" type="button" data-more>Load more</button></div>` : ''}`);
  }
  async function load(reset = true) {
    const my = ++seq;
    try { const page = reset ? 1 : pag.page + 1; const r = await api.get('/todos', { status: mem.status, page, limit: 50 }); if (my !== seq) return; items = reset ? r.items : items.concat(r.items); pag = r.pagination; counts = r.counts; today = r.today; items.forEach((t) => byId.set(t.id, t)); } catch (e) { toast(e.message, { type: 'error' }); }
    if (my === seq) draw();
  }
  const off = [
    delegate(el, 'submit', '[data-quick]', async (e, f) => { e.preventDefault(); const t = f.elements.title.value.trim(); if (!t) return; try { await api.post('/todos', { title: t }); f.reset(); mem.status = mem.status === 'completed' ? 'pending' : mem.status; load(); } catch (er) { toast(er.message, { type: 'error' }); } }),
    delegate(el, 'click', '[data-new]', () => openTodoForm({ onSaved: () => load() })),
    delegate(el, 'click', '[data-s]', (e, b) => { mem.status = b.dataset.s; load(); }),
    delegate(el, 'click', '[data-check]', async (e, b) => {
      const t = byId.get(b.dataset.check); const next = !t.completed; b.setAttribute('aria-pressed', next); b.closest('.todo').classList.toggle('done', next);
      try { await api.put(`/todos/${t.id}/complete`, { completed: next }); setTimeout(() => load(), mem.status === 'all' ? 0 : 380); } catch (er) { toast(er.message, { type: 'error' }); load(); }
    }),
    delegate(el, 'click', '[data-edit]', (e, b) => openTodoForm({ todo: byId.get(b.dataset.edit), onSaved: () => load() })),
    delegate(el, 'click', '[data-del]', (e, b) => deleteTodo(byId.get(b.dataset.del), () => load())),
    delegate(el, 'click', '[data-more]', (e, b) => { b.classList.add('is-loading'); load(false); }),
  ];
  await load(); void refresh; void $$;
  return () => { off.forEach((x) => x()); seq++; };
}
