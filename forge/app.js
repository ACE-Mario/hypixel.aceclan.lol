'use strict';

const KEY = 'ace-hypixel.forge.v1';
const $ = s => document.querySelector(s);
let recipes = [], byId = new Map(), names = {};
let st = U.readLS(KEY, null) || { slots: 2, quick: 0, startMode: 'now', startAt: '', queue: [] };
const save = () => U.writeLS(KEY, st);

const nameOf = id => {
  const r = byId.get(id);
  if (r) return U.named(r.c, r.name);
  const n = names[id];
  return n ? U.named(n[0], n[1]) : U.esc(U.pretty(id));
};
const plainName = id => (byId.get(id) || {}).name || (names[id] || [])[1] || U.pretty(id);
const forgeTime = r => r.dur * (1 - Math.min(30, Math.max(0, +st.quick || 0)) / 100);
let running = []; // what's in the forge right now, from the profile: { slot (0-based), id, start (unix s) }
const runEnd = j => { const r = byId.get(j.id); return r ? j.start + forgeTime(r) : null; };

function startTime() {
  if (st.startMode === 'custom' && st.startAt) {
    const t = new Date(st.startAt).getTime();
    if (!isNaN(t)) return t / 1000;
  }
  return SB.now();
}

/** Spread every forge across the slots in queue order; each forge takes the slot that frees up first. */
function schedule() {
  const t0 = startTime();
  const free = Array.from({ length: st.slots }, () => t0);
  const lanes = Array.from({ length: st.slots }, () => []);
  const jobs = [];
  let busyUntil = t0;
  // Slots still busy with what's forging now only take new items once that's done
  for (const j of running) {
    const end = runEnd(j);
    if (j.slot >= st.slots || end === null || end <= t0) continue;
    free[j.slot] = Math.max(free[j.slot], end);
    lanes[j.slot].push({ qi: -1, id: j.id, slot: j.slot, start: Math.max(t0, j.start), end, running: true });
    busyUntil = Math.max(busyUntil, end);
  }
  st.queue.forEach((q, qi) => {
    const r = byId.get(q.id);
    if (!r) return;
    const forges = Math.ceil(q.qty / r.count);
    for (let k = 0; k < forges; k++) {
      let s = 0;
      for (let i = 1; i < free.length; i++) if (free[i] < free[s]) s = i;
      const start = free[s], end = start + forgeTime(r);
      free[s] = end;
      const job = { qi, id: q.id, slot: s, start, end };
      lanes[s].push(job); jobs.push(job);
    }
  });
  const done = jobs.length ? Math.max(...jobs.map(j => j.end)) : t0;
  return { t0, lanes, jobs, done, span: Math.max(done, busyUntil) };
}

function renderQueue(sch) {
  if (!st.queue.length) {
    $('#queue').innerHTML = '<p class="empty-note">Nothing queued yet. Search for a forge item above.</p>';
    return;
  }
  const readyBy = new Map();
  for (const j of sch.jobs) readyBy.set(j.qi, Math.max(readyBy.get(j.qi) || 0, j.end));
  $('#queue').innerHTML = `<div class="table-wrap"><table class="table">
    <thead><tr><th>Item</th><th class="num">Amount</th><th class="num">Each</th><th>All ready</th><th></th></tr></thead>
    <tbody>${st.queue.map((q, i) => {
      const r = byId.get(q.id);
      if (!r) return '';
      const forges = Math.ceil(q.qty / r.count);
      return `<tr>
        <td><div class="item-cell">${nameOf(q.id)} ${r.req ? `<span class="chip req">🔒 ${U.esc(r.req)}</span>` : ''}</div>
          <div class="ing">${forges} forge${forges > 1 ? 's' : ''}${r.count > 1 ? ` · makes ${r.count} each` : ''}</div></td>
        <td class="num"><input class="small" type="number" min="1" value="${q.qty}" data-qty="${i}" aria-label="Amount"></td>
        <td class="num nowrap">${U.dur(forgeTime(r))}</td>
        <td class="nowrap">${U.when(readyBy.get(i))}</td>
        <td class="right nowrap">
          <button class="btn ghost icon" data-up="${i}" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn ghost icon" data-down="${i}" title="Move down" ${i === st.queue.length - 1 ? 'disabled' : ''}>↓</button>
          <a class="btn ghost icon" href="../ironman/?item=${encodeURIComponent(q.id)}&qty=${q.qty}" title="Plan all materials in the Ironman planner">Plan</a>
          <button class="btn ghost icon danger" data-del="${i}" title="Remove">✕</button>
        </td>
      </tr>`;
    }).join('')}</tbody></table></div>
    <p class="hint">Everything is done ${U.when(sch.done)} (${U.dur(sch.done - sch.t0)} from start).</p>`;
}

function renderTimeline(sch) {
  if (!sch.jobs.length && sch.span <= sch.t0) { $('#timeline').innerHTML = '<p class="empty-note">Your forge slots will show up here.</p>'; return; }
  const span = Math.max(1, sch.span - sch.t0);
  const pct = t => ((t - sch.t0) / span * 100).toFixed(3);
  $('#timeline').innerHTML = `<div class="slots">${sch.lanes.map((lane, i) => `
    <div class="slot"><div class="lab">Slot ${i + 1}</div>
      <div class="lane">${lane.map(j => `<div class="job${j.running ? ' running' : ''}" style="left:${pct(j.start)}%;width:calc(${pct(j.end) - pct(j.start)}% - 2px)"
        title="${j.running ? 'Forging now: ' : ''}${U.esc(plainName(j.id))}: ${U.esc(U.when(j.start))} → ${U.esc(U.when(j.end))}">${U.esc(plainName(j.id))}</div>`).join('')}
      </div></div>`).join('')}</div>
    <div class="axis"><span>${U.esc(U.when(sch.t0))}</span><span>${U.esc(U.when(sch.t0 + span / 2))}</span><span>${U.esc(U.when(sch.t0 + span))}</span></div>`;
}

function renderMats() {
  const total = new Map();
  let coins = 0;
  for (const q of st.queue) {
    const r = byId.get(q.id);
    if (!r) continue;
    const forges = Math.ceil(q.qty / r.count);
    coins += r.coins * forges;
    for (const [id, n] of r.in) total.set(id, (total.get(id) || 0) + n * forges);
  }
  if (!total.size && !coins) { $('#mats').innerHTML = '<p class="empty-note">Nothing yet.</p>'; return; }
  $('#mats').innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Material</th><th class="num">Needed</th></tr></thead><tbody>
    ${[...total].sort((a, b) => plainName(a[0]).localeCompare(plainName(b[0]))).map(([id, n]) =>
      `<tr><td>${nameOf(id)}</td><td class="num">${U.num(n)}</td></tr>`).join('')}
    ${coins ? `<tr><td>${U.named('6', 'Coins')}</td><td class="num">${U.num(coins)}</td></tr>` : ''}
  </tbody></table></div>
  <p class="hint">These are the forges' direct ingredients. Use "Plan" on a queue item to break it down to raw materials.</p>`;
}

function renderNow() {
  const el = $('#forgeNow');
  if (!running.length) { el.innerHTML = ''; return; }
  const now = SB.now();
  el.innerHTML = `<h3 class="section-h">In your forge now</h3><div class="forge-now">${running.map(j => {
    const end = runEnd(j), ready = end !== null && end <= now;
    return `<div class="fn-row ${ready ? 'ready' : ''}"><span class="muted">Slot ${j.slot + 1}</span><span class="grow">${nameOf(j.id)}</span>
      <span class="nowrap">${end === null ? 'started ' + U.esc(U.when(j.start)) : ready ? '✓ ready to collect' : `ready ${U.esc(U.when(end))} · ${U.countdown(end - now)} left`}</span></div>`;
  }).join('')}</div>
  <p class="hint">New items in the queue go into a slot once it's free. Times use your Quick Forge % above.</p>`;
}
function applyProfile(d) {
  const f = (d.member.forge && d.member.forge.forge_processes) || {};
  running = [];
  for (const forge of Object.values(f)) {
    for (const p of Object.values(forge || {})) {
      if (!p || !p.id || !p.startTime) continue;
      running.push({ slot: Math.max(0, (+p.slot || 1) - 1), id: p.id, start: p.startTime / 1000 });
    }
  }
  running.sort((a, b) => a.slot - b.slot);
  const top = running.reduce((m, j) => Math.max(m, j.slot + 1), 0);
  if (top > st.slots) { st.slots = Math.min(7, top); save(); }
  render();
  return running.length ? `${running.length} item${running.length > 1 ? 's' : ''} forging` : 'Nothing in your forge right now';
}

function render() {
  renderNow();
  $('#slots').value = st.slots;
  $('#quick').value = st.quick;
  $('#startMode').value = st.startMode;
  $('#startAtWrap').hidden = st.startMode !== 'custom';
  $('#startAt').value = st.startAt;
  const sch = schedule();
  renderQueue(sch);
  renderTimeline(sch);
  renderMats();
}

function search() {
  const q = $('#search').value.trim().toLowerCase();
  const box = $('#results');
  if (!q) { box.hidden = true; return; }
  const words = q.split(/\s+/);
  const hits = recipes.filter(r => words.every(w => r.name.toLowerCase().includes(w))).slice(0, 30);
  box.hidden = false;
  box.innerHTML = hits.length ? hits.map(r => `<button type="button" data-add="${U.esc(r.id)}">
      <span>${U.named(r.c, r.name)} <span class="ing">· ${r.in.map(([id, n]) => `${U.num(n)} ${U.esc(plainName(id))}`).join(', ')}</span></span>
      <span class="ing nowrap">${U.dur(forgeTime(r))}</span></button>`).join('')
    : '<p class="empty-note">No forge recipe matches that.</p>';
}

function bind() {
  $('#slots').innerHTML = [1, 2, 3, 4, 5, 6, 7].map(n => `<option value="${n}">${n}</option>`).join('');
  $('#slots').addEventListener('change', e => { st.slots = +e.target.value; save(); render(); });
  $('#quick').addEventListener('change', e => { st.quick = Math.min(30, Math.max(0, +e.target.value || 0)); save(); render(); search(); });
  $('#startMode').addEventListener('change', e => {
    st.startMode = e.target.value;
    if (st.startMode === 'custom' && !st.startAt) {
      const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
      st.startAt = d.toISOString().slice(0, 16);
    }
    save(); render();
  });
  $('#startAt').addEventListener('change', e => { st.startAt = e.target.value; save(); render(); });
  $('#clear').addEventListener('click', () => { st.queue = []; save(); render(); });
  $('#search').addEventListener('input', search);
  $('#results').addEventListener('click', e => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    const ex = st.queue.find(q => q.id === b.dataset.add);
    if (ex) ex.qty += 1; else st.queue.push({ id: b.dataset.add, qty: 1 });
    $('#search').value = ''; $('#results').hidden = true;
    save(); render();
  });
  $('#queue').addEventListener('change', e => {
    const i = e.target.dataset.qty;
    if (i === undefined) return;
    st.queue[i].qty = Math.max(1, parseInt(e.target.value, 10) || 1);
    save(); render();
  });
  $('#queue').addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    const q = st.queue;
    if (t.dataset.del !== undefined) q.splice(+t.dataset.del, 1);
    else if (t.dataset.up !== undefined) { const i = +t.dataset.up; [q[i - 1], q[i]] = [q[i], q[i - 1]]; }
    else if (t.dataset.down !== undefined) { const i = +t.dataset.down; [q[i + 1], q[i]] = [q[i], q[i + 1]]; }
    else return;
    save(); render();
  });
}

fetch('../data/forge.json').then(r => r.json()).then(d => {
  recipes = d.forge; names = d.names;
  byId = new Map(recipes.map(r => [r.id, r]));
  st.queue = st.queue.filter(q => byId.has(q.id));
  bind(); render();
  U.profileBar($('#profileBar'), { what: 'your forge', apply: applyProfile });
  setInterval(() => { if (st.startMode === 'now' && (st.queue.length || running.length)) render(); }, 60000);
}).catch(() => { $('#queue').innerHTML = '<p class="empty-note">Couldn\'t load forge recipes.</p>'; });
