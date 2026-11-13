"""Build data/hotm.json and data/hotf.json for the Heart of the Mountain / Forest planners.

Source: constants/hotmlayout.json and constants/hotflayout.json from the NotEnoughUpdates repo zip.
Positions, max levels, stats and lore come from there (as small lisp expressions the page evaluates).
NEU leaves most Heart of the Forest costs blank, so those are filled in from the SkyBlock wiki below.

usage: python -I scripts/extract_trees.py NotEnoughUpdates-REPO-master.zip
"""
import json
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Heart of the Forest powder cost per level, from the SkyBlock wiki: cost to go from `level` to
# `level + 1` is floor((level + 2) ^ k), same shape as Heart of the Mountain.
HOTF_EXP = {
    'sweep': 3, 'luck_of_the_forest': 3.07, 'foraging_fortune': 3.05, 'collector': 2.9,
    'deep_waters': 2.9, 'hunters_luck': 3.2, 'galateas_might': 3.2, 'iron_lungs': 2.9,
    '250_gifts': 3.07, 'strength_boost': 3.1, 'speed_boost': 3.1, 'starlyn_supreme': 2.6,
    'efficient_forager': 2.6, 'half_empty': 4.1, 'half_full': 4.1, 'ricochet': 5.5,
    'two_for_one': 2.45, 'essence_fortune': 3.2,
    # Not listed on the wiki at the time of writing: estimated like the other 50-level perks on that row.
    'forest_speed': 3.2, 'forest_strength': 3.2,
}
HOTF_EST = {'forest_speed', 'forest_strength'}
HOTF_COST = {
    'daily_wishes': '(+ 200 (* 18 (+ level 1)))',
    'timber': '(pow (+ level 8) 5)',
}

TREES = {
    'hotm': {
        'file': 'hotmlayout.json', 'rows': 10,
        # Cumulative tree XP to reach each tier, and tokens given by each tier.
        'xp': [0, 3000, 12000, 37000, 97000, 197000, 347000, 557000, 847000, 1247000],
        'tokens': [1, 2, 2, 2, 2, 2, 3, 2, 2, 2],
        'core': 'core_of_the_mountain', 'coreTokens': {1: 1, 5: 1, 7: 1, 10: 2},
        'abilities': ['mining_speed_boost', 'pickobulus', 'anomalous_desire', 'maniac_miner', 'gemstone_infusion', 'sheer_force'],
        'powders': {'MITHRIL': ['2', 'Mithril Powder'], 'GEMSTONE': ['d', 'Gemstone Powder'], 'GLACITE': ['b', 'Glacite Powder']},
    },
    'hotf': {
        'file': 'hotflayout.json', 'rows': 8,
        'xp': [0, 3000, 12000, 37000, 97000, 197000, 347000, 547000],
        'tokens': [1, 2, 2, 2, 2, 2, 2, 2],
        'core': 'center_of_the_forest', 'coreTokens': {1: 1, 5: 1},
        'abilities': None,
        'powders': {'FOREST_WHISPERS': ['3', 'Forest Whispers'], 'DESERT_WHISPERS': ['6', 'Desert Whispers']},
    },
}


def main(zpath):
    z = zipfile.ZipFile(zpath)
    root = z.namelist()[0].split('/')[0]
    for key, cfg in TREES.items():
        raw = json.loads(z.read(f'{root}/constants/{cfg["file"]}').decode('utf8'))
        tree = raw[key]
        perks = {}
        for pid, p in tree['perks'].items():
            cost = p.get('cost', '')
            est = False
            if key == 'hotf' and not cost:
                if pid in HOTF_COST:
                    cost = HOTF_COST[pid]
                elif pid in HOTF_EXP:
                    cost = f'(pow (+ level 2) {HOTF_EXP[pid]})'
                    est = pid in HOTF_EST
            if key == 'hotm' and pid == 'core_of_the_mountain':
                # NEU's list is out of date: the wiki has levels 4-7 on Gemstone and 8-10 on Glacite powder.
                cost = '(list.at (list.new 0 50000 100000 200000 300000 400000 500000 750000 1000000 1250000 0) level)'
                p = {**p, 'powder': '(if (lt level 3) MITHRIL (if (lt level 7) GEMSTONE GLACITE))'}
            if p['maxLevel'] == 1:
                cost = cost or '0'
            out = {
                'name': p['name'], 'x': p['x'], 'tier': cfg['rows'] - p['y'], 'max': p['maxLevel'],
                'powder': p.get('powder', ''), 'cost': cost, 'lore': p.get('lore', []), 'item': p.get('item', ''),
            }
            stats = {k: v for k, v in p.items() if k.startswith('stat')}
            if stats:
                out['stats'] = stats
            if est:
                out['est'] = True
            ability = p.get('isAbility') or (cfg['abilities'] and pid in cfg['abilities'])
            if ability:
                out['ability'] = True
            if pid == cfg['core']:
                out['core'] = True
            perks[pid] = out
        data = {
            'rows': cfg['rows'], 'xp': cfg['xp'], 'tokens': cfg['tokens'], 'coreTokens': cfg['coreTokens'],
            'powders': cfg['powders'], 'prelude': raw['prelude'], 'perks': perks,
        }
        with open(os.path.join(ROOT, 'data', f'{key}.json'), 'w', encoding='utf8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        print(key, len(perks), 'perks')


if __name__ == '__main__':
    main(sys.argv[1])
