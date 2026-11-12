'use strict';

const KEY = 'ace-hypixel.talismans.v1';
const $ = s => document.querySelector(s);
const TIERS = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC', 'DIVINE', 'SPECIAL', 'VERY_SPECIAL', 'SUPREME'];
const MP = { COMMON: 3, UNCOMMON: 5, RARE: 8, EPIC: 12, LEGENDARY: 16, MYTHIC: 22, DIVINE: 22, SPECIAL: 3, VERY_SPECIAL: 5, SUPREME: 22 };
const TCOL = { COMMON: 'f', UNCOMMON: 'a', RARE: '9', EPIC: '5', LEGENDARY: '6', MYTHIC: 'd', DIVINE: 'b', SPECIAL: 'c', VERY_SPECIAL: 'c', SUPREME: '4' };
const HOW = { craft: ['Craft', 'raw'], forge: ['Forge', 'forge'], trade: ['Trade', 'npc'], npc: ['NPC shop', 'npc'], kat: ['Kat', 'kat'] };
const HEGEMONY = 'HEGEMONY_ARTIFACT';

let st = U.readLS(KEY, null) || {};
st = Object.assign({ tab: 'missing', manual: {}, f: { tier: '', how: '', sort: 'gain', next: true, rift: false } }, st);
const save = () => U.writeLS(KEY, st);

let all = [], byId = new Map();
let bag = null;   // id -> { tier, recomb } from the logged-in profile's Accessory Bag
let extra = { prism: false, highest: null };

/* ---------- helpers ---------- */
const tierName = t => U.pretty(t);
const mpOf = (id, tier) => (MP[tier] || 0) * (id === HEGEMONY ? 2 : 1);
const nameHTML = (a, tier = a.tier) => U.named(TCOL[tier] || 'f', a.name);
function icon(a) {
  return `<span class="sh-icon small"><img src="../icons/${encodeURIComponent(a.id)}.png" alt="" loading="lazy"
    onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'vt-letter',textContent:'${U.esc(a.name.charAt(0))}'}))"></span>`;
}
const famKey = a => a.fam || a.id;

/** What you own: id -> { tier, recomb, manual } */
function owned() {
  const o = new Map();
  for (const id of Object.keys(st.manual)) { const a = byId.get(id); if (a) o.set(id, { tier: a.tier, manual: true }); }
  if (bag) for (const [id, v] of bag) o.set(id, v);
  return o;
}

/** Work out Magical Power and what's missing. */
function analyse() {
  const own = owned();
  // best owned accessory in each upgrade line
  const best = new Map();
  for (const [id, v] of own) {
    const a = byId.get(id); if (!a || a.skip) continue;
    const k = famKey(a), cur = best.get(k);
    if (!cur || (a.rank || 0) > (cur.a.rank || 0)) best.set(k, { a, v });
  }
  let mp = 0;
  for (const { a, v } of best.values()) mp += mpOf(a.id, v.tier);
  if (extra.prism) mp += 11;

  const missing = [];
  let available = 0;
  const topOfLine = new Map(); // family -> highest MP still available
  for (const a of all) {
    if (a.skip || a.alias || own.has(a.id)) continue;
    if (a.rift && !st.f.rift) continue;
    const b = best.get(famKey(a));
    if (b && (b.a.rank || 0) >= (a.rank || 0)) continue; // you already have this or something better
    const gain = mpOf(a.id, a.tier) - (b ? mpOf(b.a.id, b.v.tier) : 0);
    missing.push({ a, gain, from: b ? b.a : null });
    const k = famKey(a);
    topOfLine.set(k, Math.max(topOfLine.get(k) || 0, gain));
  }
  for (const g of topOfLine.values()) available += Math.max(0, g);
  // next step only: the lowest missing rank above what you own in each line
  const next = new Map();
  for (const m of missing) {
    const k = famKey(m.a), cur = next.get(k);
    if (!cur || (m.a.rank || 0) < (cur.a.rank || 0)) next.set(k, m);
  }
  return { own, best, mp, missing, next, available };
}

/* ---------- render ---------- */
function howChips(a) {
  const c = (a.how || []).map(h => `<span class="chip ${HOW[h] ? HOW[h][1] : ''}">${U.esc(HOW[h] ? HOW[h][0] : h)}</span>`);
  if (!c.length) c.push('<span class="chip">Drop or other</span>');
  return c.join('') + (a.req || []).map(r => `<span class="chip req">🔒 ${U.esc(r)}</span>`).join('');
}
function matches(a) {
  const q = ($('#q').value || '').trim().toLowerCase();
  if (q && !(a.name + ' ' + (a.req || []).join(' ')).toLowerCase().includes(q)) return false;
  if (st.f.tier && a.tier !== st.f.tier) return false;
  const h = st.f.how;
  if (h === 'other' && (a.how || []).length) return false;
  if (h === 'trade' && !(a.how || []).some(x => x === 'trade' || x === 'npc')) return false;
  if (h && h !== 'other' && h !== 'trade' && !(a.how || []).includes(h)) return false;
  return true;
}
const sorters = {
  gain: (x, y) => y.gain - x.gain || x.a.name.localeCompare(y.a.name),
  name: (x, y) => x.a.name.localeCompare(y.a.name),
  tier: (x, y) => TIERS.indexOf(y.tier || y.a.tier) - TIERS.indexOf(x.tier || x.a.tier) || x.a.name.localeCompare(y.a.name),
};

function renderStats(r) {
  $('#mp').textContent = U.num(r.mp);
  $('#mpInfo').textContent = extra.highest ? `Hypixel's saved best: ${U.num(extra.highest)} (updates when you open your bag)` : (bag ? '' : 'From the ones you tick');
  const counted = r.best.size;
  $('#stats').innerHTML = `
    <div class="stat"><div class="k">Accessories counted</div><div class="v">${counted}</div></div>
    <div class="stat"><div class="k">Missing</div><div class="v">${r.next.size}</div><div class="hint">upgrade lines and single accessories</div></div>
    <div class="stat"><div class="k">Magical Power still to get</div><div class="v">+${U.num(r.available)}</div><div class="hint">with everything at its best tier</div></div>`;
}

function renderMissing(r) {
  const rows = (st.f.next ? [...r.next.values()] : r.missing).filter(m => matches(m.a)).sort(sorters[st.f.sort] || sorters.gain);
  $('#count').textContent = `${rows.length} accessor${rows.length === 1 ? 'y' : 'ies'}`;
  if (!rows.length) { $('#list').innerHTML = '<p class="empty-note">Nothing missing with these filters. 🎉</p>'; return; }
  $('#list').innerHTML = `<div class="table-wrap"><table class="table acc-table">
    <thead><tr><th>Accessory</th><th class="num">Magical Power</th><th>How to get it</th><th></th></tr></thead>
    <tbody>${rows.map(({ a, gain, from }) => `<tr>
      <td><div class="item-cell">${icon(a)} ${nameHTML(a)} <span class="muted">${tierName(a.tier)}</span></div>
        ${from ? `<div class="hint">Upgrades your ${U.esc(from.name)}</div>` : ''}</td>
      <td class="num"><b>+${gain}</b></td>
      <td><div class="chips">${howChips(a)}</div></td>
      <td class="right nowrap">
        ${(a.how || []).some(h => h === 'craft' || h === 'forge') ? `<a class="btn ghost small" href="../ironman/?item=${encodeURIComponent(a.id)}&qty=1" title="Plan every material in the Ironman planner">Plan</a>` : ''}
        ${a.wiki ? `<a class="btn ghost small" href="${U.esc(a.wiki)}" target="_blank" rel="noopener">Wiki ↗</a>` : ''}
        <button class="btn ghost small" data-have="${U.esc(a.id)}" title="Mark this as owned">I have it</button>
      </td></tr>`).join('')}</tbody></table></div>`;
}

function renderOwned(r) {
  const rows = [...r.own].map(([id, v]) => ({ a: byId.get(id), v, tier: v.tier })).filter(x => x.a && matches(x.a));
  const counts = new Set([...r.best.values()].map(b => b.a.id));
  rows.sort(sorters[st.f.sort === 'gain' ? 'tier' : st.f.sort]);
  $('#count').textContent = `${rows.length} owned`;
  if (!rows.length) {
    $('#list').innerHTML = `<p class="empty-note">${bag ? 'No accessories match.' : 'Log in to load your Accessory Bag, or use "I have it" on the Missing tab.'}</p>`;
    return;
  }
  $('#list').innerHTML = `<div class="table-wrap"><table class="table acc-table">
    <thead><tr><th>Accessory</th><th class="num">Magical Power</th><th>Notes</th><th></th></tr></thead>
    <tbody>${rows.map(({ a, v }) => {
      const counted = counts.has(a.id);
      const better = !counted && !a.skip && r.best.get(famKey(a));
      const note = a.skip ? 'Doesn\'t count towards Magical Power' : better ? `Doesn't count: you have ${U.esc(better.a.name)}${(better.a.rank || 0) === (a.rank || 0) ? ', which counts as the same accessory' : ''}` : '';
      return `<tr class="${counted ? '' : 'done'}">
        <td><div class="item-cell">${icon(a)} ${nameHTML(a, v.tier)} <span class="muted">${tierName(v.tier)}${v.recomb ? ' ★' : ''}</span></div></td>
        <td class="num">${counted ? mpOf(a.id, v.tier) : '–'}</td>
        <td class="hint">${note}${v.recomb ? `${note ? ' · ' : ''}Recombobulated` : ''}${v.manual ? `${note || v.recomb ? ' · ' : ''}Ticked by you` : ''}</td>
        <td class="right">${v.manual ? `<button class="btn ghost small" data-unhave="${U.esc(a.id)}">Remove</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function render() {
  const r = analyse();
  renderStats(r);
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === st.tab));
  $('#nextWrap').hidden = st.tab !== 'missing';
  if (st.tab === 'owned') renderOwned(r); else renderMissing(r);
}

/* ---------- events ---------- */
function bind() {
  document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { st.tab = b.dataset.tab; save(); render(); } });
  const F = { fTier: 'tier', fHow: 'how', sort: 'sort' };
  for (const [id, k] of Object.entries(F)) {
    $('#' + id).value = st.f[k] || '';
    $('#' + id).addEventListener('change', e => { st.f[k] = e.target.value; save(); render(); });
  }
  $('#nextOnly').checked = !!st.f.next;
  $('#nextOnly').addEventListener('change', e => { st.f.next = e.target.checked; save(); render(); });
  $('#showRift').checked = !!st.f.rift;
  $('#showRift').addEventListener('change', e => { st.f.rift = e.target.checked; save(); render(); });
  let qt;
  $('#q').addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(render, 120); });
  $('#list').addEventListener('click', e => {
    const h = e.target.closest('[data-have]'), u = e.target.closest('[data-unhave]');
    if (h) { st.manual[h.dataset.have] = 1; save(); render(); }
    if (u) { delete st.manual[u.dataset.unhave]; save(); render(); }
  });
}

/* ---------- from the logged-in profile ---------- */
const RARITY = /\b(VERY SPECIAL|UNCOMMON|COMMON|RARE|EPIC|LEGENDARY|MYTHIC|DIVINE|SPECIAL|SUPREME)\b/;
async function applyProfile(d) {
  const m = d.member;
  const acc = m.accessory_bag_storage || {};
  extra = { prism: !!(m.rift && m.rift.access && m.rift.access.consumed_prism), highest: acc.highest_magical_power || null };
  const blob = m.inventory && m.inventory.bag_contents && m.inventory.bag_contents.talisman_bag;
  if (!blob || !blob.data) {
    bag = null; render();
    return 'Your Inventory API is off, so your Accessory Bag can\'t be read. Turn it on in SkyBlock Menu → Settings → API Settings';
  }
  bag = new Map();
  for (const it of await U.nbtItems(blob.data)) {
    const a = byId.get(it.id); if (!a) continue;
    // Rarity is the last lore line (this includes recombobulation)
    const last = U.plain(it.lore[it.lore.length - 1] || '');
    const mt = last.match(RARITY);
    const recomb = !!(it.ea && it.ea.rarity_upgrades);
    let tier = mt ? mt[1].replace(' ', '_') : a.tier;
    if (!mt && recomb) tier = TIERS[Math.min(TIERS.indexOf(a.tier) + 1, 5)] || a.tier;
    const cur = bag.get(it.id);
    if (!cur || TIERS.indexOf(tier) > TIERS.indexOf(cur.tier)) bag.set(it.id, { tier, recomb });
  }
  render();
  return `${bag.size} accessories in your Accessory Bag`;
}

/* ---------- start ---------- */
fetch('../data/accessories.json').then(r => r.json()).then(d => {
  all = d.accessories;
  byId = new Map(all.map(a => [a.id, a]));
  bind(); render();
  U.profileBar($('#profileBar'), { what: 'your Accessory Bag', apply: applyProfile });
}).catch(err => { $('#list').innerHTML = '<p class="empty-note">Could not load the accessory list. Try refreshing.</p>'; console.error(err); });
