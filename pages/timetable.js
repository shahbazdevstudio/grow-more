import { $, $$, html, icon, mount, delegate, raw } from '../js/core/dom.js';
import { api } from '../js/core/api.js';
import { state } from '../js/core/state.js';
import { timezone } from '../js/core/format.js';
import { emptyState } from '../components/emptyState.js';
import { openModal, confirmDialog, withLoading } from '../components/modal.js';
import { errorBox, readForm } from '../components/forms.js';
import { toast } from '../components/toast.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const mem = { dow: null };

/** "14:30" → "2:30 PM" */
export const clock12 = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
/** current time of day in the owner's time zone, as minutes since midnight */
const nowMinutes = () => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: timezone(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(Date.now() + (state.serverOffset || 0)));
  return Number(p.find((x) => x.type === 'hour').value) * 60 + Number(p.find((x) => x.type === 'minute').value);
};

export function openTimetableForm({ entry = null, day = 0, onSaved } = {}) {
  const sel = new Set(entry ? entry.days : [day]);
  const v = entry || { title: '', note: '', startTime: '09:00', endTime: '10:00' };
  const m = openModal({ title: entry ? 'Edit time slot' : 'New time slot', size: 'narrow', mobile: 'sheet', body: html`<form id="ttf" novalidate autocomplete="off"><div class="stack"><div data-err></div>
    <div class="field-row"><div class="field"><label for="tt-s">From</label><input class="input" id="tt-s" name="startTime" type="time" required value="${v.startTime}"></div>
      <div class="field"><label for="tt-e">To</label><input class="input" id="tt-e" name="endTime" type="time" required value="${v.endTime}"></div></div>
    <div class="field"><label for="tt-t">Task</label><input class="input" id="tt-t" name="title" maxlength="100" required value="${v.title}" placeholder="What will you do in this time?"></div>
    <div class="field"><label for="tt-n">Note <span class="opt">optional</span></label><input class="input" id="tt-n" name="note" maxlength="300" value="${v.note}" placeholder="Details…"></div>
    <div class="field"><label>Repeat on</label><div class="chips" data-days style="flex-wrap:wrap">${DAYS.map((d, i) => html`<button class="chip" type="button" data-d="${i}" aria-pressed="${sel.has(i)}">${d}</button>`)}</div>
      <div class="quick-dates" style="margin-top:6px"><button class="chip" type="button" data-set="0,1,2,3,4,5,6">Every day</button><button class="chip" type="button" data-set="0,1,2,3,4">Weekdays</button><button class="chip" type="button" data-set="5,6">Weekend</button></div></div>
  </div></form>`,
    footer: html`${entry ? html`<button class="btn btn-ghost" type="button" data-del style="color:var(--neg);flex:0 0 auto">${icon('trash-2', 'i-sm')} Delete</button>` : ''}<button class="btn btn-primary" type="submit" form="ttf" data-save>${entry ? 'Save changes' : 'Add to timetable'}</button>` });
  const form = $('#ttf', m.el); const showErr = (x) => mount($('[data-err]', m.el), errorBox(x));
  const paint = () => $$('[data-d]', m.el).forEach((b) => b.setAttribute('aria-pressed', sel.has(Number(b.dataset.d))));
  m.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]'); if (b) { const d = Number(b.dataset.d); if (sel.has(d)) sel.delete(d); else sel.add(d); paint(); return; }
    const s = e.target.closest('[data-set]'); if (s) { sel.clear(); s.dataset.set.split(',').forEach((d) => sel.add(Number(d))); paint(); }
  });
  setTimeout(() => form.elements.title.focus(), 60);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const d = readForm(form);
    if (!d.title.trim()) return showErr('Write what the task is.');
    if (!d.startTime || !d.endTime) return showErr('Choose both times.');
    if (d.endTime <= d.startTime) return showErr('The end time must be after the start time.');
    if (!sel.size) return showErr('Pick at least one day.');
    const body = { title: d.title.trim(), note: d.note.trim(), startTime: d.startTime, endTime: d.endTime, days: [...sel].sort() };
    try { await withLoading($('[data-save]', m.el), () => (entry ? api.put(`/timetable/${entry.id}`, body) : api.post('/timetable', body))); m.close(); toast(entry ? 'Time slot updated' : 'Added to timetable'); onSaved && onSaved(); } catch (err) { showErr(err.message); }
  });
  const del = $('[data-del]', m.el); if (del) del.addEventListener('click', () => { m.close(); deleteEntry(entry, onSaved); });
}

async function deleteEntry(t, onDone) {
  if (!await confirmDialog({ title: 'Remove this time slot?', message: `"${t.title}" will be removed from every day it repeats on. You can undo this right after.`, confirmText: 'Remove' })) return;
  try { await api.del(`/timetable/${t.id}`); onDone && onDone(); toast('Time slot removed', { type: 'info', action: { label: 'Undo', onClick: async () => { try { await api.post(`/timetable/${t.id}/restore`); toast('Restored'); onDone && onDone(); } catch (e) { toast(e.message, { type: 'error' }); } } } }); }
  catch (e) { toast(e.message, { type: 'error' }); }
}

export default async function timetable(el) {
  let items = []; let todayDow = 0; const byId = new Map();
  if (mem.dow === null) mem.dow = -1; // resolved from the server's "today" on first load
  let ticker = null;

  const draw = () => {
    const dow = mem.dow; const isToday = dow === todayDow; const now = nowMinutes();
    const list = items.filter((t) => t.days.includes(dow)); // already sorted by start time on the server
    const overlaps = new Set(); list.forEach((a, i) => list.slice(i + 1).forEach((b) => { if (mins(b.startTime) < mins(a.endTime) && mins(a.startTime) < mins(b.endTime)) { overlaps.add(a.id); overlaps.add(b.id); } }));
    const row = (t) => { const live = isToday && now >= mins(t.startTime) && now < mins(t.endTime); const over = isToday && now >= mins(t.endTime);
      return html`<div class="slot ${live ? 'live' : ''} ${over ? 'past' : ''}" data-id="${t.id}"><div class="slot-time"><b>${clock12(t.startTime)}</b><span>${clock12(t.endTime)}</span></div>
        <div class="row-main" data-edit="${t.id}" style="cursor:pointer"><div class="todo-title">${t.title}</div>${t.note ? html`<div class="todo-desc">${t.note}</div>` : ''}
          <div class="slot-tags">${live ? html`<span class="pill gold">Now</span>` : ''}${overlaps.has(t.id) ? html`<span class="pill warn" title="This slot overlaps another one">${icon('triangle-alert', 'i-sm')} Overlaps</span>` : ''}${t.days.length < 7 ? html`<span class="pill">${t.days.length === 5 && !t.days.includes(5) && !t.days.includes(6) ? 'Weekdays' : t.days.length === 2 && t.days.includes(5) && t.days.includes(6) ? 'Weekend' : t.days.map((d) => DAYS[d]).join(' · ')}</span>` : ''}</div></div>
        <div class="todo-actions"><button class="icon-btn sm plain" type="button" data-edit="${t.id}" aria-label="Edit time slot">${icon('pencil', 'i-sm')}</button><button class="icon-btn sm plain danger" type="button" data-del="${t.id}" aria-label="Delete time slot">${icon('trash-2', 'i-sm')}</button></div></div>`; };
    mount($('[data-body]', el), html`<div class="tabs"><div class="seg seg-days" role="tablist" aria-label="Day of the week">${DAYS.map((d, i) => html`<button type="button" role="tab" data-dow="${i}" aria-pressed="${i === dow}" aria-selected="${i === dow}" title="${FULL[i]}">${d}${i === todayDow ? html`<i class="today-dot" aria-label="today"></i>` : ''}</button>`)}</div></div>
      <div class="group-head" style="padding-top:2px"><span>${FULL[dow]}${isToday ? ' · today' : ''}</span><span>${list.length} ${list.length === 1 ? 'slot' : 'slots'}</span></div>
      ${list.length ? html`<div class="card" style="padding:6px 10px">${list.map(row)}</div>` : html`<div class="card">${emptyState({ art: 'receipt', title: `Nothing planned for ${FULL[dow]}`, text: 'Add a time slot — for example 6:00 AM to 7:00 AM: Gym.', action: html`<button class="btn btn-primary" type="button" data-new>${icon('plus')} Add time slot</button>` })}</div>`}`);
  };
  async function load() {
    try { const r = await api.get('/timetable'); items = r.items; todayDow = r.dow; byId.clear(); items.forEach((t) => byId.set(t.id, t)); if (mem.dow < 0) mem.dow = todayDow; } catch (e) { toast(e.message, { type: 'error' }); }
    draw();
  }
  mount(el, html`<div class="page-head"><p>Your weekly routine: from this time to that time, do this.</p><div class="page-actions"><button class="btn btn-primary" type="button" data-new>${icon('plus')} Add time slot</button></div></div><div data-body></div>`);
  const off = [
    delegate(el, 'click', '[data-new]', () => openTimetableForm({ day: mem.dow < 0 ? 0 : mem.dow, onSaved: load })),
    delegate(el, 'click', '[data-dow]', (e, b) => { mem.dow = Number(b.dataset.dow); draw(); }),
    delegate(el, 'click', '[data-edit]', (e, b) => openTimetableForm({ entry: byId.get(b.dataset.edit), onSaved: load })),
    delegate(el, 'click', '[data-del]', (e, b) => deleteEntry(byId.get(b.dataset.del), load)),
  ];
  await load();
  ticker = setInterval(() => { if (el.isConnected && !document.querySelector('dialog[open]')) draw(); }, 60000); // keeps the "Now" marker current
  void raw;
  return () => { off.forEach((f) => f()); clearInterval(ticker); };
}
