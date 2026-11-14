'use strict';
/* global NO_WATER, EFFECTS, SOIL, CROPS, CROP_XP, OTHER, MUTATIONS, DROP_ICON, DROP_NAME, VINE_CHANCE, GRID, DEFAULT_OPEN */

const KEY = 'ace-hypixel.greenhouse.v1';
const $ = s => document.querySelector(s);
const RCOL = { COMMON: 'f', UNCOMMON: 'a', RARE: '9', EPIC: '5', LEGENDARY: '6' };
const RORDER = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4 };

// Everything that can go in a slot, by id.
const DEF = {};
for (const c of CROPS) DEF[c.id] = { ...c, kind: 'crop', size: 1, xp: CROP_XP };
for (const o of OTHER) DEF[o.id] = { ...o, kind: 'other', size: 1, drops: {}, xp: 0, stages: 0 };
for (const m of MUTATIONS) DEF[m.id] = { ...m, kind: 'mut', icon: m.id };
const MUT_BY_ID = Object.fromEntries(MUTATIONS.map(m => [m.id, m]));

const defaults = () => ({
  open: DEFAULT_OPEN.map(([r, c]) => r + ',' + c),
  plants: [],
  set: { desk: 0, growth: 0, timestalk: 0, flora: 0, yieldDesk: 0, ff: 0 },
  tool: 'inspect', tab: 'plan', sel: null,
  // Auto-planner: what to make, slots it may not use, where it put each target, and whether to fill spare slots.
  reqs: [], blocked: [], targets: [], fill: true,
});
let st = Object.assign(defaults(), U.readLS(KEY, {}) || {});
st.set = Object.assign(defaults().set, st.set);
const save = () => U.writeLS(KEY, st);

/* ---------- helpers ---------- */
const iconURL = id => `../icons/${id}.png`;
const img = (id, alt = '') => `<img src="${iconURL(id)}" alt="${U.esc(alt)}" loading="lazy" draggable="false" onerror="this.style.visibility='hidden'">`;
const nameOf = id => DEF[id] ? DEF[id].name : U.pretty(id);
function nameHTML(id) {
  const d = DEF[id];
  if (d && d.kind === 'mut') return U.named(RCOL[d.r], d.name);
  return U.esc(nameOf(id));
}
const fxChip = k => `<span class="chip fx ${EFFECTS[k].good ? 'good' : 'bad'}" title="${U.esc(EFFECTS[k].text)}">${U.esc(EFFECTS[k].name)}</span>`;
const key = (r, c) => r + ',' + c;
const inGrid = (r, c) => r >= 0 && c >= 0 && r < GRID && c < GRID;

/* ---------- analysis ---------- */
let A = null; // latest analysis

function occupancy() {
  const occ = Array.from({ length: GRID }, () => new Array(GRID).fill(-1));
  st.plants.forEach((p, i) => {
    const s = DEF[p.id] ? DEF[p.id].size : 1;
    for (let dr = 0; dr < s; dr++) for (let dc = 0; dc < s; dc++) if (inGrid(p.r + dr, p.c + dc)) occ[p.r + dr][p.c + dc] = i;
  });
  return occ;
}
/** Cells around a size-s square at (r, c), clipped to the grid. */
function ring(r, c, s) {
  const out = [];
  for (let rr = r - 1; rr <= r + s; rr++) for (let cc = c - 1; cc <= c + s; cc++) {
    if (rr >= r && rr < r + s && cc >= c && cc < c + s) continue;
    if (inGrid(rr, cc)) out.push([rr, cc]);
  }
  return out;
}
/** Orthogonal neighbours of a placement (other placement indices). */
function neighbours(i, occ) {
  const p = st.plants[i], s = DEF[p.id].size, set = new Set();
  for (let k = 0; k < s; k++) {
    for (const [rr, cc] of [[p.r - 1, p.c + k], [p.r + s, p.c + k], [p.r + k, p.c - 1], [p.r + k, p.c + s]]) {
      if (inGrid(rr, cc) && occ[rr][cc] >= 0 && occ[rr][cc] !== i) set.add(occ[rr][cc]);
    }
  }
  return [...set];
}
function cycleSeconds(u) {
  const s = st.set;
  const d = Math.min(9, Math.max(0, +s.desk || 0));
  const bonus = 0.025 * u + 0.0025 * (+s.growth || 0) + 0.001 * (+s.timestalk || 0) + (d === 9 ? 0.5 : 0.05 * d);
  return Math.max(6301, 14400 / (1 + bonus)); // can't go below 1h 45m 1s
}

function analyse() {
  const occ = occupancy();
  const open = new Set(st.open);
  // unique crop types (Sunflower/Moonflower and the two mushrooms count once)
  const groups = new Set(st.plants.map(p => DEF[p.id]).filter(d => d && d.kind === 'crop').map(d => d.group || d.id));
  const u = Math.min(10, groups.size + (+st.set.flora || 0));
  const T = cycleSeconds(u);

  const nb = st.plants.map((_, i) => neighbours(i, occ));
  const native = i => (DEF[st.plants[i].id].fx || []);
  const plants = st.plants.map((p, i) => {
    const d = DEF[p.id];
    const got = new Map(); // effect -> source names
    const add = (k, from) => { if (!got.has(k)) got.set(k, new Set()); got.get(k).add(from); };
    for (const j of nb[i]) {
      for (const k of native(j)) add(k, nameOf(st.plants[j].id));
      // Effect Spread: the neighbour also passes on what it receives from its other neighbours.
      if (native(j).includes('ES')) {
        for (const x of nb[j]) if (x !== i) for (const k of native(x)) if (k !== 'ES') add(k, nameOf(st.plants[x].id) + ' (spread)');
      }
    }
    const immune = got.has('IMM');
    const has = k => got.has(k) && (EFFECTS[k].good || !immune);
    const yieldFx = (has('IHB') ? 30 : has('HB') ? 20 : 0) - (has('HL') ? 20 : 0);
    const xpFx = (has('IXB') ? 30 : has('XB') ? 20 : 0) - (has('XPL') ? 20 : 0);
    let water = 20;
    if (has('WD')) water *= 1.3;
    if (has('IWR')) water = 0; else if (has('WR')) water *= 0.5;
    const mult = (1 + (+st.set.ff || 0) / 100) * (1 + 0.025 * u + 0.02 * (+st.set.yieldDesk || 0)) * (1 + yieldFx / 100);
    const drops = {};
    for (const [k, v] of Object.entries(d.drops || {})) drops[k] = v * mult;
    return {
      i, d, got, immune, yieldFx, xpFx, water: NO_WATER.has(d.id) ? null : water, bd: has('BD'), drops,
      xp: (d.xp || 0) * (1 + xpFx / 100), grow: (d.stages || 0) * T,
    };
  });

  // Where can a mutation appear?
  const spots = [];
  const free = (r, c) => inGrid(r, c) && open.has(key(r, c)) && occ[r][c] < 0;
  for (const m of MUTATIONS) {
    if (m.special) continue;
    for (let r = 0; r <= GRID - m.size; r++) for (let c = 0; c <= GRID - m.size; c++) {
      let ok = true;
      for (let dr = 0; dr < m.size && ok; dr++) for (let dc = 0; dc < m.size && ok; dc++) ok = free(r + dr, c + dc);
      if (!ok) continue;
      const cells = ring(r, c, m.size);
      // Counted per slot: a 2×2 or 3×3 plant counts once for each ring slot it covers (that's the only way
      // recipes like Stoplight Petal, 4 Snoozling + 4 Noctilume around one slot, can fit).
      const count = {}, fx = new Set();
      let plantsAround = 0;
      for (const [rr, cc] of cells) {
        const j = occ[rr][cc];
        if (j < 0) continue;
        const id = st.plants[j].id;
        count[id] = (count[id] || 0) + 1;
        if (id !== 'FIRE') plantsAround++;
        for (const k of native(j)) fx.add(k);
      }
      if (m.lonely) ok = plantsAround === 0 && st.plants.length > 0;
      else if (m.godseed) ok = ['HB', 'XB', 'WR', 'IMM', 'BD', 'ES'].every(k => fx.has(k) || fx.has('I' + k));
      else ok = m.need.every(([id, n]) => (count[id] || 0) >= n);
      if (ok) spots.push({ m, r, c });
    }
  }
  // Lonelily fits almost anywhere on an empty board; only list it if nothing better, and cap it.
  const lone = spots.filter(s => s.m.lonely);
  const rest = spots.filter(s => !s.m.lonely);
  const shownSpots = rest.concat(lone.slice(0, rest.length ? 0 : 3));

  A = { occ, open, u, T, plants, spots: shownSpots, allSpots: spots, groups };
  return A;
}

/* ---------- placing ---------- */
function canPlace(id, r, c) {
  const s = DEF[id].size;
  for (let dr = 0; dr < s; dr++) for (let dc = 0; dc < s; dc++) {
    if (!inGrid(r + dr, c + dc) || !st.open.includes(key(r + dr, c + dc))) return false;
  }
  return true;
}
function removeAt(r, c) {
  const occ = occupancy();
  const i = occ[r] && occ[r][c];
  if (i >= 0) st.plants.splice(i, 1);
  return i >= 0;
}
function place(id, r, c) {
  if (!canPlace(id, r, c)) return false;
  const s = DEF[id].size;
  const occ = occupancy();
  const clash = new Set();
  for (let dr = 0; dr < s; dr++) for (let dc = 0; dc < s; dc++) if (occ[r + dr][c + dc] >= 0) clash.add(occ[r + dr][c + dc]);
  if (clash.size === 1 && s === 1) { const p = st.plants[[...clash][0]]; if (p.id === id) return false; }
  st.plants = st.plants.filter((_, i) => !clash.has(i));
  st.plants.push({ id, r, c });
  return true;
}
function toggleOpen(r, c, want) {
  const k = key(r, c), has = st.open.includes(k);
  const v = want === undefined ? !has : want;
  if (v && !has) st.open.push(k);
  if (!v && has) { st.open = st.open.filter(x => x !== k); removeAt(r, c); }
  return v;
}

/* ---------- rendering ---------- */
function renderPalette() {
  const btn = (id, label, extra = '') => `<button class="pal ${st.tool === id ? 'on' : ''}" data-tool="${id}" title="${U.esc(label)}">${extra}</button>`;
  const item = d => btn(d.id, d.name + (d.size > 1 ? ` (${d.size}×${d.size})` : ''), img(d.icon, d.name));
  const muts = [...MUTATIONS].sort((a, b) => RORDER[a.r] - RORDER[b.r]);
  $('#palette').innerHTML = `
    <div class="pal-row">${btn('inspect', 'Look at a slot', '🔍')}${btn('erase', 'Remove plants', '🧹')}${btn('unlock', 'Unlock or lock slots (Ethereal Vine)', '🔓')}</div>
    <div class="pal-h">Crops</div><div class="pal-row">${CROPS.map(c => item(DEF[c.id])).join('')}${OTHER.map(o => item(DEF[o.id])).join('')}</div>
    <div class="pal-h">Mutations</div><div class="pal-row">${muts.filter(m => !m.special).map(m => item(DEF[m.id]).replace('class="pal', `class="pal r-${m.r.toLowerCase()}`)).join('')}</div>
    <p class="hint" id="toolHint">${toolHint()}</p>`;
}
function toolHint() {
  if (st.tool === 'inspect') return 'Click a slot to see its effects and what could grow there.';
  if (st.tool === 'erase') return 'Click or drag over plants to remove them.';
  if (st.tool === 'unlock') return 'Click or drag over slots to unlock or lock them. Each slot costs 1 Ethereal Vine.';
  if (!DEF[st.tool]) return 'Click a slot to see its effects and what could grow there.';
  const d = DEF[st.tool];
  return `Placing <b>${U.esc(d.name)}</b>${d.size > 1 ? ` (${d.size}×${d.size}, click its top-left slot)` : ''}. Click or drag to plant.`;
}
function plantBadge(pl) {
  const out = [];
  if (pl.yieldFx) out.push(`<span class="b ${pl.yieldFx > 0 ? 'up' : 'down'}">${pl.yieldFx > 0 ? '+' : ''}${pl.yieldFx}%</span>`);
  if (pl.bd) out.push('<span class="b bd" title="Bonus Drops">✦</span>');
  if (pl.immune && [...pl.got.keys()].some(k => !EFFECTS[k].good)) out.push('<span class="b imm" title="Immunity is blocking a bad effect">🛡</span>');
  return out.length ? `<span class="badges">${out.join('')}</span>` : '';
}
function renderGrid() {
  const { occ, open, plants, spots } = A;
  const blocked = new Set(st.blocked);
  const near = new Set();
  for (const k of open) {
    const [r, c] = k.split(',').map(Number);
    for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) if (inGrid(rr, cc) && !open.has(key(rr, cc))) near.add(key(rr, cc));
  }
  let cells = '';
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
    const k = key(r, c);
    const cls = open.has(k) ? (blocked.has(k) ? 'open blocked' : 'open') : near.has(k) ? 'locked next' : 'locked';
    cells += `<div class="gh-cell ${cls} ${st.sel === k ? 'sel' : ''}" data-r="${r}" data-c="${c}" style="grid-area:${r + 1}/${c + 1}"></div>`;
  }
  // Targets from the auto-planner (while their space is still empty), drawn instead of the suggestion there.
  const targets = st.targets.filter(t => MUT_BY_ID[t.id] && occ[t.r] && occ[t.r][t.c] < 0);
  const targetAt = new Set(targets.map(t => key(t.r, t.c)));
  let ghosts = targets.map(t => {
    const m = MUT_BY_ID[t.id], ok = A.allSpots.some(s => s.m.id === m.id && s.r === t.r && s.c === t.c);
    return `<div class="gh-ghost target r-${m.r.toLowerCase()}${ok ? '' : ' broken'}" style="grid-area:${t.r + 1}/${t.c + 1}/span ${m.size}/span ${m.size}" title="Planned: ${U.esc(m.name)}${ok ? '' : " (its ingredients aren't all around it any more)"}">${img(m.id)}</div>`;
  }).join('');
  // best (rarest) mutation suggestion per anchor
  const bestAt = new Map();
  for (const s of spots) {
    if (targetAt.has(key(s.r, s.c))) continue;
    const k = key(s.r, s.c), cur = bestAt.get(k);
    if (!cur || RORDER[s.m.r] > RORDER[cur.m.r] || (RORDER[s.m.r] === RORDER[cur.m.r] && s.m.size > cur.m.size)) bestAt.set(k, s);
  }
  const counts = new Map();
  for (const s of spots) counts.set(key(s.r, s.c), (counts.get(key(s.r, s.c)) || 0) + 1);
  for (const [k, s] of bestAt) {
    const n = counts.get(k);
    ghosts += `<div class="gh-ghost r-${s.m.r.toLowerCase()}" style="grid-area:${s.r + 1}/${s.c + 1}/span ${s.m.size}/span ${s.m.size}" title="Can mutate into ${U.esc(s.m.name)}${n > 1 ? ` (+${n - 1} more)` : ''}">${img(s.m.id)}${n > 1 ? `<span class="n">+${n - 1}</span>` : ''}</div>`;
  }
  const items = st.plants.map((p, i) => {
    const d = DEF[p.id], pl = plants[i];
    return `<div class="gh-plant ${d.kind === 'mut' ? 'mut r-' + d.r.toLowerCase() : d.kind} ${d.block ? 'block' : ''}" style="grid-area:${p.r + 1}/${p.c + 1}/span ${d.size}/span ${d.size}" title="${U.esc(d.name)}">${img(d.icon, d.name)}${plantBadge(pl)}</div>`;
  }).join('');
  $('#grid').innerHTML = cells + ghosts + items;
  $('#grid').dataset.tool = st.tool;
}
function dropsHTML(drops) {
  const e = Object.entries(drops).filter(([, v]) => v > 0);
  if (!e.length) return '<span class="muted">nothing</span>';
  return e.map(([k, v]) => `<span class="drop">${img(DROP_ICON[k])}${U.num(v)} ${U.esc(DROP_NAME[k])}</span>`).join(' ');
}
function renderSummary() {
  const { u, T, plants, spots, open } = A;
  const total = {};
  let xp = 0, vines = 0;
  for (const pl of plants) {
    for (const [k, v] of Object.entries(pl.drops)) total[k] = (total[k] || 0) + v;
    xp += pl.xp;
    if (pl.d.kind === 'mut') vines += VINE_CHANCE[pl.d.r] || 0;
    if (pl.bd) vines += 0.05;
  }
  const locked = GRID * GRID - open.size;
  $('#cycle').textContent = U.dur(T);
  $('#cycleInfo').textContent = `${u}/10 unique crop bonus`;
  const needWater = plants.filter(p => p.water !== null);
  const thirsty = needWater.filter(p => p.water >= 20).length;
  $('#summary').innerHTML = `
    <div class="stats">
      <div class="stat"><div class="k">Growth cycle</div><div class="v">${U.dur(T)}</div></div>
      <div class="stat"><div class="k">Unique crops</div><div class="v">${A.groups.size}${+st.set.flora ? ` + ${st.set.flora} Flora` : ''}</div><div class="hint">+${(2.5 * u).toFixed(1)}% speed and yield</div></div>
      <div class="stat"><div class="k">Mutation spots</div><div class="v">${spots.length}</div></div>
      <div class="stat"><div class="k">Ethereal Vines per harvest</div><div class="v">≈ ${vines.toFixed(2)}</div></div>
      <div class="stat"><div class="k">Slots unlocked</div><div class="v">${open.size} / ${GRID * GRID}</div><div class="hint">${locked ? `${locked} more Ethereal Vines to unlock the rest` : 'All unlocked'}</div></div>
    </div>
    <div class="card"><b>One full harvest</b> <span class="muted">(estimate, with your fortune and upgrades)</span>
      <div class="drops">${dropsHTML(total)}</div>
      <div class="muted" style="margin-top:4px">+${U.num(xp)} Farming XP${needWater.length ? ` · ${needWater.length} plant${needWater.length > 1 ? 's need' : ' needs'} watering${thirsty ? ` (${thirsty} with no Water Retain next to ${thirsty > 1 ? 'them' : 'it'})` : ''}` : ' · nothing here needs watering'}</div>
    </div>`;
}
function renderSide() {
  const panel = $('#detail');
  const sel = st.sel && st.sel.split(',').map(Number);
  let html = '';
  if (sel) {
    const [r, c] = sel;
    const i = A.occ[r][c];
    if (!A.open.has(key(r, c))) {
      html = `<div class="card"><b>Locked slot</b><p class="hint">Use an Ethereal Vine on a slot next to an unlocked one. Switch to 🔓 to mark it unlocked here.</p></div>`;
    } else if (i >= 0) {
      const pl = A.plants[i], d = pl.d;
      const got = [...pl.got].map(([k, from]) => `<li>${fxChip(k)} <span class="muted">from ${U.esc([...from].join(', '))}</span>${!EFFECTS[k].good && pl.immune ? ' <span class="muted">(blocked by Immunity)</span>' : ''}</li>`).join('');
      html = `<div class="card gh-info">
        <div class="item-cell">${img(d.icon)} <b>${nameHTML(d.id)}</b> ${d.kind === 'mut' ? `<span class="chip">${d.r.toLowerCase()}</span>` : ''}</div>
        ${d.note ? `<p class="hint">${U.esc(d.note)}</p>` : ''}
        ${d.fx.length ? `<div class="k">Gives its neighbours</div><div class="chips">${d.fx.map(fxChip).join('')}</div>` : ''}
        <div class="k">Gets from its neighbours</div>${got ? `<ul class="fx-list">${got}</ul>` : '<p class="hint" style="margin:0">No effects. Plant something next to it.</p>'}
        ${d.kind !== 'other' ? `<div class="k">Harvest</div><div class="drops">${dropsHTML(pl.drops)}</div>
        <p class="hint">+${U.num(pl.xp)} Farming XP · ${pl.grow ? `grows in ${U.dur(pl.grow)} (${d.stages} cycles)` : 'appears fully grown'} · ${pl.water === null ? "doesn't need water" : `water lost per cycle: ${pl.water ? Math.round(pl.water) : 'none'}`}</p>` : ''}
      </div>`;
    } else {
      const here = A.allSpots.filter(s => r >= s.r && r < s.r + s.m.size && c >= s.c && c < s.c + s.m.size);
      html = `<div class="card"><b>Empty slot</b> <span class="muted">row ${r + 1}, column ${c + 1}</span>
        ${here.length ? `<div class="k">Can mutate into</div>${here.map(s => spotRow(s)).join('')}` : '<p class="hint">Nothing can mutate here with this layout.</p>'}</div>`;
    }
  }
  const list = [...A.spots].sort((a, b) => RORDER[b.m.r] - RORDER[a.m.r] || a.m.name.localeCompare(b.m.name));
  html += `<h3 class="section-h" style="margin-top:14px">Mutations this layout can make</h3>
    ${list.length ? list.map(s => spotRow(s, true)).join('') : '<p class="hint">None yet. Pick a mutation in the Mutation guide tab and press <b>Try it</b> to load its layout.</p>'}`;
  panel.innerHTML = html;
}
function spotRow(s, withPos) {
  return `<div class="spot">${img(s.m.id)} <span class="grow">${nameHTML(s.m.id)} <span class="muted">${s.m.chance ? s.m.chance + '% per cycle' : ''}${withPos ? ` · row ${s.r + 1}, col ${s.c + 1}` : ''}</span></span>
    <button class="btn ghost small" data-spot="${s.m.id},${s.r},${s.c}" title="Plant it here to plan the next step">Place</button></div>`;
}

/* ---------- mutation guide ---------- */
function needHTML(m) {
  if (m.special) return `<span class="muted">${U.esc(m.special)}</span>`;
  if (m.lonely) return '<span class="muted">No plants in the 8 slots around it.</span>';
  if (m.godseed) return '<span class="muted">Every positive effect around it: harvest, XP, water, Immunity, Bonus Drops and Effect Spread.</span>';
  return m.need.map(([id, n]) => `<span class="need">${img(DEF[id].icon)}<b>${n}×</b> ${nameHTML(id)}</span>`).join(' ');
}
/** Every mutation that has to exist before this one, deepest first. */
function prereqs(m, seen = new Set()) {
  for (const [id] of m.need) {
    const x = MUT_BY_ID[id];
    if (x && !seen.has(id)) { prereqs(x, seen); seen.add(id); }
  }
  if (m.id === 'SHELLFRUIT') { for (const id of ['TURTLELLINI', 'BLASTBERRY']) if (!seen.has(id)) { prereqs(MUT_BY_ID[id], seen); seen.add(id); } }
  return seen;
}
let found = null; // Set of mutation ids this profile has discovered, once loaded
function renderGuide() {
  const q = ($('#gq').value || '').trim().toLowerCase();
  const r = $('#gr').value, f = $('#gf').value;
  const list = MUTATIONS.filter(m => (!r || m.r === r) && (!q || (m.name + ' ' + m.need.map(n => nameOf(n[0])).join(' ')).toLowerCase().includes(q))
    && (!f || !found || (f === 'found') === found.has(m.id)));
  const T = A.T;
  $('#guide').innerHTML = list.map(m => {
    const pre = [...prereqs(m)];
    return `<article class="card mut-card r-${m.r.toLowerCase()}">
      <div class="item-cell">${img(m.id)} <b>${nameHTML(m.id)}</b>
        <span class="chip">${m.r.toLowerCase()}</span>${m.size > 1 ? `<span class="chip">${m.size}×${m.size}</span>` : ''}
        <span class="chip">${SOIL[m.soil]}</span>${found ? (found.has(m.id) ? '<span class="chip raw">✓ discovered</span>' : '<span class="chip req">not found yet</span>') : ''}</div>
      <div class="k">Needs around it</div><div>${needHTML(m)}</div>
      ${pre.length ? `<div class="k">Mutations to grow first (${pre.length}, in order)</div><div class="path">${pre.map(id => `<span class="need">${img(id)}${nameHTML(id)}</span>`).join('')}</div>` : ''}
      <div class="k">Effects</div><div class="chips">${m.fx.length ? m.fx.map(fxChip).join('') : '<span class="muted">none</span>'}</div>
      <div class="k">Harvest</div><div class="drops">${dropsHTML(m.drops)}</div>
      <p class="hint">${m.chance ? `${m.chance}% chance per cycle · ` : ''}${m.stages ? `grows in ${U.dur(m.stages * T)}` : 'appears fully grown'} · +${U.num(m.xp)} XP · ${Math.round(VINE_CHANCE[m.r] * 100)}% Ethereal Vine chance</p>
      ${autoLayout(m) ? `<button class="btn small" data-try="${m.id}">Try it in my greenhouse</button>` : ''}
      ${!m.special && !m.godseed ? `<button class="btn ghost small" data-plan="${m.id}">Auto-plan it</button>` : ''}
    </article>`;
  }).join('') || '<p class="empty-note">No mutations match.</p>';
}
/** Put a ready-made layout for `m` into the first free area of the user's greenhouse. */
function tryLayout(m) {
  const s = m.size, open = new Set(st.open), occ = occupancy();
  const fits = (r, c) => {
    for (let rr = r - 1; rr <= r + s; rr++) for (let cc = c - 1; cc <= c + s; cc++) {
      if (!inGrid(rr, cc) || !open.has(key(rr, cc)) || occ[rr][cc] >= 0) return false;
    }
    return true;
  };
  let at = null;
  for (let r = 1; r <= GRID - s - 1 && !at; r++) for (let c = 1; c <= GRID - s - 1 && !at; c++) if (fits(r, c)) at = [r, c];
  if (!at) { toast(`No free ${s + 2}×${s + 2} area. Clear some plants or unlock more slots (🔓).`); return; }
  const cells = ring(at[0], at[1], s);
  const queue = m.lonely ? [] : m.need.flatMap(([id, n]) => Array(n).fill(id));
  queue.slice(0, cells.length).forEach((id, k) => st.plants.push({ id, r: cells[k][0], c: cells[k][1] }));
  st.sel = key(at[0], at[1]);
  st.tab = 'plan';
  save(); render();
  toast(`Loaded a ${m.name} layout. The faded icon shows where it can appear.`);
}
/** Auto layouts only work when every ingredient takes a single slot. */
const autoLayout = m => !m.special && !m.godseed && !m.lonely && m.need.every(([id]) => DEF[id].size === 1);

/* ---------- auto-planner ---------- */
// Everything with a plain recipe can be planned, plus Lonelily (nothing around it). Godseed needs effects, and
// Shellfruit / Jerryflower can't be made by layout, so they're left out.
const PLANNABLE = MUTATIONS.filter(m => !m.special && !m.godseed).sort((a, b) => RORDER[a.r] - RORDER[b.r] || a.name.localeCompare(b.name));
let lastPlan = null;

/**
 * Lay out the requested mutations on the unlocked, unblocked slots. Each target is an empty space (1×1, 2×2 or 3×3)
 * with its ingredients in the ring around it. Targets are added one at a time, round-robin over the requests, each
 * at the spot that needs the fewest new plants, so neighbouring targets share ingredients. `reqs`: [{ id, n, max }].
 */
function autoPlan(reqs, fill) {
  const open = new Set(st.open), blocked = new Set(st.blocked);
  const usable = (r, c) => inGrid(r, c) && open.has(key(r, c)) && !blocked.has(key(r, c));
  const cell = new Map();      // slot -> plant id
  const reserved = new Set();  // target spaces, which must stay empty
  const noPlant = new Set();   // slots around a Lonelily, which must stay empty
  const plants = [], targets = [], placed = {};
  const canPlant = (r, c) => usable(r, c) && !cell.has(key(r, c)) && !reserved.has(key(r, c)) && !noPlant.has(key(r, c));
  const square = (r, c, s) => { const out = []; for (let dr = 0; dr < s; dr++) for (let dc = 0; dc < s; dc++) out.push([r + dr, c + dc]); return out; };
  const centre = () => {
    const pts = [...cell.keys(), ...reserved].map(k => k.split(',').map(Number));
    if (!pts.length) {
      const o = [...open].map(k => k.split(',').map(Number));
      return o.length ? [o.reduce((n, p) => n + p[0], 0) / o.length, o.reduce((n, p) => n + p[1], 0) / o.length] : [4.5, 4.5];
    }
    return [pts.reduce((n, p) => n + p[0], 0) / pts.length, pts.reduce((n, p) => n + p[1], 0) / pts.length];
  };
  // Free slots around a slot; ingredients go where few are free, which keeps open space together for more targets.
  const freeAround = (r, c) => ring(r, c, 1).filter(([a, b]) => canPlant(a, b)).length;

  function tryTarget(m) {
    const s = m.size, [cr, cc] = centre();
    let best = null;
    for (let r = 0; r <= GRID - s; r++) for (let c = 0; c <= GRID - s; c++) {
      const space = square(r, c, s);
      if (!space.every(([a, b]) => canPlant(a, b))) continue;
      const spaceKeys = new Set(space.map(p => key(...p)));
      const around = ring(r, c, s);
      let adds = [], cost;
      if (m.lonely) {
        if (around.some(([a, b]) => cell.has(key(a, b)) || reserved.has(key(a, b)))) continue;
        cost = around.filter(([a, b]) => usable(a, b)).length;   // open slots it keeps empty
      } else {
        // Plants already around this space, counted per slot like the game does.
        const have = {};
        for (const [a, b] of around) { const id = cell.get(key(a, b)); if (id) have[id] = (have[id] || 0) + 1; }
        const aroundKeys = new Set(around.map(p => key(...p)));
        /** Fill the ring. A 2×2 or 3×3 ingredient counts once per ring slot it covers; `aim` is how many ring
            slots each one should cover (never more than still needed), so different aims give different shapes. */
        const fillRing = aim => {
          const out = [], taken = new Set();
          // Big ingredients first: they need the corners and sides, single plants fill the gaps.
          for (const [id, n] of [...m.need].sort((x, y) => DEF[y[0]].size - DEF[x[0]].size)) {
            let need = n - (have[id] || 0);
            const k = DEF[id].size;
            while (need > 0) {
              if (k === 1) {
                const pick = around.filter(([a, b]) => canPlant(a, b) && !taken.has(key(a, b)))
                  .sort((x, y) => freeAround(...x) - freeAround(...y))[0];
                if (!pick) return null;
                taken.add(key(...pick)); out.push({ id, r: pick[0], c: pick[1] }); need--;
                continue;
              }
              const want = Math.min(aim, need);
              let bp = null, bo = 0;
              for (let a = r - k; a <= r + s; a++) for (let b = c - k; b <= c + s; b++) {
                const sq = square(a, b, k);
                if (!sq.every(([x, y]) => canPlant(x, y) && !taken.has(key(x, y)) && !spaceKeys.has(key(x, y)))) continue;
                const ov = sq.filter(p => aroundKeys.has(key(...p))).length;
                if (ov && ov <= need && (!bp || Math.abs(ov - want) < Math.abs(bo - want))) { bo = ov; bp = [a, b]; }
              }
              if (!bp) return null;
              for (const p of square(bp[0], bp[1], k)) taken.add(key(...p));
              out.push({ id, r: bp[0], c: bp[1] }); need -= bo;
            }
          }
          return { out, cost: taken.size };
        };
        const done = fillRing(Infinity) || fillRing(2) || fillRing(1);
        if (!done) continue;
        adds = done.out; cost = done.cost;
      }
      const score = cost * 10 + Math.abs(r + (s - 1) / 2 - cr) + Math.abs(c + (s - 1) / 2 - cc);
      if (!best || score < best.score) best = { r, c, adds, score, around };
    }
    if (!best) return false;
    for (const p of square(best.r, best.c, s)) reserved.add(key(...p));
    for (const a of best.adds) {
      for (const p of square(a.r, a.c, DEF[a.id].size)) cell.set(key(...p), a.id);
      plants.push(a);
    }
    if (m.lonely) for (const p of best.around) noPlant.add(key(...p));
    targets.push({ id: m.id, r: best.r, c: best.c });
    return true;
  }

  const left = reqs.filter(q => MUT_BY_ID[q.id]).map(q => ({ m: MUT_BY_ID[q.id], n: q.max ? Infinity : Math.max(0, +q.n || 0) }));
  for (let progress = true; progress;) {
    progress = false;
    for (const q of left) {
      if (q.n <= 0) continue;
      if (tryTarget(q.m)) { q.n--; placed[q.m.id] = (placed[q.m.id] || 0) + 1; progress = true; } else q.n = 0;
    }
  }

  // Spare slots: one of each crop type not used yet, for the unique-crop bonus (never next to a target, so
  // they can't change what grows there).
  if (fill) {
    const nearTarget = new Set(targets.flatMap(t => ring(t.r, t.c, MUT_BY_ID[t.id].size).map(p => key(...p))));
    const groups = new Set(plants.map(p => DEF[p.id]).filter(d => d.kind === 'crop').map(d => d.group || d.id));
    const [cr, cc] = centre();
    const spare = [...open].map(k => k.split(',').map(Number))
      .filter(([r, c]) => canPlant(r, c) && !nearTarget.has(key(r, c)))
      .sort((x, y) => Math.abs(x[0] - cr) + Math.abs(x[1] - cc) - Math.abs(y[0] - cr) - Math.abs(y[1] - cc));
    const want = 10 - Math.min(10, +st.set.flora || 0);
    for (const c of CROPS) {
      if (groups.size >= want || !spare.length) break;
      const g = c.group || c.id;
      if (groups.has(g)) continue;
      const [r, cc2] = spare.shift();
      plants.push({ id: c.id, r, c: cc2 }); cell.set(key(r, cc2), c.id); groups.add(g);
    }
  }
  return { plants, targets, placed };
}

function renderAuto() {
  const box = $('#auto');
  const opt = m => `<option value="${m.id}">${U.esc(m.name)} (${m.r.toLowerCase()}${m.size > 1 ? `, ${m.size}×${m.size}` : ''})</option>`;
  const rows = st.reqs.map((q, i) => {
    const m = MUT_BY_ID[q.id];
    return `<div class="spot">${img(m.id)} <span class="grow">${nameHTML(m.id)}</span>
      <input type="number" min="1" max="99" value="${q.n}" data-qn="${i}" style="width:58px" aria-label="How many">
      <button class="btn ghost small" data-qmax="${i}" title="As many as fit with the other requests">Max</button>
      <button class="btn ghost small" data-qdel="${i}" title="Remove">✕</button></div>`;
  }).join('');
  let out = '';
  if (lastPlan) {
    const { placed, plants, reqs } = lastPlan;
    const lines = reqs.map(q => {
      const got = placed[q.id] || 0, m = MUT_BY_ID[q.id];
      return `<li>${nameHTML(q.id)}: <b>${got}</b> of ${q.n} placed${got < q.n ? ' <span class="muted">(no more room)</span>' : ''} · grows on ${U.esc(SOIL[m.soil])}${m.chance ? ` · ${m.chance}% per cycle` : ''}</li>`;
    }).join('');
    const count = {};
    for (const p of plants) count[p.id] = (count[p.id] || 0) + 1;
    const plantList = Object.entries(count).sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `<span class="need">${img(DEF[id].icon)}<b>${n}×</b> ${nameHTML(id)}</span>`).join(' ');
    // Ingredient mutations you need seeds for, and the ones not discovered yet.
    const ingr = [...new Set(plants.map(p => p.id).filter(id => MUT_BY_ID[id]))];
    const missing = found ? ingr.filter(id => !found.has(id)) : [];
    out = `<div class="k">Result</div><ul class="fx-list">${lines}</ul>
      ${plantList ? `<div class="k">Plant these</div><div class="path">${plantList}</div>` : ''}
      ${ingr.length ? `<p class="hint">Mutations used as ingredients have to be grown (or harvested for their seeds) first.</p>` : ''}
      ${missing.length ? `<div class="k">Not discovered yet</div>${missing.map(id => `<div class="spot">${img(id)} <span class="grow">${nameHTML(id)}</span>
        <button class="btn ghost small" data-qfirst="${id}">Plan this first</button></div>`).join('')}` : ''}`;
  }
  box.innerHTML = `<div class="card gh-info">
    <b>Auto-planner</b>
    <p class="hint" style="margin:4px 0 8px">Pick the mutations you want and how many. It fills your unlocked slots with the plants they need,
      sharing ingredients between targets. Faded icons with a gold outline are where each target will grow.</p>
    <div class="toolbar"><select id="aSel" style="flex:1;min-width:0">${PLANNABLE.map(opt).join('')}</select>
      <input id="aN" type="number" min="1" max="99" value="1" style="width:58px" aria-label="How many">
      <button id="aAdd" class="btn small">Add</button></div>
    ${rows || '<p class="hint">Nothing added yet.</p>'}
    <label style="display:block;margin-top:8px"><input type="checkbox" id="aFill" ${st.fill ? 'checked' : ''}> Fill spare slots with other crops for the unique-crop bonus</label>
    <label style="display:block;margin-top:4px"><input type="checkbox" id="aBlock" ${st.tool === 'block' ? 'checked' : ''}> Block slots: click slots on the grid that the planner must leave alone${st.blocked.length ? ` (${st.blocked.length} blocked)` : ''}</label>
    <div class="toolbar" style="margin-top:10px"><button id="aGo" class="btn" ${st.reqs.length ? '' : 'disabled'}>Generate layout</button>
      ${st.blocked.length ? '<button id="aUnblock" class="btn ghost small">Clear blocked slots</button>' : ''}</div>
    ${out}
  </div>`;
}
function runPlan() {
  if (st.plants.length && !lastPlan && !confirm('Replace the plants in your layout with the planned ones?')) return;
  const res = autoPlan(st.reqs, st.fill);
  st.plants = res.plants;
  st.targets = res.targets;
  st.sel = null;
  lastPlan = { ...res, reqs: st.reqs.map(q => ({ ...q })) };
  save(); render();
  const total = Object.values(res.placed).reduce((n, v) => n + v, 0);
  toast(total ? `Planned ${total} mutation spot${total > 1 ? 's' : ''}.` : 'Nothing fits. Unlock more slots or unblock some.');
}
function bindAuto() {
  const box = $('#auto');
  box.addEventListener('click', e => {
    const t = e.target;
    if (t.id === 'aAdd') {
      const id = $('#aSel').value, n = Math.max(1, Math.min(99, +$('#aN').value || 1));
      const q = st.reqs.find(x => x.id === id);
      if (q) q.n += n; else st.reqs.push({ id, n });
      save(); renderAuto(); return;
    }
    if (t.id === 'aGo') { runPlan(); return; }
    if (t.id === 'aUnblock') { st.blocked = []; save(); render(); return; }
    const del = t.closest('[data-qdel]'), max = t.closest('[data-qmax]'), first = t.closest('[data-qfirst]');
    if (del) { st.reqs.splice(+del.dataset.qdel, 1); save(); renderAuto(); }
    if (max) {
      const i = +max.dataset.qmax;
      const res = autoPlan(st.reqs.map((q, j) => (j === i ? { ...q, max: true } : q)), false);
      st.reqs[i].n = Math.max(1, res.placed[st.reqs[i].id] || 0);
      save(); renderAuto();
    }
    if (first) { st.reqs = [{ id: first.dataset.qfirst, n: 1 }]; lastPlan = null; save(); runPlan(); }
  });
  box.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.qn !== undefined) { st.reqs[+t.dataset.qn].n = Math.max(1, Math.min(99, +t.value || 1)); save(); }
    if (t.id === 'aFill') { st.fill = t.checked; save(); }
    if (t.id === 'aBlock') { st.tool = t.checked ? 'block' : 'inspect'; save(); $('#grid').dataset.tool = st.tool; }
  });
}

/* ---------- toast ---------- */
let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3500);
}

/* ---------- main render ---------- */
function render() {
  analyse();
  // The block tool only exists on the auto-planner tab.
  if (st.tab !== 'auto' && st.tool === 'block') st.tool = 'inspect';
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === st.tab));
  $('#tab-plan').hidden = st.tab === 'guide';
  $('#tab-guide').hidden = st.tab !== 'guide';
  $('#palette').hidden = $('#detail').hidden = st.tab === 'auto';
  $('#auto').hidden = st.tab !== 'auto';
  renderSummary();
  if (st.tab === 'plan') { renderPalette(); renderGrid(); renderSide(); } else if (st.tab === 'auto') { renderGrid(); renderAuto(); } else renderGuide();
}

/* ---------- events ---------- */
function applyTool(r, c, start) {
  const t = st.tool;
  if (t === 'inspect') { if (start) { st.sel = st.sel === key(r, c) ? null : key(r, c); } return true; }
  if (t === 'erase') return removeAt(r, c);
  if (t === 'unlock') { if (start) drag.want = !st.open.includes(key(r, c)); toggleOpen(r, c, drag.want); return true; }
  if (t === 'block') {
    if (!st.open.includes(key(r, c))) return false;
    if (start) drag.want = !st.blocked.includes(key(r, c));
    st.blocked = st.blocked.filter(k => k !== key(r, c));
    if (drag.want) st.blocked.push(key(r, c));
    return true;
  }
  return place(t, r, c);
}
const drag = { on: false, last: null, want: true };
function bind() {
  document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { st.tab = b.dataset.tab; save(); render(); } });
  $('#palette').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) { st.tool = b.dataset.tool; save(); renderPalette(); $('#grid').dataset.tool = st.tool; } });
  const grid = $('#grid');
  const cellAt = e => { const el = document.elementFromPoint(e.clientX, e.clientY); const c = el && el.closest('.gh-cell'); return c ? [+c.dataset.r, +c.dataset.c] : null; };
  grid.addEventListener('pointerdown', e => {
    const at = cellAt(e); if (!at || e.button !== 0) return;
    e.preventDefault();
    drag.on = st.tool !== 'inspect'; drag.last = key(...at);
    if (drag.on) grid.setPointerCapture(e.pointerId);
    applyTool(at[0], at[1], true);
    save(); render();
  });
  grid.addEventListener('pointermove', e => {
    if (!drag.on) return;
    const at = cellAt(e); if (!at || key(...at) === drag.last) return;
    drag.last = key(...at);
    if (applyTool(at[0], at[1], false)) { save(); render(); }
  });
  const end = () => { drag.on = false; };
  grid.addEventListener('pointerup', end); grid.addEventListener('pointercancel', end);

  $('#detail').addEventListener('click', e => {
    const b = e.target.closest('[data-spot]'); if (!b) return;
    const [id, r, c] = b.dataset.spot.split(',');
    place(id, +r, +c); st.sel = key(+r, +c); save(); render();
  });
  $('#guide').addEventListener('click', e => {
    const b = e.target.closest('[data-try]'); if (b) { tryLayout(MUT_BY_ID[b.dataset.try]); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    const p = e.target.closest('[data-plan]');
    if (p) {
      const q = st.reqs.find(x => x.id === p.dataset.plan);
      if (!q) st.reqs.push({ id: p.dataset.plan, n: 1 });
      st.tab = 'auto'; save(); render(); window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  $('#gq').addEventListener('input', renderGuide);
  $('#gr').addEventListener('change', renderGuide);
  $('#gf').addEventListener('change', renderGuide);

  $('#clearPlants').addEventListener('click', () => { if (st.plants.length && confirm('Remove every plant from the layout?')) { st.plants = []; st.targets = []; st.sel = null; lastPlan = null; save(); render(); } });
  $('#resetSlots').addEventListener('click', () => { if (confirm('Go back to the 12 starting slots?')) { st.open = defaults().open; st.plants = st.plants.filter(p => canPlace(p.id, p.r, p.c)); save(); render(); } });
  $('#unlockAll').addEventListener('click', () => { st.open = []; for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) st.open.push(key(r, c)); save(); render(); });

  for (const k of Object.keys(st.set)) {
    const el = document.getElementById('set-' + k); if (!el) continue;
    el.value = st.set[k];
    el.addEventListener('change', () => { st.set[k] = Math.max(0, +el.value || 0); save(); render(); });
  }
}

/* ---------- from the logged-in profile ---------- */
const LEG_LEVELS = [1, 1, 1, 2, 2, 2, 3, 3, 4, 5]; // legendary shards per attribute level
function shardLevel(n) { let l = 0, s = 0; while (l < 10 && s + LEG_LEVELS[l] <= n) s += LEG_LEVELS[l++]; return l; }
async function loadGarden(force) {
  const [p, g] = await Promise.all([U.myProfile(force), U.myGarden(force)]);
  return { at: Math.min(p.at, g.at), member: p.member, garden: g.garden };
}
function applyProfile(d, fresh) {
  const out = [];
  const gp = d.member.garden_player_data || {};
  found = new Set((gp.discovered_greenhouse_crops || []).map(x => String(x).toUpperCase()));
  $('#gf').hidden = false;
  out.push(`${found.size} of ${MUTATIONS.length} mutations discovered`);

  const slots = (d.garden.greenhouse_slots || []).filter(s => s && inGrid(s.z, s.x)).map(s => key(s.z, s.x));
  if (slots.length) {
    const open = [...new Set([...defaults().open, ...slots])].sort();
    if (fresh || U.changed('gh-slots', open)) {
      st.open = open;
      st.plants = st.plants.filter(p => canPlace(p.id, p.r, p.c));
    }
    out.unshift(`${open.length} unlocked slots`);
  }
  const stacks = (d.member.attributes && d.member.attributes.stacks) || {};
  const shard = { timestalk: shardLevel(stacks.greenhouse_speed || 0), flora: shardLevel(stacks.unique_bonus || 0) };
  if (fresh || U.changed('gh-shards', shard)) {
    for (const [k, v] of Object.entries(shard)) { st.set[k] = v; const el = document.getElementById('set-' + k); if (el) el.value = v; }
  }
  save(); render();
  return out.join(' · ');
}

bind();
bindAuto();
render();
U.profileBar($('#profileBar'), { what: 'your Greenhouse', load: loadGarden, apply: applyProfile });
