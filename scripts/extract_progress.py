"""Build data/progress.json for the "What to get next" page: gear ladders per skill.

Ladders are written by hand below, following the SkyKings Ironman/mining guides and the SkyBlock wiki fishing
and farming tutorials. Names, requirements, recipes and stats come from the NotEnoughUpdates repo zip.

usage: python -I scripts/extract_progress.py NotEnoughUpdates-REPO-master.zip
"""
import json
import os
import re
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIECES = ['HELMET', 'CHESTPLATE', 'LEGGINGS', 'BOOTS']

# Each track is an ordered ladder, worst to best. A string is one item; 'SET:PREFIX' is an armour set
# (PREFIX_HELMET ... PREFIX_BOOTS); 'PET:TYPE' is a pet.
SKILLS = [
    {'id': 'mining', 'name': 'Mining', 'skill': 'MINING', 'icon': 'DIAMOND_PICKAXE', 'tracks': [
        ('Pickaxe / drill', ['ROOKIE_PICKAXE', 'IRON_PICKAXE', 'MITHRIL_PICKAXE', 'REFINED_MITHRIL_PICKAXE', 'MITHRIL_DRILL_1',
                             'MITHRIL_DRILL_2', 'GEMSTONE_DRILL_1', 'TITANIUM_DRILL_1', 'GEMSTONE_DRILL_2', 'TITANIUM_DRILL_2',
                             'GEMSTONE_GAUNTLET', 'GEMSTONE_DRILL_3', 'TITANIUM_DRILL_3', 'GEMSTONE_DRILL_4', 'TITANIUM_DRILL_4',
                             'DIVAN_DRILL']),
        ('Armour', ['SET:MINER_OUTFIT', 'SET:GOBLIN', 'SET:GLACITE', 'SET:ARMOR_OF_YOG', 'SET:SORROW', 'SET:DIVAN']),
        ('Necklace', 'AUTO:NECKLACE'),
        ('Cloak', 'AUTO:CLOAK'),
        ('Belt', 'AUTO:BELT'),
        ('Gloves', 'AUTO:GLOVES'),
        ('Pet', ['PET:SILVERFISH', 'PET:MITHRIL_GOLEM', 'PET:SCATHA']),
    ]},
    {'id': 'foraging', 'name': 'Foraging', 'skill': 'FORAGING', 'icon': 'JUNGLE_AXE', 'tracks': [
        ('Axe', ['JUNGLE_AXE', 'SERIOUSLY_DAMAGED_AXE', 'FIG_AXE', 'DECENT_AXE', 'TREECAPITATOR_AXE', 'FIGSTONE_AXE', 'HELIX_CHOPPER']),
        ('Armour', ['SET:LEAFLET', 'SET:CANOPY', 'SET:FIG', 'SET:HELIX_ARMOR']),
        ('Necklace', 'AUTO:NECKLACE'),
        ('Belt', 'AUTO:BELT'),
        ('Gloves', 'AUTO:GLOVES'),
        ('Pet', ['PET:MONKEY', 'PET:SLOTH', 'PET:JADE_DRAGON']),
    ]},
    {'id': 'farming', 'name': 'Farming', 'skill': 'FARMING', 'icon': 'GOLD_HOE', 'tracks': [
        ('Armour', ['SET:FARM_SUIT', 'SET:FARM_ARMOR', 'SET:PUMPKIN', 'SET:MELON', 'SET:CROPIE', 'SET:SQUASH', 'SET:FERMENTO', 'SET:HELIANTHUS']),
        ('Necklace', 'AUTO:NECKLACE'),
        ('Cloak', 'AUTO:CLOAK'),
        ('Belt', 'AUTO:BELT'),
        ('Gloves', 'AUTO:GLOVES'),
        ('Pet', ['PET:RABBIT', 'PET:MOOSHROOM_COW', 'PET:ELEPHANT']),
        ('Wheat tool', ['ROOKIE_HOE', 'THEORETICAL_HOE_WHEAT_1', 'THEORETICAL_HOE_WHEAT_2', 'THEORETICAL_HOE_WHEAT_3']),
        ('Carrot tool', ['THEORETICAL_HOE_CARROT_1', 'THEORETICAL_HOE_CARROT_2', 'THEORETICAL_HOE_CARROT_3']),
        ('Potato tool', ['THEORETICAL_HOE_POTATO_1', 'THEORETICAL_HOE_POTATO_2', 'THEORETICAL_HOE_POTATO_3']),
        ('Sugar cane tool', ['THEORETICAL_HOE_CANE_1', 'THEORETICAL_HOE_CANE_2', 'THEORETICAL_HOE_CANE_3']),
        ('Nether wart tool', ['THEORETICAL_HOE_WARTS_1', 'THEORETICAL_HOE_WARTS_2', 'THEORETICAL_HOE_WARTS_3']),
        ('Sunflower tool', ['THEORETICAL_HOE_SUNFLOWER_1', 'THEORETICAL_HOE_SUNFLOWER_2', 'THEORETICAL_HOE_SUNFLOWER_3']),
        ('Wild rose tool', ['THEORETICAL_HOE_WILD_ROSE_1', 'THEORETICAL_HOE_WILD_ROSE_2', 'THEORETICAL_HOE_WILD_ROSE_3']),
        ('Melon tool', ['MELON_DICER', 'MELON_DICER_2', 'MELON_DICER_3']),
        ('Pumpkin tool', ['PUMPKIN_DICER', 'PUMPKIN_DICER_2', 'PUMPKIN_DICER_3']),
        ('Cocoa tool', ['COCO_CHOPPER', 'COCO_CHOPPER_2', 'COCO_CHOPPER_3']),
        ('Cactus tool', ['CACTUS_KNIFE', 'CACTUS_KNIFE_2', 'CACTUS_KNIFE_3']),
        ('Mushroom tool', ['FUNGI_CUTTER', 'FUNGI_CUTTER_2', 'FUNGI_CUTTER_3']),
    ]},
    {'id': 'fishing', 'name': 'Fishing', 'skill': 'FISHING', 'icon': 'FISHING_ROD', 'tracks': [
        ('Water rod', ['FISHING_ROD', 'CHALLENGE_ROD', 'CHAMP_ROD', 'LEGEND_ROD', 'ROD_OF_THE_SEA']),
        ('Lava rod', ['STARTER_LAVA_ROD', 'POLISHED_TOPAZ_ROD', 'MAGMA_ROD', 'INFERNO_ROD', 'HELLFIRE_ROD']),
        ('Armour', ['SET:ANGLER', 'SET:SALMON', 'SET:SPONGE', 'SET:DIVER', 'SET:SHARK_SCALE', 'SET:THUNDER', 'SET:MAGMA_LORD']),
        ('Necklace', 'AUTO:NECKLACE'),
        ('Cloak', 'AUTO:CLOAK'),
        ('Belt', 'AUTO:BELT'),
        ('Gloves', 'AUTO:GLOVES'),
        ('Pet', ['PET:DOLPHIN', 'PET:SQUID', 'PET:FLYING_FISH']),
    ]},
    # Combat: no single guide covers it, so this follows the usual path (collections and Rosetta-era gear,
    # then dragon armour from the End, slayer gear, dungeons, then Crimson Isle / Kuudra).
    {'id': 'combat', 'name': 'Combat', 'skill': 'COMBAT', 'icon': 'DIAMOND_SWORD', 'tracks': [
        ('Sword', ['UNDEAD_SWORD', 'RAIDER_AXE', 'ZOMBIE_SWORD', 'ASPECT_OF_THE_END', 'REVENANT_SWORD', 'VOIDEDGE_KATANA',
                   'REAPER_SWORD', 'PIGMAN_SWORD', 'LIVID_DAGGER', 'VORPAL_KATANA', 'SHADOW_FURY', 'ATOMSPLIT_KATANA',
                   'GIANTS_SWORD', 'HYPERION']),
        ('Bow', ['ARTISANAL_SHORTBOW', 'HURRICANE_BOW', 'END_STONE_BOW', 'RUNAANS_BOW', 'ITEM_SPIRIT_BOW', 'JUJU_SHORTBOW',
                 'MOSQUITO_BOW', 'TERMINATOR']),
        ('Armour', ['SET:GOLEM_ARMOR', 'SET:HARDENED_DIAMOND', 'SET:TARANTULA', 'SET:STRONG_DRAGON', 'SET:FINAL_DESTINATION',
                    'SET:SUPERIOR_DRAGON', 'SET:SHADOW_ASSASSIN', 'SET:CRIMSON', 'SET:POWER_WITHER']),
        ('Necklace', 'AUTO:NECKLACE'),
        ('Cloak', 'AUTO:CLOAK'),
        ('Belt', 'AUTO:BELT'),
        ('Gloves', 'AUTO:GLOVES'),
        ('Pet', ['PET:WOLF', 'PET:BLAZE', 'PET:TIGER', 'PET:ENDER_DRAGON']),
    ]},
]
# Equipment ladders are built from every item with the skill's stats, worst to best by this score.
SCORE = {
    'mining': {'Mining Speed': 1, 'Mining Fortune': 2},
    'foraging': {'Foraging Fortune': 1, 'Sweep': 3},
    'farming': {'Farming Fortune': 1},
    'fishing': {'Sea Creature Chance': 5, 'Fishing Speed': 1},
    'combat': {'Strength': 1, 'Crit Damage': 1, 'Health': 0.2, 'Defense': 0.2},
}
SOURCES = [
    ['SkyKings Ironman guide', 'https://skykings.net/guides/ironman'],
    ['SkyKings mining guide', 'https://skykings.net/guides/mining'],
    ['Wiki fishing guide', 'https://hypixelskyblock.minecraft.wiki/w/Tutorial:Fishing_Guide'],
    ['Wiki farming guide', 'https://hypixelskyblock.minecraft.wiki/w/Tutorial:Farming_Guide'],
]
ROMAN = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10, 'XI': 11, 'XII': 12}
plain = lambda s: re.sub('§.', '', s or '')


def main(zpath):
    z = zipfile.ZipFile(zpath)
    root = z.namelist()[0].split('/')[0]
    items = {}
    for n in z.namelist():
        if n.startswith(f'{root}/items/') and n.endswith('.json'):
            try:
                j = json.loads(z.read(n))
            except ValueError:
                continue
            items[j.get('internalname', n.split('/')[-1][:-5])] = j
    by_name = {}
    for k, j in items.items():
        nm = plain(j.get('displayname', '')).strip().lower()
        if ';' in k or k.startswith('ENCHANTED_') or nm in by_name:
            continue
        by_name[nm] = k
    by_name.update({'lily pad': 'WATER_LILY', 'magmafish': 'MAGMA_FISH', 'raw salmon': 'RAW_FISH-1', 'sponge': 'SPONGE'})

    def info(iid):
        j = items[iid]
        lore = [plain(l) for l in j.get('lore', [])]
        req = []
        for l in lore:
            m = re.search(r'Requires (\w[\w ]*?) Skill (\d+)', l)
            if m:
                req.append({'skill': m.group(1).upper(), 'lv': int(m.group(2))})
            m = re.search(r'Requires Heart of the Mountain Tier (\d+)', l)
            if m:
                req.append({'hotm': int(m.group(1))})
            m = re.search(r'Requires Heart of the Forest Tier (\d+)', l)
            if m:
                req.append({'hotf': int(m.group(1))})
            m = re.search(r'Requires (Zombie|Spider|Wolf|Enderman|Blaze|Vampire) Slayer (\d+)', l)
            if m:
                req.append({'slayer': m.group(1).lower(), 'lv': int(m.group(2))})
            m = re.search(r'Requires The Catacombs Floor ([IVX]+) Completion', l)
            if m:
                req.append({'floor': ROMAN[m.group(1)]})
            m = re.search(r'Requires Kuudra (\w+) Tier Completion', l)
            if m:
                req.append({'text': f'Kuudra {m.group(1)} tier'})
        ms = re.match(r'Requires: (Zombie|Spider|Wolf|Enderman|Blaze|Vampire) Slayer (\d+)$', j.get('crafttext', '') or '')
        if ms:
            req = [q for q in req if q.get('slayer') != ms.group(1).lower()] + [{'slayer': ms.group(1).lower(), 'lv': int(ms.group(2))}]
        m = None if ms else re.match(r'Requires: (.+) ([IVX]+)$', j.get('crafttext', '') or '')
        if m and m.group(1).lower() in by_name:
            req.append({'coll': by_name[m.group(1).lower()], 'name': m.group(1), 'tier': ROMAN[m.group(2)]})
        elif not ms and j.get('crafttext', '').startswith('Requires: ') and not re.match(r'Requires: (HotM|HotF) ', j['crafttext']):
            req.append({'text': j['crafttext'][10:]})
        how = []
        for r in j.get('recipes', []) + ([dict(j['recipe'], type='crafting')] if 'recipe' in j else []):
            t = r.get('type', 'crafting')
            if t == 'forge':
                h = round(r.get('duration', 0) / 3600, 1)
                how.append(f'Forge ({h:g}h)' if h else 'Forge')
            elif t == 'crafting':
                how.append('Craft')
            elif t == 'npc_shop':
                how.append('Buy from an NPC')
            elif t == 'drops':
                how.append('Mob drop')
        stats = [l for l in lore if re.match(r'^[A-Z][A-Za-z ]+: [+-][\d,.]+', l)][:4]
        stats = [re.sub(r' \(.*$', '', s) for s in stats]
        wiki = (j.get('info') or [None])[0] if j.get('infoType') == 'WIKI_URL' else None
        return {'name': j.get('displayname', iid), 'req': req, 'how': sorted(set(how)), 'stats': stats, 'wiki': wiki}

    def auto(skill, slot):
        found = []
        for k, j in items.items():
            lore = [plain(l) for l in j.get('lore', [])]
            if ';' in k or not lore or k.startswith('STARRED_') or plain(j.get('displayname', '')).startswith(' '):
                continue
            m = re.search(r'\b(NECKLACE|CLOAK|BELT|GLOVES|BRACELET)\b', lore[-1])
            if not m or {'BRACELET': 'GLOVES'}.get(m.group(1), m.group(1)) != slot:
                continue
            score = 0
            for stat, w in SCORE[skill].items():
                for l in lore:
                    mm = re.match(re.escape(stat) + r': \+([\d.]+)', l)
                    if mm:
                        score += float(mm.group(1)) * w
            if skill == 'combat' and not any(re.match(r'(Strength|Crit Damage): \+', l) for l in lore):
                continue   # health/defense alone (fishing, farming pieces) isn't combat gear
            if score:
                found.append((score, k))
        return [k for _, k in sorted(found)]

    out = []
    for sk in SKILLS:
        tracks = []
        for label, ladder in sk['tracks']:
            if isinstance(ladder, str):
                ladder = auto(sk['id'], ladder[5:])
            rungs = []
            for e in ladder:
                if e.startswith('SET:'):
                    pre = e[4:]
                    pieces = [f'{pre}_{p}' for p in PIECES if f'{pre}_{p}' in items]
                    if not pieces:
                        print('missing set', pre)
                        continue
                    i = info(pieces[1] if len(pieces) > 1 else pieces[0])
                    nm = plain(items[pieces[0]]['displayname'])
                    i['name'] = items[pieces[0]]['displayname'][:2] + set_name(nm)
                    rungs.append({'ids': pieces, 'icon': pieces[1] if len(pieces) > 1 else pieces[0], 'set': True, **i})
                elif e.startswith('PET:'):
                    t = e[4:]
                    key = next((f'{t};{r}' for r in (4, 3, 5, 2, 1, 0) if f'{t};{r}' in items), None)
                    if not key:
                        print('missing pet', t)
                        continue
                    i = info(key)
                    i['name'] = '§6' + re.sub(r'^\[Lvl \{LVL\}\] ', '', plain(items[key]['displayname'])) + ' Pet'
                    rungs.append({'ids': [t], 'icon': f'PET_{t}', 'pet': True, **i})
                elif e in items:
                    rungs.append({'ids': [e], 'icon': e, **info(e)})
                else:
                    print('missing', e)
            tracks.append({'name': label, 'rungs': rungs})
        out.append({'id': sk['id'], 'name': sk['name'], 'skill': sk['skill'], 'icon': sk['icon'], 'tracks': tracks})
    with open(os.path.join(ROOT, 'data', 'progress.json'), 'w', encoding='utf8') as f:
        json.dump({'sources': SOURCES, 'skills': out}, f, ensure_ascii=False, separators=(',', ':'))
    print(sum(len(t['rungs']) for s in out for t in s['tracks']), 'rungs')


def set_name(helmet_name):
    """'Helmet of Divan' -> 'Armor of Divan', 'Cropie Helmet' -> 'Cropie Armor'."""
    if re.search(r'\bArmor\b', helmet_name):
        return re.sub(r' (Helmet|Hat|Hood|Mask|Cap)$', '', helmet_name)
    n = re.sub(r'^(Helmet|Hat|Hood|Mask|Cap) of ', 'Armor of ', helmet_name)
    return re.sub(r' (Helmet|Hat|Hood|Mask|Cap)$', ' Armor', n)


if __name__ == '__main__':
    main(sys.argv[1])
