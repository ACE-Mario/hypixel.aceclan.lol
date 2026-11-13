'use strict';

const WIKI = 'https://hypixelskyblock.minecraft.wiki/w/Heart_of_the_Forest';

// Builds: perk → target level ('max' = max level). Perks needed to connect them are added at level 1.
const PRESETS = [
  {
    id: 'trees', name: 'Cutting trees',
    desc: "Fig and Mangrove logs: Sweep and Foraging Fortune maxed, the free Sweep/Fortune perks (Foraging Madness, Early Bird, Precision Cutting), then Timber, Two for One and Forest Strength.",
    ability: 'axe_toss',
    levels: {
      sweep: 'max', foraging_fortune: 'max', collector: 1, axe_toss: 1, hunters_luck: 1, '250_gifts': 'max', iron_lungs: 1,
      foraging_madness: 1, daily_wishes: 'max', early_bird: 1, precision_cutting: 1, center_of_the_forest: 5,
      starlyn_supreme: 1, strength_boost: 'max', ricochet: 'max', timber: 'max', two_for_one: 'max', forest_strength: 'max',
    },
  },
  {
    id: 'gifts', name: 'Whispers & Tree Gifts',
    desc: "For earning whispers and gift loot: Luck of the Forest, 250 Gifts, Daily Wishes, Tree Whisperer, Free Trial and Essence Fortune.",
    ability: 'damage_boost',
    levels: {
      sweep: 'max', foraging_fortune: 'max', luck_of_the_forest: 'max', damage_boost: 1, hunters_luck: 1, '250_gifts': 'max',
      daily_wishes: 'max', iron_lungs: 1, foraging_madness: 1, tree_whisperer: 1, early_bird: 1, free_trial: 1, center_of_the_forest: 5,
      starlyn_supreme: 'max', ricochet: 1, timber: 1, essence_fortune: 'max', two_for_one: 'max',
    },
  },
  {
    id: 'hunting', name: 'Hunting & combat',
    desc: "Hunting shards and fighting on Galatea: Hunter Fortune and Galatea's Might maxed, plus Strength, Speed and the water perks.",
    ability: 'damage_boost',
    levels: {
      sweep: 1, foraging_fortune: 1, hunters_luck: 'max', luck_of_the_forest: 1, damage_boost: 1, deep_waters: 'max',
      collector: 1, axe_toss: 1, galateas_might: 'max', foraging_madness: 1, iron_lungs: 'max', '250_gifts': 1,
      center_of_the_forest: 3, starlyn_supreme: 1, strength_boost: 'max', speed_boost: 'max',
    },
  },
  {
    id: 'fishing', name: 'Fishing on Galatea',
    desc: "Forest Fisher for fishing speed and Sea Creature Chance, Galatea's Might for the fights, and pressure resistance and respiration for the water.",
    ability: 'damage_boost',
    levels: {
      sweep: 1, foraging_fortune: 1, luck_of_the_forest: 1, damage_boost: 1, deep_waters: 'max', foraging_madness: 1,
      tree_whisperer: 1, forest_fisher: 'max', iron_lungs: 'max', collector: 1, axe_toss: 1, galateas_might: 'max',
      strength_boost: 25, starlyn_supreme: 1, center_of_the_forest: 3,
    },
  },
];

const powderOf = m => {
  const w = (m.foraging_core || {}).whispers || {};
  const get = k => {
    const o = w[k] || {};
    return (o.total || 0) + Object.keys(o).filter(n => /^\d+$/.test(n)).reduce((s, n) => Math.max(s, (o[n] || {}).spent || 0), 0);
  };
  return { FOREST_WHISPERS: get('forest'), DESERT_WHISPERS: get('desert') };
};

Tree.page({
  data: '../data/hotf.json', storeKey: 'ace-hypixel.hotf.v1', node: 'foraging', label: 'HotF',
  icons: { npi: ['WOOD_BUTTON', 'WOOD', 'LOG'], api: ['DEAD_BUSH', 'SAPLING'], map: { MANGROVE_WOOD: 'MANGROVE_LOG', MANGROVE_ROOTS: 'MANGROVE_LOG' }, tierOn: 'LEAVES', tierOff: 'DEAD_BUSH' },
  title: 'Heart of the Forest',
  presets: PRESETS.map(p => ({ ...p, src: WIKI, srcName: 'perk data on the SkyBlock wiki' })), powderOf,
}).catch(err => { console.error(err); document.querySelector('#grid').innerHTML = '<p class="empty-note">Could not load the tree. Try refreshing.</p>'; });
