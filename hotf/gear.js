/* HotF gear panel: reads your foraging gear, accessories, skill and pet from the profile, totals Sweep and
   Foraging Fortune with the plan's perks, and ranks the cheapest next perk levels for more of both. */
'use strict';

const ForestGear = (() => {
  const KEY = 'ace-hypixel.hotf-gear.v1';
  const EMPTY = { helmet: 'IRON_HELMET', chest: 'IRON_CHESTPLATE', legs: 'IRON_LEGGINGS', boots: 'IRON_BOOTS', tool: 'IRON_AXE' };
  const SLOTS = [
    ['tool', 'Axe', /\bAXE\b/], ['helmet', 'Helmet', /\bHELMET\b/],
    ['chest', 'Chestplate', /\bCHESTPLATE\b/], ['legs', 'Leggings', /\bLEGGINGS\b/], ['boots', 'Boots', /\bBOOTS\b/],
    ['necklace', 'Necklace', /\bNECKLACE\b/], ['cloak', 'Cloak', /\bCLOAK\b/], ['belt', 'Belt', /\bBELT\b/],
    ['gloves', 'Gloves / bracelet', /\b(GLOVES|BRACELET)\b/],
  ];
  // Cumulative skill XP for levels 1-60.
  const SKILL_XP = [50, 175, 375, 675, 1175, 1925, 2925, 4425, 6425, 9925, 14925, 22425, 32425, 47425, 67425, 97425,
    147425, 222425, 322425, 522425, 822425, 1222425, 1722425, 2322425, 3022425, 3822425, 4722425, 5722425, 6822425,
    8022425, 9322425, 10722425, 12222425, 13822425, 15522425, 17322425, 19222425, 21222425, 23322425, 25522425,
    27822425, 30222425, 32722425, 35322425, 38072425, 40972425, 44072425, 47472425, 51172425, 55172425, 59472425,
    64072425, 68972425, 74172425, 79672425, 85472425, 91572425, 97972425, 104672425, 111672425];
  const SKILL_FORTUNE = 4;     // Foraging Fortune per Foraging level (Logger)
  const BASE_SPEED = 100;
  const SPEED_CAP = 500, STRENGTH_CAP = 1000;   // Forest Speed / Forest Strength caps
  // Perks the "cheapest next levels" list looks at.
  const RANKED = ['foraging_fortune', 'sweep', 'forest_speed', 'forest_strength', 'strength_boost', 'speed_boost'];

  let g = U.readLS(KEY, null) || {};
  g = { pick: g.pick || {}, early: g.early !== false, speed: g.speed || '', strength: g.strength || '',
    otherSweep: g.otherSweep || 0, otherFortune: g.otherFortune || 0 };
  let owned = null, acc = null, skill = null, pet = null, api = null, open = null;
  const petData = fetch('../data/pets.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => null);
  const save = () => U.writeLS(KEY, g);
  const $ = s => document.querySelector(s);

  function itemStats(it) {
    const lines = it.lore.map(U.plain);
    const num = re => { for (const l of lines) { const m = l.match(re); if (m) return +m[1].replace(/,/g, ''); } return 0; };
    return {
      fortune: num(/^Foraging Fortune: \+([\d,.]+)/), sweep: num(/^Sweep: \+([\d,.]+)/),
      speed: num(/^Speed: \+([\d,.]+)/), strength: num(/^Strength: \+([\d,.]+)/),
    };
  }

  function petStats(p, data) {
    const RAR = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
    const rarity = p.heldItem === 'PET_ITEM_TIER_BOOST' ? RAR[Math.min(5, RAR.indexOf(p.tier) + 1)] : p.tier;
    const custom = (data && data.custom[p.type]) || {};
    const levels = data ? data.levels.slice(data.offset[rarity] || 0).concat(custom.levels || []) : [];
    let level = 1, need = 0;
    for (let i = 0; i < (custom.max || 100) - 1 && i < levels.length; i++) { need += levels[i]; if (p.exp >= need) level = i + 2; else break; }
    const table = data && data.pets[p.type];
    const out = { name: U.pretty(p.type), rarity, level, fortune: 0, sweep: 0, speed: 0, strength: 0, known: !!table };
    if (!table) return out;
    const r = table[rarity] || table[Object.keys(table).pop()];
    const lo = r['1'] || { s: {}, o: [] }, hi = r['100'] || lo;
    const f = Math.min(1, (level - 1) / 99);
    const lerp = k => (lo.s[k] || 0) + ((hi.s[k] || 0) - (lo.s[k] || 0)) * f;
    out.fortune = lerp('FORAGING_FORTUNE'); out.sweep = lerp('SWEEP'); out.speed = lerp('SPEED'); out.strength = lerp('STRENGTH');
    for (const [i, stat] of (data.abilities[p.type] || [])) {
      if (stat === 'forfortune') out.fortune += (lo.o[i] || 0) + ((hi.o[i] || 0) - (lo.o[i] || 0)) * f;
    }
    out.known = !!(out.fortune || out.sweep);
    return out;
  }

  async function load(d) {
    const data = await petData;
    const active = (((d.member.pets_data || {}).pets) || []).find(p => p.active);
    pet = active ? petStats(active, data) : null;
    const xp = ((d.member.player_data || {}).experience || {}).SKILL_FORAGING;
    skill = xp === undefined ? null : SKILL_XP.filter(n => xp >= n).length;
    const inv = d.member.inventory || {};
    acc = null;
    const bag = (inv.bag_contents || {}).talisman_bag;
    if (bag && bag.data) {
      acc = { fortune: 0, sweep: 0, speed: 0, strength: 0 };
      let list = [];
      try { list = await U.nbtItems(bag.data); } catch (e) { console.error(e); }
      for (const it of list) { const st = itemStats(it); for (const k of Object.keys(acc)) acc[k] += st[k]; }
    }
    owned = Object.fromEntries(SLOTS.map(([k]) => [k, []]));
    const sources = [inv.inv_armor, inv.equipment_contents, inv.inv_contents, inv.ender_chest_contents, inv.wardrobe_contents,
      inv.personal_vault_contents, ...Object.values(inv.backpack_contents || {})];
    // Armour donated to the Museum counts too (you can borrow it back).
    let museumSrc = [];
    try {
      const mu = (await U.myMuseum()).museum || {};
      museumSrc = [...Object.values(mu.items || {}), ...(mu.special || [])].map(v => v.items).filter(x => x && x.data);
    } catch (e) { console.error(e); }
    const seen = new Set();
    for (const src of [...sources, ...museumSrc]) {
      if (!src || !src.data) continue;
      let items = [];
      try { items = await U.nbtItems(src.data); } catch (e) { console.error(e); }
      for (const it of items) {
        const last = U.plain(it.lore[it.lore.length - 1] || '');
        const slot = SLOTS.find(([, , re]) => re.test(last));
        if (!slot) continue;
        const st = itemStats(it);
        if (!st.fortune && !st.sweep) continue;
        const key = String(it.ea.uuid || it.id);
        if (seen.has(key)) continue;
        seen.add(key);
        owned[slot[0]].push({ key, museum: museumSrc.includes(src), id: it.id, lore: it.lore, rawName: it.name || it.id, ...st });
      }
    }
  }

  function chosen(slot) {
    const list = (owned && owned[slot]) || [];
    if (!list.length) return null;
    return list.find(x => x.key === g.pick[slot]) || list.slice().sort((a, b) => (b.fortune + b.sweep * 2) - (a.fortune + a.sweep * 2))[0];
  }

  /** Stats before perks: gear, accessories, skill, pet, other. */
  function base() {
    const parts = {};
    const gear = { fortune: 0, sweep: 0, speed: 0, strength: 0 };
    for (const [slot] of SLOTS) { const x = chosen(slot); if (x) for (const k of Object.keys(gear)) gear[k] += x[k]; }
    parts.gear = gear;
    if (acc) parts.acc = acc;
    if (skill) parts.skill = { fortune: skill * SKILL_FORTUNE, sweep: 0, speed: 0, strength: 0 };
    if (pet) parts.pet = { fortune: Math.round(pet.fortune), sweep: Math.round(pet.sweep), speed: pet.speed, strength: pet.strength };
    parts.other = { fortune: +g.otherFortune || 0, sweep: +g.otherSweep || 0, speed: 0, strength: 0 };
    return parts;
  }
  const sumOf = (parts, k) => Object.values(parts).reduce((n, x) => n + (x[k] || 0), 0);

  /** Sweep and Foraging Fortune for a set of perk levels. */
  function totals(levels) {
    const parts = base();
    const st = (id) => (levels[id] > 0 ? api.stat(id, levels[id]) : 0);
    const speed = (+g.speed || BASE_SPEED + sumOf(parts, 'speed')) + st('speed_boost');
    const strength = (+g.strength || sumOf(parts, 'strength')) + st('strength_boost');
    const fromSpeed = st('forest_speed') / 100 * Math.min(speed, SPEED_CAP);
    const fromStr = st('forest_strength') / 100 * Math.min(strength, STRENGTH_CAP);
    const perk = {
      fortune: st('foraging_fortune') + (levels.foraging_madness > 0 ? 50 : 0) + (g.early && levels.early_bird > 0 ? 100 : 0) + fromSpeed + fromStr,
      sweep: st('sweep') + (levels.foraging_madness > 0 ? 10 : 0) + (g.early && levels.early_bird > 0 ? 20 : 0) + fromSpeed + fromStr,
    };
    let sweep = sumOf(parts, 'sweep') + perk.sweep;
    const core = (levels.center_of_the_forest || 0) >= 3;
    if (core) sweep *= 1.05;
    return { parts, perk, speed, strength, fortune: sumOf(parts, 'fortune') + perk.fortune, sweep, core };
  }

  /** Cheapest way to get more fortune and sweep: the next 5 levels of each ranked perk, by whispers per point. */
  function ranking() {
    const t = api.tree, s = api.state, plan = s.plan;
    const now = totals(plan);
    const rows = [];
    for (const id of RANKED) {
      const p = t.perks[id];
      if (!p || p.tier > s.tier || (plan[id] || 0) >= p.max) continue;
      const to = Math.min(p.max, (plan[id] || 0) + 5);
      const next = totals({ ...plan, [id]: to });
      const df = next.fortune - now.fortune, ds = next.sweep - now.sweep;
      if (df <= 0 && ds <= 0) continue;
      const cost = t.cost(id, plan[id] || 0, to, s);
      const amount = Object.values(cost).reduce((n, v) => n + v, 0);
      rows.push({ id, to, df, ds, cost, per: amount / (df + ds), connected: !!(plan[id] > 0) });
    }
    return rows.sort((a, b) => a.per - b.per);
  }

  function render(a) {
    api = a;
    const host = $('#gear');
    if (!host) return;
    const plan = api.state.plan;
    const tot = totals(plan);
    const img = id => `<img src="../icons/${encodeURIComponent(id)}.png" alt="" loading="lazy" onerror="this.src='../icons/BARRIER.png'">`;
    const slot = k => {
      const list = (owned && owned[k]) || [];
      const cur = chosen(k);
      const label = SLOTS.find(x => x[0] === k)[1];
      return `<button type="button" class="mc-slot${cur ? '' : ' none'}${open === k ? ' sel' : ''}" data-fslot="${k}" ${cur ? `data-fi="${U.esc(k)}|${U.esc(cur.key)}"` : `title="${U.esc(label)}: nothing found"`} ${list.length ? '' : 'disabled'}>
        ${cur ? img(cur.id) : EMPTY[k] ? img(EMPTY[k]) : ''}${cur && cur.museum ? '<span class="mc-mus" title="In your Museum">M</span>' : ''}${list.length > 1 ? `<span class="mc-n">${list.length}</span>` : ''}</button>`;
    };
    const picker = () => {
      if (!open || !owned || !owned[open] || !owned[open].length) return '';
      const cur = chosen(open), auto = !g.pick[open];
      return `<div class="mc-pick"><div class="mc-title">Pick your ${U.esc(SLOTS.find(x => x[0] === open)[1].toLowerCase())}</div>
        <div class="mc-grid">${owned[open].map(x => `<button type="button" class="mc-slot${cur && x.key === cur.key ? ' cur' : ''}" data-fchoose="${U.esc(x.key)}" data-fi="${U.esc(open)}|${U.esc(x.key)}">${img(x.id)}${x.museum ? '<span class="mc-mus">M</span>' : ''}</button>`).join('')}
        <button type="button" class="mc-slot${auto ? ' cur' : ''}" data-fchoose="" title="Pick the best one for me">${img('NETHER_STAR')}<span class="mc-n">A</span></button></div>
        <p class="mc-gear-lbl">Hover for stats. The star picks the best one automatically${auto ? ' (on now)' : ''}. M means it is in your Museum.</p></div>`;
    };
    const any = owned && SLOTS.some(([k]) => owned[k].length);
    const box = any ? `<div class="ht-grid mc-gearbox">
      <div class="mc-title">Your foraging gear</div>
      <div class="mc-gear">
        <div><div class="grp col">${['helmet', 'chest', 'legs', 'boots'].map(slot).join('')}</div><div class="mc-gear-lbl">Armour</div></div>
        <div><div class="grp col">${['necklace', 'cloak', 'belt', 'gloves'].map(slot).join('')}</div><div class="mc-gear-lbl">Equipment</div></div>
        <div><div class="grp col">${slot('tool')}</div><div class="mc-gear-lbl">Axe</div></div>
        <div class="mc-gear-sum">${SLOTS.map(([k, label]) => { const c = chosen(k); return c ? `<div><span class="mc-gear-lbl">${U.esc(label)}</span> ${U.mcText(c.rawName)}${c.museum ? ' <span class="mc-gear-lbl">(in your Museum, borrow it)</span>' : ''}</div>` : ''; }).join('')}</div>
      </div>${picker()}</div>` : '';
    const LABEL = { gear: 'gear', acc: 'accessories', skill: `Foraging ${skill}`, pet: pet ? `${pet.name} pet` : 'pet', other: 'other' };
    const from = k => Object.entries(tot.parts).filter(([, x]) => x[k]).map(([n, x]) => `${U.num(x[k])} ${LABEL[n]}`).join(' + ') || '0';
    const stat = (k, v, hint) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="hint" style="margin:4px 0 0">${hint}</div></div>`;
    const rows = ranking();
    const pn = id => U.esc(api.tree.perks[id].name);
    host.innerHTML = `
      <div class="controls">
        <label class="field">Your Speed <input type="number" id="fSpeed" min="0" value="${g.speed}" placeholder="${U.num(tot.speed)}" style="width:110px"></label>
        <label class="field">Your Strength <input type="number" id="fStr" min="0" value="${g.strength}" placeholder="${U.num(tot.strength)}" style="width:110px"></label>
        <label class="field">Other Sweep <input type="number" id="fSweep" min="0" value="${g.otherSweep || ''}" placeholder="0" style="width:100px"></label>
        <label class="field">Other fortune <input type="number" id="fFort" min="0" value="${g.otherFortune || ''}" placeholder="0" style="width:100px"></label>
        <label><input type="checkbox" id="fEarly" ${g.early ? 'checked' : ''}> Count Early Bird (first 250 trees a day)</label>
      </div>
      ${owned ? (box || '<p class="hint">No foraging gear found on your profile. Turn on the Inventory API in SkyBlock settings, or type your stats under "Other".</p>')
        : '<p class="hint">Log in to read your armour, equipment and axe, or type your stats under "Other".</p>'}
      <div class="stats">
        ${stat('Sweep', U.num(tot.sweep), `${from('sweep')} + ${U.num(tot.perk.sweep)} from this plan${tot.core ? ', then +5% from the Center of the Forest' : ''}`)}
        ${stat('Foraging Fortune', U.num(tot.fortune), `${from('fortune')} + ${U.num(tot.perk.fortune)} from this plan`)}
        ${stat('Speed / Strength', `${U.num(tot.speed)} / ${U.num(tot.strength)}`, `Forest Speed counts up to ${SPEED_CAP} Speed, Forest Strength up to ${U.num(STRENGTH_CAP)} Strength${g.speed || g.strength ? '' : '. These are estimates from your gear: type your real stats above for exact numbers'}`)}
      </div>
      ${pet ? `<p class="hint">Active pet: <b>${U.esc(pet.name)}</b> (${U.esc(U.pretty(pet.rarity || ''))}, level ${pet.level})${pet.known ? '' : '. It has no foraging stats, so it adds nothing here.'}</p>` : ''}
      ${owned && !acc ? '<p class="hint">Your accessory bag is not on the API. Turn on the Inventory API to count it.</p>' : ''}
      <h4 class="ht-tier-h">Cheapest way to more Sweep and fortune</h4>
      ${rows.length ? `<div class="ht-steps">${rows.slice(0, 6).map(r => `<a href="#" class="ht-step" data-fadd="${r.id}|${r.to}">
          <span class="nm">${pn(r.id)} → ${r.to}</span>
          <span class="to">${r.df ? `+${U.num(r.df)} fortune` : ''}${r.df && r.ds ? ', ' : ''}${r.ds ? `+${U.num(r.ds)} Sweep` : ''}</span>
          <span class="cost">${Object.entries(r.cost).map(([k, v]) => `${U.num(v)} ${api.pname(k)}`).join(' + ') || 'free'} · ${U.num(Math.round(r.per))} per point${r.connected ? '' : ' · new perk'}</span></a>`).join('')}</div>
        <p class="hint">The next 5 levels of each perk, cheapest first. Click one to add it to your plan.</p>`
        : '<p class="hint">Nothing left to raise for Sweep or fortune at your tier.</p>'}
      <p class="hint">Not counted: Precision Cutting, Half Empty / Half Full (they depend on other players), the Lottery buff and pet abilities that only work sometimes.</p>`;
  }

  document.addEventListener('change', e => {
    const el = e.target;
    if (!el.closest || !el.closest('#gear')) return;
    if (el.id === 'fSpeed') g.speed = Math.max(0, +el.value || 0) || '';
    else if (el.id === 'fStr') g.strength = Math.max(0, +el.value || 0) || '';
    else if (el.id === 'fSweep') g.otherSweep = Math.max(0, +el.value || 0);
    else if (el.id === 'fFort') g.otherFortune = Math.max(0, +el.value || 0);
    else if (el.id === 'fEarly') g.early = el.checked;
    else return;
    save();
    if (api) render(api);
  });
  const gearItem = key => { const [slot, k] = key.split('|'); return ((owned && owned[slot]) || []).find(x => x.key === k); };
  document.addEventListener('mouseover', e => {
    const tip = Tree.tip;
    if (!tip || !e.target.closest) return;
    const el = e.target.closest('#gear [data-fi]');
    if (!el || matchMedia('(hover: none)').matches) { if (e.target.closest('#gear')) tip.el.hidden = true; return; }
    const x = gearItem(el.dataset.fi);
    if (!x) return;
    tip.el.innerHTML = [U.mcText(x.rawName), ...x.lore.map(l => U.mcText(l) || '&nbsp;')].join('<br>');
    tip.el.hidden = false; tip.place(e);
  });
  document.addEventListener('mousemove', e => { if (Tree.tip && !Tree.tip.el.hidden && e.target.closest && e.target.closest('#gear [data-fi]')) Tree.tip.place(e); });
  document.addEventListener('click', e => {
    if (!e.target.closest || !api) return;
    const sl = e.target.closest('#gear [data-fslot]'), ch = e.target.closest('#gear [data-fchoose]'), add = e.target.closest('#gear [data-fadd]');
    if (add) {
      e.preventDefault();
      const [id, to] = add.dataset.fadd.split('|');
      api.state.plan[id] = +to;
      api.tree.connect(api.state.plan);
      api.render();
      return;
    }
    if (!sl && !ch) return;
    if (Tree.tip) Tree.tip.el.hidden = true;
    if (sl) open = open === sl.dataset.fslot ? null : sl.dataset.fslot;
    if (ch) { if (ch.dataset.fchoose) g.pick[open] = ch.dataset.fchoose; else delete g.pick[open]; save(); }
    render(api);
  });

  return { load, render };
})();
