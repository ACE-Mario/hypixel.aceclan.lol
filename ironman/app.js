'use strict';

/* ---------- config ---------- */
const REPO = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items/';
const ITEMS_API = 'https://api.hypixel.net/v2/resources/skyblock/items';
const STORE_KEY = 'ironman-planner.v1';
const RECIPE_CACHE_KEY = 'ironman-planner.recipes.v2';
const LIST_CACHE_KEY = 'ironman-planner.list.v1';
const RECIPE_TTL = 3 * 864e5;   // 3 days
const LIST_TTL = 864e5;         // 1 day
const MAX_NODES = 6000;

const MC = { 0: '#8a8a8a', 1: '#6b6bff', 2: '#3cc13c', 3: '#3cc1c1', 4: '#d94040', 5: '#c04ad0', 6: '#ffaa00', 7: '#aaaaaa',
  8: '#8a8a8a', 9: '#6f6fff', a: '#55ff55', b: '#55ffff', c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff' };
const TIER = { COMMON: 'f', UNCOMMON: 'a', RARE: '9', EPIC: '5', LEGENDARY: '6', MYTHIC: 'd', DIVINE: 'b',
  SPECIAL: 'c', VERY_SPECIAL: 'c', SUPREME: '4', ULTIMATE: '4' };
const SLAYER = { ZOMBIE: 'Revenant Horror', SPIDER: 'Tarantula Broodfather', WOLF: 'Sven Packmaster',
  EMAN: 'Voidgloom Seraph', ENDERMAN: 'Voidgloom Seraph', BLAZE: 'Inferno Demonlord', VAMPIRE: 'Riftstalker Bloodfiend' };
const SLOTS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'];

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => (+n).toLocaleString(undefined, { maximumFractionDigits: 2 });
function coins(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return num(n);
}
function dur(sec) {
  if (!sec) return '0m';
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.round(sec % 3600 / 60);
  return [d && d + 'd', h && h + 'h', m && m + 'm'].filter(Boolean).join(' ') || '<1m';
}
function readLS(key, fb) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch { return fb; } }
function writeLS(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; } }
const pretty = id => id.split(/[_;]/).map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3200);
}

/* ---------- item list (search) ---------- */
let itemList = [];
const listById = new Map();
function setList(items) {
  itemList = items;
  listById.clear();
  for (const i of items) listById.set(i.id, i);
  for (const i of items) i.lc = i.name.toLowerCase();
}
async function loadItemList() {
  const c = readLS(LIST_CACHE_KEY, null);
  if (c && Date.now() - c.t < LIST_TTL) { setList(c.items); return; }
  try {
    const r = await fetch(ITEMS_API);
    const j = await r.json();
    const items = j.items.map(i => ({ id: i.id, name: i.name.replace(/§./g, ''), tier: i.tier || 'COMMON' }));
    setList(items);
    writeLS(LIST_CACHE_KEY, { t: Date.now(), items });
  } catch {
    if (c) setList(c.items);
    else toast('Could not load the item list. You can still type an item ID like HYPERION.');
  }
}

/* ---------- recipes ---------- */
const info = new Map();      // id -> parsed item
const pending = new Map();
let disk = readLS(RECIPE_CACHE_KEY, {});
let persistT;
function persist() {
  clearTimeout(persistT);
  persistT = setTimeout(() => {
    if (!writeLS(RECIPE_CACHE_KEY, disk)) { disk = {}; writeLS(RECIPE_CACHE_KEY, disk); }
  }, 800);
}

const cleanName = s => (s || '').replace(/Â/g, '').replace(/\[Lvl \{LVL\}\]\s*/g, '').trim();
function stack(s) {
  if (!s || typeof s !== 'string') return null;
  const i = s.lastIndexOf(':');
  if (i < 0) return { id: s, count: 1 };
  return { id: s.slice(0, i), count: parseFloat(s.slice(i + 1)) || 1 };
}
function merge(list) {
  const m = new Map();
  for (const s of list) if (s && s.id) m.set(s.id, (m.get(s.id) || 0) + s.count);
  let c = 0; const inputs = [];
  for (const [id, count] of m) { if (id === 'SKYBLOCK_COIN') c += count; else inputs.push({ id, count }); }
  return { inputs, coins: c };
}
function parseRecipe(r, fallbackType) {
  const type = r.type || fallbackType;
  let out = null;
  if (type === 'crafting') {
    out = { type: 'craft', ...merge(SLOTS.map(k => stack(r[k]))), count: parseFloat(r.count) || 1 };
  } else if (type === 'forge') {
    out = { type: 'forge', ...merge((r.inputs || []).map(stack)), count: parseFloat(r.count) || 1, duration: r.duration || 0 };
  } else if (type === 'npc_shop') {
    const res = stack(r.result);
    out = { type: 'npc', ...merge((r.cost || []).map(stack)), count: res ? res.count : 1 };
  } else if (type === 'katgrade') {
    const m = merge([stack(r.input), ...(r.items || []).map(stack)]);
    out = { type: 'kat', inputs: m.inputs, coins: m.coins + (r.coins || 0), count: 1, duration: r.time || 0 };
  } else if (type === 'trade') {
    const res = stack(r.result);
    out = { type: 'trade', ...merge([stack(r.cost)]), count: res ? res.count : 1 };
  }
  if (!out || (!out.inputs.length && !out.coins)) return null;
  return out;
}
const sig = r => r.type + '|' + r.count + '|' + r.inputs.map(i => i.id + ':' + i.count).sort().join(',');
function parseItem(d) {
  const recipes = [];
  const add = r => { if (r && !recipes.some(x => sig(x) === sig(r))) recipes.push(r); };
  if (d.recipe) add(parseRecipe(d.recipe, 'crafting'));
  for (const r of d.recipes || []) add(parseRecipe(r));
  const req = [];
  const ct = (d.crafttext || '').replace(/^Requires:?\s*/i, '').trim();
  if (ct) req.push(ct);
  if (d.slayer_req && !/slayer/i.test(ct)) {
    const [boss, lvl] = d.slayer_req.split('_');
    req.push(`${SLAYER[boss] || pretty(boss)} ${lvl || ''}`.trim());
  }
  return {
    name: cleanName(d.displayname),
    req,
    wiki: (d.info || []).find(u => /^https?:\/\//.test(u)) || null,
    vanilla: !!d.vanilla,
    glint: /\bench:\[/.test(d.nbttag || ''),
    recipes,
  };
}
function fetchItem(id) {
  if (info.has(id)) return Promise.resolve(info.get(id));
  if (pending.has(id)) return pending.get(id);
  const c = disk[id];
  if (c && Date.now() - c.t < RECIPE_TTL) { info.set(id, c.d); return Promise.resolve(c.d); }
  const p = fetch(REPO + encodeURIComponent(id) + '.json')
    .then(async r => {
      if (r.status === 404) return { name: null, req: [], wiki: null, vanilla: false, recipes: [], missing: true };
      if (!r.ok) throw new Error(r.status);
      return parseItem(await r.json());
    })
    .then(d => { disk[id] = { t: Date.now(), d }; persist(); return d; })
    .catch(() => ({ name: null, req: [], wiki: null, vanilla: false, recipes: [], missing: true, offline: true }))
    .then(d => { info.set(id, d); pending.delete(id); return d; });
  pending.set(id, p);
  return p;
}

function nameStr(id) {
  const i = info.get(id);
  if (i && i.name) return i.name;
  const l = listById.get(id);
  if (l) return '§' + (TIER[l.tier] || 'f') + l.name;
  return '§f' + pretty(id);
}
function nameHTML(id) {
  const s = nameStr(id);
  const m = s.match(/§([0-9a-f])/i);
  return `<span class="mc" style="color:${m ? MC[m[1].toLowerCase()] : MC.f}">${esc(s.replace(/§./g, '').trim())}</span>`;
}
const plainName = id => nameStr(id).replace(/§./g, '').trim();
function wikiLink(id) {
  const i = info.get(id);
  const url = (i && i.wiki) || 'https://hypixelskyblock.minecraft.wiki/w/Special:Search?search=' + encodeURIComponent(plainName(id));
  return `<a class="wiki" href="${esc(url)}" target="_blank" rel="noopener" title="Open on the wiki">wiki ↗</a>`;
}

/* ---------- plans ---------- */
let state = readLS(STORE_KEY, null) || { plans: [], active: null, tab: 'raw', hideDone: false };
function saveState() { writeLS(STORE_KEY, state); }
function makePlan(name) {
  const p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, target: null, qty: 1, have: {}, raw: {}, choice: {}, done: {} };
  state.plans.push(p); state.active = p.id; saveState();
  return p;
}
const plan = () => state.plans.find(p => p.id === state.active) || null;

function isRaw(p, id, inf) {
  if (p.raw[id] !== undefined) return p.raw[id];
  return !inf.recipes.length || inf.vanilla;
}

/* ---------- compute ---------- */
function compute(p) {
  const pool = { ...p.have };
  const raw = new Map();
  const missing = new Set();
  const steps = new Map();
  const reqs = new Map();
  let coinTotal = 0, forge = 0, kat = 0, nodes = 0, truncated = false;

  function walk(id, qty, path) {
    nodes++;
    const key = path.length ? path.join('>') + '>' + id : id;
    const n = { id, qty, key, depth: path.length, children: [] };
    const inf = info.get(id);
    if (!inf) { missing.add(id); n.loading = true; return n; }
    for (const r of inf.req) {
      if (!reqs.has(r)) reqs.set(r, new Set());
      reqs.get(r).add(id);
    }
    n.hasRecipe = inf.recipes.length > 0;
    const cyc = path.includes(id);
    if (cyc || nodes > MAX_NODES || isRaw(p, id, inf)) {
      if (nodes > MAX_NODES) truncated = true;
      n.raw = true; n.cyc = cyc;
      raw.set(id, (raw.get(id) || 0) + qty);
      return n;
    }
    const use = Math.min(pool[id] || 0, qty);
    if (use) pool[id] -= use;
    n.used = use;
    const need = qty - use;
    if (need <= 0) return n;
    const ri = Math.min(p.choice[id] || 0, inf.recipes.length - 1);
    const r = inf.recipes[ri];
    const crafts = Math.ceil(need / r.count - 1e-9);
    Object.assign(n, { recipe: r, ri, crafts, extra: crafts * r.count - need, options: inf.recipes });
    coinTotal += r.coins * crafts;
    if (r.type === 'forge') forge += r.duration * crafts;
    if (r.type === 'kat') kat += r.duration * crafts;
    const next = path.concat(id);
    for (const inp of r.inputs) n.children.push(walk(inp.id, inp.count * crafts, next));
    const s = steps.get(id);
    if (s && s.ri === ri) { s.crafts += crafts; s.out += crafts * r.count; }
    else if (!s) steps.set(id, { id, ri, recipe: r, crafts, out: crafts * r.count });
    return n;
  }

  const root = p.target ? walk(p.target, p.qty, []) : null;
  return { root, raw, missing, steps: [...steps.values()], reqs, coins: coinTotal, forge, kat, truncated };
}

/* ---------- refresh loop ---------- */
let tok = 0, last = null;
async function refresh() {
  const my = ++tok;
  const p = plan();
  renderPlans();
  if (!p || !p.target) { last = null; render(null); return; }
  let res = compute(p);
  render(res);
  let rounds = 0;
  while (res.missing.size && rounds++ < 80) {
    status(`Loading recipes… ${info.size} items so far`);
    await Promise.all([...res.missing].map(fetchItem));
    if (my !== tok) return;
    res = compute(p);
    render(res);
  }
  if (my !== tok) return;
  const offline = [...info.values()].some(i => i.offline);
  status(res.truncated ? 'This tree is huge, so it was cut off. Mark some branches as gathered to shorten it.'
    : offline ? 'Some recipes could not be downloaded (offline?). They are shown as raw materials.' : '');
}
function status(s) { $('#status').textContent = s; }

/* ---------- render ---------- */
function renderPlans() {
  const sel = $('#planSelect');
  sel.innerHTML = state.plans.length
    ? state.plans.map(p => `<option value="${p.id}" ${p.id === state.active ? 'selected' : ''}>${esc(p.name)}</option>`).join('')
    : '<option value="">No plans yet</option>';
  sel.disabled = !state.plans.length;
  $('#renamePlan').disabled = $('#deletePlan').disabled = !plan();
}

function render(res) {
  last = res;
  const p = plan();
  const has = !!(p && p.target);
  $('#empty').hidden = has;
  $('#planView').hidden = !has;
  if (!has || !res) return;

  const focus = document.activeElement && document.activeElement.dataset.focus;

  // target header
  $('#targetName').innerHTML = `${num(p.qty)}× ${nameHTML(p.target)}`;
  const tInf = info.get(p.target);
  $('#targetReq').innerHTML = tInf ? tInf.req.map(r => `<span class="chip req">🔒 ${esc(r)}</span>`).join('') : '';
  $('#targetWiki').href = (tInf && tInf.wiki) || 'https://hypixelskyblock.minecraft.wiki/w/Special:Search?search=' + encodeURIComponent(plainName(p.target));
  $('#qty').value = p.qty;

  // stats
  let need = 0, got = 0, doneTypes = 0;
  for (const [id, q] of res.raw) {
    const h = Math.min(p.have[id] || 0, q);
    need += q; got += h; if (h >= q) doneTypes++;
  }
  const pct = need ? got / need * 100 : 100;
  const stepsDone = res.steps.filter(s => p.done[s.id]).length;
  const loading = res.missing.size > 0;
  $('#stats').innerHTML = [
    stat('Materials gathered', `${pct.toFixed(pct >= 99.95 || pct === 0 ? 0 : 1)}%`, pct),
    stat('Raw materials done', `${doneTypes} / ${res.raw.size}`),
    stat('Crafts done', `${stepsDone} / ${res.steps.length}`, res.steps.length ? stepsDone / res.steps.length * 100 : 100),
    stat('Coins (NPC & upgrades)', coins(res.coins)),
    res.forge ? stat('Forge time', dur(res.forge)) : '',
    res.kat ? stat('Kat upgrade time', dur(res.kat)) : '',
  ].join('') + (loading ? '' : '');

  // tab badges
  const counts = { raw: res.raw.size, tree: '', req: res.reqs.size, steps: res.steps.length };
  document.querySelectorAll('.tab').forEach(t => {
    const k = t.dataset.tab;
    t.classList.toggle('on', state.tab === k);
    t.setAttribute('aria-selected', state.tab === k);
    t.innerHTML = t.textContent.replace(/\d+$/, '').trim() + (counts[k] !== '' ? ` <span class="n">${counts[k]}</span>` : '');
  });
  ['raw', 'tree', 'req', 'steps'].forEach(k => ($('#tab-' + k).hidden = state.tab !== k));

  if (state.tab === 'raw') renderRaw(p, res);
  if (state.tab === 'tree') renderTree(p, res);
  if (state.tab === 'req') renderReq(p, res);
  if (state.tab === 'steps') renderSteps(p, res);

  if (focus) {
    const el = document.querySelector(`[data-focus="${CSS.escape(focus)}"]`);
    if (el) { el.focus(); if (el.select) el.select(); }
  }
}
function stat(k, v, pct) {
  const bar = pct === undefined ? '' : `<div class="bar ${pct >= 100 ? 'full' : ''}"><span style="width:${Math.min(100, pct)}%"></span></div>`;
  return `<div class="stat"><div class="k">${esc(k)}</div><div class="v">${v}</div>${bar}</div>`;
}

function renderRaw(p, res) {
  const rows = [...res.raw].map(([id, q]) => {
    const h = p.have[id] || 0;
    return { id, q, h, left: Math.max(0, q - h), name: plainName(id) };
  }).sort((a, b) => (a.left === 0) - (b.left === 0) || a.name.localeCompare(b.name));
  const shown = state.hideDone ? rows.filter(r => r.left > 0) : rows;
  const body = shown.map(r => {
    const inf = info.get(r.id);
    const pct = r.q ? Math.min(100, r.h / r.q * 100) : 100;
    const breakBtn = inf && inf.recipes.length
      ? `<button class="btn ghost small" data-act="expand" data-id="${esc(r.id)}" title="This item can be crafted. Show its ingredients instead">Break down</button>` : '';
    return `<tr class="${r.left === 0 ? 'done' : ''}">
      <td><div class="item-cell">${nameHTML(r.id)} ${wikiLink(r.id)} ${breakBtn}</div></td>
      <td class="num">${num(r.q)}</td>
      <td class="num"><input type="number" min="0" value="${r.h || ''}" placeholder="0" data-have="${esc(r.id)}" data-focus="raw:${esc(r.id)}" aria-label="Have ${esc(r.name)}"></td>
      <td class="num">${r.left ? num(r.left) : '✓'}</td>
      <td class="barcell"><div class="bar ${pct >= 100 ? 'full' : ''}"><span style="width:${pct}%"></span></div></td>
    </tr>`;
  }).join('');
  $('#tab-raw').innerHTML = `
    <div class="toolbar">
      <label><input type="checkbox" id="hideDone" ${state.hideDone ? 'checked' : ''}> Hide finished</label>
      <span>Type how many you have of each item. Everything is saved in this browser.</span>
    </div>
    <table class="table">
      <thead><tr><th>Item</th><th class="num">Needed</th><th class="num">Have</th><th class="num">Left</th><th class="barcell">Progress</th></tr></thead>
      <tbody>${body || `<tr><td colspan="5" class="muted">${rows.length ? 'Everything is gathered! 🎉' : 'Loading…'}</td></tr>`}</tbody>
    </table>`;
}

const openState = new Map(); // key -> bool (user toggled)
function isOpen(n) { return openState.has(n.key) ? openState.get(n.key) : n.depth < (state.treeView === 'list' ? 2 : 8); }
const RTYPE = { craft: ['Craft', ''], forge: ['Forge', 'forge'], npc: ['NPC shop', 'npc'], kat: ['Kat upgrade', 'kat'], trade: ['Trade', 'npc'] };
function recipeLabel(r) {
  const ins = r.inputs.map(i => `${num(i.count)} ${plainName(i.id)}`);
  if (r.coins) ins.push(coins(r.coins) + ' coins');
  return `${RTYPE[r.type][0]}: ${ins.join(', ')}${r.count > 1 ? ` → ${num(r.count)}` : ''}`;
}
function nodeHTML(p, n) {
  const kids = n.children.length > 0;
  const open = kids && isOpen(n);
  const chips = [];
  if (n.loading) chips.push('<span class="chip">loading…</span>');
  if (n.raw) chips.push(`<span class="chip raw">${n.cyc ? 'raw (loop)' : 'gather'}</span>`);
  if (n.recipe) {
    const [label, cls] = RTYPE[n.recipe.type];
    let t = `${label} ×${num(n.crafts)}`;
    if (n.recipe.type === 'forge' || n.recipe.type === 'kat') t += ` · ${dur(n.recipe.duration)} each`;
    if (n.recipe.coins) t += ` · ${coins(n.recipe.coins * n.crafts)} coins`;
    chips.push(`<span class="chip ${cls}">${esc(t)}</span>`);
    if (n.extra > 0) chips.push(`<span class="chip" title="Leftover from rounding up crafts">+${num(n.extra)} spare</span>`);
  }
  const inf = info.get(n.id);
  if (inf) for (const r of inf.req) chips.push(`<span class="chip req">🔒 ${esc(r)}</span>`);
  if (n.used) chips.push(`<span class="covered">✓ ${num(n.used)} from inventory</span>`);
  if (n.raw && (p.have[n.id] || 0) >= (last && last.raw.get(n.id) || Infinity)) chips.push('<span class="covered">✓ gathered</span>');

  const ctrl = [];
  if (n.options && n.options.length > 1) {
    ctrl.push(`<select data-choice="${esc(n.id)}" title="Pick a recipe">${n.options.map((r, i) =>
      `<option value="${i}" ${i === n.ri ? 'selected' : ''}>${esc(recipeLabel(r))}</option>`).join('')}</select>`);
  }
  if (!n.raw && !n.loading && n.depth > 0) {
    ctrl.push(`<label>have <input type="number" min="0" value="${p.have[n.id] || ''}" placeholder="0" data-have="${esc(n.id)}" data-focus="tree:${esc(n.key)}"></label>`);
  }
  if (n.hasRecipe && !n.cyc && n.depth > 0) {
    ctrl.push(n.raw
      ? `<button class="btn ghost small" data-act="expand" data-id="${esc(n.id)}">Break down</button>`
      : `<button class="btn ghost small" data-act="stop" data-id="${esc(n.id)}" title="Treat this as something you gather or already have, without listing its ingredients">Stop here</button>`);
  }

  return `<li>
    <div class="node-row">
      <button class="twisty ${kids ? '' : 'leaf'}" data-toggle="${esc(n.key)}" aria-label="Toggle">${open ? '▼' : '▶'}</button>
      <span class="qtyx">${num(n.qty)}×</span>
      ${nameHTML(n.id)} ${chips.join(' ')}
      <span class="node-ctrl">${ctrl.join('')}</span>
    </div>
    ${open ? `<ul>${n.children.map(c => nodeHTML(p, c)).join('')}</ul>` : ''}
  </li>`;
}
/* ---- picture view of the tree ---- */
// Icons are stored in ../icons/ (see scripts/fetch_icons.py). Anything not downloaded yet
// falls back to sky.coflnet.com, then to the item's first letter.
const iconFile = id => id.replace(/[^A-Za-z0-9_]/g, c => '-' + c.charCodeAt(0) + '-') + '.png';
let localIcons = null;
fetch('../icons/index.json').then(r => r.ok ? r.json() : []).catch(() => [])
  .then(list => { localIcons = new Set(list); if (state.tab === 'tree' && last) render(last); });
const ICON = id => (!localIcons || localIcons.has(iconFile(id)))
  ? '../icons/' + iconFile(id)
  : 'https://sky.coflnet.com/static/icon/' + encodeURIComponent(id);
/** Broken icon: try coflnet once, then show the item's first letter. */
window.iconFail = img => {
  const wrap = img.parentElement;
  if (!img.dataset.tried) {
    img.dataset.tried = '1';
    const url = 'https://sky.coflnet.com/static/icon/' + encodeURIComponent(img.dataset.id);
    wrap.style.setProperty('--icon', `url('${url}')`);
    img.src = url;
    return;
  }
  wrap.classList.remove('glint');
  img.replaceWith(Object.assign(document.createElement('span'), { className: 'vt-letter', textContent: img.dataset.letter }));
};
/** Items that shimmer in-game (NEU marks them with ench:[]), or anything named Enchanted. */
const hasGlint = id => { const i = info.get(id); return !!(i && i.glint) || /^ENCHANTED_/.test(id); };
let selectedKey = null;
function shortNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(Math.round(n * 100) / 100);
}
function picHTML(p, n) {
  const kids = n.children.length > 0;
  const open = kids && isOpen(n);
  const done = n.raw ? (p.have[n.id] || 0) >= (last && last.raw.get(n.id) || Infinity) : n.used >= n.qty;
  const cls = ['vt-box', n.raw ? 'raw' : '', done ? 'done' : '', kids && !open ? 'closed' : '', n.key === selectedKey ? 'sel' : ''].join(' ');
  const tip = `${num(n.qty)}× ${plainName(n.id)}${n.recipe ? ' · ' + recipeLabel(n.recipe) : n.raw ? ' · gather' : ''}`;
  return `<div class="vt-node">
    <button class="${cls}" data-select="${esc(n.key)}" title="${esc(tip)}">
      <span class="vt-icon ${hasGlint(n.id) ? 'glint' : ''}" style="--icon:url('${ICON(n.id)}')"><img src="${ICON(n.id)}" alt="" loading="lazy" data-id="${esc(n.id)}" data-letter="${esc(plainName(n.id).charAt(0))}" onerror="iconFail(this)"></span>
      <span class="vt-n">${shortNum(n.qty)}</span>
    </button>
    ${open ? `<div class="vt-kids">${n.children.map(c => picHTML(p, c)).join('')}</div>` : ''}
  </div>`;
}
function selectedPanel(p, res) {
  const n = selectedKey && findNode(res.root, selectedKey);
  if (!n) return '<p class="hint">Click an item to see its details. Items with a small corner mark have hidden ingredients.</p>';
  const inf = info.get(n.id);
  const bits = [];
  if (n.recipe) {
    const [label, cls] = RTYPE[n.recipe.type];
    bits.push(`<span class="chip ${cls}">${esc(label)} ×${num(n.crafts)}${n.recipe.duration ? ` · ${dur(n.recipe.duration)} each` : ''}</span>`);
  }
  if (n.raw) bits.push(`<span class="chip raw">gather</span>`);
  if (inf) for (const r of inf.req) bits.push(`<span class="chip req">🔒 ${esc(r)}</span>`);
  if (n.used) bits.push(`<span class="covered">✓ ${num(n.used)} from inventory</span>`);
  const actions = [];
  if (n.children.length) actions.push(`<button class="btn ghost small" data-toggle="${esc(n.key)}">${isOpen(n) ? 'Hide ingredients' : 'Show ingredients'}</button>`);
  if (n.hasRecipe && !n.cyc && n.depth > 0) {
    actions.push(n.raw
      ? `<button class="btn ghost small" data-act="expand" data-id="${esc(n.id)}">Break down</button>`
      : `<button class="btn ghost small" data-act="stop" data-id="${esc(n.id)}">Stop here</button>`);
  }
  if (n.depth > 0) actions.push(`<label class="node-ctrl" style="margin:0">have <input type="number" min="0" value="${p.have[n.id] || ''}" placeholder="0" data-have="${esc(n.id)}" data-focus="pic:${esc(n.key)}"></label>`);
  actions.push(wikiLink(n.id));
  return `<div class="vt-detail">
    <div class="vt-detail-head"><b>${num(n.qty)}×</b> ${nameHTML(n.id)} ${bits.join(' ')}</div>
    ${n.recipe ? `<div class="ing">${esc(recipeLabel(n.recipe))}</div>` : ''}
    <div class="vt-actions">${actions.join(' ')}</div>
  </div>`;
}

function renderTree(p, res) {
  const pic = state.treeView !== 'list';
  const oldFrame = $('#tab-tree .vt-frame');
  const scroll = oldFrame ? [oldFrame.scrollLeft, oldFrame.scrollTop] : null;
  renderTreeHTML(p, res, pic);
  const frame = $('#tab-tree .vt-frame');
  if (frame && scroll) [frame.scrollLeft, frame.scrollTop] = scroll;
}
function renderTreeHTML(p, res, pic) {
  $('#tab-tree').innerHTML = `
    <div class="toolbar">
      <span class="seg">
        <button class="btn small ${pic ? '' : 'ghost'}" data-view="pic">Picture</button>
        <button class="btn small ${pic ? 'ghost' : ''}" data-view="list">List</button>
      </span>
      <button class="btn ghost small" data-act="openall">Expand all</button>
      <button class="btn ghost small" data-act="closeall">Collapse all</button>
      <span>${pic ? 'Hover or click an item for details.' : 'Enter items you already own and their branches disappear. Use "Stop here" for anything you\'d rather treat as one raw item.'}</span>
    </div>
    ${pic
      ? `<div class="vt-frame"><div class="vt-canvas">${picHTML(p, res.root)}</div></div>${selectedPanel(p, res)}`
      : `<ul class="tree">${nodeHTML(p, res.root)}</ul>`}`;
}

function renderReq(p, res) {
  const list = [...res.reqs].sort((a, b) => a[0].localeCompare(b[0]));
  $('#tab-req').innerHTML = list.length ? `
    <div class="toolbar"><span>Unlocks you need before you can craft everything in this plan.</span></div>
    <div class="cards">${list.map(([r, ids]) => `
      <div class="card"><h3>🔒 ${esc(r)}</h3>
        <div class="muted">Needed for: ${[...ids].map(nameHTML).join(', ')}</div></div>`).join('')}
    </div>` : '<p class="muted">No collection, slayer or HotM requirements were found for this plan.</p>';
}

function renderSteps(p, res) {
  $('#tab-steps').innerHTML = res.steps.length ? `
    <div class="toolbar"><span>Crafts in order, with ingredients first. Tick them off as you go.</span></div>
    <div class="cards">${res.steps.map((s, i) => {
      const r = s.recipe;
      const ins = r.inputs.map(x => `${num(x.count * s.crafts)} ${nameHTML(x.id)}`);
      if (r.coins) ins.push(`${coins(r.coins * s.crafts)} coins`);
      const verb = { craft: 'Craft', forge: 'Forge', npc: 'Buy from NPC', kat: 'Upgrade with Kat', trade: 'Trade for' }[r.type];
      let extra = '';
      if (r.type === 'forge' || r.type === 'kat') extra = ` · ${dur(r.duration)} each${s.crafts > 1 ? ` (${dur(r.duration * s.crafts)} total)` : ''}`;
      const done = !!p.done[s.id];
      return `<label class="card step ${done ? 'done' : ''}">
        <input type="checkbox" data-done="${esc(s.id)}" ${done ? 'checked' : ''}>
        <span class="step-num">${i + 1}.</span>
        <span><div class="step-main">${verb} <b>${num(s.out)}×</b> ${nameHTML(s.id)}${s.crafts !== s.out ? ` <span class="muted">(${num(s.crafts)} crafts)</span>` : ''}<span class="muted">${extra}</span></div>
          <div class="step-in">Uses ${ins.join(', ')}</div></span>
      </label>`;
    }).join('')}</div>` : '<p class="muted">Nothing to craft. You already have everything!</p>';
}

/* ---------- search ---------- */
let sugg = [], sIdx = 0;
function searchItems(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  const scored = [];
  for (const i of itemList) {
    if (!words.every(w => i.lc.includes(w))) continue;
    const s = (i.lc === q ? 0 : i.lc.startsWith(q) ? 1 : 2) * 1000 + i.lc.length;
    scored.push([s, i]);
  }
  scored.sort((a, b) => a[0] - b[0]);
  const out = scored.slice(0, 12).map(x => x[1]);
  const asId = q.toUpperCase().replace(/\s+/g, '_');
  if (/^[A-Z0-9_;:\-]+$/.test(asId) && !listById.has(asId) && !out.some(i => i.id === asId)) {
    out.push({ id: asId, name: `Use item ID "${asId}"`, tier: 'COMMON', raw: true });
  }
  if (listById.has(asId) && !out.some(i => i.id === asId)) out.unshift(listById.get(asId));
  return out;
}
function showSuggest() {
  const box = $('#suggest');
  sugg = searchItems($('#search').value);
  sIdx = 0;
  if (!sugg.length) { box.hidden = true; return; }
  box.innerHTML = sugg.map((i, k) => `<button type="button" role="option" data-pick="${k}" class="${k === sIdx ? 'active' : ''}">
    ${i.raw ? esc(i.name) : `<span class="mc" style="color:${MC[TIER[i.tier] || 'f']}">${esc(i.name)}</span>`}
    <span class="id">${esc(i.id)}</span></button>`).join('');
  box.hidden = false;
}
function pick(i) {
  $('#suggest').hidden = true;
  $('#search').value = '';
  const qty = Math.max(1, parseInt($('#qty').value, 10) || 1);
  let p = plan();
  if (!p || p.target) p = makePlan(i.raw ? pretty(i.id) : i.name);
  else p.name = i.raw ? pretty(i.id) : i.name;
  p.target = i.id; p.qty = qty;
  state.tab = 'raw';
  saveState();
  refresh();
}

/* ---------- events ---------- */
function bind() {
  const search = $('#search');
  search.addEventListener('input', showSuggest);
  search.addEventListener('focus', showSuggest);
  search.addEventListener('keydown', e => {
    const box = $('#suggest');
    if (box.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sIdx = (sIdx + (e.key === 'ArrowDown' ? 1 : -1) + sugg.length) % sugg.length;
      box.querySelectorAll('button').forEach((b, k) => b.classList.toggle('active', k === sIdx));
      box.children[sIdx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') { e.preventDefault(); if (sugg[sIdx]) pick(sugg[sIdx]); }
    else if (e.key === 'Escape') box.hidden = true;
  });
  $('#suggest').addEventListener('mousedown', e => {
    const b = e.target.closest('[data-pick]');
    if (b) { e.preventDefault(); pick(sugg[+b.dataset.pick]); }
  });
  document.addEventListener('click', e => { if (!e.target.closest('.search-box')) $('#suggest').hidden = true; });

  $('#qty').addEventListener('change', () => {
    const p = plan();
    const q = Math.max(1, parseInt($('#qty').value, 10) || 1);
    if (p && p.target) { p.qty = q; saveState(); refresh(); }
  });

  $('#planSelect').addEventListener('change', e => { state.active = e.target.value; saveState(); openState.clear(); refresh(); });
  $('#newPlan').addEventListener('click', () => { makePlan('New plan'); refresh(); $('#search').focus(); });
  $('#renamePlan').addEventListener('click', () => {
    const p = plan(); if (!p) return;
    const n = prompt('Rename plan', p.name);
    if (n && n.trim()) { p.name = n.trim(); saveState(); renderPlans(); }
  });
  $('#deletePlan').addEventListener('click', () => {
    const p = plan(); if (!p) return;
    if (!confirm(`Delete the plan "${p.name}"? This can't be undone.`)) return;
    state.plans = state.plans.filter(x => x !== p);
    state.active = state.plans.length ? state.plans[state.plans.length - 1].id : null;
    saveState(); refresh();
  });
  $('#resetHave').addEventListener('click', () => {
    const p = plan(); if (!p) return;
    if (!confirm('Clear every "have" amount and ticked step in this plan?')) return;
    p.have = {}; p.done = {}; saveState(); refresh();
  });
  $('#exportPlan').addEventListener('click', async () => {
    const p = plan(); if (!p) return;
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(p))));
    try { await navigator.clipboard.writeText(code); toast('Plan copied to clipboard. Paste it into Import on another device.'); }
    catch { prompt('Copy this plan code:', code); }
  });
  $('#importPlan').addEventListener('click', () => {
    const code = prompt('Paste a plan code:');
    if (!code) return;
    try {
      const p = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
      if (!p.target) throw 0;
      const np = makePlan(p.name || 'Imported plan');
      Object.assign(np, { target: p.target, qty: p.qty || 1, have: p.have || {}, raw: p.raw || {}, choice: p.choice || {}, done: p.done || {} });
      saveState(); refresh(); toast('Plan imported.');
    } catch { toast("That code doesn't look like a plan."); }
  });

  document.querySelector('.tabs').addEventListener('click', e => {
    const t = e.target.closest('[data-tab]'); if (!t) return;
    state.tab = t.dataset.tab; saveState(); render(last);
  });

  const view = $('#planView');
  view.addEventListener('change', e => {
    const p = plan(); if (!p) return;
    const el = e.target;
    if (el.dataset.have !== undefined) {
      const v = Math.max(0, parseFloat(el.value) || 0);
      if (v) p.have[el.dataset.have] = v; else delete p.have[el.dataset.have];
      saveState();
      setTimeout(() => render(compute(p)), 0); // let focus move first (Tab key)
    } else if (el.dataset.choice !== undefined) {
      p.choice[el.dataset.choice] = +el.value; saveState(); refresh();
    } else if (el.dataset.done !== undefined) {
      if (el.checked) p.done[el.dataset.done] = true; else delete p.done[el.dataset.done];
      saveState(); render(last);
    } else if (el.id === 'hideDone') {
      state.hideDone = el.checked; saveState(); render(last);
    }
  });
  view.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.dataset.have !== undefined) e.target.blur();
  });
  view.addEventListener('click', e => {
    const p = plan(); if (!p) return;
    const vw = e.target.closest('[data-view]');
    if (vw) { state.treeView = vw.dataset.view; saveState(); render(last); return; }
    const sel = e.target.closest('[data-select]');
    if (sel) { selectedKey = selectedKey === sel.dataset.select ? null : sel.dataset.select; render(last); return; }
    const tg = e.target.closest('[data-toggle]');
    if (tg) {
      const n = findNode(last.root, tg.dataset.toggle);
      if (n) { openState.set(n.key, !isOpen(n)); render(last); }
      return;
    }
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act, id = a.dataset.id;
    if (act === 'expand') { p.raw[id] = false; saveState(); refresh(); }
    if (act === 'stop') { p.raw[id] = true; saveState(); refresh(); }
    if (act === 'openall' || act === 'closeall') {
      (function walk(n) { if (n.children.length) { openState.set(n.key, act === 'openall'); n.children.forEach(walk); } })(last.root);
      render(last);
    }
  });
}
function findNode(n, key) {
  if (!n) return null;
  if (n.key === key) return n;
  for (const c of n.children) { const f = findNode(c, key); if (f) return f; }
  return null;
}

/* ---------- drag to pan the picture tree ---------- */
(function dragPan() {
  let drag = null;
  document.addEventListener('pointerdown', e => {
    const frame = e.target.closest('.vt-frame');
    if (!frame || e.button !== 0 || e.target.closest('.vt-box')) return;
    drag = { frame, x: e.clientX, y: e.clientY, left: frame.scrollLeft, top: frame.scrollTop, id: e.pointerId };
    frame.classList.add('dragging');
    frame.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  document.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.frame.scrollLeft = drag.left - (e.clientX - drag.x);
    drag.frame.scrollTop = drag.top - (e.clientY - drag.y);
  });
  const end = e => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    drag.frame.classList.remove('dragging');
    drag = null;
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
})();

/* ---------- start ---------- */
bind();
if (state.plans.length && !plan()) state.active = state.plans[0].id;

// Deep link from the other tools: ironman/?item=WHEAT_GENERATOR_5&qty=1
(function openLinkedItem() {
  const qp = new URLSearchParams(location.search);
  const raw = qp.get('item');
  if (!raw) return;
  const id = raw.trim().toUpperCase();
  const qty = Math.max(1, parseInt(qp.get('qty'), 10) || 1);
  history.replaceState(null, '', location.pathname);
  const existing = state.plans.find(p => p.target === id && p.qty === qty);
  if (existing) { state.active = existing.id; }
  else {
    const p = makePlan(pretty(id));
    p.target = id; p.qty = qty;
    fetchItem(id).then(inf => {
      if (inf.name) { p.name = inf.name.replace(/§./g, '').trim(); saveState(); renderPlans(); }
    });
  }
  state.tab = 'raw';
  saveState();
})();
refresh();
loadItemList();
