'use strict';

const KEY = 'ace-hypixel.minions.v1';
const $ = s => document.querySelector(s);

// Speed bonus from common fuels (percent).
const FUELS = [
  ['None', 0], ['Coal', 5], ['Block of Coal', 5], ['Enchanted Bread', 5], ['Enchanted Coal', 10],
  ['Enchanted Charcoal', 20], ['Enchanted Lava Bucket', 25], ['Magma Bucket', 30], ['Plasma Bucket', 35],
  ['Hamster Wheel', 50], ['Foul Flesh', 90],
];
// Minion storage chests placed next to the minion: [name, extra slots of 64 items].
const STORAGES = [
  ['None', 0], ['Small Storage', 3], ['Medium Storage', 9], ['Large Storage', 15],
  ['X-Large Storage', 21], ['XX-Large Storage', 27],
];
// Minion upgrades (each minion has 2 slots).
//   speed: % speed bonus · compact: storage multiplier · sells: hopper empties the minion so it never fills
const UPGRADES = {
  none: { name: 'None' },
  super_compactor: { name: 'Super Compactor 3000', compact: 160 },
  dwarven_compactor: { name: 'Dwarven Super Compactor', compact: 160 },
  flycatcher: { name: 'Flycatcher', speed: 20 },
  expander: { name: 'Minion Expander', speed: 5 },
  diamond_spreading: { name: 'Diamond Spreading' },
  auto_smelter: { name: 'Auto Smelter' },
  budget_hopper: { name: 'Budget Hopper', sells: true },
  enchanted_hopper: { name: 'Enchanted Hopper', sells: true },
};
// Minions whose drops only the Dwarven Super Compactor can compact.
const DWARVEN = new Set(['MITHRIL']);
const defaultCompactor = id => DWARVEN.has(id) ? 'dwarven_compactor' : 'super_compactor';
// Average items per harvest for minions whose main drop isn't 1 (editable per row anyway).
const DEFAULT_DROPS = { LAPIS: 6, REDSTONE: 4.5 };

let minions = [], byId = new Map(), names = {};
let st = U.readLS(KEY, null) || { bonus: 0, rows: [] };
// Older saves kept fuel/storage as page-wide settings: copy them onto each row.
for (const r of st.rows) {
  if (r.fuel === undefined) r.fuel = st.fuel || 0;
  if (r.storage === undefined) r.storage = st.storage || 0;
  if (!r.upg) r.upg = [defaultCompactor(r.id), 'none'];
}
delete st.fuel; delete st.storage;
const save = () => U.writeLS(KEY, st);

const ingName = id => names[id] ? U.named(names[id][0], names[id][1]) : U.esc(U.pretty(id));

/** Per-minion numbers for a row. */
function stats(row) {
  const m = byId.get(row.id);
  const t = m.tiers.find(x => x.tier === row.tier) || m.tiers[0];
  const ups = row.upg.map(k => UPGRADES[k] || UPGRADES.none);
  const bonus = (FUELS[row.fuel] ? FUELS[row.fuel][1] : 0) + ups.reduce((s, u) => s + (u.speed || 0), 0) + (+st.bonus || 0);
  const action = t.t / (1 + bonus / 100);                 // seconds between actions
  const perDay = 86400 / (action * 2) * row.drops;        // one action places, the next harvests
  const items = t.s + (STORAGES[row.storage] ? STORAGES[row.storage][1] * 64 : 0);
  const compact = Math.max(1, ...ups.map(u => u.compact || 1));
  const sells = ups.some(u => u.sells);
  const fill = sells ? Infinity : (items && perDay ? items * compact / perDay * 86400 : null);
  return { m, t, bonus, action, perDay, items, compact, fill };
}

const opts = (list, sel) => list.map(([v, label]) => `<option value="${v}" ${String(v) === String(sel) ? 'selected' : ''}>${U.esc(label)}</option>`).join('');
const fillText = f => f === Infinity ? 'Never (hopper)' : f ? U.dur(f) : '—';

function renderList() {
  if (!st.rows.length) {
    $('#list').innerHTML = '<p class="empty-note">No minions yet. Search for one above.</p>';
    $('#totals').innerHTML = '';
    return;
  }
  const fuelOpts = FUELS.map(([n, p], i) => [i, p ? `${n} (+${p}%)` : n]);
  const storeOpts = STORAGES.map(([n, s], i) => [i, s ? `${n} (+${s} slots)` : n]);
  const upgOpts = Object.entries(UPGRADES).map(([k, u]) => [k, u.name + (u.speed ? ` (+${u.speed}%)` : '')]);
  $('#list').innerHTML = `<div class="cards">${st.rows.map((row, i) => {
    const s = stats(row);
    return `<div class="card minion">
      <div class="minion-top">
        <h3>${U.esc(s.m.name)}</h3>
        <label class="field">Tier <select data-k="tier" data-i="${i}">${opts(s.m.tiers.map(t => [t.tier, U.roman(t.tier)]), s.t.tier)}</select></label>
        <label class="field">Count <input class="small" type="number" min="1" max="31" value="${row.count}" data-k="count" data-i="${i}"></label>
        <label class="field">Drops / harvest <input class="small" type="number" min="0" step="0.1" value="${row.drops}" data-k="drops" data-i="${i}"></label>
        <button class="btn ghost icon danger" data-del="${i}" title="Remove">✕</button>
      </div>
      <div class="minion-gear">
        <label class="field">Fuel <select data-k="fuel" data-i="${i}">${opts(fuelOpts, row.fuel)}</select></label>
        <label class="field">Storage <select data-k="storage" data-i="${i}">${opts(storeOpts, row.storage)}</select></label>
        <label class="field">Upgrade 1 <select data-k="upg0" data-i="${i}">${opts(upgOpts, row.upg[0])}</select></label>
        <label class="field">Upgrade 2 <select data-k="upg1" data-i="${i}">${opts(upgOpts, row.upg[1])}</select></label>
      </div>
      <div class="minion-stats">
        <span><span class="muted">Speed</span> +${U.num(s.bonus)}%</span>
        <span><span class="muted">Action</span> ${s.action.toFixed(1)}s</span>
        <span><span class="muted">Per day${row.count > 1 ? ` (×${row.count})` : ''}</span> <b>${Math.round(s.perDay * row.count).toLocaleString()}</b></span>
        <span title="${U.num(s.items)} items of storage${s.compact > 1 ? `, compacted ×${s.compact}` : ''}"><span class="muted">Fills up in</span> <b>${fillText(s.fill)}</b></span>
      </div>
    </div>`;
  }).join('')}</div>
    <p class="hint">"Drops / harvest" is the average number of the main item one harvest gives, usually 1. Super Compactors are counted at 160:1.
      "Per day" counts the base item before compacting. Mithril needs the Dwarven Super Compactor.</p>`;
  const totalMinions = st.rows.reduce((n, r) => n + r.count, 0);
  const fills = st.rows.map(r => stats(r).fill).filter(f => f && f !== Infinity);
  $('#totals').innerHTML = `<div class="stats">
    <div class="stat"><div class="k">Minions placed</div><div class="v">${totalMinions}</div></div>
    <div class="stat"><div class="k">First minion full in</div><div class="v">${fills.length ? U.dur(Math.min(...fills)) : 'Never'}</div></div>
  </div>`;
}

function renderUpgrades() {
  if (!st.rows.length) { $('#upgrades').innerHTML = '<p class="empty-note">Add a minion to see what its upgrades cost.</p>'; return; }
  $('#upgrades').innerHTML = `<div class="cards">${st.rows.map((row, i) => {
    const m = byId.get(row.id);
    const max = m.tiers[m.tiers.length - 1].tier;
    const target = Math.min(max, Math.max(row.tier + 1, row.target || row.tier + 1));
    if (row.tier >= max) return `<div class="card"><h3>${U.esc(m.name)} ${U.roman(row.tier)}</h3><div class="muted">Already max tier. 🎉</div></div>`;
    const sum = new Map(); const reqs = []; const uncraftable = [];
    for (let t = row.tier + 1; t <= target; t++) {
      const tt = m.tiers.find(x => x.tier === t);
      if (!tt || !tt.in.length) { uncraftable.push(U.roman(t)); continue; }
      for (const [id, n] of tt.in) sum.set(id, (sum.get(id) || 0) + n);
      if (tt.req) reqs.push(tt.req);
    }
    return `<div class="card">
      <h3>${U.esc(m.name)}: ${U.roman(row.tier)} →
        <select data-k="target" data-i="${i}">${opts(m.tiers.filter(t => t.tier > row.tier).map(t => [t.tier, U.roman(t.tier)]), target)}</select>
        ${row.count > 1 ? `<span class="muted">× ${row.count} minions</span>` : ''}</h3>
      ${sum.size ? `<div>${[...sum].map(([id, n]) => `${U.num(n * row.count)} ${ingName(id)}`).join(' · ')}</div>` : ''}
      ${reqs.length ? `<div class="chips" style="margin-top:6px">${[...new Set(reqs)].map(r => `<span class="chip req">🔒 ${U.esc(r)}</span>`).join('')}</div>` : ''}
      ${uncraftable.length ? `<p class="hint">Tier ${uncraftable.join(', ')} isn't crafted with a normal recipe, so it isn't included.</p>` : ''}
      <p class="hint"><a href="../ironman/?item=${encodeURIComponent(m.id + '_GENERATOR_' + target)}&qty=${row.count}">Break it down in the Ironman planner →</a>
        (enter your current ${U.roman(row.tier)} minions as "have" there)</p>
    </div>`;
  }).join('')}</div>`;
}

function render() {
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
  $('#bonus').addEventListener('change', e => { st.bonus = Math.max(0, +e.target.value || 0); save(); render(); });
  $('#search').addEventListener('input', search);
  $('#results').addEventListener('click', e => {
    const b = e.target.closest('[data-add]'); if (!b) return;
    const m = byId.get(b.dataset.add);
    // New minions copy the gear of the last minion you added, or start with a compactor.
    const prev = st.rows[st.rows.length - 1];
    st.rows.push({
      id: m.id, tier: m.tiers[0].tier, count: 1, drops: DEFAULT_DROPS[m.id] || 1,
      fuel: prev ? prev.fuel : 0, storage: prev ? prev.storage : 0,
      upg: prev ? prev.upg.map(k => (k === 'super_compactor' || k === 'dwarven_compactor') ? defaultCompactor(m.id) : k)
        : [defaultCompactor(m.id), 'none'],
    });
    $('#search').value = ''; $('#results').hidden = true;
    save(); render();
  });
  const onChange = e => {
    const { k, i } = e.target.dataset;
    const r = st.rows[i];
    if (!r || !k) return;
    const v = e.target.value;
    if (k === 'tier') { r.tier = +v; r.target = 0; }
    else if (k === 'count') r.count = Math.max(1, parseInt(v, 10) || 1);
    else if (k === 'drops') r.drops = Math.max(0, +v || 0);
    else if (k === 'fuel') r.fuel = +v;
    else if (k === 'storage') r.storage = +v;
    else if (k === 'upg0') r.upg[0] = v;
    else if (k === 'upg1') r.upg[1] = v;
    else if (k === 'target') r.target = +v;
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
  save();
  bind(); render();
}).catch(() => { $('#list').innerHTML = '<p class="empty-note">Couldn\'t load minion data.</p>'; });
