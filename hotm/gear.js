/* HotM gear panel: reads your mining gear from the profile, totals Mining Speed and fortune for the block
   you mine, shows break-tick breakpoints, and tunes the plan's speed perks to the fastest break you can reach. */
'use strict';

const Gear = (() => {
  const KEY = 'ace-hypixel.hotm-gear.v1';
  // Block strength (SkyBlock wiki). kind decides which perks and fortune types apply.
  const BLOCKS = [
    ['ruby', 'Ruby', 2300, 'gem'], ['amber', 'Amber', 3000, 'gem'], ['amethyst', 'Amethyst', 3000, 'gem'],
    ['jade', 'Jade', 3000, 'gem'], ['sapphire', 'Sapphire', 3000, 'gem'], ['opal', 'Opal', 3000, 'gem'],
    ['topaz', 'Topaz', 3800, 'gem'], ['jasper', 'Jasper', 4800, 'gem'], ['aquamarine', 'Aquamarine', 5200, 'gem'],
    ['citrine', 'Citrine', 5200, 'gem'], ['onyx', 'Onyx', 5200, 'gem'], ['peridot', 'Peridot', 5200, 'gem'],
    ['mithril1', 'Mithril (grey)', 500, 'metal'], ['mithril2', 'Mithril (prismarine)', 800, 'metal'],
    ['mithril3', 'Mithril (blue wool)', 1500, 'metal'], ['titanium', 'Titanium', 2000, 'metal'],
    ['umber', 'Umber', 5600, 'metal'], ['tungsten', 'Tungsten', 5600, 'metal'], ['glacite', 'Glacite', 6000, 'metal'],
    ['hardstone', 'Hard Stone', 50, 'block'],
  ].map(([id, name, str, kind]) => ({ id, name, str, kind }));
  // Speed and fortune perks, and which blocks they count for.
  const SPEED_PERKS = { mining_speed: 'all', speedy_mineman: 'all', professional: 'gem', strong_arm: 'metal', eager_adventurer: 'shaft' };
  const FORTUNE_PERKS = { mining_fortune: 'all', fortunate_mineman: 'all', gem_lover: 'gem', metal_head: 'metal', blockhead: 'block', rags_to_riches: 'shaft' };
  const FORTUNE_NAME = { gem: 'Gemstone Fortune', metal: 'Dwarven Metal Fortune', block: 'Block Fortune' };
  const SLOTS = [
    ['tool', 'Pickaxe / drill', /\b(PICKAXE|DRILL|GAUNTLET)\b/], ['helmet', 'Helmet', /\bHELMET\b/],
    ['chest', 'Chestplate', /\bCHESTPLATE\b/], ['legs', 'Leggings', /\bLEGGINGS\b/], ['boots', 'Boots', /\bBOOTS\b/],
    ['necklace', 'Necklace', /\bNECKLACE\b/], ['cloak', 'Cloak', /\bCLOAK\b/], ['belt', 'Belt', /\bBELT\b/],
    ['gloves', 'Gloves / bracelet', /\b(GLOVES|BRACELET)\b/],
  ];

  let g = U.readLS(KEY, null) || {};
  g = { block: g.block || 'ruby', shaft: !!g.shaft, otherSpeed: g.otherSpeed || 0, otherFortune: g.otherFortune || 0, pick: g.pick || {} };
  let owned = null;   // slot -> [{ key, name, speed, fortune: {all, gem, metal, block}, pristine }]
  let api = null;
  const save = () => U.writeLS(KEY, g);
  const blockOf = () => BLOCKS.find(b => b.id === g.block) || BLOCKS[0];
  const applies = (where, b) => where === 'all' || where === b.kind || (where === 'shaft' && g.shaft);
  const $ = s => document.querySelector(s);

  /** Mining stats from an item's lore. Efficiency isn't counted in the lore, so it's added from the enchant. */
  function itemStats(it) {
    const lines = it.lore.map(U.plain);
    const num = re => { for (const l of lines) { const m = l.match(re); if (m) return +m[1].replace(/,/g, ''); } return 0; };
    const eff = ((it.ea.enchantments || {}).efficiency) || 0;
    return {
      speed: num(/^Mining Speed: \+([\d,.]+)/) + (eff ? 10 + 20 * (eff - 1) : 0),
      fortune: {
        all: num(/^Mining Fortune: \+([\d,.]+)/), gem: num(/^Gemstone Fortune: \+([\d,.]+)/),
        metal: num(/^Dwarven Metal Fortune: \+([\d,.]+)/), block: num(/^Block Fortune: \+([\d,.]+)/),
      },
      pristine: num(/^Pristine: \+([\d,.]+)/),
    };
  }

  async function load(d) {
    const inv = d.member.inventory || {};
    const sources = [inv.inv_armor, inv.equipment_contents, inv.inv_contents, inv.ender_chest_contents, inv.wardrobe_contents,
      inv.personal_vault_contents, ...Object.values(inv.backpack_contents || {})];
    owned = Object.fromEntries(SLOTS.map(([k]) => [k, []]));
    const seen = new Set();
    for (const src of sources) {
      if (!src || !src.data) continue;
      let items = [];
      try { items = await U.nbtItems(src.data); } catch (e) { console.error(e); }
      for (const it of items) {
        const last = U.plain(it.lore[it.lore.length - 1] || '');
        const slot = SLOTS.find(([, , re]) => re.test(last));
        if (!slot) continue;
        const st = itemStats(it);
        if (!st.speed && !st.fortune.all && !st.fortune.gem && !st.fortune.metal && !st.fortune.block) continue;
        const key = String(it.ea.uuid || it.id);
        if (seen.has(key)) continue;
        seen.add(key);
        owned[slot[0]].push({ key, name: U.plain(it.name || it.id).replace(/[-]/g, '').trim(), ...st });
      }
    }
  }

  const fortuneFor = (x, b) => x.fortune.all + (x.fortune[b.kind] || 0);
  /** The item used for a slot: your pick, else the one with most speed (tool) or most fortune (everything else). */
  function chosen(slot, b) {
    const list = (owned && owned[slot]) || [];
    if (!list.length) return null;
    const pick = list.find(x => x.key === g.pick[slot]);
    if (pick) return pick;
    const score = x => (slot === 'tool' ? x.speed * 10 + fortuneFor(x, b) : fortuneFor(x, b) * 10 + x.speed);
    return list.slice().sort((a, c) => score(c) - score(a))[0];
  }
  function gearTotals(b) {
    let speed = 0, fortune = 0, pristine = 0;
    for (const [slot] of SLOTS) {
      const x = chosen(slot, b);
      if (x) { speed += x.speed; fortune += fortuneFor(x, b); pristine += x.pristine; }
    }
    return { speed: speed + (+g.otherSpeed || 0), fortune: fortune + (+g.otherFortune || 0), pristine };
  }
  const perkSum = (perks, b, levels) => Object.entries(perks).reduce((n, [id, where]) => n + (applies(where, b) ? api.stat(id, levels[id] || 0) : 0), 0);

  /** Ticks to break a block: ceil(30 × strength / speed), at least 4 unless it breaks in 1 tick (instantly). */
  function ticks(speed, str) {
    if (speed <= 0) return Infinity;
    const t = Math.ceil(30 * str / speed);
    return t <= 1 ? 1 : Math.max(4, t);
  }
  /** Least speed that breaks the block in `t` ticks. */
  const speedFor = (t, str) => (t === 1 ? 30 * str : 30 * str / t);

  function render(a) {
    api = a;
    const host = $('#gear');
    if (!host) return;
    const b = blockOf();
    const plan = api.state.plan;
    const tot = gearTotals(b);
    const pSpeed = perkSum(SPEED_PERKS, b, plan), pFort = perkSum(FORTUNE_PERKS, b, plan);
    const total = tot.speed + pSpeed;
    const tk = ticks(total, b.str);
    const better = tk === 4 ? 1 : tk > 4 && tk !== Infinity ? tk - 1 : null;
    const need = better ? Math.ceil(speedFor(better, b.str)) : null;
    const keep = tk === Infinity ? 0 : Math.ceil(speedFor(tk, b.str));
    const opt = (v, l, sel) => `<option value="${U.esc(v)}" ${v === sel ? 'selected' : ''}>${U.esc(l)}</option>`;
    const slotRows = SLOTS.map(([k, label]) => {
      const list = (owned && owned[k]) || [];
      if (!list.length) return '';
      const cur = chosen(k, b);
      return `<label class="field">${label}<select data-slot="${k}">${list.map(x => opt(x.key,
        `${x.name} (${x.speed ? U.num(x.speed) + ' speed, ' : ''}${U.num(fortuneFor(x, b))} fortune)`, cur && cur.key)).join('')}</select></label>`;
    }).join('');
    const fortName = FORTUNE_NAME[b.kind] ? `Mining + ${FORTUNE_NAME[b.kind]}` : 'Mining Fortune';
    const stat = (k, v, hint) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="hint" style="margin:4px 0 0">${hint}</div></div>`;
    host.innerHTML = `
      <div class="controls">
        <label class="field">What you mine <select id="gBlock">${BLOCKS.map(x => opt(x.id, `${x.name} (strength ${U.num(x.str)})`, b.id)).join('')}</select></label>
        <label class="field">Other Mining Speed <input type="number" id="gSpeed" min="0" value="${g.otherSpeed || ''}" placeholder="0" style="width:120px"></label>
        <label class="field">Other fortune <input type="number" id="gFort" min="0" value="${g.otherFortune || ''}" placeholder="0" style="width:120px"></label>
        <label><input type="checkbox" id="gShaft" ${g.shaft ? 'checked' : ''}> In a Glacite Mineshaft</label>
      </div>
      ${owned ? (slotRows ? `<div class="controls ht-gear">${slotRows}</div>`
        : '<p class="hint">No mining gear found on your profile. Turn on the Inventory API in SkyBlock settings, or type your stats under "Other".</p>')
        : '<p class="hint">Log in to read your armour, equipment and pickaxe or drill, or type your total stats under "Other".</p>'}
      <div class="stats">
        ${stat('Mining Speed', U.num(total), `${U.num(tot.speed)} gear + ${U.num(pSpeed)} from this plan`)}
        ${stat(`${U.esc(b.name)} breaks in`, tk === Infinity ? '—' : tk === 1 ? 'Instantly' : `${tk} ticks`,
          tk === Infinity ? 'Add your speed first' : better ? `${better === 1 ? 'Instant' : better + ' ticks'} at ${U.num(need)} speed (${U.num(need - total)} more)` : 'As fast as it gets')}
        ${stat(fortName, U.num(tot.fortune + pFort), `${U.num(tot.fortune)} gear + ${U.num(pFort)} from this plan`)}
        ${tot.pristine ? stat('Pristine', U.num(tot.pristine + api.stat('mining_master', plan.mining_master || 0)), 'gear + Mining Master') : ''}
      </div>
      ${tk !== Infinity && tk > 1 ? `<p class="hint">Any speed between ${U.num(keep)} and ${U.num(need)} breaks ${U.esc(b.name)} in the same ${tk} ticks, so powder spent on speed in that gap is wasted.</p>` : ''}
      <p class="hint">"Other" is what the API can't show: pets, potions, accessories, and skill or Sky Mall bonuses.
        Break time is ⌈30 × block strength ÷ speed⌉ ticks, with a 4-tick minimum unless the block breaks instantly.</p>
      <div class="controls"><button type="button" class="btn" id="gTune">Tune this plan for ${U.esc(b.name)}</button></div>
      <div id="gMsg"></div>`;
  }

  /** Lowest speed-perk levels that keep the fastest break you can reach; fortune perks in the plan are maxed. */
  function tune() {
    const b = blockOf(), t = api.tree, s = api.state;
    const plan = { ...s.plan };
    const before = {};
    for (const id of t.ids) t.cost(id, 0, s.plan[id], s, before);
    const tot = gearTotals(b);
    const speedIds = Object.keys(SPEED_PERKS).filter(id => applies(SPEED_PERKS[id], b) && plan[id] > 0 && t.perks[id].tier <= s.tier);
    for (const id of speedIds) plan[id] = t.perks[id].max;
    const best = ticks(tot.speed + perkSum(SPEED_PERKS, b, plan), b.str);
    if (best === Infinity) return 'Add your Mining Speed first: log in, or type it under "Other".';
    const need = speedFor(best, b.str);
    // Keep dropping the level with the most powder per point of speed while the break time stays the same.
    for (;;) {
      let pick = null, ratio = 0;
      for (const id of speedIds) {
        const lv = plan[id];
        if (lv <= 1) continue;
        const lost = api.stat(id, lv) - api.stat(id, lv - 1);
        plan[id] = lv - 1;
        const ok = tot.speed + perkSum(SPEED_PERKS, b, plan) >= need;
        plan[id] = lv;
        if (!ok || lost <= 0) continue;
        const r = api.levelCost(id, lv) / lost;
        if (r > ratio) { ratio = r; pick = id; }
      }
      if (!pick) break;
      plan[pick]--;
    }
    for (const id of Object.keys(FORTUNE_PERKS)) {
      if (applies(FORTUNE_PERKS[id], b) && plan[id] > 0 && t.perks[id].tier <= s.tier) plan[id] = t.perks[id].max;
    }
    s.plan = plan;
    const after = {};
    for (const id of t.ids) t.cost(id, 0, plan[id], s, after);
    const diff = Object.keys(t.data.powders).map(k => [k, (before[k] || 0) - (after[k] || 0)]).filter(([, n]) => n);
    api.render();
    const changes = diff.map(([k, n]) => `${n > 0 ? 'saves' : 'costs'} ${U.num(Math.abs(n))} ${api.pname(k)}`).join(', ');
    const speeds = speedIds.map(id => `${U.esc(t.perks[id].name)} ${plan[id]}`).join(', ');
    return `Set for ${best === 1 ? 'instant' : best + '-tick'} ${U.esc(b.name)}${speeds ? ` (${speeds})` : ''}, with the fortune perks in your plan maxed. ${changes ? 'This ' + changes + '.' : 'No change in powder.'}`;
  }

  document.addEventListener('change', e => {
    const el = e.target;
    if (!el.closest || !el.closest('#gear')) return;
    if (el.id === 'gBlock') g.block = el.value;
    else if (el.id === 'gShaft') g.shaft = el.checked;
    else if (el.id === 'gSpeed') g.otherSpeed = Math.max(0, +el.value || 0);
    else if (el.id === 'gFort') g.otherFortune = Math.max(0, +el.value || 0);
    else if (el.dataset.slot) g.pick[el.dataset.slot] = el.value;
    else return;
    save();
    if (api) render(api);
  });
  document.addEventListener('click', e => {
    if (e.target.id !== 'gTune' || !api) return;
    const msg = tune();
    $('#gMsg').innerHTML = `<p class="hint">${msg}</p>`;
  });

  return { load, render };
})();
