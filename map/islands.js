// Island renders and their real world corners (x1,z1 = top-left, x2,z2 = bottom-right) from SkyGuide by DeDiamondPro (GPL-3.0).
// dx/dz = where the island sits on the shared clan map (added to real coordinates), so separate worlds don't overlap.
// "under": an underground layer drawn at its real spot beneath another island (switch with the Surface/Tunnels buttons).
// Glacite Tunnels render (8 px per block, scaled to 2) from the Hypixel SkyBlock Wiki.
// To add or replace a map: drop a top-down PNG (2 px per block) in map/img/ and add or edit its line here.
window.ISLANDS = [
  {"key": "hub", "name": "Hub", "areas": ["Hub"], "img": "img/hub.png", "x1": -298, "z1": -258, "x2": 201, "z2": 241, "dx": 0, "dz": 0},
  {"key": "combat_1", "name": "Spider's Den", "areas": ["Spider's Den"], "img": "img/spiders_den.png", "x1": -408, "z1": -408, "x2": -106, "z2": -106, "dx": 0, "dz": 0},
  {"key": "foraging_1", "name": "Park", "areas": ["The Park"], "img": "img/park.png", "x1": -500, "z1": -148, "x2": -253, "z2": 99, "dx": 0, "dz": 0},
  {"key": "farming_1", "name": "Farming Islands", "areas": ["The Farming Islands", "The Barn", "Mushroom Desert"], "img": "img/farming_islands.png", "x1": 82, "z1": -618, "x2": 400, "z2": -194, "dx": 0, "dz": 0},
  {"key": "crimson_isle", "name": "Crimson Isle", "areas": ["Crimson Isle"], "img": "img/crimson_isle.png", "x1": -772, "z1": -1180, "x2": 51, "z2": -357, "dx": 0, "dz": 0},
  {"key": "combat_3", "name": "End", "areas": ["The End"], "img": "img/end.png", "x1": -790, "z1": -422, "x2": -447, "z2": -123, "dx": 0, "dz": 0},
  {"key": "mining_1", "name": "Gold Mine", "areas": ["Gold Mine"], "img": "img/gold_mine.png", "x1": -90, "z1": -401, "x2": 45, "z2": -266, "dx": 0, "dz": 0},
  {"key": "mining_2", "name": "Deep Caverns", "areas": ["Deep Caverns"], "img": "img/deep_caverns.png", "x1": -86, "z1": -68, "x2": 80, "z2": 98, "dx": 306, "dz": -82},
  {"key": "mining_3", "name": "Dwarven Mines", "areas": ["Dwarven Mines"], "img": "img/dwarven_mines.png", "x1": -250, "z1": -186, "x2": 249, "z2": 313, "dx": 850, "dz": -994},
  {"key": "glacite_tunnels", "name": "Glacite Tunnels", "areas": [], "under": "mining_3", "img": "img/glacite_tunnels.webp", "x1": -126, "z1": 187, "x2": 124, "z2": 476, "dx": 850, "dz": -994},
  {"key": "crystal_hollows", "name": "Crystal Hollows", "areas": ["Crystal Hollows"], "img": "img/crystal_hollows.png", "x1": 200, "z1": 200, "x2": 824, "z2": 824, "dx": 1000, "dz": -1380},
  {"key": "rift", "name": "Rift", "areas": ["The Rift"], "img": "img/rift.png", "x1": -368, "z1": -400, "x2": 302, "z2": 320, "dx": 968, "dz": 60},
  {"key": "winter", "name": "Jerry's Workshop", "areas": ["Jerry's Workshop"], "img": "img/jerry_workshop.png", "x1": -140, "z1": -114, "x2": 125, "z2": 132, "dx": 1490, "dz": -366},
  {"key": "dungeon_hub", "name": "Dungeon Hub", "areas": ["Dungeon Hub"], "img": "img/dungeon_hub.png", "x1": -146, "z1": -92, "x2": 21, "z2": 144, "dx": 1496, "dz": -58}
];
