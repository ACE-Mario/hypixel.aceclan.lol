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
    ['hardstone', 'Hard Stone', 50, 'block'], ['goldblock', 'Gold Block (Mines of Divan)', 600, 'block'],
    ['diamondblock', 'Diamond Block (Royal Mines)', 600, 'block'],
  ].map(([id, name, str, kind]) => ({ id, name, str, kind }));
  // Speed and fortune perks, and which blocks they count for.
  const SPEED_PERKS = { mining_speed: 'all', speedy_mineman: 'all', professional: 'gem', strong_arm: 'metal', eager_adventurer: 'shaft' };
  const FORTUNE_PERKS = { mining_fortune: 'all', fortunate_mineman: 'all', gem_lover: 'gem', metal_head: 'metal', blockhead: 'block', rags_to_riches: 'shaft' };
  const FORTUNE_NAME = { gem: 'Gemstone Fortune', metal: 'Dwarven Metal Fortune', block: 'Block Fortune' };
  const EMPTY = { helmet: 'IRON_HELMET', chest: 'IRON_CHESTPLATE', legs: 'IRON_LEGGINGS', boots: 'IRON_BOOTS', pet: 'BONE' };
  let open = null;    // slot whose item picker is showing
  const SLOTS = [
    ['tool', 'Pickaxe / drill', /\b(PICKAXE|DRILL|GAUNTLET)\b/], ['helmet', 'Helmet', /\bHELMET\b/],
    ['chest', 'Chestplate', /\bCHESTPLATE\b/], ['legs', 'Leggings', /\bLEGGINGS\b/], ['boots', 'Boots', /\bBOOTS\b/],
    ['necklace', 'Necklace', /\bNECKLACE\b/], ['cloak', 'Cloak', /\bCLOAK\b/], ['belt', 'Belt', /\bBELT\b/],
    ['gloves', 'Gloves / bracelet', /\b(GLOVES|BRACELET)\b/], ['pet', 'Pet', /(?!)/],
  ];

  // Cumulative skill XP for levels 1-60.
  const SKILL_XP = [50, 175, 375, 675, 1175, 1925, 2925, 4425, 6425, 9925, 14925, 22425, 32425, 47425, 67425, 97425,
    147425, 222425, 322425, 522425, 822425, 1222425, 1722425, 2322425, 3022425, 3822425, 4722425, 5722425, 6822425,
    8022425, 9322425, 10722425, 12222425, 13822425, 15522425, 17322425, 19222425, 21222425, 23322425, 25522425,
    27822425, 30222425, 32722425, 35322425, 38072425, 40972425, 44072425, 47472425, 51172425, 55172425, 59472425,
    64072425, 68972425, 74172425, 79672425, 85472425, 91572425, 97972425, 104672425, 111672425];
  const SKILL_FORTUNE = 4;                   // Mining Fortune per Mining level
  const GOD_POT = { speed: 200, fortune: 25 }; // Haste IV and Spelunker V

  let g = U.readLS(KEY, null) || {};
  g = { block: g.block || 'ruby', shaft: !!g.shaft, otherSpeed: g.otherSpeed || 0, otherFortune: g.otherFortune || 0, otherSpread: g.otherSpread || 0, sheer: !!g.sheer, speedStat: g.speedStat || 0, pick: g.pick || {}, god: g.god !== false, mall: g.mall || '', noMall: g.noMall !== false };
  let owned = null;   // slot -> [{ key, name, speed, fortune: {all, gem, metal, block}, pristine }]
  let api = null;
  let acc = null;     // accessory bag totals { speed, fortune, pristine, n }
  let skill = null;   // Mining skill level
  let pet = null;     // active pet { name, level, rarity, stats: {MINING_SPEED...}, other: [], ab: [] }
  const petData = fetch('../data/pets.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => null);
  const PRISTINE_PERKS = { mining_master: 'gem' };
  // Sky Mall: one random buff each SkyBlock day (not on the API, so you pick today's).
  const MALL = [['', 'Not counted'], ['speed', '+100 Mining Speed'], ['fortune', '+50 Mining Fortune'], ['powder', '+15% Powder'],
    ['cooldown', '-20% ability cooldowns'], ['goblin', '10x Golden / Diamond Goblins'], ['titanium', '5x Titanium drops']];
  // Pet items that add mining stats.
  const HELD = {
    PET_ITEM_QUICK_CLAW: { name: 'Quick Claw', per2: true },          // +1 speed and fortune every 2 pet levels
    PET_ITEM_TITANIUM_MINECART: { name: 'Titanium Minecart', titanium: 33.3 },
  };
  const save = () => U.writeLS(KEY, g);
  const blockOf = () => BLOCKS.find(b => b.id === g.block) || BLOCKS[0];
  // Per piece. Their Mining Spread works on Ores and Blocks (pure blocks, Hard Stone), not on Dwarven Metals.
  const MINERAL = { MINERAL: { block: 25, spread: 100 }, GLOSSY_MINERAL: { block: 50, spread: 150 } };
  const SHEER_FORCE = 200;
  // Mining Spread works on Blocks, Ores and Dwarven Metals (gemstones have Gemstone Spread instead).
  const hasSpread = b => b.kind === 'block' || b.kind === 'metal';
  const spreadFor = (x, b) => (hasSpread(b) ? (x.spread || 0) + (b.kind === 'block' ? x.spreadBlock || 0 : 0) : 0);
  const SPREAD_WHERE = { block: 'Blocks', divan: 'Mines of Divan', hardstone: 'Hard Stone' };
  // Perks that give Mining Spread, and where.
  const SPREAD_PERKS = { efficient_miner: 'all', mole: 'hardstone' };
  const applies = (where, b) => where === 'all' || where === b.kind || where === b.id || (where === 'shaft' && g.shaft);
  const $ = s => document.querySelector(s);

  /** Mining stats from an item's lore. Efficiency isn't counted in the lore, so it's added from the enchant. */
  function itemStats(it) {
    const lines = it.lore.map(U.plain);
    const num = re => { for (const l of lines) { const m = l.match(re); if (m) return +m[1].replace(/,/g, ''); } return 0; };
    const eff = ((it.ea.enchantments || {}).efficiency) || 0;
    // Mineral armour's Block Fortune and spread live in its ability text, and Museum copies have no lore for them.
    const set = (it.id.match(/^(GLOSSY_MINERAL|MINERAL)_(HELMET|CHESTPLATE|LEGGINGS|BOOTS)$/) || [])[1];
    const fixed = MINERAL[set] || { block: 0, spread: 0 };
    return {
      speed: num(/^Mining Speed: \+([\d,.]+)/) + (eff ? 10 + 20 * (eff - 1) : 0),
      fortune: {
        all: num(/^Mining Fortune: \+([\d,.]+)/), gem: num(/^Gemstone Fortune: \+([\d,.]+)/),
        metal: num(/^Dwarven Metal Fortune: \+([\d,.]+)/), block: num(/^Block Fortune: \+([\d,.]+)/) || fixed.block,
      },
      pristine: num(/^Pristine: \+([\d,.]+)/),
      spread: num(/^Mining Spread: \+([\d,.]+)/),
      // Spread that only counts on blocks: Mineral armour, the Fleet reforge ("towards Blocks").
      spreadBlock: num(/\+([\d,.]+)\D{0,2}Mining Spread (?:on Ores|towards Blocks)/) || fixed.spread,
    };
  }

  /** Level and mining stats of the active pet, from its XP and the NEU stat tables. */
  function petStats(p, data) {
    const table = data.pets[p.type];
    if (!table) return { name: U.pretty(p.type), rarity: p.tier, level: null, stats: {}, other: [], ab: [] };
    const rarity = p.heldItem === 'PET_ITEM_TIER_BOOST' ? ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'][
      Math.min(5, ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'].indexOf(p.tier) + 1)] : p.tier;
    const custom = data.custom[p.type] || {};
    const max = custom.max || 100;
    const levels = data.levels.slice(data.offset[rarity] || 0).concat(custom.levels || []);
    let level = 1, need = 0;
    for (let i = 0; i < max - 1 && i < levels.length; i++) { need += levels[i]; if (p.exp >= need) level = i + 2; else break; }
    const r = table[rarity] || table[Object.keys(table).pop()];
    const lo = r['1'] || { s: {}, o: [] }, hi = r['100'] || lo;
    const f = Math.min(1, (level - 1) / 99);
    const lerp = (a, b) => a + (b - a) * f;
    const stats = {};
    for (const k of Object.keys(hi.s)) stats[k] = lerp(lo.s[k] || 0, hi.s[k]);
    const other = hi.o.map((v, i) => lerp(lo.o[i] || 0, v));
    const ab = (data.abilities[p.type] || []).map(([i, stat, when]) => ({ v: other[i] || 0, stat, when }));
    return { name: U.pretty(p.type), rarity, level, stats, other, ab, held: p.heldItem || null };
  }

  async function load(d) {
    const data = await petData;
    const active = (((d.member.pets_data || {}).pets) || []).find(p => p.active);
    pet = active && data ? petStats(active, data) : active ? { name: U.pretty(active.type), rarity: active.tier, level: null, stats: {}, ab: [], held: active.heldItem || null } : null;
    // Pets without mining stats still need a level for Quick Claw.
    if (pet && pet.level === null && data && active) {
      const levels = data.levels.slice(data.offset[active.tier] || 0);
      let lv = 1, need = 0;
      for (let i = 0; i < 99; i++) { need += levels[i]; if (active.exp >= need) lv = i + 2; else break; }
      pet.xpLevel = lv;
    }
    const allPets = ((d.member.pets_data || {}).pets) || [];
    const inv = d.member.inventory || {};
    const sources = [inv.inv_armor, inv.equipment_contents, inv.inv_contents, inv.ender_chest_contents, inv.wardrobe_contents,
      inv.personal_vault_contents, ...Object.values(inv.backpack_contents || {})];
    owned = Object.fromEntries(SLOTS.map(([k]) => [k, []]));
    const xp = ((d.member.player_data || {}).experience || {}).SKILL_MINING;
    skill = xp === undefined ? null : SKILL_XP.filter(n => xp >= n).length;
    const bag = (inv.bag_contents || {}).talisman_bag;
    acc = null;
    if (bag && bag.data) {
      acc = { speed: 0, fortune: { all: 0, gem: 0, metal: 0, block: 0 }, pristine: 0, spread: 0, spreadBlock: 0, n: 0 };
      let list = [];
      try { list = await U.nbtItems(bag.data); } catch (e) { console.error(e); }
      for (const it of list) {
        const st = itemStats(it);
        if (!st.speed && !st.fortune.all && !st.fortune.gem && !st.fortune.metal && !st.fortune.block && !st.pristine && !st.spread && !st.spreadBlock) continue;
        acc.n++; acc.speed += st.speed; acc.pristine += st.pristine; acc.spread += st.spread; acc.spreadBlock += st.spreadBlock;
        for (const k of Object.keys(acc.fortune)) acc.fortune[k] += st.fortune[k];
      }
    }
    // Armour donated to the Museum counts too (you can borrow it back).
    let museumSrc = [];
    try {
      const mu = (await U.myMuseum()).museum || {};
      museumSrc = [...Object.values(mu.items || {}), ...(mu.special || [])].map(v => v.items).filter(x => x && x.data);
    } catch (e) { console.error(e); }
    const seen = new Set();
    let worn = new Set();
    for (const src of [inv.inv_armor, inv.equipment_contents]) {
      if (!src || !src.data) continue;
      try { for (const it of await U.nbtItems(src.data)) worn.add(String(it.ea.uuid || it.id)); } catch (e) { console.error(e); }
    }
    for (const src of [...sources, ...museumSrc]) {
      if (!src || !src.data) continue;
      let items = [];
      try { items = await U.nbtItems(src.data); } catch (e) { console.error(e); }
      for (const it of items) {
        const last = U.plain(it.lore[it.lore.length - 1] || '');
        const slot = SLOTS.find(([, , re]) => re.test(last));
        if (!slot) continue;
        const st = itemStats(it);
        if (!st.speed && !st.fortune.all && !st.fortune.gem && !st.fortune.metal && !st.fortune.block && !st.spread && !st.spreadBlock) continue;
        const key = String(it.ea.uuid || it.id);
        if (seen.has(key)) continue;
        seen.add(key);
        owned[slot[0]].push({ key, museum: museumSrc.includes(src), worn: worn.has(key), id: it.id, lore: it.lore, rawName: it.name || it.id, drill: /\bDRILL\b/.test(last), name: U.plain(it.name || it.id).replace(/[-]/g, '').trim(), ...st });
      }
    }
    // Pets that help mining (stats, abilities or a mining pet item), best rarity first.
    const RAR = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
    for (const p of allPets.slice().sort((a, c) => RAR.indexOf(c.tier) - RAR.indexOf(a.tier) || c.exp - a.exp)) {
      if (!data || (!data.pets[p.type] && !HELD[p.heldItem])) continue;
      const st = data.pets[p.type] ? petStats(p, data) : { name: U.pretty(p.type), rarity: p.tier, level: null, stats: {}, ab: [], held: p.heldItem };
      if (!data.pets[p.type]) {
        const levels = data.levels.slice(data.offset[p.tier] || 0);
        let lv = 1, need = 0;
        for (let i = 0; i < 99; i++) { need += levels[i]; if (p.exp >= need) lv = i + 2; else break; }
        st.xpLevel = lv;
      }
      if (!st.level && !HELD[st.held] && !Object.keys(st.stats).some(k => /MINING|PRISTINE|GEMSTONE/.test(k)) && !st.ab.some(a => a.stat !== 'forfortune')) continue;
      const col = { COMMON: 'f', UNCOMMON: 'a', RARE: '9', EPIC: '5', LEGENDARY: '6', MYTHIC: 'd' }[st.rarity] || 'f';
      owned.pet.push({
        key: p.uuid || `${p.type}:${p.tier}:${p.exp}`, id: 'PET_' + p.type, pet: st, worn: !!p.active,
        rawName: `§7[Lvl ${st.level || st.xpLevel || '?'}] §${col}${st.name}`,
        lore: [`§8${U.pretty(st.rarity)} pet`, ...Object.entries(st.stats).filter(([k]) => /MINING|PRISTINE|GEMSTONE/.test(k)).map(([k, v]) => `§7${U.pretty(k)}: §a+${U.num(v)}`),
          ...st.ab.filter(a => a.stat === 'spread' && a.v).map(a => `§7Mining Spread (${SPREAD_WHERE[a.when] || a.when}): §a+${U.num(Math.round(a.v))}`),
          ...st.ab.filter(a => a.stat === 'snailbf' && a.v).map(a => `§7+1 Block Fortune per ${U.num(Math.round(a.v * 100) / 100)} Speed above 100`),
          ...(st.held ? [`§7Holding: §e${HELD[st.held] ? HELD[st.held].name : U.pretty(st.held.replace(/^PET_ITEM_/, ''))}`] : [])],
        speed: 0, fortune: { all: 0, gem: 0, metal: 0, block: 0 }, pristine: 0,
      });
    }
  }

  const fortuneFor = (x, b) => x.fortune.all + (x.fortune[b.kind] || 0);
  /** What a pet adds while mining block b: { speed, fortune, pristine, spread }. */
  function petParts(pt, b, tool) {
    let ps = pt.stats.MINING_SPEED || 0, pf = pt.stats.MINING_FORTUNE || 0, pr = pt.stats.PRISTINE || 0, sp = 0;
    if (b.kind === 'gem') pf += pt.stats.GEMSTONE_FORTUNE || 0;
    for (const a of pt.ab) {
      const on = a.when === 'all' || (a.when === 'drill' && tool && tool.drill && b.kind === 'gem')
        || (a.when === 'mithril' && b.id.startsWith('mithril')) || (a.when === 'shaft' && g.shaft);
      if (a.stat === 'spread' || a.stat === 'snailbf') {
        const here = a.when === 'block' ? b.kind === 'block' : a.when === 'divan' ? b.id === 'goldblock' : b.id === a.when;
        if (!here || !a.v) continue;
        // Slow and Steady: +1 Block Fortune per a.v Speed above 100 (your Speed stat, typed in).
        if (a.stat === 'snailbf') pf += Math.floor(Math.max(0, (+g.speedStat || 0) - 100) / a.v); else sp += a.v;
        continue;
      }
      if (!on || a.stat === 'forfortune') continue;
      if (a.stat === 'speed') ps += a.v; else if (a.stat === 'pristine') pr += a.v; else pf += a.v;
    }
    const h = HELD[pt.held];
    const lvl = pt.level || pt.xpLevel || 0;
    if (h && h.per2) { ps += Math.floor(lvl / 2); pf += Math.floor(lvl / 2); }
    if (h && h.titanium && b.id === 'titanium') pf += h.titanium;
    return { speed: Math.round(ps), fortune: Math.round(pf), pristine: Math.round(pr * 100) / 100, spread: Math.round(sp) };
  }
  /** The item used for a slot: your pick, else the one with most speed (tool) or most fortune (everything else). */
  function chosen(slot, b) {
    const list = (owned && owned[slot]) || [];
    if (!list.length) return null;
    const pick = list.find(x => x.key === g.pick[slot]);
    if (pick) return pick;
    const score = slot === 'pet'
      ? x => { const t = list === owned.pet ? chosen('tool', b) : null; const r = petParts(x.pet, b, t); return (r.fortune + r.spread * 10) * 10 + r.speed + r.pristine * 100; }
      : x => {
        // Each 100 spread is roughly one extra block per break, so it beats the same amount of fortune by a lot.
        const sp = spreadFor(x, b) * 10;
        return slot === 'tool' ? x.speed * 10 + fortuneFor(x, b) + sp : (fortuneFor(x, b) + sp) * 10 + x.speed;
      };
    return list.slice().sort((a, c) => score(c) - score(a))[0];
  }
  function gearTotals(b) {
    let speed = 0, fortune = 0, pristine = 0, spread = 0;
    let gearPristine = 0;
    for (const [slot] of SLOTS) {
      if (slot === 'pet') continue;
      const x = chosen(slot, b);
      if (x) { speed += x.speed; fortune += fortuneFor(x, b); pristine += x.pristine; gearPristine += x.pristine; spread += spreadFor(x, b); }
    }
    const spreadParts = { gear: spread, acc: acc ? spreadFor(acc, b) : 0 };
    const parts = { gear: { speed, fortune } };
    if (acc) { parts.acc = { speed: acc.speed, fortune: fortuneFor(acc, b) }; pristine += acc.pristine; }
    if (skill) parts.skill = { speed: 0, fortune: skill * SKILL_FORTUNE };
    const usePet = owned && owned.pet.length ? chosen('pet', b) : null;
    const pt = usePet ? usePet.pet : pet;
    if (pt) {
      const r = petParts(pt, b, chosen('tool', b));
      pristine += r.pristine;
      parts.pet = { speed: r.speed, fortune: r.fortune };
      spreadParts.pet = r.spread;
    }
    if (g.sheer && hasSpread(b)) spreadParts.sheer = SHEER_FORCE;
    spreadParts.other = hasSpread(b) ? +g.otherSpread || 0 : 0;
    if (!g.noMall && g.mall === 'speed') parts.mall = { speed: 100, fortune: 0 };
    if (!g.noMall && g.mall === 'fortune') parts.mall = { speed: 0, fortune: 50 };
    if (g.god) parts.god = { speed: GOD_POT.speed, fortune: GOD_POT.fortune };
    parts.other = { speed: +g.otherSpeed || 0, fortune: +g.otherFortune || 0 };
    const sum = k => Object.values(parts).reduce((n, x) => n + x[k], 0);
    const pristineParts = { gear: gearPristine, acc: acc ? acc.pristine : 0 };
    pristineParts.pet = Math.round((pristine - pristineParts.gear - pristineParts.acc) * 100) / 100;
    return { speed: sum('speed'), fortune: sum('fortune'), pristine, pristineParts, parts, spreadParts };
  }
  const perkSum = (perks, b, levels) => Object.entries(perks).reduce((n, [id, where]) => n + (applies(where, b) ? api.stat(id, levels[id] || 0) : 0), 0);

  /** Ticks to break a block: ceil(30 × strength / speed), at least 4 unless it breaks instantly. Plain blocks like
      Hard Stone break instantly at 30 × strength; ores, gemstones, Dwarven metals and pure blocks need more than 60 ×. */
  const instantAt = b => (b.id === 'hardstone' ? 30 * b.str : 60 * b.str + 1);
  function ticks(speed, b) {
    if (speed <= 0) return Infinity;
    if (speed >= instantAt(b)) return 1;
    return Math.max(4, Math.ceil(30 * b.str / speed));
  }
  /** Least speed that breaks the block in `t` ticks. */
  const speedFor = (t, b) => (t === 1 ? instantAt(b) : 30 * b.str / t);

  function render(a) {
    api = a;
    const host = $('#gear');
    if (!host) return;
    const b = blockOf();
    const plan = api.state.plan;
    const tot = gearTotals(b);
    const pSpeed = perkSum(SPEED_PERKS, b, plan), pFort = perkSum(FORTUNE_PERKS, b, plan);
    const total = tot.speed + pSpeed;
    const tk = ticks(total, b);
    const better = tk === 4 ? 1 : tk > 4 && tk !== Infinity ? tk - 1 : null;
    const need = better ? Math.ceil(speedFor(better, b)) : null;
    const keep = tk === Infinity ? 0 : Math.ceil(speedFor(tk, b));
    const opt = (v, l, sel) => `<option value="${U.esc(v)}" ${v === sel ? 'selected' : ''}>${U.esc(l)}</option>`;
    const img = id => `<img src="../icons/${encodeURIComponent(id)}.png" alt="" loading="lazy" onerror="this.src='../icons/BARRIER.png'">`;
    const slot = k => {
      const list = (owned && owned[k]) || [];
      const cur = chosen(k, b);
      const label = SLOTS.find(x => x[0] === k)[1];
      return `<button type="button" class="mc-slot${cur ? '' : ' none'}${open === k ? ' sel' : ''}" data-gslot="${k}" ${cur ? `data-gi="${U.esc(k)}|${U.esc(cur.key)}"` : `title="${U.esc(label)}: nothing found"`} ${list.length ? '' : 'disabled'}>
        ${cur ? img(cur.id) : EMPTY[k] ? img(EMPTY[k]) : ''}${cur && cur.museum ? '<span class="mc-mus" title="In your Museum">M</span>' : ''}${list.length > 1 ? `<span class="mc-n">${list.length}</span>` : ''}</button>`;
    };
    const picker = () => {
      if (!open || !owned || !owned[open] || !owned[open].length) return '';
      const cur = chosen(open, b), auto = !g.pick[open];
      return `<div class="mc-pick"><div class="mc-title">Pick your ${U.esc(SLOTS.find(x => x[0] === open)[1].toLowerCase())}</div>
        <div class="mc-grid">${owned[open].map(x => `<button type="button" class="mc-slot${cur && x.key === cur.key ? ' cur' : ''}" data-gchoose="${U.esc(x.key)}" data-gi="${U.esc(open)}|${U.esc(x.key)}">${img(x.id)}${x.museum ? '<span class="mc-mus">M</span>' : ''}</button>`).join('')}
        <button type="button" class="mc-slot${auto ? ' cur' : ''}" data-gchoose="" title="Pick the best one for me">${img('NETHER_STAR')}<span class="mc-n">A</span></button></div>
        <p class="mc-gear-lbl">Hover for stats. The star picks the best one automatically${auto ? ' (on now)' : ''}. M = in your Museum.</p></div>`;
    };
    const slotRows = owned && SLOTS.some(([k]) => owned[k].length) ? `<div class="ht-grid mc-gearbox">
      <div class="mc-title">Your mining gear</div>
      <div class="mc-gear">
        <div><div class="grp col">${['helmet', 'chest', 'legs', 'boots'].map(slot).join('')}</div><div class="mc-gear-lbl">Armour</div></div>
        <div><div class="grp col">${['necklace', 'cloak', 'belt', 'gloves'].map(slot).join('')}</div><div class="mc-gear-lbl">Equipment</div></div>
        <div><div class="grp col">${slot('tool')}${slot('pet')}</div><div class="mc-gear-lbl">Tool / pet</div></div>
        <div class="mc-gear-sum">${SLOTS.map(([k, label]) => { const c = chosen(k, b); return c ? `<div><span class="mc-gear-lbl">${U.esc(label)}</span> ${U.mcText(c.rawName)}${k !== 'tool' && !c.worn ? ' <span class="mc-equip">equip this</span>' : ''}</div>` : ''; }).join('')}</div>
      </div>${picker()}</div>` : '';
    const fortName = FORTUNE_NAME[b.kind] ? `Mining + ${FORTUNE_NAME[b.kind]}` : 'Mining Fortune';
    const petNow = owned && owned.pet.length ? chosen('pet', b) : null;
    const LABEL = { gear: 'gear', acc: 'accessories', skill: `Mining ${skill}`, pet: petNow ? `${petNow.pet.name} pet` : pet ? `${pet.name} pet` : 'pet', mall: 'Sky Mall', god: 'God Potion', other: 'other', sheer: 'Sheer Force' };
    const pMaster = api.stat('mining_master', plan.mining_master || 0);
    const priParts = [...Object.entries(tot.pristineParts).filter(([, v]) => v).map(([k, v]) => `${U.num(v)} ${LABEL[k]}`),
      ...(pMaster ? [`${U.num(pMaster)} Mining Master`] : [])].join(' + ') || 'none yet';
    const from = k => Object.entries(tot.parts).filter(([, x]) => x[k]).map(([n, x]) => `${U.num(x[k])} ${LABEL[n]}`).join(' + ') || '0';
    const stat = (k, v, hint) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="hint" style="margin:4px 0 0">${hint}</div></div>`;
    host.innerHTML = `
      <div class="controls">
        <label class="field">What you mine <select id="gBlock">${BLOCKS.map(x => opt(x.id, `${x.name} (strength ${U.num(x.str)})`, b.id)).join('')}</select></label>
        <label><input type="checkbox" id="gShaft" ${g.shaft ? 'checked' : ''}> In a Glacite Mineshaft</label>
      </div>
      ${owned ? (slotRows ? slotRows
        : '<p class="hint">No mining gear found on your profile. Turn on the Inventory API in SkyBlock settings, or type your stats under "Other".</p>')
        : '<p class="hint">Log in to read your armour, equipment, pet and pickaxe or drill, or type your total stats under "Other".</p>'}
      ${slotRows ? `<p class="hint">The best gear and pet you own for ${U.esc(b.name)} are picked for you. Anything marked "equip this" isn't on you right now.</p>` : ''}
      <div class="controls">
        <label class="field">Other Mining Speed <input type="number" id="gSpeed" min="0" value="${g.otherSpeed || ''}" placeholder="0" style="width:120px"></label>
        <label class="field">Other fortune <input type="number" id="gFort" min="0" value="${g.otherFortune || ''}" placeholder="0" style="width:120px"></label>
        <label><input type="checkbox" id="gNoMall" ${g.noMall ? 'checked' : ''}> Ignore Sky Mall</label>
        <label class="field">Today's Sky Mall <select id="gMall" ${g.noMall ? 'disabled' : ''}>${MALL.map(([v, l]) => opt(v, l, g.mall)).join('')}</select></label>
        <label><input type="checkbox" id="gGod" ${g.god ? 'checked' : ''}> God Potion (+${GOD_POT.speed} speed, +${GOD_POT.fortune} fortune)</label>
      </div>
      ${hasSpread(b) ? `<div class="controls">
        <label class="field">Other Mining Spread <input type="number" id="gSpread" min="0" value="${g.otherSpread || ''}" placeholder="0" style="width:120px"></label>
        <label><input type="checkbox" id="gSheer" ${g.sheer ? 'checked' : ''}> Sheer Force active (+${SHEER_FORCE} spread for 25s)</label>
        ${b.kind === 'block' && petNow && petNow.pet.ab.some(a => a.stat === 'snailbf' && a.v) ? `<label class="field">Your Speed (for the Snail pet) <input type="number" id="gSpeedStat" min="0" value="${g.speedStat || ''}" placeholder="100" style="width:120px"></label>` : ''}
      </div>` : ''}
      <div class="stats">
        ${stat('Mining Speed', U.num(total), `${from('speed')} + ${U.num(pSpeed)} from this plan`)}
        ${stat(`${U.esc(b.name)} breaks in`, tk === Infinity ? '—' : tk === 1 ? 'Instantly' : `${tk} ticks`,
          tk === Infinity ? 'Add your speed first' : better ? `${better === 1 ? 'Instant' : better + ' ticks'} at ${U.num(need)} speed (${U.num(need - total)} more)` : 'As fast as it gets')}
        ${stat(fortName, U.num(tot.fortune + pFort), `${from('fortune')} + ${U.num(pFort)} from this plan`)}
        ${b.kind === 'gem' || tot.pristine ? stat('Pristine', U.num(tot.pristine + pMaster), priParts) : ''}
        ${hasSpread(b) ? (() => {
          const pSpread = perkSum(SPREAD_PERKS, b, plan);
          const all = Object.values(tot.spreadParts).reduce((n, v) => n + v, 0) + pSpread;
          const parts = [...Object.entries(tot.spreadParts).filter(([, v]) => v).map(([k, v]) => `${U.num(v)} ${LABEL[k]}`), `${U.num(pSpread)} from this plan`];
          return stat('Mining Spread', U.num(all), parts.join(' + '));
        })() : ''}
      </div>
      ${tk !== Infinity && tk > 1 ? `<p class="hint">Any speed between ${U.num(keep)} and ${U.num(need)} breaks ${U.esc(b.name)} in the same ${tk} ticks, so powder spent on speed in that gap is wasted.</p>` : ''}
      ${pet && !petNow ? `<p class="hint">Active pet: <b>${U.esc(pet.name)}</b> (${U.esc(U.pretty(pet.rarity || ''))}${pet.level ? `, level ${pet.level}` : ''})${pet.held ? `, holding ${U.esc(HELD[pet.held] ? HELD[pet.held].name : U.pretty(pet.held.replace(/^PET_ITEM_/, '')))}` : ''}${!['MINING_SPEED', 'MINING_FORTUNE', 'PRISTINE', 'GEMSTONE_FORTUNE'].some(k => pet.stats[k]) && !pet.ab.some(x => x.stat !== 'forfortune') && !HELD[pet.held] ? '. Neither it nor its item has mining stats, so it adds nothing here.' : ''}${pet.ab.some(a => a.when === 'magma') ? '. Its Pristine bonus only works in the Magma Fields, so it isn\'t counted.' : ''}</p>` : ''}
      ${owned && !acc ? '<p class="hint">Your accessory bag is not on the API. Turn on the Inventory API to count it.</p>' : ''}
      <p class="hint">"Other" is for anything else, like a temporary buff. Power stones don't give mining stats, and Sky Mall changes daily and isn't on the API.
        Dwarven O's Block Bran and the Mossy Box attribute aren't on the API either, so add their Block Fortune under "Other fortune".
        Pure blocks (Gold Blocks in the Mines of Divan, Diamond Blocks under the Royal Mines) use Block Fortune.
        Mining Spread breaks extra blocks next to the one you mine, on blocks, ores and Dwarven metals. Mineral Armor (+100 a piece),
        Glossy Mineral (+150), the Fleet reforge and the Snail pet count on blocks only, the Goblin pet in the Mines of Divan,
        and Armadillo and Mole on Hard Stone.
        Break time is ⌈30 × block strength ÷ speed⌉ ticks with a 4-tick minimum. Hard Stone breaks instantly at 30 × its strength;
        ores, gemstones, Dwarven metals and pure blocks need more than 60 ×.</p>
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
    const best = ticks(tot.speed + perkSum(SPEED_PERKS, b, plan), b);
    if (best === Infinity) return 'Add your Mining Speed first: log in, or type it under "Other".';
    const need = speedFor(best, b);
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
    for (const id of [...Object.keys(FORTUNE_PERKS), ...Object.keys(PRISTINE_PERKS)]) {
      if (applies(FORTUNE_PERKS[id] || PRISTINE_PERKS[id], b) && plan[id] > 0 && t.perks[id].tier <= s.tier) plan[id] = t.perks[id].max;
    }
    s.plan = plan;
    const after = {};
    for (const id of t.ids) t.cost(id, 0, plan[id], s, after);
    const diff = Object.keys(t.data.powders).map(k => [k, (before[k] || 0) - (after[k] || 0)]).filter(([, n]) => n);
    api.render();
    const changes = diff.map(([k, n]) => `${n > 0 ? 'saves' : 'costs'} ${U.num(Math.abs(n))} ${api.pname(k)}`).join(', ');
    const speeds = speedIds.map(id => `${U.esc(t.perks[id].name)} ${plan[id]}`).join(', ');
    return `Set for ${best === 1 ? 'instant' : best + '-tick'} ${U.esc(b.name)}${speeds ? ` (${speeds})` : ''}, with the fortune${b.kind === 'gem' ? ' and Pristine' : ''} perks in your plan maxed. ${changes ? 'This ' + changes + '.' : 'No change in powder.'}`;
  }

  document.addEventListener('change', e => {
    const el = e.target;
    if (!el.closest || !el.closest('#gear')) return;
    if (el.id === 'gBlock') g.block = el.value;
    else if (el.id === 'gShaft') g.shaft = el.checked;
    else if (el.id === 'gGod') g.god = el.checked;
    else if (el.id === 'gMall') g.mall = el.value;
    else if (el.id === 'gNoMall') g.noMall = el.checked;
    else if (el.id === 'gSpeed') g.otherSpeed = Math.max(0, +el.value || 0);
    else if (el.id === 'gFort') g.otherFortune = Math.max(0, +el.value || 0);
    else if (el.id === 'gSpread') g.otherSpread = Math.max(0, +el.value || 0);
    else if (el.id === 'gSheer') g.sheer = el.checked;
    else if (el.id === 'gSpeedStat') g.speedStat = Math.max(0, +el.value || 0);
    else if (el.dataset.slot) g.pick[el.dataset.slot] = el.value;
    else return;
    save();
    if (api) render(api);
  });
  const gearItem = key => {
    const [slot, k] = key.split('|');
    return ((owned && owned[slot]) || []).find(x => x.key === k);
  };
  document.addEventListener('mouseover', e => {
    const el = e.target.closest && e.target.closest('#gear [data-gi]');
    const tip = Tree.tip;
    if (!tip) return;
    if (!el || matchMedia('(hover: none)').matches) { if (e.target.closest && e.target.closest('#gear')) tip.el.hidden = true; return; }
    const x = gearItem(el.dataset.gi);
    if (!x) return;
    tip.el.innerHTML = [U.mcText(x.rawName), ...x.lore.map(l => U.mcText(l) || '&nbsp;')].join('<br>');
    tip.el.hidden = false; tip.place(e);
  });
  document.addEventListener('mousemove', e => { if (Tree.tip && !Tree.tip.el.hidden && e.target.closest && e.target.closest('#gear [data-gi]')) Tree.tip.place(e); });
  document.addEventListener('click', e => {
    const sl = e.target.closest && e.target.closest('#gear [data-gslot]');
    const ch = e.target.closest && e.target.closest('#gear [data-gchoose]');
    if (sl || ch) {
      if (Tree.tip) Tree.tip.el.hidden = true;
      if (sl) open = open === sl.dataset.gslot ? null : sl.dataset.gslot;
      if (ch) { if (ch.dataset.gchoose) g.pick[open] = ch.dataset.gchoose; else delete g.pick[open]; save(); }
      if (api) render(api);
      return;
    }
    if (e.target.id !== 'gTune' || !api) return;
    const msg = tune();
    $('#gMsg').innerHTML = `<p class="hint">${msg}</p>`;
  });

  return { load, render };
})();
