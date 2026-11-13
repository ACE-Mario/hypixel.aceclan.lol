'use strict';

/* What to get next: for each skill's gear ladders (data/progress.json), find the best rung you own and show the next. */
const KEY = 'ace-hypixel.progress.v1';
const $ = s => document.querySelector(s);
const SKILL_XP = [50, 175, 375, 675, 1175, 1925, 2925, 4425, 6425, 9925, 14925, 22425, 32425, 47425, 67425, 97425,
  147425, 222425, 322425, 522425, 822425, 1222425, 1722425, 2322425, 3022425, 3822425, 4722425, 5722425, 6822425,
  8022425, 9322425, 10722425, 12222425, 13822425, 15522425, 17322425, 19222425, 21222425, 23322425, 25522425,
  27822425, 30222425, 32722425, 35322425, 38072425, 40972425, 44072425, 47472425, 51172425, 55172425, 59472425,
  64072425, 68972425, 74172425, 79672425, 85472425, 91572425, 97972425, 104672425, 111672425];
const HOTM_XP = [0, 3000, 12000, 37000, 97000, 197000, 347000, 557000, 847000, 1247000];
const HOTF_XP = [0, 3000, 12000, 37000, 97000, 197000, 347000, 547000];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

let data = null;
let me = null;   // { items: Set, pets: Set, museum: Set, skills: {}, hotm, hotf, coll: Set }
let st = U.readLS(KEY, null) || {};
st = { tab: st.tab || 'mining' };

const img = id => `<img src="../icons/${encodeURIComponent(id)}.png" alt="" loading="lazy" onerror="this.src='../icons/BARRIER.png'">`;
const tierOf = (xp, table) => table.filter(n => xp >= n).length;

/** How many of a rung's items you own (pieces for a set). */
function ownedCount(r) {
  if (!me) return 0;
  if (r.pet) return me.pets.has(r.ids[0]) ? 1 : 0;
  return r.ids.filter(id => me.items.has(id)).length;
}

/** Each requirement with ok true / false / null (can't tell). */
function reqs(r) {
  return r.req.map(q => {
    if (q.skill) return { text: `${U.pretty(q.skill)} ${q.lv}`, ok: me && me.skills[q.skill] !== undefined ? me.skills[q.skill] >= q.lv : null };
    if (q.hotm) return { text: `HotM ${q.hotm}`, ok: me ? me.hotm >= q.hotm : null };
    if (q.hotf) return { text: `HotF ${q.hotf}`, ok: me ? me.hotf >= q.hotf : null };
    if (q.coll) return { text: `${q.name} ${ROMAN[q.tier] || q.tier}`, ok: me && me.coll.size ? me.coll.has(`${q.coll.replace('-', ':')}_${q.tier}`) : null };
    return { text: q.text, ok: null };
  });
}
const ready = r => reqs(r).every(q => q.ok !== false);
const chip = q => q.ok === null ? `<span class="chip">Needs ${U.esc(q.text)}</span>`
  : q.ok ? `<span class="chip ok">✓ ${U.esc(q.text)}</span>` : `<span class="chip req">🔒 ${U.esc(q.text)}</span>`;

/** Where you are on a ladder: best fully owned rung, and the next thing to get (finishing a set first). */
function place(track) {
  let best = -1;
  track.rungs.forEach((r, i) => { if (ownedCount(r) > 0) best = i; });
  const cur = best >= 0 ? track.rungs[best] : null;
  if (cur && cur.set && ownedCount(cur) < cur.ids.length) return { best, cur, next: cur, finish: true };
  return { best, cur, next: track.rungs[best + 1] || null, finish: false };
}

function itemCard(r, label, extra = '') {
  const missing = r.set ? r.ids.filter(id => !me || !me.items.has(id)) : [];
  return `<div class="pg-item">
    <div class="mc-slot pg-icon">${img(r.icon)}</div>
    <div class="pg-body">
      <div class="pg-label">${label}</div>
      <div class="pg-name">${r.wiki ? `<a href="${U.esc(r.wiki)}" target="_blank" rel="noopener">${U.mcText(r.name)}</a>` : U.mcText(r.name)}${extra}</div>
      ${r.stats.length ? `<div class="pg-stats">${r.stats.map(s => U.esc(s)).join(' · ')}</div>` : ''}
      ${missing.length && missing.length < r.ids.length ? `<div class="pg-stats">Still need: ${missing.map(id => U.esc(U.pretty(id.split('_').pop()))).join(', ')}</div>` : ''}
      <div class="chips">${r.how.map(h => `<span class="chip ${/Forge/.test(h) ? 'forge' : /NPC/.test(h) ? 'npc' : 'raw'}">${U.esc(h)}</span>`).join('')}${reqs(r).map(chip).join('')}</div>
    </div></div>`;
}

function renderTrack(t) {
  const p = place(t);
  const after = p.next ? t.rungs.slice(t.rungs.indexOf(p.next) + 1) : [];
  return `<div class="card pg-track">
    <h4>${U.esc(t.name)}</h4>
    ${p.cur && !p.finish ? `<div class="pg-have">${img(p.cur.icon)} You have ${U.mcText(p.cur.name)}</div>` : !p.cur ? '<div class="pg-have">Nothing from this list yet</div>' : ''}
    ${p.next ? itemCard(p.next, p.finish ? 'Finish the set' : 'Get next', p.finish ? ` <small>(${ownedCount(p.next)}/${p.next.ids.length})</small>` : '')
      : '<p class="pg-done">✓ You have the best one on this list.</p>'}
    ${after.length ? `<div class="pg-after"><span>After that</span>${after.map(r => `<span class="mc-slot pg-mini" title="${U.esc(U.plain(r.name))}">${img(r.icon)}</span>`).join('')}</div>` : ''}
  </div>`;
}

function render() {
  const skills = data.skills;
  $('#tabs').innerHTML = skills.map(s => `<button role="tab" class="tab${st.tab === s.id ? ' on' : ''}" data-tab="${s.id}">${img(s.icon)} ${U.esc(s.name)}</button>`).join('');
  const sk = skills.find(s => s.id === st.tab) || skills[0];
  const lv = me && me.skills[sk.skill];
  $('#levels').innerHTML = me ? `<div class="stat"><div class="k">${U.esc(sk.name)} level</div><div class="v">${lv ?? '?'}</div></div>
    ${sk.id === 'mining' ? `<div class="stat"><div class="k">HotM tier</div><div class="v">${me.hotm}</div></div>` : ''}
    ${sk.id === 'foraging' ? `<div class="stat"><div class="k">HotF tier</div><div class="v">${me.hotf}</div></div>` : ''}` : '';
  $('#list').innerHTML = `<div class="pg-grid">${sk.tracks.map(renderTrack).join('')}</div>
    <p class="hint">Ladders follow ${data.sources.map(([n, u]) => `<a href="${U.esc(u)}" target="_blank" rel="noopener">${U.esc(n)}</a>`).join(', ')}. Click an item name for its wiki page.</p>`;
  // Quick picks: the next item in every track that you can get right now.
  if (!me) { $('#quick').innerHTML = '<p class="hint">Log in to see what you can work on right now.</p>'; return; }
  const picks = [];
  for (const s of skills) {
    for (const t of s.tracks) {
      const p = place(t);
      if (p.next && ready(p.next)) picks.push({ s, t, p });
    }
  }
  const bySkill = skills.map(s => [s, picks.filter(x => x.s === s)]).filter(([, l]) => l.length);
  $('#quick').innerHTML = bySkill.length ? `<div class="pg-quick">${bySkill.map(([s, l]) => `<div class="card">
      <h4>${img(s.icon)} ${U.esc(s.name)}</h4>
      ${l.slice(0, 5).map(({ t, p }) => `<a href="#" class="pg-q" data-tab="${s.id}"><span class="mc-slot pg-mini">${img(p.next.icon)}</span>
        <span><small>${U.esc(t.name)}${p.finish ? ' (finish set)' : ''}</small><br>${U.mcText(p.next.name)}</span></a>`).join('')}
      ${l.length > 5 ? `<p class="hint">+${l.length - 5} more in the ${U.esc(s.name)} tab</p>` : ''}</div>`).join('')}</div>`
    : '<p class="hint">Nothing is ready right now: every next item needs a level, tier or collection you don\'t have yet. Check each tab for what to work towards.</p>';
}

async function applyProfile(d) {
  const m = d.member, inv = m.inventory || {};
  const items = new Set(), museum = new Set();
  const srcs = [inv.inv_armor, inv.equipment_contents, inv.inv_contents, inv.ender_chest_contents, inv.wardrobe_contents,
    inv.personal_vault_contents, ...Object.values(inv.backpack_contents || {}), ...Object.values(inv.bag_contents || {})];
  for (const s of srcs) {
    if (!s || !s.data) continue;
    try { for (const it of await U.nbtItems(s.data)) items.add(it.id); } catch (e) { console.error(e); }
  }
  try {
    const mu = (await U.myMuseum()).museum || {};
    for (const v of [...Object.values(mu.items || {}), ...(mu.special || [])]) {
      if (!v.items || !v.items.data) continue;
      for (const it of await U.nbtItems(v.items.data)) { items.add(it.id); museum.add(it.id); }
    }
  } catch (e) { console.error(e); }
  const exp = (m.player_data || {}).experience || {};
  const skills = {};
  for (const [k, v] of Object.entries(exp)) skills[k.replace(/^SKILL_/, '')] = SKILL_XP.filter(n => v >= n).length;
  const tx = ((m.skill_tree || {}).experience) || {};
  me = {
    items, museum, skills,
    pets: new Set((((m.pets_data || {}).pets) || []).map(p => p.type)),
    hotm: tierOf(tx.mining || 0, HOTM_XP), hotf: tierOf(tx.foraging || 0, HOTF_XP),
    coll: new Set(((m.player_data || {}).unlocked_coll_tiers) || []),
  };
  render();
  const apiOff = !srcs.some(s => s && s.data);
  return apiOff ? 'Your Inventory API is off, so only pets and Museum items are counted. Turn it on in SkyBlock Menu → Settings → API Settings.'
    : `${items.size} different items and ${me.pets.size} pet types found`;
}

document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-tab]');
  if (!b) return;
  e.preventDefault();
  st.tab = b.dataset.tab; U.writeLS(KEY, st); render();
  if (b.classList.contains('pg-q')) $('#tabs').scrollIntoView({ behavior: 'smooth' });
});

fetch('../data/progress.json', { cache: 'no-cache' }).then(r => r.json()).then(d => {
  data = d;
  render();
  U.profileBar($('#profileBar'), { what: 'your gear', apply: applyProfile });
}).catch(err => { console.error(err); $('#list').innerHTML = '<p class="empty-note">Could not load the gear lists. Try refreshing.</p>'; });
