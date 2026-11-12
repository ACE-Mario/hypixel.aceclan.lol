"""Build data/accessories.json for the Talisman tracker.

Sources:
  * Hypixel's public items list (api.hypixel.net/v2/resources/skyblock/items): every
    accessory, its rarity and requirements.
  * NotEnoughUpdates item repo: upgrade lines (constants/misc.json talisman_upgrades),
    accessories that don't count (ignored_talisman), and how each one is made
    (crafting, forge, NPC shop...) plus its wiki link.

Run from the repo root:  python scripts/extract_accessories.py
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

NEU = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/'
ITEMS = 'https://api.hypixel.net/v2/resources/skyblock/items'
ICON = 'https://sky.coflnet.com/static/icon/'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {'User-Agent': 'ace-hypixel-tools'}
TIERS = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC', 'DIVINE', 'SPECIAL', 'VERY_SPECIAL', 'SUPREME']
# Accessories that count as one (only one of each group adds Magical Power), from SkyCrypt's list.
ALIASES = {
    'WEDDING_RING_0': ['WEDDING_RING_1'], 'WEDDING_RING_2': ['WEDDING_RING_3'],
    'WEDDING_RING_4': ['WEDDING_RING_5', 'WEDDING_RING_6'], 'WEDDING_RING_7': ['WEDDING_RING_8'],
    'CAMPFIRE_TALISMAN_1': ['CAMPFIRE_TALISMAN_2', 'CAMPFIRE_TALISMAN_3'],
    'CAMPFIRE_TALISMAN_4': ['CAMPFIRE_TALISMAN_5', 'CAMPFIRE_TALISMAN_6', 'CAMPFIRE_TALISMAN_7'],
    'CAMPFIRE_TALISMAN_8': ['CAMPFIRE_TALISMAN_9', 'CAMPFIRE_TALISMAN_10', 'CAMPFIRE_TALISMAN_11', 'CAMPFIRE_TALISMAN_12'],
    'CAMPFIRE_TALISMAN_13': ['CAMPFIRE_TALISMAN_%d' % i for i in range(14, 21)],
    'CAMPFIRE_TALISMAN_21': ['CAMPFIRE_TALISMAN_%d' % i for i in range(22, 30)],
    'PARTY_HAT_CRAB': ['PARTY_HAT_CRAB_ANIMATED', 'PARTY_HAT_SLOTH', 'BALLOON_HAT_2024'],
    'PIGGY_BANK': ['BROKEN_PIGGY_BANK', 'CRACKED_PIGGY_BANK'],
    'DANTE_TALISMAN': ['DANTE_RING'],
}
EXTRA_IGNORED = {'ARGOFAY_TRINKET', 'GENERAL_MEDALLION'}
HOW = {'crafting': 'craft', 'forge': 'forge', 'npc_shop': 'npc', 'trade': 'trade', 'katgrade': 'kat'}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def clean(s):
    s = re.sub('§.', '', s or '')
    return ''.join(c for c in s if not (0xE000 <= ord(c) <= 0xF8FF or 0xD800 <= ord(c) <= 0xDFFF)).strip()


def pretty(s):
    return ' '.join(w.capitalize() for w in str(s).replace('_', ' ').lower().split())


ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']


def requirement(r):
    t = r.get('type')
    if t == 'SLAYER':
        boss = {'zombie': 'Revenant', 'spider': 'Tarantula', 'wolf': 'Sven', 'enderman': 'Voidgloom', 'blaze': 'Inferno',
                'vampire': 'Riftstalker'}.get(r.get('slayer_boss_type'), pretty(r.get('slayer_boss_type')))
        return f"{boss} Slayer {r.get('level')}"
    if t == 'SKILL':
        return f"{pretty(r.get('skill'))} {r.get('level')}"
    if t == 'COLLECTION':
        tier = r.get('tier', 0)
        return f"{pretty(r.get('collection'))} Collection {ROMAN[tier] if tier < len(ROMAN) else tier}"
    if t == 'DUNGEON_TIER':
        return f"Catacombs floor {r.get('tier')}"
    if t == 'DUNGEON_SKILL':
        return f"Catacombs {r.get('level')}"
    if t == 'HEART_OF_THE_MOUNTAIN':
        return f"HotM {r.get('tier')}"
    if t == 'GARDEN_LEVEL':
        return f"Garden {r.get('level')}"
    if t == 'MELODY_HAIR':
        return None
    return pretty(t) if t else None


def neu_item(id_):
    try:
        return json.loads(get(NEU + 'items/' + urllib.parse.quote(id_) + '.json'))
    except Exception:
        return None


def main():
    items = json.loads(get(ITEMS))['items']
    misc = json.loads(get(NEU + 'constants/misc.json'))
    acc = [i for i in items if i.get('category') == 'ACCESSORY']
    ignored = set(misc.get('ignored_talisman', [])) | EXTRA_IGNORED

    # Upgrade lines: a root and everything it upgrades into, lowest first.
    ups = misc.get('talisman_upgrades', {})
    children = {c for v in ups.values() for c in v}
    family = {}
    for root, chain in ups.items():
        if root in children:
            continue
        for rank, i in enumerate([root] + chain):
            family.setdefault(i, (root, rank))
    alias_of = {}
    for key, others in ALIASES.items():
        for o in others:
            alias_of[o] = key
            family[o] = family.get(key, (key, 0))
        family.setdefault(key, (key, 0))

    with ThreadPoolExecutor(16) as ex:
        neu = dict(zip([a['id'] for a in acc], ex.map(neu_item, [a['id'] for a in acc])))

    out = []
    for a in sorted(acc, key=lambda x: x['name']):
        id_ = a['id']
        n = neu.get(id_) or {}
        how = []
        if n.get('recipe'):
            how.append('craft')
        for r in n.get('recipes') or []:
            h = HOW.get(r.get('type'))
            if h and h not in how:
                how.append(h)
        req = [x for x in (requirement(r) for r in a.get('requirements', [])) if x]
        ct = clean(n.get('crafttext', '')).replace('Requires:', '').replace('Requires', '').strip()
        if ct and not req:
            req.append(ct)
        wiki = next((u for u in n.get('info', []) if str(u).startswith('http') and 'wiki' in u), None)
        fam = family.get(id_)
        rift_only = a.get('origin') == 'RIFT' and not a.get('rift_transferrable')
        e = {'id': id_, 'name': clean(a['name']), 'tier': a.get('tier') or 'COMMON'}
        if fam:
            e['fam'], e['rank'] = fam
        if how:
            e['how'] = how
        if req:
            e['req'] = req
        if wiki:
            e['wiki'] = wiki
        if id_ in ignored or rift_only or id_.startswith('BINGO_'):
            e['skip'] = 1  # doesn't count towards Magical Power, or can't be got on a normal profile
        if id_ in alias_of:
            e['alias'] = alias_of[id_]  # same as another accessory; only one of them counts
        if a.get('origin') == 'RIFT':
            e['rift'] = 1
        out.append(e)

    path = os.path.join(ROOT, 'data', 'accessories.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'accessories': out}, f, ensure_ascii=False, separators=(',', ':'))
    print(len(out), 'accessories,', sum(1 for e in out if 'fam' in e), 'in upgrade lines,',
          sum(1 for e in out if e.get('skip')), 'skipped ->', path)

    # Any icons we don't have yet
    os.makedirs(os.path.join(ROOT, 'icons'), exist_ok=True)
    missing = [e['id'] for e in out if not os.path.exists(os.path.join(ROOT, 'icons', e['id'] + '.png'))]

    def fetch(i):
        try:
            data = get(ICON + urllib.parse.quote(i))
            if data[:4] == b'\x89PNG':
                with open(os.path.join(ROOT, 'icons', i + '.png'), 'wb') as f:
                    f.write(data)
                return 1
        except Exception:
            pass
        return 0

    with ThreadPoolExecutor(8) as ex:
        print(sum(ex.map(fetch, missing)), 'of', len(missing), 'missing icons downloaded')


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
