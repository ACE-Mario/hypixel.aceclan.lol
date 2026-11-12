'use strict';

const KEY = 'ace-hypixel.shards.v1';
const $ = s => document.querySelector(s);
const RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
const RCOL = { COMMON: 'f', UNCOMMON: 'a', RARE: '9', EPIC: '5', LEGENDARY: '6' };
const COLORS = {
  black: '#555', dark_blue: '#5555d0', dark_green: '#2fae2f', dark_aqua: '#2fb5b5', dark_red: '#d94040', dark_purple: '#b64ad0',
  gold: '#ffaa00', gray: '#aaaaaa', dark_gray: '#8a8a8a', blue: '#6f6fff', green: '#55ff55', aqua: '#55ffff', red: '#ff5555',
  light_purple: '#ff55ff', yellow: '#ffff55', white: '#ffffff',
};
// Shards whose own level boosts Hunting Fortune for a whole rarity: [code, rarity, fortune per level].
const FORTUNE_SHARDS = [['C35', 'COMMON', 2], ['U8', 'UNCOMMON', 2], ['R8', 'RARE', 1], ['E5', 'EPIC', 1]];
const CHAMELEON = 'L4';
// Other bonus shards, using SkyShards' maths: Python and King Cobra boost black-hole shards, Sea Serpent boosts
// those two, Tiamat boosts Sea Serpent, and Crocodile can double the output of reptile fusions.
const PYTHON = 'R9', KING_COBRA = 'R54', SEA_SERPENT = 'E32', TIAMAT = 'L6', CROCODILE = 'R45', KRAKEN = 'L15', SHINYFISH = 'L23';
const BONUS_SHARDS = [...FORTUNE_SHARDS.map(f => f[0]), PYTHON, KING_COBRA, SEA_SERPENT, TIAMAT, CROCODILE];
// Shards caught in black holes: every one gets King Cobra's fortune, `true` ones also get Python's speed.
const BLACK_HOLE = { L47: 0, L27: 0, L26: 0, L17: 0, E33: 1, E29: 0, E20: 0, E18: 1, E17: 0, E14: 0, R56: 0, R49: 0, R42: 0, R39: 1,
  R38: 0, R36: 1, R31: 1, R21: 0, R18: 0, R6: 1, U38: 1, U36: 1, U33: 1, U32: 1, U30: 0, U29: 0, U27: 0, U18: 1, U15: 1, U12: 1,
  C36: 1, C33: 1, C30: 1, C27: 0, C21: 1, C20: 0, C15: 1, C14: 0, C12: 1, C9: 1, C8: 0 };
const WOODEN_BAIT = ['R29', 'L23', 'R59', 'R23', 'R49'];
// Kuudra tiers for the Kraken shard: [run seconds, key cost, shards per run]
const KUUDRA = { t1: [60, 155000, 1], t2: [60, 310000, 1], t3: [60, 582000, 1], t4: [60, 1164000, 1.25], t5: [100, 2328000, 1.5] };

let data = null, byCode = new Map(), fusion = null, best = null;
let st = U.readLS(KEY, null) || {};
st = Object.assign({ hf: 0, penalty: 1, cham: 1, noBait: 0, kuudra: '', kMoney: '', kTime: '', track: {}, tab: 'list', fuse: { code: null, qty: 1 }, f: {} }, st);
const save = () => U.writeLS(KEY, st);

/* ---------- helpers ---------- */
const lvlOf = code => (st.track[code] && st.track[code].lvl) || 0;
let owned = {}; // shard code -> how many are sitting in the Hunting Box (from the profile)
const iconURL = s => `../icons/${s.id}.png`;
function icon(s, cls = '') {
  return `<span class="sh-icon ${cls}"><img src="${iconURL(s)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'vt-letter',textContent:'${U.esc(s.name.charAt(0))}'}))"></span>`;
}
const nameHTML = s => U.named(RCOL[s.rarity], s.name);
/** Shards to go from level `from` to level `to`. */
function shardsFor(rarity, from, to) {
  const per = data.levelling[rarity] || [];
  let n = 0;
  for (let i = from; i < to; i++) n += per[i] || 0;
  return n;
}
/** Effect text; level ranges are shown at `lvl` (1–10) with the max value after it. */
function textHTML(segs, lvl) {
  return segs.map(p => {
    if (Array.isArray(p)) return `<span style="color:${COLORS[p[1]] || COLORS.gray}${p[2] ? ';font-weight:700' : ''}">${U.esc(p[0])}</span>`;
    const [a, b] = p.r, L = Math.max(1, lvl || 1);
    const v = a + (b - a) * (L - 1) / 9;
    const fmt = x => (Math.round(x * 100) / 100) + (p.u || '');
    return `<b style="color:${COLORS[p.c] || COLORS.gray}" title="Level 1: ${fmt(a)} · Level 10: ${fmt(b)}">+${fmt(v)}</b>${L < 10 ? `<span class="muted" style="font-size:11px"> (max ${fmt(b)})</span>` : ''}`;
  }).join('');
}
const hrs = h => !isFinite(h) ? 'not possible' : h < 1 / 60 ? '< 1m' : U.dur(h * 3600);

/* ---------- hunt rates and best fusion paths ---------- */
function mults() {
  const tiamat = 1 + 5 * lvlOf(TIAMAT) / 100;
  const sea = 1 + 2 * lvlOf(SEA_SERPENT) / 100 * tiamat;
  return { croc: 1 + 2 * lvlOf(CROCODILE) / 100, python: 5 * lvlOf(PYTHON) / 100 * sea, cobra: lvlOf(KING_COBRA) / 100 * sea };
}
/** "200k", "2.5m", "2b" -> number; empty -> Infinity (ignore key cost). */
function money(v) {
  const m = String(v || '').trim().toLowerCase().replace(/,/g, '').match(/^([\d.]+)\s*([kmb]?)$/);
  if (!m) return Infinity;
  return +m[1] * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1);
}
/** Kraken shards per hour from Kuudra, counting the key cost as time at your coins per hour. */
function kuudraRate() {
  const t = KUUDRA[st.kuudra]; if (!t) return 0;
  const run = (+st.kTime > 0 ? +st.kTime : t[0]) + 25;
  const mph = money(st.kMoney);
  const costTime = mph === Infinity ? 0 : mph === 0 ? 1e12 : t[1] / mph * 3600;
  return t[2] * 3600 / (run + costTime);
}
function rateOf(s, m = mults()) {
  let rate = s.rate;
  if (s.code === KRAKEN && !rate) rate = kuudraRate();
  if (!rate || (s.code === CHAMELEON && !+st.cham)) return 0;
  if (+st.noBait && WOODEN_BAIT.includes(s.code)) rate *= s.code === SHINYFISH ? 0.1 : 0.05;
  if (s.noFortune) return rate;
  let hf = (+st.hf || 0) + FORTUNE_SHARDS.filter(f => f[1] === s.rarity).reduce((t, f) => t + lvlOf(f[0]) * f[2], 0);
  if (s.code in BLACK_HOLE) {
    if (BLACK_HOLE[s.code]) rate *= 1 + m.python;
    hf *= 1 + m.cobra;
  }
  return rate * (1 + hf / 100);
}
/**
 * Cheapest time (hours) to get one of each shard, either hunting it or fusing it.
 * Fusing A + B uses `fuse` of each input and makes `q` of the output.
 */
function computeBest() {
  const n = data.shards.length;
  const cost = new Float64Array(n).fill(Infinity), direct = new Float64Array(n);
  const how = new Int32Array(n).fill(-1); // index into recipe arrays, or -1 = hunt
  const m = mults();
  data.shards.forEach((s, i) => { const r = rateOf(s, m); direct[i] = r > 0 ? 1 / r : Infinity; cost[i] = direct[i]; });
  const { out, a, b, rep } = fusion;
  // Crocodile: reptile fusions make more on average
  const q = Float64Array.from(fusion.q, (x, k) => rep[k] ? x * m.croc : x);
  const fuse = data.shards.map(s => s.fuse);
  const pen = (+st.penalty || 0) / 3600;
  for (let pass = 0; pass < 60; pass++) {
    let changed = false;
    for (let k = 0; k < out.length; k++) {
      const c = (cost[a[k]] * fuse[a[k]] + cost[b[k]] * fuse[b[k]] + pen) / q[k];
      if (c < cost[out[k]] - 1e-12) { cost[out[k]] = c; how[out[k]] = k; changed = true; }
    }
    if (!changed) break;
  }
  best = { cost, direct, how, q };
}

/** Expand a plan for `qty` of shard index `i` into a tree. */
function expand(i, qty, path = new Set()) {
  const s = data.shards[i];
  const k = best.how[i];
  if (k < 0 || path.has(i)) {
    return { i, qty, hunt: true, hours: qty * best.direct[i] };
  }
  const { a, b } = fusion, q = best.q;
  const crafts = Math.ceil(qty / q[k] - 1e-9);
  const next = new Set(path).add(i);
  const kids = a[k] === b[k]
    ? [expand(a[k], crafts * data.shards[a[k]].fuse * 2, next)]
    : [expand(a[k], crafts * data.shards[a[k]].fuse, next), expand(b[k], crafts * data.shards[b[k]].fuse, next)];
  return { i, qty, crafts, made: crafts * q[k], kids, s };
}

/* ---------- list ---------- */
function renderStatsSummary() {
  const parts = [];
  if (+st.hf) parts.push(`${st.hf} Hunting Fortune`);
  const lv = BONUS_SHARDS.filter(c => lvlOf(c)).map(c => `${byCode.get(c).name} ${lvlOf(c)}`);
  if (lv.length) parts.push(lv.join(', '));
  $('#statsSummary').textContent = parts.length ? '· ' + parts.join(' · ') : '· none set';
}
function cardHTML(s) {
  const t = st.track[s.code];
  const lvl = t ? t.lvl : 0, target = t ? t.target : 10;
  const box = owned[s.code] || 0;
  const need = Math.max(0, (t ? shardsFor(s.rarity, lvl, target) : shardsFor(s.rarity, 0, 10)) - box);
  const i = byCode.get(s.code).idx;
  const r = rateOf(s);
  const how = r > 0 ? `<span class="chip raw" title="Average with your Hunting Fortune">≈ ${U.num(r)}/h hunting</span>` : '<span class="chip forge">Fusion only</span>';
  const c = best.cost[i];
  const opts = (sel, from) => Array.from({ length: 11 - from }, (_, k) => k + from).map(v => `<option ${v === sel ? 'selected' : ''}>${v}</option>`).join('');
  return `<article class="shard ${t ? 'tracked' : ''} ${t && lvl >= target ? 'done' : ''}">
    <div class="shard-head">
      ${icon(s)}
      <div class="grow">
        <div>${nameHTML(s)} <span class="muted code">${s.code}</span></div>
        <div class="muted ability">${U.esc(s.ability)}</div>
      </div>
      <a class="wiki" href="${U.esc(s.wiki)}" target="_blank" rel="noopener" title="Open on the wiki">wiki ↗</a>
    </div>
    <div class="shard-desc">${textHTML(s.desc, lvl)}</div>
    <div class="chips">${how}
      ${s.alignment ? `<span class="chip">${U.esc(s.alignment)}</span>` : ''}
      ${s.family.map(f => `<span class="chip">${U.esc(f)}</span>`).join('')}
      ${s.req ? `<span class="chip req">🔒 ${U.esc(s.req)}</span>` : ''}
    </div>
    ${s.hunt.length ? `<details class="shard-hunt"><summary>How to get it</summary>${s.hunt.map(l => `<div>${textHTML(l, 1)}</div>`).join('')}</details>` : ''}
    <div class="shard-track">
      <label>Level <select data-lvl="${s.code}">${opts(lvl, 0)}</select></label>
      <label>Goal <select data-target="${s.code}">${opts(target, 1)}</select></label>
      <span class="need">${need ? `<b>${need}</b> more · ${hrs(need * c)}` : '✓ done'}${box ? ` <span class="muted" title="Not fused yet">(${box} in your Hunting Box)</span>` : ''}</span>
      ${need && !(r > 0 && best.how[i] < 0) && isFinite(c) ? `<button class="btn ghost small" data-plan="${s.code}" data-qty="${need}">Fusion plan</button>` : ''}
    </div>
  </article>`;
}
function filtered() {
  const q = ($('#q').value || '').trim().toLowerCase();
  const words = q ? q.split(/\s+/) : [];
  const f = st.f;
  return data.shards.filter(s => {
    if (f.rarity && s.rarity !== f.rarity) return false;
    if (f.align && s.alignment !== f.align) return false;
    if (f.family && !s.family.includes(f.family)) return false;
    if (f.get === 'hunt' && !(s.rate > 0)) return false;
    if (f.get === 'fuse' && s.rate > 0) return false;
    if (f.tracked && !st.track[s.code]) return false;
    if (words.length) {
      const hay = s.hay || (s.hay = [s.name, s.code, s.ability, s.family.join(' '), s.alignment,
        s.desc.map(p => Array.isArray(p) ? p[0] : '').join('')].join(' ').toLowerCase());
      if (!words.every(w => hay.includes(w))) return false;
    }
    return true;
  });
}
function renderList() {
  const list = filtered();
  $('#count').textContent = `${list.length} of ${data.shards.length} shards`;
  $('#shards').innerHTML = list.length ? list.map(cardHTML).join('') : '<p class="empty-note">No shards match those filters.</p>';
}
function renderTotals() {
  let need = 0, time = 0, n = 0, impossible = 0;
  for (const [code, t] of Object.entries(st.track)) {
    const s = byCode.get(code); if (!s) continue;
    const k = Math.max(0, shardsFor(s.rarity, t.lvl, t.target) - (owned[code] || 0));
    if (!k) continue;
    n++; need += k;
    const c = best.cost[s.idx] * k;
    if (isFinite(c)) time += c; else impossible++;
  }
  $('#totNeed').textContent = U.num(need);
  $('#totInfo').textContent = n ? `${n} shard${n > 1 ? 's' : ''} below goal · ≈ ${hrs(time)}${impossible ? ` (+${impossible} with no known source)` : ''}` : 'Set a level on any shard to track it';
}
function renderAll() { computeBest(); renderStatsSummary(); renderTotals(); if (st.tab === 'list') renderList(); else renderFuse(); }

/* ---------- fusion planner ---------- */
function treeHTML(n) {
  const s = data.shards[n.i];
  if (n.hunt) {
    return `<li><div class="node-row">${icon(s, 'small')} <span class="qtyx">${U.num(n.qty)}×</span> ${nameHTML(s)}
      ${isFinite(n.hours) ? `<span class="chip raw">hunt · ${hrs(n.hours)}</span>` : '<span class="chip req">no known source</span>'}</div></li>`;
  }
  const extra = n.made - n.qty;
  return `<li><div class="node-row">${icon(s, 'small')} <span class="qtyx">${U.num(n.qty)}×</span> ${nameHTML(s)}
    <span class="chip kat">fuse ×${U.num(n.crafts)}</span>${extra > 0 ? ` <span class="chip" title="Left over from rounding up fusions">+${U.num(extra)} spare</span>` : ''}</div>
    <ul>${n.kids.map(treeHTML).join('')}</ul></li>`;
}
function renderFuse() {
  const out = $('#fuseOut');
  const s = st.fuse.code && byCode.get(st.fuse.code);
  $('#fuseQty').value = st.fuse.qty;
  if (!s) { out.innerHTML = '<p class="empty-note">Pick a shard to see the fastest way to get it.</p>'; return; }
  $('#fuseSearch').placeholder = s.name;
  const qty = Math.max(1, +st.fuse.qty || 1);
  const tree = expand(s.idx, qty);
  const hunts = new Map(), steps = [];
  let fusions = 0;
  (function walk(n) {
    if (n.hunt) { hunts.set(n.i, (hunts.get(n.i) || 0) + n.qty); return; }
    n.kids.forEach(walk);
    fusions += n.crafts;
    steps.push(n);
  })(tree);
  const pen = (+st.penalty || 0) / 3600;
  let total = fusions * pen, impossible = false;
  const huntRows = [...hunts].map(([i, q]) => {
    const h = q * best.direct[i];
    if (isFinite(h)) total += h; else impossible = true;
    return { s: data.shards[i], q, h };
  }).sort((x, y) => y.h - x.h);
  const directH = qty * best.direct[s.idx];
  out.innerHTML = `
    <div class="stats">
      <div class="stat"><div class="k">Total time</div><div class="v">${impossible ? 'not possible' : hrs(total)}</div></div>
      <div class="stat"><div class="k">Hunting it directly</div><div class="v">${isFinite(directH) ? hrs(directH) : 'not huntable'}</div></div>
      <div class="stat"><div class="k">Fusions</div><div class="v">${U.num(fusions)}</div></div>
      <div class="stat"><div class="k">Shard types to hunt</div><div class="v">${hunts.size}</div></div>
    </div>
    ${tree.hunt ? `<p class="hint">Hunting ${U.esc(s.name)} yourself is faster than any fusion with your stats.</p>` : ''}
    <h3 class="section-h">Shards to hunt</h3>
    <table class="table">
      <thead><tr><th>Shard</th><th class="num">Amount</th><th class="num">Rate</th><th class="num">Time</th></tr></thead>
      <tbody>${huntRows.map(r => `<tr><td><div class="item-cell">${icon(r.s, 'small')} ${nameHTML(r.s)}</div>
        ${r.s.hunt.length ? `<div class="hint">${r.s.hunt.map(l => textHTML(l, 1)).join('<br>')}</div>` : ''}</td>
        <td class="num">${U.num(r.q)}</td><td class="num">${rateOf(r.s) > 0 ? U.num(rateOf(r.s)) + '/h' : '–'}</td><td class="num">${hrs(r.h)}</td></tr>`).join('')}</tbody>
    </table>
    ${steps.length ? `<h3 class="section-h">Fusions in order</h3>
    <div class="cards">${steps.map((n, k) => {
      const ins = n.kids.map(c => `${U.num(c.qty)} ${nameHTML(data.shards[c.i])}`).join(' + ');
      return `<div class="card step"><span class="step-num">${k + 1}.</span><span>Fuse ${ins} <b>${n.crafts}×</b> → ${U.num(n.made)} ${nameHTML(data.shards[n.i])}</span></div>`;
    }).join('')}</div>
    <h3 class="section-h">Fusion tree</h3>
    <ul class="tree">${treeHTML(tree)}</ul>` : ''}`;
}
let fSugg = [];
function showFuseSuggest() {
  const q = $('#fuseSearch').value.trim().toLowerCase();
  const box = $('#fuseSuggest');
  if (!q) { box.hidden = true; return; }
  fSugg = data.shards.filter(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase() === q).slice(0, 10);
  box.innerHTML = fSugg.map((s, k) => `<button type="button" data-f="${k}" class="${k ? '' : 'active'}">${nameHTML(s)}<span class="id">${s.code}</span></button>`).join('');
  box.hidden = !fSugg.length;
}
function pickFuse(s, qty) {
  st.fuse = { code: s.code, qty: qty || st.fuse.qty || 1 };
  $('#fuseSearch').value = ''; $('#fuseSuggest').hidden = true;
  save(); setTab('fuse');
}

/* ---------- tabs and events ---------- */
function setTab(t) {
  st.tab = t; save();
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $('#tab-list').hidden = t !== 'list';
  $('#tab-fuse').hidden = t !== 'fuse';
  renderAll();
}
function bind() {
  document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
  const lvlSel = v => Array.from({ length: 11 }, (_, k) => `<option ${k === v ? 'selected' : ''}>${k}</option>`).join('');
  for (const code of BONUS_SHARDS) {
    const el = $('#lvl-' + code);
    el.innerHTML = lvlSel(lvlOf(code));
    el.addEventListener('change', () => setLevel(code, +el.value));
  }
  $('#hf').value = st.hf; $('#penalty').value = st.penalty; $('#cham').value = st.cham;
  $('#hf').addEventListener('change', e => { st.hf = Math.max(0, +e.target.value || 0); save(); renderAll(); });
  $('#penalty').addEventListener('change', e => { st.penalty = Math.max(0, +e.target.value || 0); save(); renderAll(); });
  $('#cham').addEventListener('change', e => { st.cham = +e.target.value; save(); renderAll(); });
  const opt = { noBait: 'noBait', kuudra: 'kuudra', kMoney: 'kMoney', kTime: 'kTime' };
  for (const [id, k] of Object.entries(opt)) {
    $('#' + id).value = st[k];
    $('#' + id).addEventListener('change', e => { st[k] = e.target.value; save(); renderAll(); });
  }
  $('#maxBonus').addEventListener('click', () => {
    for (const c of BONUS_SHARDS) { const r = st.track[c] || (st.track[c] = { lvl: 0, target: 10 }); r.lvl = 10; r.target = 10; $('#lvl-' + c).value = 10; }
    save(); renderAll();
  });

  const fam = [...new Set(data.shards.flatMap(s => s.family))].sort();
  $('#fFamily').innerHTML += fam.map(f => `<option>${U.esc(f)}</option>`).join('');
  const F = { fRarity: 'rarity', fAlign: 'align', fFamily: 'family', fGet: 'get' };
  for (const [id, k] of Object.entries(F)) {
    $('#' + id).value = st.f[k] || '';
    $('#' + id).addEventListener('change', e => { st.f[k] = e.target.value; save(); renderList(); });
  }
  $('#fTracked').checked = !!st.f.tracked;
  $('#fTracked').addEventListener('change', e => { st.f.tracked = e.target.checked; save(); renderList(); });
  let qt;
  $('#q').addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(renderList, 120); });

  $('#shards').addEventListener('change', e => {
    const l = e.target.dataset.lvl, t = e.target.dataset.target;
    if (l) setLevel(l, +e.target.value);
    if (t) { const r = st.track[t] || (st.track[t] = { lvl: 0, target: 10 }); r.target = +e.target.value; save(); renderTotals(); renderList(); }
  });
  $('#shards').addEventListener('click', e => {
    const b = e.target.closest('[data-plan]');
    if (b) { pickFuse(byCode.get(b.dataset.plan), +b.dataset.qty); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });

  $('#fuseSearch').addEventListener('input', showFuseSuggest);
  $('#fuseSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter' && fSugg[0] && !$('#fuseSuggest').hidden) { e.preventDefault(); pickFuse(fSugg[0]); }
    if (e.key === 'Escape') $('#fuseSuggest').hidden = true;
  });
  $('#fuseSuggest').addEventListener('mousedown', e => { const b = e.target.closest('[data-f]'); if (b) { e.preventDefault(); pickFuse(fSugg[+b.dataset.f]); } });
  document.addEventListener('click', e => { if (!e.target.closest('#tab-fuse .search-box')) $('#fuseSuggest').hidden = true; });
  $('#fuseQty').addEventListener('change', e => { st.fuse.qty = Math.max(1, parseInt(e.target.value, 10) || 1); save(); renderFuse(); });
}
function setLevel(code, v) {
  const r = st.track[code] || (st.track[code] = { lvl: 0, target: 10 });
  r.lvl = v;
  if (r.target < v) r.target = Math.max(v, 1);
  const sel = document.getElementById('lvl-' + code);
  if (sel) sel.value = v;
  save(); renderAll();
}

/* ---------- from the logged-in profile ---------- */
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
/** Shards fused into an attribute -> its level. */
function levelFromStacks(rarity, n) {
  const per = data.levelling[rarity] || [];
  let lvl = 0, sum = 0;
  while (lvl < per.length && sum + per[lvl] <= n) sum += per[lvl++];
  return lvl;
}
function applyProfile(d, fresh) {
  const m = d.member;
  const stacks = (m.attributes && m.attributes.stacks) || {};
  const byAbility = new Map(data.shards.map(s => [norm(s.ability), s]));
  // Shards waiting in the Hunting Box
  owned = {};
  const byId = new Map(data.shards.map(s => [s.id, s]));
  for (const o of (m.shards && m.shards.owned) || []) {
    const s = byId.get('SHARD_' + o.type); if (s && o.amount_owned > 0) owned[s.code] = o.amount_owned;
  }
  let n = 0, bonus = 0;
  const levels = {};
  for (const [k, v] of Object.entries(stacks)) {
    const s = byAbility.get(norm(k));
    if (!s || !(v > 0)) continue;
    levels[s.code] = levelFromStacks(s.rarity, v);
  }
  const apply = fresh || U.changed('shards', levels);
  for (const [code, lvl] of Object.entries(levels)) {
    n++;
    if (BONUS_SHARDS.includes(code) && lvl) bonus++;
    if (!apply) continue;
    const t = st.track[code];
    if (t) { t.lvl = lvl; if (t.target < lvl) t.target = lvl; } else st.track[code] = { lvl, target: lvl };
    const sel = document.getElementById('lvl-' + code);
    if (sel) sel.value = lvl;
  }
  if (apply) save();
  renderAll();
  const box = Object.values(owned).reduce((a, b) => a + b, 0);
  if (!n && !box) return 'No attribute shards on this profile yet';
  return `${n} attribute${n === 1 ? '' : 's'} (${bonus} bonus shard${bonus === 1 ? '' : 's'})${box ? ` and ${U.num(box)} shards in the Hunting Box` : ''}`;
}

/* ---------- start ---------- */
(async function start() {
  try {
    const [d, f] = await Promise.all([fetch('../data/shards.json').then(r => r.json()), fetch('../data/fusion.json').then(r => r.json())]);
    data = d;
    data.shards.forEach((s, i) => { s.idx = i; byCode.set(s.code, s); });
    // Flatten recipes into parallel arrays for speed: output, input A, input B, output quantity.
    const out = [], a = [], b = [], q = [], rep = [];
    const reptile = s => s.family.includes('Reptile');
    for (const [o, byQty] of Object.entries(f)) {
      const oi = byCode.get(o); if (!oi) continue;
      for (const [qty, list] of Object.entries(byQty)) {
        for (const pair of list.split(';')) {
          const [x, y] = pair.split(',');
          const xi = byCode.get(x), yi = byCode.get(y);
          if (!xi || !yi) continue;
          out.push(oi.idx); a.push(xi.idx); b.push(yi.idx); q.push(+qty); rep.push(reptile(xi) || reptile(yi) ? 1 : 0);
        }
      }
    }
    fusion = { out: Int32Array.from(out), a: Int32Array.from(a), b: Int32Array.from(b), q: Float64Array.from(q), rep: Uint8Array.from(rep) };
    bind();
    setTab(st.tab === 'fuse' ? 'fuse' : 'list');
    U.profileBar($('#profileBar'), { what: 'your shard levels', apply: applyProfile });
  } catch (err) {
    $('#shards').innerHTML = '<p class="empty-note">Could not load the shard data. Try refreshing.</p>';
    console.error(err);
  }
})();
