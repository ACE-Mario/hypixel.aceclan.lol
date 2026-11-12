'use strict';
/*
 * Greenhouse facts, from the Hypixel SkyBlock Wiki pages "Greenhouse" and "Mutations"
 * (checked November 2026, after patch 0.27.2). Update here when Hypixel changes things.
 */

// Effects a plant gives to the plants next to it (up, down, left, right).
const EFFECTS = {
  HB: { name: 'Harvest Boost', text: '+20% yield', good: true },
  IHB: { name: 'Improved Harvest Boost', text: '+30% yield', good: true },
  HL: { name: 'Harvest Loss', text: '−20% yield', good: false },
  XB: { name: 'XP Boost', text: '+20% Farming XP', good: true },
  IXB: { name: 'Improved XP Boost', text: '+30% Farming XP', good: true },
  XPL: { name: 'XP Loss', text: '−20% Farming XP', good: false },
  WD: { name: 'Water Drain', text: 'loses 30% more water each cycle', good: false },
  WR: { name: 'Water Retain', text: 'keeps 50% of the water it would lose', good: true },
  IWR: { name: 'Improved Water Retain', text: "doesn't lose water", good: true },
  IMM: { name: 'Immunity', text: 'ignores bad effects', good: true },
  ES: { name: 'Effect Spread', text: 'passes on the effects it receives', good: true },
  BD: { name: 'Bonus Drops', text: 'rolls for Ethereal Vines, chips and more', good: true },
};

// Ground the plant needs.
const SOIL = { F: 'Farmland', SS: 'Soul Sand', M: 'Mycelium', S: 'Sand', ES: 'End Stone', FD: 'Farmland or Dirt' };

// Normal crops: yield per harvest, growth stages, effects, water capacity.
// `group` merges crops that count as one type for the unique-crop bonus.
const CROPS = [
  { id: 'WHEAT', name: 'Wheat', icon: 'WHEAT', drops: { WHEAT: 72 }, stages: 8, fx: ['HB'], water: 1200 },
  { id: 'CARROT', name: 'Carrot', icon: 'CARROT_ITEM', drops: { CARROT: 175 }, stages: 8, fx: ['XB'], water: 1200 },
  { id: 'POTATO', name: 'Potato', icon: 'POTATO_ITEM', drops: { POTATO: 150 }, stages: 8, fx: ['IMM'], water: 1200 },
  { id: 'PUMPKIN', name: 'Pumpkin', icon: 'PUMPKIN', drops: { PUMPKIN: 68 }, stages: 11, fx: ['BD'], water: 1600 },
  { id: 'SUGAR_CANE', name: 'Sugar Cane', icon: 'SUGAR_CANE', drops: { SUGAR_CANE: 136 }, stages: 8, fx: ['IXB', 'HL'], water: 1200 },
  { id: 'MELON', name: 'Melon', icon: 'MELON', drops: { MELON: 320 }, stages: 11, fx: ['WR'], water: 1600 },
  { id: 'CACTUS', name: 'Cactus', icon: 'CACTUS', drops: { CACTUS: 132 }, stages: 8, fx: ['IWR', 'HL'] },
  { id: 'COCOA', name: 'Cocoa Beans', icon: 'INK_SACK-58-3', drops: { COCOA: 120 }, stages: 6, fx: ['IMM'] },
  { id: 'RED_MUSHROOM', name: 'Red Mushroom', icon: 'RED_MUSHROOM', drops: { RED_MUSHROOM: 30 }, stages: 6, fx: ['IHB', 'WD'], group: 'MUSHROOM' },
  { id: 'BROWN_MUSHROOM', name: 'Brown Mushroom', icon: 'BROWN_MUSHROOM', drops: { BROWN_MUSHROOM: 30 }, stages: 6, fx: ['IHB', 'WD'], group: 'MUSHROOM' },
  { id: 'NETHER_WART', name: 'Nether Wart', icon: 'NETHER_STALK', drops: { NETHER_WART: 108 }, stages: 8, fx: ['IHB', 'XPL'] },
  { id: 'SUNFLOWER', name: 'Sunflower', icon: 'DOUBLE_PLANT', drops: { SUNFLOWER: 232 }, stages: 15, fx: ['BD'], water: 2000, group: 'FLOWER' },
  { id: 'MOONFLOWER', name: 'Moonflower', icon: 'MOONFLOWER', drops: { MOONFLOWER: 232 }, stages: 15, fx: ['BD'], water: 2000, group: 'FLOWER' },
  { id: 'WILD_ROSE', name: 'Wild Rose', icon: 'WILD_ROSE', drops: { WILD_ROSE: 200 }, stages: 15, fx: ['ES'], water: 2000 },
];
const CROP_XP = 320;

// Other things that can sit in a slot.
const OTHER = [
  { id: 'DEAD_PLANT', name: 'Dead Plant', icon: 'DEAD_PLANT', fx: [], note: 'What a plant turns into when it decays. Counts as a plant for mutations.' },
  { id: 'FERMENTO', name: 'Fermento', icon: 'FERMENTO', fx: [], note: 'Counts as a crop for mutations (Cheesebite).' },
  { id: 'FIRE', name: 'Fire', icon: 'BLAZE_POWDER', fx: [], block: true, note: "Not a plant. Ashwreath needs fire next to it, but fire doesn't raise its chance." },
];

// Mutations. need: [[id, count]] counted in the ring of slots around the empty space
// (8 slots for 1x1, 12 for 2x2, 16 for 3x3). chance is per growth cycle, from the wiki.
// special: text for mutations that can't be made by layout alone.
const MUTATIONS = [
  { id: 'ASHWREATH', name: 'Ashwreath', r: 'COMMON', chance: 15, size: 1, soil: 'SS', need: [['NETHER_WART', 2], ['FIRE', 2]], fx: ['IHB', 'XPL'], drops: { NETHER_WART: 180 }, xp: 240, stages: 0 },
  { id: 'CHOCONUT', name: 'Choconut', r: 'COMMON', chance: 30, size: 1, soil: 'F', need: [['COCOA', 2]], fx: ['IMM'], drops: { COCOA: 200 }, xp: 400, stages: 0 },
  { id: 'DUSTGRAIN', name: 'Dustgrain', r: 'COMMON', chance: 30, size: 1, soil: 'F', need: [['WHEAT', 2]], fx: ['HB'], drops: { WHEAT: 100 }, xp: 400, stages: 0 },
  { id: 'GLOOMGOURD', name: 'Gloomgourd', r: 'COMMON', chance: 30, size: 1, soil: 'F', need: [['PUMPKIN', 1], ['MELON', 1]], fx: ['WR', 'BD'], drops: { PUMPKIN: 34, MELON: 160 }, xp: 320, stages: 0 },
  { id: 'LONELILY', name: 'Lonelily', r: 'COMMON', chance: 6, size: 1, soil: 'FD', need: [], lonely: true, fx: ['BD'], drops: { POTATO: 525, CARROT: 613, PUMPKIN: 298 }, xp: 2800, stages: 0 },
  { id: 'SCOURROOT', name: 'Scourroot', r: 'COMMON', chance: 30, size: 1, soil: 'F', need: [['POTATO', 1], ['CARROT', 1]], fx: ['IMM', 'XB'], drops: { POTATO: 102, CARROT: 119 }, xp: 272, stages: 0 },
  { id: 'SHADEVINE', name: 'Shadevine', r: 'COMMON', chance: 30, size: 1, soil: 'F', need: [['CACTUS', 1], ['SUGAR_CANE', 1]], fx: ['IWR', 'IXB', 'HL'], drops: { CACTUS: 78, SUGAR_CANE: 104 }, xp: 416, stages: 0 },
  { id: 'VEILSHROOM', name: 'Veilshroom', r: 'COMMON', chance: 30, size: 1, soil: 'M', need: [['RED_MUSHROOM', 1], ['BROWN_MUSHROOM', 1]], fx: ['IHB', 'WD'], drops: { BROWN_MUSHROOM: 28, RED_MUSHROOM: 28 }, xp: 240, stages: 0 },
  { id: 'WITHERBLOOM', name: 'Witherbloom', r: 'COMMON', chance: 30, size: 1, soil: 'SS', need: [['DEAD_PLANT', 4]], fx: ['ES'], drops: { WILD_ROSE: 184 }, xp: 368, stages: 0 },

  { id: 'CHOCOBERRY', name: 'Chocoberry', r: 'UNCOMMON', chance: 25, size: 1, soil: 'F', need: [['CHOCONUT', 6], ['GLOOMGOURD', 2]], fx: ['WR'], drops: { COCOA: 440, PUMPKIN: 187, MELON: 1760 }, xp: 3520, stages: 6 },
  { id: 'CINDERSHADE', name: 'Cindershade', r: 'UNCOMMON', chance: 25, size: 1, soil: 'SS', need: [['ASHWREATH', 4], ['WITHERBLOOM', 4]], fx: ['ES', 'IHB', 'XPL'], drops: { NETHER_WART: 1020, WILD_ROSE: 680 }, xp: 2720, stages: 8 },
  { id: 'COALROOT', name: 'Coalroot', r: 'UNCOMMON', chance: 25, size: 1, soil: 'F', need: [['ASHWREATH', 5], ['SCOURROOT', 3]], fx: ['XB'], drops: { POTATO: 510, CARROT: 1190, NETHER_WART: 510 }, xp: 2720, stages: 8 },
  { id: 'CREAMBLOOM', name: 'Creambloom', r: 'UNCOMMON', chance: 25, size: 1, soil: 'F', need: [['CHOCONUT', 8]], fx: ['IMM'], drops: { COCOA: 2240 }, xp: 4480, stages: 6 },
  { id: 'DUSKBLOOM', name: 'Duskbloom', r: 'UNCOMMON', chance: 25, size: 1, soil: 'F', need: [['MOONFLOWER', 2], ['SHADEVINE', 2], ['SUNFLOWER', 2], ['DUSTGRAIN', 2]], fx: ['BD'], drops: { MOONFLOWER: 720, SUNFLOWER: 720, WHEAT: 360 }, xp: 4320, stages: 8 },
  { id: 'THORNSHADE', name: 'Thornshade', r: 'UNCOMMON', chance: 25, size: 1, soil: 'F', need: [['WILD_ROSE', 4], ['VEILSHROOM', 4]], fx: ['ES'], drops: { BROWN_MUSHROOM: 190, RED_MUSHROOM: 190, WILD_ROSE: 800 }, xp: 3200, stages: 8 },

  { id: 'BLASTBERRY', name: 'Blastberry', r: 'RARE', chance: 25, size: 1, soil: 'S', need: [['CHOCOBERRY', 5], ['ASHWREATH', 3]], fx: ['IMM', 'IHB', 'XPL'], drops: { COCOA: 800, NETHER_WART: 1200 }, xp: 3200, stages: 6 },
  { id: 'CHEESEBITE', name: 'Cheesebite', r: 'RARE', chance: 25, size: 1, soil: 'F', need: [['CREAMBLOOM', 4], ['FERMENTO', 4]], fx: ['IWR'], drops: { BROWN_MUSHROOM: 253, CACTUS: 800, SUGAR_CANE: 1067, RED_MUSHROOM: 253 }, xp: 6400, stages: 10 },
  { id: 'CHLORONITE', name: 'Chloronite', r: 'RARE', chance: 25, size: 1, soil: 'F', need: [['COALROOT', 6], ['THORNSHADE', 2]], fx: ['IMM'], drops: { BROWN_MUSHROOM: 128, POTATO: 810, CARROT: 945, RED_MUSHROOM: 128, WILD_ROSE: 540 }, xp: 4320, stages: 10 },
  { id: 'DO_NOT_EAT_SHROOM', name: 'Do-not-eat-shroom', r: 'RARE', chance: 25, size: 1, soil: 'F', need: [['VEILSHROOM', 4], ['SCOURROOT', 4]], fx: ['IHB', 'WD'], drops: { BROWN_MUSHROOM: 200, POTATO: 630, CARROT: 735, RED_MUSHROOM: 200 }, xp: 3360, stages: 8 },
  { id: 'FLESHTRAP', name: 'Fleshtrap', r: 'RARE', chance: 25, size: 1, soil: 'F', need: [['CINDERSHADE', 4], ['LONELILY', 4]], fx: ['BD'], drops: { POTATO: 510, CARROT: 595, PUMPKIN: 289 }, xp: 2720, stages: 14 },
  { id: 'MAGIC_JELLYBEAN', name: 'Magic Jellybean', r: 'RARE', chance: 25, size: 1, soil: 'S', need: [['SUGAR_CANE', 5], ['DUSKBLOOM', 3]], fx: ['IXB', 'HL'], drops: { MOONFLOWER: 600, SUNFLOWER: 600, SUGAR_CANE: 1200 }, xp: 4800, stages: 120 },
  { id: 'NOCTILUME', name: 'Noctilume', r: 'RARE', chance: 25, size: 2, soil: 'F', need: [['DUSKBLOOM', 6], ['LONELILY', 6]], fx: ['ES', 'IWR', 'HL'], drops: { CACTUS: 1590, WILD_ROSE: 2120 }, xp: 8480, stages: 4 },
  { id: 'SNOOZLING', name: 'Snoozling', r: 'RARE', chance: 25, size: 3, soil: 'F', need: [['CREAMBLOOM', 4], ['DUSTGRAIN', 3], ['WITHERBLOOM', 3], ['DUSKBLOOM', 3], ['THORNSHADE', 3]], fx: ['BD'], drops: { MOONFLOWER: 4200, SUNFLOWER: 4200, CACTUS: 3150, SUGAR_CANE: 4200 }, xp: 33600, stages: 20 },
  { id: 'SOGGYBUD', name: 'Soggybud', r: 'RARE', chance: 25, size: 1, soil: 'F', need: [['MELON', 2], ['GLOOMGOURD', 2]], fx: ['WR'], drops: { MELON: 1920 }, xp: 1920, stages: 10 },
  { id: 'TURTLELLINI', name: 'Turtlellini', r: 'RARE', chance: 25, size: 1, soil: 'F', need: [['SOGGYBUD', 4], ['CHOCONUT', 4]], fx: ['WR', 'IMM'], drops: { MELON: 800 }, xp: 800, stages: 0 },

  { id: 'CHORUS_FRUIT', name: 'Chorus Fruit', r: 'EPIC', chance: 25, size: 1, soil: 'ES', need: [['CHLORONITE', 5], ['MAGIC_JELLYBEAN', 3]], fx: ['IXB', 'HL'], drops: { POTATO: 1050, CARROT: 1225, SUGAR_CANE: 1400 }, xp: 5600, stages: 12 },
  { id: 'PLANTBOY_ADVANCE', name: 'PlantBoy Advance', r: 'EPIC', chance: 25, size: 2, soil: 'F', need: [['SNOOZLING', 6], ['THUNDERLING', 6]], fx: ['HB'], drops: { MOONFLOWER: 4600, SUNFLOWER: 4600, WHEAT: 4600 }, xp: 36800, stages: 12 },
  { id: 'PUFFERCLOUD', name: 'Puffercloud', r: 'EPIC', chance: 25, size: 1, soil: 'F', need: [['SNOOZLING', 2], ['DO_NOT_EAT_SHROOM', 6]], fx: ['IHB', 'WD'], drops: { BROWN_MUSHROOM: 570, MOONFLOWER: 1200, SUNFLOWER: 1200, RED_MUSHROOM: 570 }, xp: 9600, stages: 14 },
  { id: 'SHELLFRUIT', name: 'Shellfruit', r: 'EPIC', chance: 0, size: 1, soil: 'F', need: [], special: 'Explode a Turtlellini with a Blastberry.', fx: ['WR', 'IMM'], drops: { COCOA: 400 }, xp: 800, stages: 0 },
  { id: 'STARTLEVINE', name: 'Startlevine', r: 'EPIC', chance: 25, size: 1, soil: 'F', need: [['BLASTBERRY', 4], ['CHEESEBITE', 4]], fx: ['IWR', 'IXB', 'HL'], drops: { CACTUS: 2250, SUGAR_CANE: 3000 }, xp: 12000, stages: 12 },
  { id: 'STOPLIGHT_PETAL', name: 'Stoplight Petal', r: 'EPIC', chance: 25, size: 1, soil: 'F', need: [['SNOOZLING', 4], ['NOCTILUME', 4]], fx: ['ES', 'IWR', 'HL'], drops: { CACTUS: 7500, WILD_ROSE: 10000 }, xp: 40000, stages: 12 },
  { id: 'THUNDERLING', name: 'Thunderling', r: 'EPIC', chance: 25, size: 1, soil: 'F', need: [['SOGGYBUD', 5], ['NOCTILUME', 3]], fx: ['ES'], drops: { CACTUS: 1650, MELON: 4400, WILD_ROSE: 4400 }, xp: 17600, stages: 16 },
  { id: 'ZOMBUD', name: 'Zombud', r: 'EPIC', chance: 25, size: 1, soil: 'SS', need: [['DEAD_PLANT', 4], ['CINDERSHADE', 2], ['FLESHTRAP', 2]], fx: ['ES', 'BD'], drops: { PUMPKIN: 765, WILD_ROSE: 1800 }, xp: 7200, stages: 16 },

  { id: 'ALL_IN_ALOE', name: 'All-in Aloe', r: 'LEGENDARY', chance: 25, size: 1, soil: 'S', need: [['MAGIC_JELLYBEAN', 6], ['PLANTBOY_ADVANCE', 2]], fx: ['HB'], drops: { MOONFLOWER: 140, SUNFLOWER: 140, WHEAT: 140 }, xp: 1120, stages: 27 },
  { id: 'DEVOURER', name: 'Devourer', r: 'LEGENDARY', chance: 20, size: 1, soil: 'F', need: [['PUFFERCLOUD', 4], ['ZOMBUD', 4]], fx: ['BD', 'IHB', 'WD'], drops: { BROWN_MUSHROOM: 1805, PUMPKIN: 3230, RED_MUSHROOM: 1805 }, xp: 30400, stages: 16 },
  { id: 'GLASSCORN', name: 'Glasscorn', r: 'LEGENDARY', chance: 20, size: 2, soil: 'S', need: [['STARTLEVINE', 6], ['CHLORONITE', 6]], fx: ['IMM', 'IWR', 'HL'], drops: { POTATO: 4800, CACTUS: 7200 }, xp: 25600, stages: 9 },
  { id: 'GODSEED', name: 'Godseed', r: 'LEGENDARY', chance: 5, size: 3, soil: 'F', need: [], godseed: true, fx: ['IHB', 'IWR', 'IXB', 'IMM', 'BD', 'ES'], drops: { BROWN_MUSHROOM: 117, COCOA: 492, MOONFLOWER: 492, CARROT: 862, SUNFLOWER: 492, CACTUS: 369, SUGAR_CANE: 492, PUMPKIN: 209, WHEAT: 246, MELON: 985, POTATO: 738, NETHER_WART: 738, RED_MUSHROOM: 117, WILD_ROSE: 492 }, xp: 12800, stages: 40 },
  { id: 'JERRYFLOWER', name: 'Jerryflower', r: 'LEGENDARY', chance: 0, size: 1, soil: 'F', need: [], special: 'Grow the Jerryseed.', fx: [], drops: {}, xp: 0, stages: 10 },
  { id: 'PHANTOMLEAF', name: 'Phantomleaf', r: 'LEGENDARY', chance: 20, size: 1, soil: 'SS', need: [['CHORUS_FRUIT', 4], ['SHELLFRUIT', 4]], fx: ['XB', 'IMM'], drops: { POTATO: 3000, CARROT: 3500 }, xp: 8000, stages: 15 },
  { id: 'TIMESTALK', name: 'Timestalk', r: 'LEGENDARY', chance: 20, size: 1, soil: 'ES', need: [['STOPLIGHT_PETAL', 4], ['CHORUS_FRUIT', 2], ['SHELLFRUIT', 2]], fx: ['IWR', 'IXB', 'HL'], drops: { CACTUS: 2700, SUGAR_CANE: 3600 }, xp: 14400, stages: 14 },
];

// Display name + icon for every drop id.
const DROP_ICON = {
  WHEAT: 'WHEAT', CARROT: 'CARROT_ITEM', POTATO: 'POTATO_ITEM', PUMPKIN: 'PUMPKIN', SUGAR_CANE: 'SUGAR_CANE', MELON: 'MELON',
  CACTUS: 'CACTUS', COCOA: 'INK_SACK-58-3', RED_MUSHROOM: 'RED_MUSHROOM', BROWN_MUSHROOM: 'BROWN_MUSHROOM', NETHER_WART: 'NETHER_STALK',
  SUNFLOWER: 'DOUBLE_PLANT', MOONFLOWER: 'MOONFLOWER', WILD_ROSE: 'WILD_ROSE',
};
const DROP_NAME = {
  WHEAT: 'Wheat', CARROT: 'Carrot', POTATO: 'Potato', PUMPKIN: 'Pumpkin', SUGAR_CANE: 'Sugar Cane', MELON: 'Melon Slice',
  CACTUS: 'Cactus', COCOA: 'Cocoa Beans', RED_MUSHROOM: 'Red Mushroom', BROWN_MUSHROOM: 'Brown Mushroom', NETHER_WART: 'Nether Wart',
  SUNFLOWER: 'Sunflower', MOONFLOWER: 'Moonflower', WILD_ROSE: 'Wild Rose',
};

// Ethereal Vine chance when harvesting a mutation, by rarity (bonus drops: 5% on any plant).
const VINE_CHANCE = { COMMON: 0.15, UNCOMMON: 0.2, RARE: 0.25, EPIC: 0.3, LEGENDARY: 0.4 };

// The 12 slots unlocked from the start (row-major, 10x10 grid).
const GRID = 10;
const DEFAULT_OPEN = [
  [3, 4], [3, 5],
  [4, 3], [4, 4], [4, 5], [4, 6],
  [5, 3], [5, 4], [5, 5], [5, 6],
  [6, 4], [6, 5],
];

// Plants that never need watering (blank water capacity on the wiki).
const NO_WATER = new Set([
  'CACTUS', 'COCOA', 'NETHER_WART', 'RED_MUSHROOM', 'BROWN_MUSHROOM', 'DEAD_PLANT', 'FERMENTO', 'FIRE',
  'ASHWREATH', 'CHOCONUT', 'DUSTGRAIN', 'GLOOMGOURD', 'LONELILY', 'SCOURROOT', 'SHADEVINE', 'VEILSHROOM', 'WITHERBLOOM',
  'CINDERSHADE', 'TURTLELLINI', 'CHORUS_FRUIT', 'PLANTBOY_ADVANCE', 'SHELLFRUIT', 'THUNDERLING', 'ZOMBUD',
  'ALL_IN_ALOE', 'PHANTOMLEAF',
]);
