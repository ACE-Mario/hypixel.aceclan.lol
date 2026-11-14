'use strict';

const MINING_GUIDE = 'https://skykings.net/guides/mining';

// Builds: perk → target level ('max' = max level). Perks needed to connect them are added at level 1.
const PRESETS = [
  // Checked against the SkyKings mining guide (updated Nov 2026, after the Glacite Tunnels and Mineshafts) and the wiki.
  // Perks are in priority order: "Only what my tier allows" drops from the end. `fallback` is the ability used until
  // the main one is reachable (Sheer Force and Gemstone Infusion need HotM 10).
  {
    id: 'gems', name: 'Gemstone mining', src: MINING_GUIDE, srcName: 'SkyKings mining guide',
    desc: 'Crystal Hollows and Glacite gemstones. Gem speed and fortune (Professional, Gem Lover), Front Loaded and Daily Powder, then Pristine from Mining Master. Mining Speed Boost is the ability; Gemstone Infusion only pays off with Perfect gems in your drill.',
    ability: 'mining_speed_boost',
    levels: {
      mining_speed: 'max', mining_fortune: 'max', mining_speed_boost: 1, professional: 'max', gem_lover: 'max',
      fortunate_mineman: 'max', speedy_mineman: 'max', front_loaded: 1, daily_powder: 1, seasoned_mineman: 'max',
      great_explorer: 'max', powder_buff: 'max', core_of_the_mountain: 10, mining_master: 'max',
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
    id: 'glacite', name: 'Glacite & mineshafts', src: MINING_GUIDE, srcName: 'SkyKings mining guide',
    desc: 'Glacite Tunnels and Mineshafts: more mineshafts (Surveyor), more corpses and loot, Cold Resistance (Warm Heart), and Dwarven Metal speed and fortune. Sheer Force at HotM 10, Mining Speed Boost before that.',
    ability: 'sheer_force', fallback: 'mining_speed_boost',
    levels: {
      mining_speed: 'max', mining_fortune: 'max', mining_speed_boost: 1, core_of_the_mountain: 10, strong_arm: 'max',
      warm_heart: 'max', speedy_mineman: 'max', fortunate_mineman: 'max', surveyor: 'max', mineshaft_mayhem: 1,
      metal_head: 'max', eager_adventurer: 'max', rags_to_riches: 'max', steady_hand: 'max', dead_mans_chest: 'max',
      vanguard_seeker: 'max', gifts_from_the_departed: 'max', no_stone_unturned: 'max', mining_master: 'max', sheer_force: 1,
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

const powderOf = m => {
  const c = m.mining_core || {};
  const get = k => (c['powder_' + k] || 0) + (c['powder_spent_' + k] || 0);
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
