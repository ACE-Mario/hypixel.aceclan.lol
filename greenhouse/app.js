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
  const near = new Set();
  for (const k of open) {
    const [r, c] = k.split(',').map(Number);
    for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) if (inGrid(rr, cc) && !open.has(key(rr, cc))) near.add(key(rr, cc));
  }
  let cells = '';
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
    const k = key(r, c);
    const cls = open.has(k) ? 'open' : near.has(k) ? 'locked next' : 'locked';
    cells += `<div class="gh-cell ${cls} ${st.sel === k ? 'sel' : ''}" data-r="${r}" data-c="${c}" style="grid-area:${r + 1}/${c + 1}"></div>`;
  }
  // best (rarest) mutation suggestion per anchor
  const bestAt = new Map();
  for (const s of spots) {
    const k = key(s.r, s.c), cur = bestAt.get(k);
    if (!cur || RORDER[s.m.r] > RORDER[cur.m.r] || (RORDER[s.m.r] === RORDER[cur.m.r] && s.m.size > cur.m.size)) bestAt.set(k, s);
  }
  const counts = new Map();
  for (const s of spots) counts.set(key(s.r, s.c), (counts.get(key(s.r, s.c)) || 0) + 1);
  let ghosts = '';
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
function renderGuide() {
  const q = ($('#gq').value || '').trim().toLowerCase();
  const r = $('#gr').value;
  const list = MUTATIONS.filter(m => (!r || m.r === r) && (!q || (m.name + ' ' + m.need.map(n => nameOf(n[0])).join(' ')).toLowerCase().includes(q)));
  const T = A.T;
  $('#guide').innerHTML = list.map(m => {
    const pre = [...prereqs(m)];
    return `<article class="card mut-card r-${m.r.toLowerCase()}">
      <div class="item-cell">${img(m.id)} <b>${nameHTML(m.id)}</b>
        <span class="chip">${m.r.toLowerCase()}</span>${m.size > 1 ? `<span class="chip">${m.size}×${m.size}</span>` : ''}
        <span class="chip">${SOIL[m.soil]}</span></div>
      <div class="k">Needs around it</div><div>${needHTML(m)}</div>
      ${pre.length ? `<div class="k">Mutations to grow first (${pre.length}, in order)</div><div class="path">${pre.map(id => `<span class="need">${img(id)}${nameHTML(id)}</span>`).join('')}</div>` : ''}
      <div class="k">Effects</div><div class="chips">${m.fx.length ? m.fx.map(fxChip).join('') : '<span class="muted">none</span>'}</div>
      <div class="k">Harvest</div><div class="drops">${dropsHTML(m.drops)}</div>
      <p class="hint">${m.chance ? `${m.chance}% chance per cycle · ` : ''}${m.stages ? `grows in ${U.dur(m.stages * T)}` : 'appears fully grown'} · +${U.num(m.xp)} XP · ${Math.round(VINE_CHANCE[m.r] * 100)}% Ethereal Vine chance</p>
      ${autoLayout(m) ? `<button class="btn small" data-try="${m.id}">Try it in my greenhouse</button>`
        : !m.special && !m.godseed && !m.lonely ? '<p class="hint">Needs 2×2 or 3×3 plants around it, so build this one by hand in the planner.</p>' : ''}
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
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === st.tab));
  $('#tab-plan').hidden = st.tab !== 'plan';
  $('#tab-guide').hidden = st.tab !== 'guide';
  renderSummary();
  if (st.tab === 'plan') { renderPalette(); renderGrid(); renderSide(); } else renderGuide();
}

/* ---------- events ---------- */
function applyTool(r, c, start) {
  const t = st.tool;
  if (t === 'inspect') { if (start) { st.sel = st.sel === key(r, c) ? null : key(r, c); } return true; }
  if (t === 'erase') return removeAt(r, c);
  if (t === 'unlock') { if (start) drag.want = !st.open.includes(key(r, c)); toggleOpen(r, c, drag.want); return true; }
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
  $('#guide').addEventListener('click', e => { const b = e.target.closest('[data-try]'); if (b) { tryLayout(MUT_BY_ID[b.dataset.try]); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
  $('#gq').addEventListener('input', renderGuide);
  $('#gr').addEventListener('change', renderGuide);

  $('#clearPlants').addEventListener('click', () => { if (st.plants.length && confirm('Remove every plant from the layout?')) { st.plants = []; st.sel = null; save(); render(); } });
  $('#resetSlots').addEventListener('click', () => { if (confirm('Go back to the 12 starting slots?')) { st.open = defaults().open; st.plants = st.plants.filter(p => canPlace(p.id, p.r, p.c)); save(); render(); } });
  $('#unlockAll').addEventListener('click', () => { st.open = []; for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) st.open.push(key(r, c)); save(); render(); });

  for (const k of Object.keys(st.set)) {
    const el = document.getElementById('set-' + k); if (!el) continue;
    el.value = st.set[k];
    el.addEventListener('change', () => { st.set[k] = Math.max(0, +el.value || 0); save(); render(); });
  }
}

bind();
render();
