'use strict';

const KEY = 'ace-hypixel.museum.v1';
const $ = s => document.querySelector(s);
const STAGES = ['STARTER', 'AMATEUR', 'INTERMEDIATE', 'SKILLED', 'EXPERT', 'PROFESSIONAL', 'MASTER'];
const CATS = ['COMBAT', 'FARMING', 'MINING', 'FORAGING', 'FISHING', 'HUNTING', 'DUNGEONEERING'];
const TCOL = { COMMON: 'f', UNCOMMON: 'a', RARE: '9', EPIC: '5', LEGENDARY: '6', MYTHIC: 'd', DIVINE: 'b', SPECIAL: 'c', VERY_SPECIAL: 'c', SUPREME: '4' };
const HOW = { craft: ['Craft', 'raw'], forge: ['Forge', 'forge'], trade: ['Trade', 'npc'], npc: ['NPC shop', 'npc'], kat: ['Kat', 'kat'] };
const COIN = 'SKYBLOCK_COIN';

let st = U.readLS(KEY, null) || {};
st = Object.assign({ tab: 'missing', manual: {}, f: { cat: '', stage: '', how: '', sort: 'value' } }, st);
const save = () => U.writeLS(KEY, st);

let entries = [], byId = new Map(), names = {}, bazaarIds = new Set();
let prices = null;      // id -> coins each, from the live Bazaar
let donatedApi = null;  // Set of ids donated, from the logged-in profile

/* ---------- helpers ---------- */
const nameOf = id => id === COIN ? U.named('6', 'Coins') : names[id] ? U.named(names[id][0], names[id][1]) : U.esc(U.pretty(id));
const plain = id => id === COIN ? 'Coins' : names[id] ? names[id][1] : U.pretty(id);
const coins = n => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n));
function icon(id, name) {
  return `<span class="sh-icon small"><img src="../icons/${encodeURIComponent(id)}.png" alt="" loading="lazy"
    onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'vt-letter',textContent:'${U.esc((name || '?').charAt(0))}'}))"></span>`;
}
const entryIcon = e => icon(e.set ? (e.set.find(p => /HELMET|HAT|HOOD|MASK|CROWN/.test(p)) || e.set[0]) : e.id, e.name);

function isDonated(e, seen = new Set()) {
  if (!e || seen.has(e.id)) return false;
  seen.add(e.id);
  if ((donatedApi && donatedApi.has(e.id)) || st.manual[e.id]) return true;
  return e.up ? isDonated(byId.get(e.up), seen) : false;
}
/** Live cost of an entry's raw materials: { cost, drops: [[id, qty]], known } */
function costOf(e) {
  if (!e.raw) return { cost: null, drops: [], known: false };
  let cost = 0;
  const drops = [];
  for (const [id, q] of Object.entries(e.raw)) {
    if (id === COIN) cost += q;
    else if (prices && prices[id] !== undefined) cost += q * prices[id];
    else drops.push([id, q]);
  }
  return { cost, drops, known: !drops.length };
}

/* ---------- render ---------- */
function stats() {
  let xp = 0, max = 0, n = 0;
  const cat = {};
  for (const c of CATS) cat[c] = { xp: 0, max: 0 };
  for (const e of entries) {
    const d = isDonated(e);
    max += e.xp; cat[e.cat].max += e.xp;
    if (d) { xp += e.xp; n++; cat[e.cat].xp += e.xp; }
  }
  $('#xp').textContent = `${U.num(xp)} / ${U.num(max)}`;
  $('#xpInfo').textContent = `${n} of ${entries.length} items donated`;
  $('#cats').innerHTML = CATS.filter(c => cat[c].max).map(c => {
    const p = cat[c].xp / cat[c].max * 100;
    return `<div class="stat"><div class="k">${U.pretty(c)}</div><div class="v">${U.num(cat[c].xp)} <small class="muted">/ ${U.num(cat[c].max)} XP</small></div>
      <div class="bar ${p >= 100 ? 'full' : ''}"><span style="width:${p.toFixed(1)}%"></span></div></div>`;
  }).join('');
}

function matches(e) {
  const q = ($('#q').value || '').trim().toLowerCase();
  if (q) {
    const text = [e.name, ...(e.set || []).map(plain), ...Object.keys(e.raw || {}).map(plain)].join(' ').toLowerCase();
    if (!text.includes(q)) return false;
  }
  if (st.f.cat && e.cat !== st.f.cat) return false;
  if (st.f.stage && e.stage !== st.f.stage) return false;
  const make = (e.how || []).some(h => h === 'craft' || h === 'forge');
  if (st.f.how === 'make' && !make) return false;
  if (st.f.how === 'other' && make) return false;
  return true;
}
const rank = r => r.c.cost === null ? 2 : r.c.known ? 0 : 1;
const sorters = {
  value: (a, b) => rank(a) - rank(b) || (b.e.xp / Math.max(1, b.c.cost || 0)) - (a.e.xp / Math.max(1, a.c.cost || 0)) || b.e.xp - a.e.xp,
  cheap: (a, b) => rank(a) - rank(b) || (a.c.cost || 0) - (b.c.cost || 0),
  xp: (a, b) => b.e.xp - a.e.xp || a.e.name.localeCompare(b.e.name),
  stage: (a, b) => STAGES.indexOf(a.e.stage) - STAGES.indexOf(b.e.stage) || b.e.xp - a.e.xp,
  name: (a, b) => a.e.name.localeCompare(b.e.name),
};

function costCell(c) {
  if (c.cost === null) return '<span class="muted">–</span>';
  const parts = [];
  if (c.cost > 0 || c.known) parts.push(`≈ ${coins(c.cost)}`);
  if (c.drops.length) parts.push(`<span class="hint">${c.cost > 0 ? '+ ' : ''}${c.drops.slice(0, 2).map(([id, q]) => `${U.num(Math.ceil(q))} ${U.esc(plain(id))}`).join(', ')}${c.drops.length > 2 ? ` +${c.drops.length - 2} more` : ''}</span>`);
  return parts.join('<br>');
}
function detailsHTML(e, c) {
  const mats = Object.entries(e.raw || {}).sort((a, b) => (prices && prices[b[0]] || 0) * b[1] - (prices && prices[a[0]] || 0) * a[1]);
  const plan = id => `<a class="btn ghost small" href="../ironman/?item=${encodeURIComponent(id)}&qty=1" title="Plan it in the Ironman planner">Plan</a>`;
  return `<details class="mus-more"><summary>${e.set ? `${e.set.length} pieces` : 'Materials'}${e.req ? ` · 🔒 ${U.esc(e.req)}` : ''}</summary>
    ${e.set ? `<div class="mus-pieces">${e.set.map(p => `<div class="item-cell">${icon(p, plain(p))} ${nameOf(p)} ${plan(p)}</div>`).join('')}</div>` : ''}
    ${mats.length ? `<table class="table mini"><tbody>${mats.map(([id, q]) => `<tr><td>${nameOf(id)}</td><td class="num">${U.num(Math.ceil(q))}</td>
      <td class="num muted">${id === COIN ? '' : prices && prices[id] !== undefined ? coins(q * prices[id]) : 'not on Bazaar'}</td></tr>`).join('')}</tbody></table>`
      : '<p class="hint">No recipe: it drops or comes from somewhere else. Check the wiki.</p>'}
  </details>`;
}

function render() {
  stats();
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === st.tab));
  const want = st.tab === 'donated';
  const rows = entries.filter(e => isDonated(e) === want && matches(e)).map(e => ({ e, c: costOf(e) }))
    .sort(sorters[want && st.f.sort === 'value' ? 'xp' : st.f.sort] || sorters.value);
  $('#count').textContent = `${rows.length} item${rows.length === 1 ? '' : 's'} · ${U.num(rows.reduce((t, r) => t + r.e.xp, 0))} XP${prices ? '' : ' · loading Bazaar prices…'}`;
  if (!rows.length) { $('#list').innerHTML = `<p class="empty-note">${want ? 'Nothing donated matches.' : 'Everything here is donated. 🎉'}</p>`; return; }
  $('#list').innerHTML = `<div class="table-wrap"><table class="table mus-table">
    <thead><tr><th>Item</th><th class="num">XP</th><th class="num">Cost</th><th>How to get it</th><th></th></tr></thead>
    <tbody>${rows.slice(0, 300).map(({ e, c }) => {
      const up = e.up && byId.get(e.up);
      const make = (e.how || []).some(h => h === 'craft' || h === 'forge');
      const auto = isDonated(e) && !(donatedApi && donatedApi.has(e.id)) && !st.manual[e.id];
      return `<tr>
      <td><div class="item-cell">${entryIcon(e)} ${U.named(TCOL[e.tier] || 'f', e.name)}</div>
        <div class="hint">${U.pretty(e.cat)} · ${U.pretty(e.stage || '')}${up && !want ? ` · also counts if you donate ${U.esc(up.name)}` : ''}${auto ? ' · counted through a higher tier' : ''}</div>
        ${detailsHTML(e, c)}</td>
      <td class="num"><b>${e.xp}</b></td>
      <td class="num nowrap">${costCell(c)}</td>
      <td><div class="chips">${(e.how || []).map(h => `<span class="chip ${HOW[h] ? HOW[h][1] : ''}">${HOW[h] ? HOW[h][0] : U.esc(h)}</span>`).join('') || '<span class="chip">Drop or other</span>'}</div></td>
      <td class="right nowrap">
        ${make && !e.set ? `<a class="btn ghost small" href="../ironman/?item=${encodeURIComponent(e.id)}&qty=1" title="Plan every material in the Ironman planner">Plan</a>` : ''}
        ${e.wiki ? `<a class="btn ghost small" href="${U.esc(e.wiki)}" target="_blank" rel="noopener">Wiki ↗</a>` : ''}
        ${!want ? `<button class="btn ghost small" data-don="${U.esc(e.id)}" title="Mark as donated">Donated</button>`
          : st.manual[e.id] ? `<button class="btn ghost small" data-undon="${U.esc(e.id)}">Undo</button>` : ''}
      </td></tr>`;
    }).join('')}</tbody></table></div>${rows.length > 300 ? `<p class="hint">Showing the first 300. Search or filter to see the rest.</p>` : ''}`;
}

/* ---------- events ---------- */
function bind() {
  $('#fCat').innerHTML += CATS.map(c => `<option value="${c}">${U.pretty(c)}</option>`).join('');
  $('#fStage').innerHTML += STAGES.map(s => `<option value="${s}">${U.pretty(s)}</option>`).join('');
  document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { st.tab = b.dataset.tab; save(); render(); } });
  for (const [id, k] of Object.entries({ fCat: 'cat', fStage: 'stage', fHow: 'how', sort: 'sort' })) {
    $('#' + id).value = st.f[k] || '';
    $('#' + id).addEventListener('change', e => { st.f[k] = e.target.value; save(); render(); });
  }
  let qt;
  $('#q').addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(render, 150); });
  $('#list').addEventListener('click', e => {
    const d = e.target.closest('[data-don]'), u = e.target.closest('[data-undon]');
    if (d) { st.manual[d.dataset.don] = 1; save(); render(); }
    if (u) { delete st.manual[u.dataset.undon]; save(); render(); }
  });
}

async function loadPrices() {
  try {
    const j = await U.hypixel('/v2/skyblock/bazaar');
    prices = {};
    for (const id of bazaarIds) {
      const p = j.products[id] && j.products[id].quick_status;
      if (p) prices[id] = p.sellPrice || p.buyPrice || 0;
    }
  } catch (err) { console.error(err); prices = {}; }
  render();
}

function applyProfile(d) {
  donatedApi = new Set(Object.keys(d.museum.items || {}));
  render();
  if (!donatedApi.size) return 'No museum donations found. If you have some, turn on the Museum API in SkyBlock Menu → Settings → API Settings';
  return `${donatedApi.size} donations`;
}

/* ---------- start ---------- */
fetch('../data/museum.json').then(r => r.json()).then(d => {
  entries = d.entries; names = d.names; bazaarIds = new Set(d.bazaar);
  for (const e of entries) names[e.id] = names[e.id] || [TCOL[e.tier] || 'f', e.name];
  byId = new Map(entries.map(e => [e.id, e]));
  bind(); render();
  loadPrices();
  U.profileBar($('#profileBar'), { what: 'your museum', load: U.myMuseum, apply: applyProfile });
}).catch(err => { $('#list').innerHTML = '<p class="empty-note">Could not load the museum list. Try refreshing.</p>'; console.error(err); });
