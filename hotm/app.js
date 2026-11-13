'use strict';

const GEM_GUIDE = 'https://skykings.net/guides/gemstone';
const MINING_GUIDE = 'https://skykings.net/guides/mining';

// Builds: perk → target level ('max' = max level). Perks needed to connect them are added at level 1.
const PRESETS = [
  {
    id: 'gems', name: 'Gemstone mining', src: GEM_GUIDE, srcName: 'SkyKings gemstone guide',
    desc: 'For Crystal Hollows gemstones with a Pristine pickaxe. Gem mining speed and fortune first, then Pristine (Mining Master) and Gemstone Infusion.',
    ability: 'gemstone_infusion',
    levels: {
      mining_speed: 'max', mining_fortune: 'max', professional: 'max', gem_lover: 'max', fortunate_mineman: 'max',
      speedy_mineman: 'max', seasoned_mineman: 'max', front_loaded: 1, daily_powder: 1, sky_mall: 1,
      powder_buff: 'max', mining_master: 'max', gemstone_infusion: 1, core_of_the_mountain: 10,
    },
  },
  {
    id: 'powder', name: 'Powder grinding', src: MINING_GUIDE, srcName: 'SkyKings mining guide',
    desc: 'Mining hardstone in the Crystal Hollows for treasure chests. Great Explorer first, Mole to about 70, then Powder Buff.',
    ability: 'pickobulus',
    levels: {
      mining_speed: 'max', mining_fortune: 'max', efficient_miner: 'max', daily_powder: 1, mole: 70,
      great_explorer: 'max', powder_buff: 'max', gem_lover: 'max', front_loaded: 1, pickobulus: 1, core_of_the_mountain: 10,
    },
  },
  {
    id: 'mithril', name: 'Mithril & titanium', src: MINING_GUIDE, srcName: 'SkyKings mining guide',
    desc: 'Dwarven Mines mithril. Titanium Insanium for titanium, plus the Dwarven Metal speed and fortune perks lower down.',
    ability: 'pickobulus',
    levels: {
      mining_speed: 'max', mining_fortune: 'max', titanium_insanium: 'max', precision_mining: 1, efficient_miner: 'max',
      sky_mall: 1, daily_powder: 1, speedy_mineman: 'max', fortunate_mineman: 'max', strong_arm: 'max', metal_head: 'max',
      pickobulus: 1, core_of_the_mountain: 10,
    },
  },
  {
    id: 'glacite', name: 'Glacite & mineshafts',
    desc: 'Glacite Tunnels and Mineshafts: more mineshafts, more corpses and loot, cold resistance, and Dwarven Metal speed and fortune.',
    ability: 'pickobulus',
    levels: {
      mining_speed: 'max', mining_fortune: 'max', core_of_the_mountain: 10, strong_arm: 'max', metal_head: 'max',
      speedy_mineman: 'max', fortunate_mineman: 'max', surveyor: 'max', warm_heart: 'max', mineshaft_mayhem: 1,
      eager_adventurer: 'max', rags_to_riches: 'max', dead_mans_chest: 'max', vanguard_seeker: 'max',
      gifts_from_the_departed: 'max', no_stone_unturned: 'max', pickobulus: 1,
    },
  },
  {
    id: 'comms', name: 'Commissions & forging', src: MINING_GUIDE, srcName: 'SkyKings mining guide',
    desc: 'While levelling HotM with commissions. Quick Forge makes every forge item faster, which matters a lot on Ironman.',
    ability: 'pickobulus',
    levels: {
      mining_speed: 'max', mining_fortune: 'max', titanium_insanium: 20, quick_forge: 'max', luck_of_the_cave: 'max',
      efficient_miner: 50, sky_mall: 1, daily_powder: 1, lonesome_miner: 'max', keep_it_cool: 30, great_explorer: 'max',
      pickobulus: 1, core_of_the_mountain: 7,
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
  presets: PRESETS, powderOf,
  onRender: api => Gear.render(api),
  onProfile: d => Gear.load(d),
}).catch(err => { console.error(err); document.querySelector('#grid').innerHTML = '<p class="empty-note">Could not load the tree. Try refreshing.</p>'; });
