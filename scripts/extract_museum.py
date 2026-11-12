"""Build data/museum.json for the Museum tracker.

Sources:
  * Hypixel's public items list: every museum item, its Museum XP, category, game stage and
    armour set (api.hypixel.net/v2/resources/skyblock/items).
  * NotEnoughUpdates repo zip: recipes (to break each item down to raw materials) and
    constants/museum.json (which higher items also count their lower tiers).
  * The public Bazaar product list, only to know where to stop breaking things down:
    anything sold on the Bazaar is treated as a raw material and priced live on the page.

usage: python -I scripts/extract_museum.py NotEnoughUpdates-REPO-master.zip
"""
import json
import os
import re
import sys
import urllib.request
import zipfile
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {'User-Agent': 'ace-hypixel-tools'}
SLOTS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3']
TCOL = {'COMMON': 'f', 'UNCOMMON': 'a', 'RARE': '9', 'EPIC': '5', 'LEGENDARY': '6', 'MYTHIC': 'd', 'DIVINE': 'b',
        'SPECIAL': 'c', 'VERY_SPECIAL': 'c', 'SUPREME': '4'}
HOW = {'crafting': 'craft', 'forge': 'forge', 'npc_shop': 'npc', 'trade': 'trade', 'katgrade': 'kat'}
COIN = 'SKYBLOCK_COIN'


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.loads(r.read())


def clean(s):
    s = re.sub('§.', '', s or '')
    return ''.join(c for c in s if not (0xE000 <= ord(c) <= 0xF8FF or 0xD800 <= ord(c) <= 0xDFFF)).strip()


def pretty(s):
    return ' '.join(w.capitalize() for w in str(s).replace('_', ' ').lower().split())


def stack(s):
    if not s or not isinstance(s, str):
        return None
    i = s.rfind(':')
    if i < 0:
        return s, 1.0
    try:
        return s[:i], float(s[i + 1:])
    except ValueError:
        return s, 1.0


def main(zip_path):
    z = zipfile.ZipFile(zip_path)
    neu = {}
    museum_c = None
    for n in z.namelist():
        if '/items/' in n and n.endswith('.json'):
            try:
                d = json.loads(z.read(n))
                neu[d.get('internalname') or os.path.basename(n)[:-5]] = d
            except Exception:
                pass
        elif n.endswith('constants/museum.json'):
            museum_c = json.loads(z.read(n))
    items = get('https://api.hypixel.net/v2/resources/skyblock/items')['items']
    api = {i['id']: i for i in items}
    bazaar = set(get('https://api.hypixel.net/v2/skyblock/bazaar')['products'])

    def recipe(id_):
        """(how, [(id, qty)], makes) for the first usable recipe, or None."""
        d = neu.get(id_)
        if not d:
            return None
        r = d.get('recipe')
        if r and any(r.get(k) for k in SLOTS):
            ins = [stack(r.get(k)) for k in SLOTS]
            return 'craft', [x for x in ins if x], float(r.get('count') or 1)
        for r in d.get('recipes') or []:
            t = r.get('type')
            if t == 'crafting':
                ins = [stack(r.get(k)) for k in SLOTS]
                return 'craft', [x for x in ins if x], float(r.get('count') or 1)
            if t == 'forge':
                return 'forge', [x for x in map(stack, r.get('inputs') or []) if x], float(r.get('count') or 1)
            if t == 'npc_shop':
                res = stack(r.get('result'))
                return 'npc', [x for x in map(stack, r.get('cost') or []) if x], res[1] if res else 1.0
            if t == 'trade':
                res = stack(r.get('result'))
                c = stack(r.get('cost'))
                return 'trade', [c] if c else [], res[1] if res else 1.0
            if t == 'katgrade':
                ins = [stack(r.get('input'))] + [stack(x) for x in r.get('items') or []]
                ins = [x for x in ins if x]
                if r.get('coins'):
                    ins.append((COIN, float(r['coins'])))
                return 'kat', ins, 1.0
        return None

    def how_of(id_):
        d = neu.get(id_) or {}
        out = []
        if d.get('recipe') and any(d['recipe'].get(k) for k in SLOTS):
            out.append('craft')
        for r in d.get('recipes') or []:
            h = HOW.get(r.get('type'))
            if h and h not in out:
                out.append(h)
        return out

    def breakdown(id_, qty, raw, path, top=True):
        """Add the raw materials for `qty` of id_ into raw. Bazaar items and drops are raw."""
        if id_ == COIN:
            raw[COIN] += qty
            return
        if not top and (id_ in bazaar or id_ in path or len(path) > 14):
            raw[id_] += qty
            return
        r = recipe(id_)
        if not r:
            raw[id_] += qty
            return
        _, ins, makes = r
        mult = qty / (makes or 1)
        for i, n in ins:
            breakdown(i, n * mult, raw, path | {id_}, False)

    # Lower tiers that count once a higher one is donated: higher -> [lower]
    higher_of = {}
    for i in items:
        for low, high in (i.get('museum_data', {}).get('parent') or {}).items():
            higher_of[low] = high
    for high, low in (museum_c or {}).get('children', {}).items():
        higher_of.setdefault(low, high)

    entries = {}
    sets = defaultdict(list)
    for i in items:
        md = i.get('museum_data')
        if not md:
            continue
        for s, xp in (md.get('armor_set_donation_xp') or {}).items():
            sets[s].append((i, xp))
        if 'donation_xp' in md:
            entries[i['id']] = {'id': i['id'], 'name': clean(i['name']), 'tier': i.get('tier') or 'COMMON',
                                'cat': md['category'], 'stage': md.get('game_stage'), 'xp': md['donation_xp']}

    for s, pieces in sets.items():
        names = [clean(p['name']) for p, _ in pieces]
        words = names[0].split()
        n = 0
        while n < len(words) and all(x.split()[:n + 1] == words[:n + 1] for x in names):
            n += 1
        name = ' '.join(words[:n]).rstrip("'s").strip() or pretty(s)
        if not re.search(r'(Armor|Set|Suit|Outfit|Equipment)$', name):
            name += ' Armor'
        p0 = pieces[0][0]
        entries[s] = {'id': s, 'name': name, 'tier': p0.get('tier') or 'COMMON', 'cat': p0['museum_data']['category'],
                      'stage': p0['museum_data'].get('game_stage'), 'xp': pieces[0][1],
                      'set': sorted([p['id'] for p, _ in pieces])}

    names = {}
    for e in entries.values():
        parts = e.get('set') or [e['id']]
        raw = defaultdict(float)
        how = []
        for p in parts:
            breakdown(p, 1, raw, frozenset())
            for h in how_of(p):
                if h not in how:
                    how.append(h)
        own = set(parts)
        raw = {k: round(v, 2) for k, v in raw.items() if v > 0 and k not in own}
        if raw:
            e['raw'] = raw
        if how:
            e['how'] = how
        d = neu.get(parts[0]) or {}
        req = clean(d.get('crafttext', '')).replace('Requires:', '').replace('Requires', '').strip()
        if req:
            e['req'] = req
        wiki = next((u for u in d.get('info', []) if str(u).startswith('http') and 'wiki' in u), None)
        if wiki:
            e['wiki'] = wiki
        if e['id'] in higher_of and higher_of[e['id']] in entries:
            e['up'] = higher_of[e['id']]
        for k in raw:
            if k == COIN or k in names:
                continue
            a = api.get(k)
            names[k] = [TCOL.get((a or {}).get('tier'), 'f'), clean(a['name']) if a else clean((neu.get(k) or {}).get('displayname')) or pretty(k)]
        if e.get('set'):
            for p in e['set']:
                a = api.get(p)
                names[p] = [TCOL.get((a or {}).get('tier'), 'f'), clean(a['name']) if a else pretty(p)]

    out = sorted(entries.values(), key=lambda e: (e['cat'], e['name']))
    path = os.path.join(ROOT, 'data', 'museum.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'entries': out, 'names': names, 'bazaar': sorted(k for k in names if k in bazaar)}, f,
                  ensure_ascii=False, separators=(',', ':'))
    stages = sorted({e['stage'] for e in out if e.get('stage')})
    print(len(out), 'museum entries (', sum(1 for e in out if e.get('set')), 'armour sets ),',
          sum(e['xp'] for e in out), 'total XP, stages', stages, '->', path)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main(sys.argv[1])
