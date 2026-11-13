'use strict';

const KEY = 'ace-hypixel.uniques.v1';
const $ = s => document.querySelector(s);

// Unique crafts needed for each bonus minion slot (on top of the 5 you start with).
const SLOT_AT = [5, 15, 30, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300, 350, 400, 450, 500, 550, 600, 650, 700];
const BASE_SLOTS = 5;
// Plain Minecraft tools in tier I recipes: cheap enough to count as free.
const FREE = /^(WOOD_(AXE|HOE|PICKAXE|SPADE|SWORD)|FISHING_ROD)$/;
const coins = n => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n));

let st = U.readLS(KEY, null) || {};
st = { tab: st.tab || 'next', manual: st.manual || {}, canNow: !!st.canNow };
const save = () => U.writeLS(KEY, st);

let minions = [], names = {}, nameToId = new Map();
let prices = null;          // id -> coins, live Bazaar
let fromApi = null;         // Set of 'ID_TIER' crafted on the profile (whole co-op)
let collTiers = null;       // Set of 'ITEM_N' collection tiers unlocked
let community = 0;          // bonus slots from the Community Shop

const ingName = id => names[id] ? U.named(names[id][0], names[id][1]) : U.esc(U.pretty(id));
const key = (m, t) => `${m.id}_${t}`;
function crafted(m, t) {
  const k = key(m, t);
  if (st.manual[k] !== undefined) return !!st.manual[k];
  return fromApi ? fromApi.has(k) : false;
}
const uniqueCount = () => minions.reduce((n, m) => n + m.tiers.filter(t => crafted(m, t.tier)).length, 0);
function slotsFor(n) {
  let b = 0;
  SLOT_AT.forEach(need => { if (n >= need) b++; });
  return b;
}

/** "Acacia Log I" → is that collection tier unlocked? null when we can't tell. */
function reqMet(req) {
  if (!req || !collTiers) return null;
  const m = req.match(/^(.*) ([IVXL]+)$/);
  if (!m) return null;
  const id = nameToId.get(m[1].toLowerCase());
  if (!id) return null;
  const n = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12 }[m[2]];
  return collTiers.has(`${id.replace('-', ':')}_${n}`);
}

/** Bazaar cost of one tier's own ingredients (the previous minion is part of the recipe too). */
function costOf(t) {
  let total = 0; const missing = [];
  for (const [id, n] of t.in) {
    if (FREE.test(id)) continue;
    const p = prices && prices[id.replace('-', ':')];
    if (p) total += p * n; else missing.push(id);
  }
  return { total, missing };
}

/** Tiers you can craft next: not made yet, and you've made the tier below (or it's tier I). */
function candidates() {
  const out = [];
  for (const m of minions) for (const t of m.tiers) {
    if (crafted(m, t.tier) || !t.in.length) continue;
    if (t.tier > 1 && !crafted(m, t.tier - 1)) continue;
    const req = m.tiers[0].req || t.req;
    out.push({ m, t, c: costOf(t), req, ok: reqMet(req) });
  }
  return out;
}
const byCost = (a, b) => (a.c.missing.length > 0) - (b.c.missing.length > 0) || a.c.total - b.c.total || a.t.tier - b.t.tier;

function matches(m) {
  const q = $('#q').value.trim().toLowerCase();
  return !q || m.name.toLowerCase().includes(q);
}

function renderStats() {
  const n = uniqueCount();
  const bonus = slotsFor(n);
  const next = SLOT_AT.find(need => need > n);
  const total = BASE_SLOTS + bonus + community;
  const possible = minions.reduce((s, m) => s + m.tiers.length, 0);
  $('#slots').textContent = total;
  $('#slotInfo').textContent = `${BASE_SLOTS} + ${bonus} from crafts${community ? ` + ${community} Community Shop` : ''}`;
  $('#stats').innerHTML = `
    <div class="stat"><div class="k">Unique crafts</div><div class="v">${n} <small>/ ${possible}</small></div></div>
    <div class="stat"><div class="k">Next slot</div><div class="v">${next ? `${next - n} more` : 'All done'}</div>
      <div class="hint" style="margin:4px 0 0">${next ? `at ${next} crafts` : 'Every slot from crafting is unlocked'}</div></div>
    <div class="stat"><div class="k">Slots from crafting</div><div class="v">${bonus} <small>/ ${SLOT_AT.length}</small></div></div>
    <div class="stat"><div class="k">Community Shop slots</div><div class="v">${community} <small>/ 5</small></div></div>`;
  return { n, next };
}

function planBtn(m, t) {
  return `<a class="btn small" href="../minions/?plan=${encodeURIComponent(m.id)}&tier=${t.tier}" title="Add to the Minion Planner and show what it costs">Plan</a>`;
}
function reqChip(c) {
  if (!c.req) return '';
  if (c.ok === null) return `<span class="chip" title="Requirement">Needs ${U.esc(c.req)}</span>`;
  return c.ok ? `<span class="chip ok" title="You have this">✓ ${U.esc(c.req)}</span>`
    : `<span class="chip req" title="You don't have this yet">🔒 ${U.esc(c.req)}</span>`;
}
function costCell(c) {
  const parts = [];
  if (prices === null) parts.push('<span class="muted">pricing…</span>');
  else if (c.total) parts.push(`~${coins(c.total)}`);
  if (c.missing.length) parts.push(`<span class="muted">+ ${c.missing.map(ingName).join(', ')}</span>`);
  return parts.join(' ') || '<span class="muted">Free</span>';
}

function renderNext(next, n) {
  let list = candidates().filter(c => matches(c.m));
  if (st.canNow) list = list.filter(c => c.ok !== false);
  list.sort(byCost);
  // Cheapest path to the next slot: keep taking the cheapest craft (each opens up the tier above).
  let path = '';
  if (next) {
    const need = next - n;
    const pool = candidates().filter(c => (st.canNow ? c.ok !== false : true) && !c.c.missing.length);
    const picked = []; let sum = 0;
    const taken = new Set();
    while (picked.length < need && pool.length) {
      pool.sort(byCost);
      const c = pool.shift();
      picked.push(c); sum += c.c.total; taken.add(key(c.m, c.t.tier));
      const up = c.m.tiers.find(x => x.tier === c.t.tier + 1);
      if (up && up.in.length && !crafted(c.m, up.tier)) pool.push({ m: c.m, t: up, c: costOf(up), req: c.req, ok: c.ok });
    }
    if (picked.length && prices) {
      path = `<div class="card" style="margin-bottom:12px"><h3 style="margin:0 0 6px">Cheapest way to slot ${BASE_SLOTS + slotsFor(n) + community + 1}</h3>
        <p class="muted" style="margin:0 0 8px">Craft these ${picked.length} for about ${coins(sum)} coins' worth of materials.</p>
        <div class="chips">${picked.map(c => `<span class="chip">${U.esc(c.m.name.replace(/ Minion$/, ''))} ${U.roman(c.t.tier)}</span>`).join('')}</div></div>`;
    }
  }
  $('#count').textContent = `${list.length} tiers you can craft next`;
  $('#list').innerHTML = path + (list.length ? `<div class="un-scroll"><table class="table mini"><thead><tr><th>Minion</th><th>Tier</th><th>Ingredients</th><th>Cost</th><th></th></tr></thead><tbody>
    ${list.slice(0, 80).map(c => `<tr>
      <td>${U.esc(c.m.name)}<div class="chips" style="margin-top:3px">${reqChip(c)}</div></td>
      <td>${U.roman(c.t.tier)}</td>
      <td>${c.t.in.map(([id, q]) => `${U.num(q)} ${ingName(id)}`).join(', ')}${c.t.tier > 1 ? `<span class="muted"> + your ${U.roman(c.t.tier - 1)} minion</span>` : ''}</td>
      <td>${costCell(c.c)}</td>
      <td>${planBtn(c.m, c.t)}</td></tr>`).join('')}</tbody></table></div>
    ${list.length > 80 ? `<p class="hint">Showing the 80 cheapest. Search to find others.</p>` : ''}`
    : '<p class="empty-note">Nothing left to craft here.</p>');
}

function renderAll() {
  const list = minions.filter(matches);
  $('#count').textContent = `${list.length} minions · click a tier to mark it crafted or not`;
  $('#list').innerHTML = `<div class="un-list">${list.map(m => {
    const done = m.tiers.filter(t => crafted(m, t.tier)).length;
    return `<div class="un-row"><div class="un-name">${U.esc(m.name)} <span class="muted">${done}/${m.tiers.length}</span></div>
      <div class="un-tiers">${m.tiers.map(t => {
        const k = key(m, t.tier), on = crafted(m, t.tier);
        const man = st.manual[k] !== undefined;
        return `<button type="button" class="un-t${on ? ' on' : ''}${man ? ' man' : ''}" data-k="${k}" title="${U.esc(m.name)} ${U.roman(t.tier)}${man ? ' (set by you)' : ''}">${U.roman(t.tier)}</button>`;
      }).join('')}</div></div>`;
  }).join('')}</div>`;
}

function render() {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === st.tab));
  $('#canNow').checked = st.canNow;
  $('#canNow').parentElement.hidden = st.tab !== 'next';
  const { n, next } = renderStats();
  if (st.tab === 'next') renderNext(next, n); else renderAll();
  const manual = Object.keys(st.manual).length;
  $('#note').innerHTML = `Costs are the ingredients at live Bazaar sell prices, as a rough guide to how much grinding each one takes.
    Tiers marked "+ item" use something that isn't on the Bazaar. ${fromApi ? '' : 'Log in to fill in what you have crafted, or mark tiers yourself in "All minions". '}
    ${manual ? `${manual} tier${manual > 1 ? 's are' : ' is'} set by hand. <a href="#" id="resetManual">Clear those</a>` : ''}`;
  save();
}

function bind() {
  document.querySelector('.tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    st.tab = b.dataset.tab; render();
  });
  $('#q').addEventListener('input', render);
  $('#canNow').addEventListener('change', e => { st.canNow = e.target.checked; render(); });
  $('#list').addEventListener('click', e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    const k = b.dataset.k;
    const [id, tier] = [k.slice(0, k.lastIndexOf('_')), +k.slice(k.lastIndexOf('_') + 1)];
    const m = minions.find(x => x.id === id);
    const now = crafted(m, tier);
    const api = fromApi ? fromApi.has(k) : false;
    if (!now === api) delete st.manual[k]; else st.manual[k] = now ? 0 : 1;
    render();
  });
  $('#note').addEventListener('click', e => {
    if (e.target.id !== 'resetManual') return;
    e.preventDefault(); st.manual = {}; render();
  });
}

async function loadPrices() {
  try {
    const j = await U.hypixel('/v2/skyblock/bazaar');
    prices = {};
    for (const [id, p] of Object.entries(j.products)) {
      const q = p.quick_status;
      if (q) prices[id] = q.sellPrice || q.buyPrice || 0;
    }
  } catch (err) { console.error(err); prices = {}; }
  render();
}

function applyProfile(d) {
  const set = new Set();
  for (const mem of Object.values(d.profile.members || {})) {
    for (const g of ((mem.player_data || {}).crafted_generators || [])) set.add(g);
  }
  fromApi = set;
  collTiers = new Set(((d.member.player_data || {}).unlocked_coll_tiers) || []);
  community = 0;
  for (const u of ((d.profile.community_upgrades || {}).upgrade_states || [])) {
    if (u.upgrade === 'minion_slots') community = Math.max(community, u.tier || 0);
  }
  render();
  return `${set.size} unique crafts across your ${Object.keys(d.profile.members || {}).length > 1 ? 'co-op' : 'profile'}`;
}

fetch('../data/minions.json').then(r => r.json()).then(d => {
  minions = d.minions; names = d.names;
  for (const [id, [, name]] of Object.entries(names)) if (!nameToId.has(name.toLowerCase())) nameToId.set(name.toLowerCase(), id);
  bind(); render();
  loadPrices();
  U.profileBar($('#profileBar'), { what: 'your minions', apply: applyProfile });
}).catch(err => { console.error(err); $('#list').innerHTML = '<p class="empty-note">Could not load minion data. Try refreshing.</p>'; });
