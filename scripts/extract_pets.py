"""Build data/pets.json for the HotM gear panel: pet levelling and the stats of pets that help mining.

Source: constants/pets.json and constants/petnums.json from the NotEnoughUpdates repo zip.
Each pet keeps its stats at level 1 and 100 (200 for Golden Dragon); the page interpolates between them.

usage: python -I scripts/extract_pets.py NotEnoughUpdates-REPO-master.zip
"""
import json
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MINING_STATS = {'MINING_SPEED', 'MINING_FORTUNE', 'PRISTINE', 'GEMSTONE_FORTUNE'}
# Foraging pets (for the HotF gear panel). Speed and Strength feed Forest Speed / Forest Strength.
FORAGING_STATS = {'FORAGING_FORTUNE', 'SWEEP'}
EXTRA_STATS = {'SPEED', 'STRENGTH'}
# Abilities that add a mining stat: pet -> [(index into otherNums, stat, when)], read from the pets' lore.
ABILITIES = {
    'SILVERFISH': [(2, 'speed', 'all')],          # Dexterity: +X Mining Speed
    'SCATHA': [(1, 'gem', 'drill')],               # Drill Infusion: +X Gemstone Fortune to drills
    'MITHRIL_GOLEM': [(0, 'speed', 'mithril')],    # Mithril Affinity: +X Mining Speed when mining Mithril
    'GLACITE_GOLEM': [(1, 'fortune', 'shaft')],    # Iceborn: +X Mining Fortune in Glacite Mineshafts
    'BAL': [(0, 'pristine', 'magma')],             # Furnace: +X Pristine in the Magma Fields
    'MONKEY': [(0, 'forfortune', 'all')],          # Treeborn: +X Foraging Fortune
    'SNAIL': [(2, 'spread', 'block'),              # Slimy Reach: +X Mining Spread on Blocks (Legendary)
              (1, 'snailbf', 'block')],            # Slow and Steady: +1 Block Fortune per X Speed above 100
    'GOBLIN': [(1, 'spread', 'divan')],            # Fetid Thief: +X Mining Spread in the Mines of Divan
    'ARMADILLO': [(1, 'spread', 'hardstone')],     # Long Claws: +X Mining Spread on Hard Stone (Legendary+)
}


def main(zpath):
    z = zipfile.ZipFile(zpath)
    root = z.namelist()[0].split('/')[0]
    pets = json.loads(z.read(f'{root}/constants/pets.json').decode('utf8'))
    nums = json.loads(z.read(f'{root}/constants/petnums.json').decode('utf8'))
    out = {}
    for pet, rarities in nums.items():
        keep = pet in ABILITIES
        data = {}
        for rarity, levels in rarities.items():
            if not isinstance(levels, dict):
                continue
            pts = {}
            for lv, v in levels.items():
                if not lv.isdigit():
                    continue
                sn = v.get('statNums', {})
                if any(k in MINING_STATS or k in FORAGING_STATS for k in sn):
                    keep = True
                stats = {k: n for k, n in sn.items() if k in MINING_STATS or k in FORAGING_STATS or k in EXTRA_STATS}
                pts[lv] = {'s': stats, 'o': v.get('otherNums', [])}
            data[rarity] = pts
        if keep:
            out[pet] = data
    custom = {k: {'max': v.get('max_level', 100), 'levels': v.get('pet_levels'), 'offset': v.get('rarity_offset')}
              for k, v in pets.get('custom_pet_leveling', {}).items() if k in out}
    res = {'levels': pets['pet_levels'], 'offset': pets['pet_rarity_offset'], 'custom': custom,
           'names': {k: v for k, v in pets.get('id_to_display_name', {}).items() if k in out},
           'abilities': ABILITIES, 'pets': out}
    with open(os.path.join(ROOT, 'data', 'pets.json'), 'w', encoding='utf8') as f:
        json.dump(res, f, ensure_ascii=False, separators=(',', ':'))
    print(len(out), 'mining/foraging pets:', ', '.join(sorted(out)))


if __name__ == '__main__':
    main(sys.argv[1])
