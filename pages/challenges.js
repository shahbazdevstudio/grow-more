import { $, $$, html, icon, mount, delegate, raw } from '../js/core/dom.js';
import { api } from '../js/core/api.js';
import { dateShort, dateFull, weekday, plural } from '../js/core/format.js';
import { refresh as refreshRoute } from '../js/core/router.js';
import { emptyState } from '../components/emptyState.js';
import { openModal, confirmDialog, withLoading } from '../components/modal.js';
import { errorBox } from '../components/forms.js';
import { tile } from '../components/businessUi.js';
import { toast } from '../components/toast.js';

const mem = { id: null, day: null }; // the day being looked at inside the open challenge
const DAY_LABEL = { pass: 'Passed', fail: 'Failed', pending: 'In progress', upcoming: 'Upcoming' };
const DAY_PILL = { pass: 'income', fail: 'expense', pending: 'warn', upcoming: '' };
const PRESETS = [50, 70, 80, 100];

const statePill = (c) => (c.state === 'completed'
  ? html`<span class="pill ${c.result === 'passed' ? 'income' : 'expense'}">${c.result === 'passed' ? 'Challenge passed' : 'Challenge failed'}</span>`
  : c.state === 'active' ? html`<span class="pill gold">Day ${c.dayNumber} of ${c.totalDays}</span>`
    : html`<span class="pill">Starts ${dateShort(c.startDate)}</span>`);

/* ============================ Create / edit form ============================ */
export function openChallengeForm({ challenge = null, onSaved } = {}) {
  const started = !!challenge && challenge.state !== 'upcoming';
  const v = challenge || { name: '', description: '', startDate: '', totalDays: 30, passPercent: 80, tasks: [{ title: '', points: 10 }] };
  const taskRow = (t) => html`<div class="task-row" data-row data-id="${t.id || ''}"><input class="input" name="t" maxlength="80" placeholder="Task, e.g. Gym for 1 hour" value="${t.title}" aria-label="Task name"><input class="input pts" name="p" type="number" inputmode="numeric" min="1" max="1000" step="1" value="${t.points}" aria-label="Score for this task"><button class="icon-btn sm plain danger" type="button" data-rm aria-label="Remove task">${icon('x', 'i-sm')}</button></div>`;
  const m = openModal({ title: challenge ? 'Edit challenge' : 'New challenge', size: 'wide', mobile: 'sheet', body: html`<form id="chf" novalidate autocomplete="off"><div class="stack"><div data-err></div>
    <div class="field"><label for="ch-n">Challenge name</label><input class="input" id="ch-n" name="name" maxlength="60" required value="${v.name}" placeholder="e.g. 30-day discipline"></div>
    <div class="field"><label for="ch-d">Description <span class="opt">optional</span></label><input class="input" id="ch-d" name="description" maxlength="300" value="${v.description}" placeholder="Why are you doing this?"></div>
    <div class="field-row">
      <div class="field"><label for="ch-days">Number of days</label><input class="input" id="ch-days" name="totalDays" type="number" inputmode="numeric" min="1" max="365" step="1" required value="${v.totalDays}"></div>
      <div class="field"><label for="ch-start">Start date ${challenge ? '' : html`<span class="opt">default: today</span>`}</label><input class="input" id="ch-start" name="startDate" type="date" value="${v.startDate}" ${started ? raw('disabled') : ''}></div>
    </div>
    <div class="field"><label for="ch-pass">Pass mark — % of the day's score needed to pass a day</label><input class="input" id="ch-pass" name="passPercent" type="number" inputmode="numeric" min="1" max="100" step="1" required value="${v.passPercent}">
      <div class="quick-dates" style="margin-top:6px">${PRESETS.map((p) => html`<button class="chip" type="button" data-preset="${p}">${p}%</button>`)}</div></div>
    <div class="field"><label>Daily tasks and their score</label><div class="task-rows" data-rows>${v.tasks.map(taskRow)}</div>
      <button class="btn btn-sm" type="button" data-add style="justify-self:start;margin-top:8px">${icon('plus', 'i-sm')} Add task</button>
      <p class="hint" data-sum style="margin-top:8px"></p></div>
    ${started ? html`<p class="hint warn">The challenge has already started. The start date is locked, and changing the pass mark re-checks every day with the new mark. Days already played keep the score they had.</p>` : ''}
  </div></form>`,
    footer: html`<button class="btn btn-primary" type="submit" form="chf" data-save>${challenge ? 'Save changes' : 'Create challenge'}</button>` });
  const form = $('#chf', m.el); const rows = $('[data-rows]', m.el); const showErr = (x) => mount($('[data-err]', m.el), errorBox(x));
  setTimeout(() => form.elements.name.focus(), 60);

  const read = () => [...$$('[data-row]', rows)].map((r) => ({ id: r.dataset.id || null, title: r.querySelector('[name=t]').value.trim(), points: Number(r.querySelector('[name=p]').value) })).filter((t) => t.title || t.id);
  const sum = () => {
    const tasks = read().filter((t) => t.title); const total = tasks.reduce((n, t) => n + (Number.isFinite(t.points) ? t.points : 0), 0); const pass = Number(form.elements.passPercent.value);
    $('[data-sum]', m.el).textContent = total && pass >= 1 && pass <= 100 ? `A full day is worth ${total} points. You need ${Math.ceil((total * pass) / 100)} points (${pass}%) to pass a day.` : 'Add tasks with a score to see how many points a day needs.';
    $$('[data-rm]', m.el).forEach((b) => { b.disabled = $$('[data-row]', rows).length <= 1; });
  };
  m.el.addEventListener('input', sum);
  m.el.addEventListener('click', (e) => {
    const p = e.target.closest('[data-preset]'); if (p) { form.elements.passPercent.value = p.dataset.preset; sum(); return; }
    if (e.target.closest('[data-add]')) { if ($$('[data-row]', rows).length >= 30) return showErr('A challenge can have at most 30 tasks.'); rows.insertAdjacentHTML('beforeend', String(taskRow({ title: '', points: 10 }))); rows.lastElementChild.querySelector('[name=t]').focus(); sum(); return; }
    const rm = e.target.closest('[data-rm]'); if (rm && $$('[data-row]', rows).length > 1) { rm.closest('[data-row]').remove(); sum(); }
  });
  sum();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tasks = read().filter((t) => t.title);
    if (!form.elements.name.value.trim()) return showErr('Give the challenge a name.');
    if (!tasks.length) return showErr('Add at least one task.');
    if (tasks.some((t) => !Number.isInteger(t.points) || t.points < 1)) return showErr('Every task needs a score of 1 or more.');
    const body = { name: form.elements.name.value.trim(), description: form.elements.description.value.trim(), totalDays: Number(form.elements.totalDays.value), passPercent: Number(form.elements.passPercent.value), startDate: form.elements.startDate.value || undefined, tasks };
    try {
      const r = await withLoading($('[data-save]', m.el), () => (challenge ? api.put(`/challenges/${challenge.id}`, body) : api.post('/challenges', body)));
      m.close(); toast(challenge ? 'Challenge updated' : 'Challenge created'); onSaved && onSaved(r.challenge);
    } catch (err) { showErr(err.message); }
  });
}

async function deleteChallenge(c, onDone) {
  if (!await confirmDialog({ title: 'Delete this challenge?', message: `"${c.name}" and all its progress will be removed. You can undo this right after.` })) return;
  try {
    await api.del(`/challenges/${c.id}`); onDone && onDone();
    toast('Challenge deleted', { type: 'info', action: { label: 'Undo', onClick: async () => { try { await api.post(`/challenges/${c.id}/restore`); toast('Restored'); refreshRoute(); } catch (e) { toast(e.message, { type: 'error' }); } } } });
  } catch (e) { toast(e.message, { type: 'error' }); }
}

/* ============================ List of challenges ============================ */
async function listView(el) {
  const { items } = await api.get('/challenges');
  const card = (c) => html`<a class="card chal" href="#/challenges?id=${c.id}" aria-label="Open ${c.name}">
    <div class="chal-top"><span class="cico">${icon('target')}</span><div class="row-main"><div class="row-title">${c.name}</div><div class="row-sub">${plural(c.totalDays, 'day')} · pass mark ${c.passPercent}% a day</div></div>${statePill(c)}</div>
    <div><div class="progress thin" ${c.state === 'completed' ? raw(`data-status="${c.result === 'passed' ? 'done' : 'exceeded'}"`) : ''} style="--w:${Math.round((c.stats.elapsed / c.totalDays) * 100)}%"><i></i></div>
      <div class="chal-prog"><span>${c.stats.elapsed} of ${c.totalDays} days gone</span><span>${c.stats.remaining} left</span></div></div>
    <div class="chal-meta"><span class="pill income">${icon('check', 'i-sm')} ${c.stats.passed} passed</span><span class="pill expense">${icon('x', 'i-sm')} ${c.stats.failed} failed</span>
      ${c.state === 'active' && c.today ? html`<span class="pill ${DAY_PILL[c.today.status]}">Today: ${c.today.percent}%</span>` : ''}</div></a>`;
  mount(el, html`<div class="page-head"><p>Set a goal, pick the days and score yourself every day.</p><div class="page-actions"><button class="btn btn-primary" type="button" data-new>${icon('plus')} New challenge</button></div></div>
    ${items.length ? html`<div class="chal-grid">${items.map(card)}</div>` : html`<div class="card">${emptyState({ art: 'chart', title: 'No challenges yet', text: 'Create one — for example 30 days with Gym, Reading and Coding — and tick the tasks off every day.', action: html`<button class="btn btn-primary" type="button" data-new>${icon('plus')} New challenge</button>` })}</div>`}`);
  return delegate(el, 'click', '[data-new]', () => openChallengeForm({ onSaved: (c) => { location.hash = `#/challenges?id=${c.id}`; } }));
}

/* ============================ One challenge ============================ */
async function detailView(el, id) {
  let c = (await api.get(`/challenges/${id}`)).challenge;
  if (mem.id !== id) { mem.id = id; mem.day = null; }
  const defaultDay = () => (c.state === 'upcoming' ? c.startDate : c.state === 'completed' ? c.endDate : c.today.date);
  const sel = () => (mem.day && c.days.some((d) => d.date === mem.day) ? mem.day : defaultDay());
  let dead = false; let queue = Promise.resolve();

  function draw() {
    if (dead) return;
    const s = c.stats; const date = sel(); const day = c.days.find((d) => d.date === date); const open = day.status !== 'upcoming';
    const need = Math.ceil((day.possible * c.passPercent) / 100);
    mount(el, html`<div class="page-head"><div><a class="back-link" href="#/challenges">${icon('chevron-left', 'i-sm')} All challenges</a><div class="chal-title">${c.name}</div>${c.description ? html`<p>${c.description}</p>` : ''}</div>
      <div class="page-actions"><button class="btn btn-sm" type="button" data-edit>${icon('pencil', 'i-sm')} Edit</button><button class="btn btn-sm btn-ghost" type="button" data-del style="color:var(--neg)">${icon('trash-2', 'i-sm')} Delete</button></div></div>
    ${c.state === 'completed' ? html`<div class="card chal-result ${c.result}"><div class="chal-result-ico">${icon(c.result === 'passed' ? 'check' : 'x')}</div><div><div class="row-title">Challenge ${c.result === 'passed' ? 'passed' : 'failed'}</div><div class="row-sub">You passed ${s.passed} of ${s.total} days (${s.successPct}%). The bar was ${c.passPercent}% of the days.</div></div></div>` : ''}
    <div class="stats chal-stats">
      ${tile({ label: 'Total days', value: s.total, sub: `${dateShort(c.startDate)} → ${dateShort(c.endDate)}`, ico: 'calendar-days', color: '#86B7FF' })}
      ${tile({ label: 'Days gone', value: s.elapsed, sub: c.state === 'active' ? `Today is day ${c.dayNumber}` : c.state === 'upcoming' ? 'Not started yet' : 'All days are over', ico: 'history', color: '#E8B04A' })}
      ${tile({ label: 'Days left', value: s.remaining, sub: c.state === 'active' ? 'including today' : c.state === 'upcoming' ? 'still to come' : 'finished', ico: 'hourglass', color: '#A78BFA' })}
      ${tile({ label: 'Passed', value: s.passed, cls: 'pos', sub: `pass mark ${c.passPercent}% a day`, ico: 'circle-check', color: '#52DDA0' })}
      ${tile({ label: 'Failed', value: s.failed, cls: s.failed ? 'neg' : '', sub: s.failed ? 'days below the pass mark' : 'no failed days', ico: 'triangle-alert', color: '#FF8585' })}
    </div>
    <div class="card chal-tasks">
      <div class="card-head"><h3 class="card-title">${date === (c.today && c.today.date) ? 'Today' : `Day ${day.n}`} <span class="muted" style="font-weight:600">· ${weekday(date)}, ${dateFull(date)}</span></h3><span class="pill ${DAY_PILL[day.status]}">${DAY_LABEL[day.status]}</span></div>
      <div class="day-grid" role="group" aria-label="Choose a day">${c.days.map((d) => html`<button class="dg" type="button" data-day="${d.date}" data-status="${d.status}" aria-pressed="${d.date === date}" aria-label="Day ${d.n}, ${dateShort(d.date)}, ${DAY_LABEL[d.status]}">${d.n}</button>`)}</div>
      <div class="dg-legend"><span><i data-s="pass"></i>Passed</span><span><i data-s="fail"></i>Failed</span><span><i data-s="pending"></i>In progress</span><span><i data-s="upcoming"></i>Upcoming</span></div>
      <div class="day-score"><div class="day-score-top"><b>${day.earned} / ${day.possible} points</b><span class="muted">${day.percent}% · need ${need} points (${c.passPercent}%)</span></div>
        <div class="meter"><div class="progress" data-status="${day.status === 'pass' ? 'done' : day.status === 'fail' ? 'exceeded' : ''}" style="--w:${Math.min(100, day.percent)}%"><i></i></div><span class="mark" style="left:${c.passPercent}%" title="Pass mark ${c.passPercent}%"></span></div></div>
      <div class="chal-task-list">${c.tasks.map((t) => { const done = day.done.includes(t.id); return html`<div class="todo ${done ? 'done' : ''}"><button class="check" type="button" data-tick="${t.id}" aria-pressed="${done}" ${open ? '' : raw('disabled')} aria-label="${done ? 'Mark as not done' : 'Mark as done'}: ${t.title}">${icon('check', 'i-sm')}</button><div class="row-main"><div class="todo-title">${t.title}</div></div><span class="pill gold">${t.points} pt${t.points === 1 ? '' : 's'}</span></div>`; })}</div>
      ${open ? '' : html`<p class="hint" style="margin-top:10px">This day has not come yet. You can tick its tasks when it starts.</p>`}
    </div>`);
  }

  const reload = async () => { try { c = (await api.get(`/challenges/${id}`)).challenge; draw(); } catch (e) { toast(e.message, { type: 'error' }); } };
  draw();
  const off = [
    delegate(el, 'click', '[data-day]', (e, b) => { mem.day = b.dataset.day; draw(); }),
    delegate(el, 'click', '[data-tick]', (e, b) => {
      const done = b.getAttribute('aria-pressed') !== 'true'; const date = sel(); b.setAttribute('aria-pressed', done); b.closest('.todo').classList.toggle('done', done);
      // requests go one after another so a quick double-tap can never be answered out of order
      queue = queue.then(() => api.put(`/challenges/${id}/days/${date}`, { taskId: b.dataset.tick, done })).then((r) => { c = r.challenge; draw(); }).catch((er) => { toast(er.message, { type: 'error' }); return reload(); });
    }),
    delegate(el, 'click', '[data-edit]', () => openChallengeForm({ challenge: c, onSaved: (nc) => { c = nc; draw(); } })),
    delegate(el, 'click', '[data-del]', () => deleteChallenge(c, () => { location.hash = '#/challenges'; })),
  ];
  return () => { dead = true; off.forEach((f) => f()); };
}

export default async function challenges(el, { params }) {
  return params.id ? detailView(el, params.id) : listView(el);
}
