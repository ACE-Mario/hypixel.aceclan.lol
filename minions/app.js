'use strict';

const KEY = 'ace-hypixel.minions.v1';
const $ = s => document.querySelector(s);

// Speed bonus from common fuels (percent).
const FUELS = [
  ['None', 0], ['Coal', 5], ['Block of Coal', 5], ['Enchanted Bread', 5], ['Enchanted Coal', 10],
  ['Enchanted Charcoal', 20], ['Enchanted Lava Bucket', 25], ['Magma Bucket', 30], ['Plasma Bucket', 35],
  ['Hamster Wheel', 50], ['Foul Flesh', 90],
];
// Average items per harvest for minions whose main drop isn't 1 (editable per row anyway).
const DEFAULT_DROPS = { LAPIS: 6, REDSTONE: 4.5 };

let minions = [], byId = new Map(), names = {};
let st = U.readLS(KEY, null) || { fuel: 0, bonus: 0, rows: [] };
const save = () => U.writeLS(KEY, st);

const ingName = id => names[id] ? U.named(names[id][0], names[id][1]) : U.esc(U.pretty(id));
const ingPlain = id => names[id] ? names[id][1] : U.pretty(id);
const totalBonus = () => (FUELS[st.fuel] ? FUELS[st.fuel][1] : 0) + (+st.bonus || 0);
const tierOf = (m, t) => m.tiers.find(x => x.tier === t) || m.tiers[0];

/** Per-minion numbers for a row. */
function stats(row) {
  const m = byId.get(row.id);
  const t = tierOf(m, row.tier);
  const action = t.t / (1 + totalBonus() / 100);         // seconds between actions
  const harvestsPerDay = 86400 / (action * 2);            // one action places, the next harvests
  const perDay = harvestsPerDay * row.drops;
  const fill = t.s && perDay ? t.s / perDay * 86400 : null; // seconds until storage is full
  return { m, t, action, perDay, fill };
}

function renderList() {
  if (!st.rows.length) {
    $('#list').innerHTML = '<p class="empty-note">No minions yet. Search for one above.</p>';
    $('#totals').innerHTML = '';
    return;
  }
  $('#list').innerHTML = `<div class="table-wrap"><table class="table">
    <thead><tr><th>Minion</th><th>Tier</th><th class="num">Count</th><th class="num">Drops / harvest</th>
      <th class="num">Action</th><th class="num">Per day (all)</th><th class="num">Storage full</th><th></th></tr></thead>
    <tbody>${st.rows.map((row, i) => {
      const s = stats(row);
      return `<tr>
        <td><b>${U.esc(s.m.name)}</b></td>
        <td><select data-tier="${i}">${s.m.tiers.map(t => `<option value="${t.tier}" ${t.tier === s.t.tier ? 'selected' : ''}>${U.roman(t.tier)}</option>`).join('')}</select></td>
        <td class="num"><input class="small" type="number" min="1" max="31" value="${row.count}" data-count="${i}" aria-label="Count"></td>
        <td class="num"><input class="small" type="number" min="0" step="0.1" value="${row.drops}" data-drops="${i}" aria-label="Drops per harvest"></td>
        <td class="num nowrap">${s.action.toFixed(1)}s</td>
        <td class="num nowrap"><b>${U.num(s.perDay * row.count)}</b></td>
        <td class="num nowrap" title="Max storage ${U.num(s.t.s)} items per minion">${s.fill ? U.dur(s.fill) : '—'}</td>
        <td class="right"><button class="btn ghost icon danger" data-del="${i}" title="Remove">✕</button></td>
      </tr>`;
    }).join('')}</tbody></table></div>
    <p class="hint">"Drops / harvest" is the average number of the main item one harvest gives, usually 1. Change it for minions that drop more.
      "Storage full" assumes no storage upgrades or compactors.</p>`;
  const totalMinions = st.rows.reduce((n, r) => n + r.count, 0);
  $('#totals').innerHTML = `<div class="stats">
    <div class="stat"><div class="k">Minions placed</div><div class="v">${totalMinions}</div></div>
    <div class="stat"><div class="k">Total speed bonus</div><div class="v">+${U.num(totalBonus())}%</div></div>
    <div class="stat"><div class="k">First storage full</div><div class="v">${(() => {
      const f = st.rows.map(r => stats(r).fill).filter(Boolean);
      return f.length ? U.dur(Math.min(...f)) : '—';
    })()}</div></div>
  </div>`;
}

function renderUpgrades() {
  if (!st.rows.length) { $('#upgrades').innerHTML = '<p class="empty-note">Add a minion to see what its upgrades cost.</p>'; return; }
  $('#upgrades').innerHTML = `<div class="cards">${st.rows.map((row, i) => {
    const m = byId.get(row.id);
    const max = m.tiers[m.tiers.length - 1].tier;
    const target = Math.min(max, Math.max(row.tier + 1, row.target || row.tier + 1));
    if (row.tier >= max) return `<div class="card"><h3>${U.esc(m.name)} ${U.roman(row.tier)}</h3><div class="muted">Already max tier. 🎉</div></div>`;
    const sum = new Map(); const reqs = []; let uncraftable = [];
    for (let t = row.tier + 1; t <= target; t++) {
      const tt = m.tiers.find(x => x.tier === t);
      if (!tt || !tt.in.length) { uncraftable.push(U.roman(t)); continue; }
      for (const [id, n] of tt.in) sum.set(id, (sum.get(id) || 0) + n);
      if (tt.req) reqs.push(tt.req);
    }
    const perMinion = [...sum];
    return `<div class="card">
      <h3>${U.esc(m.name)}: ${U.roman(row.tier)} →
        <select data-target="${i}">${m.tiers.filter(t => t.tier > row.tier).map(t => `<option value="${t.tier}" ${t.tier === target ? 'selected' : ''}>${U.roman(t.tier)}</option>`).join('')}</select>
        ${row.count > 1 ? `<span class="muted">× ${row.count} minions</span>` : ''}</h3>
      ${perMinion.length ? `<div>${perMinion.map(([id, n]) => `${U.num(n * row.count)} ${ingName(id)}`).join(' · ')}</div>` : ''}
      ${reqs.length ? `<div class="chips" style="margin-top:6px">${[...new Set(reqs)].map(r => `<span class="chip req">🔒 ${U.esc(r)}</span>`).join('')}</div>` : ''}
      ${uncraftable.length ? `<p class="hint">Tier ${uncraftable.join(', ')} isn't crafted with a normal recipe, so it isn't included.</p>` : ''}
      <p class="hint"><a href="../ironman/?item=${encodeURIComponent(m.id + '_GENERATOR_' + target)}&qty=${row.count}">Break it down in the Ironman planner →</a>
        (enter your current ${U.roman(row.tier)} minions as "have" there)</p>
    </div>`;
  }).join('')}</div>`;
}

function render() {
  $('#fuel').value = st.fuel;
  $('#bonus').value = st.bonus;
  renderList();
  renderUpgrades();
}

function search() {
  const q = $('#search').value.trim().toLowerCase();
  const box = $('#results');
  if (!q) { box.hidden = true; return; }
  const hits = minions.filter(m => m.name.toLowerCase().includes(q)).slice(0, 25);
  box.hidden = false;
  box.innerHTML = hits.length ? hits.map(m => `<button type="button" data-add="${U.esc(m.id)}">
      <span>${U.esc(m.name)}</span><span class="ing">${m.tiers.length} tiers · ${m.tiers[0].t}s → ${m.tiers[m.tiers.length - 1].t}s</span></button>`).join('')
    : '<p class="empty-note">No minion matches that.</p>';
}

function bind() {
  $('#fuel').innerHTML = FUELS.map(([n, p], i) => `<option value="${i}">${n}${p ? ` (+${p}%)` : ''}</option>`).join('');
  $('#fuel').addEventListener('change', e => { st.fuel = +e.target.value; save(); render(); });
  $('#bonus').addEventListener('change', e => { st.bonus = Math.max(0, +e.target.value || 0); save(); render(); });
  $('#search').addEventListener('input', search);
  $('#results').addEventListener('click', e => {
    const b = e.target.closest('[data-add]'); if (!b) return;
    const m = byId.get(b.dataset.add);
    st.rows.push({ id: m.id, tier: m.tiers[0].tier, count: 1, drops: DEFAULT_DROPS[m.id] || 1 });
    $('#search').value = ''; $('#results').hidden = true;
    save(); render();
  });
  const onChange = e => {
    const d = e.target.dataset;
    const r = st.rows[d.tier ?? d.count ?? d.drops ?? d.target];
    if (!r) return;
    if (d.tier !== undefined) { r.tier = +e.target.value; r.target = 0; }
    if (d.count !== undefined) r.count = Math.max(1, parseInt(e.target.value, 10) || 1);
    if (d.drops !== undefined) r.drops = Math.max(0, +e.target.value || 0);
    if (d.target !== undefined) r.target = +e.target.value;
    save(); render();
  };
  $('#list').addEventListener('change', onChange);
  $('#upgrades').addEventListener('change', onChange);
  $('#list').addEventListener('click', e => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    st.rows.splice(+b.dataset.del, 1); save(); render();
  });
}

fetch('../data/minions.json').then(r => r.json()).then(d => {
  minions = d.minions; names = d.names;
  byId = new Map(minions.map(m => [m.id, m]));
  st.rows = st.rows.filter(r => byId.has(r.id));
  bind(); render();
}).catch(() => { $('#list').innerHTML = '<p class="empty-note">Couldn\'t load minion data.</p>'; });
