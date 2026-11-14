'use strict';

const MINING_GUIDE = 'https://skykings.net/guides/mining';

// Builds: perk → target level ('max' = max level). Perks needed to connect them are added at level 1.
// No Seasoned Mineman (Mining Wisdom): every build assumes max Mining level, so the XP is wasted.
const PRESETS = [
  // Checked against the SkyKings mining guide (updated Nov 2026, after the Glacite Tunnels and Mineshafts) and the wiki.
  // Perks are in priority order: "Only what my tier allows" drops from the end. `fallback` is the ability used until
  // the main one is reachable (Sheer Force and Gemstone Infusion need HotM 10).
  {
    id: 'gems', name: 'Gemstones (Glacite Mineshafts)', src: MINING_GUIDE, srcName: 'SkyKings mining guide',
    desc: 'Gemstones in the Glacite Mineshafts. Gem speed and fortune (Professional, Gem Lover), Front Loaded and Daily Powder, Warm Heart for the cold, Surveyor to find mineshafts, then the mineshaft perks (Steady Hand for Gemstone Spread, Eager Adventurer, Rags to Riches) and Pristine from Mining Master. Corpse loot perks come last. Mining Speed Boost is the ability; Gemstone Infusion only pays off with Perfect gems in your drill.',
    ability: 'mining_speed_boost',
    levels: {
      mining_speed: 'max', mining_fortune: 'max', mining_speed_boost: 1, professional: 'max', gem_lover: 'max',
      fortunate_mineman: 'max', speedy_mineman: 'max', front_loaded: 1, daily_powder: 1, core_of_the_mountain: 10,
      warm_heart: 'max', surveyor: 'max', steady_hand: 'max', mineshaft_mayhem: 1, eager_adventurer: 'max', rags_to_riches: 'max',
      mining_master: 'max', powder_buff: 'max', dead_mans_chest: 'max', vanguard_seeker: 'max', gifts_from_the_departed: 'max',
      no_stone_unturned: 'max',
    },
  },
  {
    id: 'powder', name: 'Powder grinding', src: MINING_GUIDE, srcName: 'SkyKings mining guide',
    desc: 'Mining Hard Stone in the Crystal Hollows for treasure chests (Gemstone Powder). Great Explorer for chests, Mole and Efficient Miner for Mining Spread, Powder Buff. Sheer Force at HotM 10, Pickobulus before that.',
    ability: 'sheer_force', fallback: 'pickobulus',
    levels: {
      mining_speed: 'max', efficient_miner: 'max', great_explorer: 'max', mole: 'max', daily_powder: 1, front_loaded: 1,
      powder_buff: 'max', pickobulus: 1, mining_fortune: 'max', core_of_the_mountain: 10, sheer_force: 1,
    },
  },
  {
    id: 'mithril', name: 'Mithril & titanium', src: MINING_GUIDE, srcName: 'SkyKings mining guide',
    desc: 'Dwarven Mines Mithril. Titanium Insanium for Titanium, Precision Mining (+30% speed on metals), then Strong Arm and Metal Head for Dwarven Metals. Mining Speed Boost is the ability.',
    ability: 'mining_speed_boost',
    levels: {
      mining_speed: 'max', mining_fortune: 'max', precision_mining: 1, mining_speed_boost: 1, titanium_insanium: 'max',
      efficient_miner: 'max', sky_mall: 1, daily_powder: 1, speedy_mineman: 'max', fortunate_mineman: 'max',
      powder_buff: 'max', core_of_the_mountain: 10, strong_arm: 'max', metal_head: 'max',
    },
  },
  {
    id: 'blocks', name: 'Block mining', src: MINING_GUIDE, srcName: 'SkyKings mining guide',
    desc: 'Pure blocks like the Gold Blocks in the Mines of Divan or the Diamond Blocks under the Royal Mines. Blockhead for Block Fortune, Efficient Miner for Mining Spread, and Sheer Force (+200 Mining Spread) at HotM 10, Mining Speed Boost before that.',
    ability: 'sheer_force', fallback: 'mining_speed_boost',
    levels: {
      mining_speed: 'max', mining_fortune: 'max', mining_speed_boost: 1, efficient_miner: 'max', blockhead: 'max',
      speedy_mineman: 'max', fortunate_mineman: 'max', sky_mall: 1, daily_powder: 1, core_of_the_mountain: 10, sheer_force: 1,
    },
  },
  {
    id: 'glacite', name: 'Dwarven Metals (Glacite Tunnels)', src: MINING_GUIDE, srcName: 'SkyKings mining guide',
    desc: 'Umber, Tungsten and Glacite in the Glacite Tunnels, outside the mineshafts. Strong Arm for Dwarven Metal speed, Metal Head for Dwarven Metal Fortune, Warm Heart for the cold, Precision Mining (+30% speed on metals). Sheer Force at HotM 10, Mining Speed Boost before that.',
    ability: 'sheer_force', fallback: 'mining_speed_boost',
    levels: {
      mining_speed: 'max', mining_fortune: 'max', mining_speed_boost: 1, precision_mining: 1, strong_arm: 'max', warm_heart: 'max',
      speedy_mineman: 'max', fortunate_mineman: 'max', metal_head: 'max', efficient_miner: 'max', core_of_the_mountain: 10,
      powder_buff: 'max', sheer_force: 1,
    },
  },
  {
    id: 'comms', name: 'Commissions & forging', src: MINING_GUIDE, srcName: 'SkyKings mining guide',
    desc: 'While levelling HotM with commissions. Daily Grind for powder from your first commission on each island, Quick Forge for faster forging (big on Ironman), Pickobulus for quick ore commissions.',
    ability: 'pickobulus',
    levels: {
      mining_speed: 'max', mining_fortune: 'max', pickobulus: 1, titanium_insanium: 20, quick_forge: 'max',
      luck_of_the_cave: 'max', efficient_miner: 50, sky_mall: 1, daily_powder: 1, daily_grind: 1, lonesome_miner: 'max',
      keep_it_cool: 30, great_explorer: 'max', core_of_the_mountain: 7,
    },
  },
];

// Powder a reset would give you. The API's powder_<type> is everything you have (unspent + in perks + in the core),
// and powder_spent_non_refundable_<type> is the part in Core of the Mountain, which a reset never gives back.
// Checked on a real profile: 6,325,373 - 900,000 = 5,425,373 Gemstone, the same as the game after a reset.
const powderOf = m => {
  const c = m.mining_core || {};
  const get = k => Math.max(0, (c['powder_' + k] || 0) - (c['powder_spent_non_refundable_' + k] || 0));
  return { MITHRIL: get('mithril'), GEMSTONE: get('gemstone'), GLACITE: get('glacite') };
};

Tree.page({
  data: '../data/hotm.json', storeKey: 'ace-hypixel.hotm.v1', node: 'mining', label: 'HotM',
  icons: { npi: ['COAL', 'EMERALD', 'DIAMOND'], api: ['COAL_BLOCK', 'EMERALD_BLOCK'], tierOn: 'EMERALD_BLOCK', tierOff: 'COAL_BLOCK' },
  title: 'Heart of the Mountain',
  presets: PRESETS, powderOf,
  onRender: api => Gear.render(api),
  onPreset: p => Gear.preset(p.id),
  best: p => Gear.best(p),   // "Best I can do": fits the build to your tier, tokens and powder
  presetScroll: '#gear',   // a preset changes the gear first, so show that
  onProfile: d => Gear.load(d),
}).catch(err => { console.error(err); document.querySelector('#grid').innerHTML = '<p class="empty-note">Could not load the tree. Try refreshing.</p>'; });
