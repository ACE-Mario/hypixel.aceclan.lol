"""Build data/shards.json + data/fusion.json and fetch shard icons.

Sources:
  * NotEnoughUpdates item repo: shard list, alignment, Hunting Skill requirements.
  * SkyShards (https://github.com/Campionnn/SkyShards, MIT licence, copy in
    data/SKYSHARDS-LICENSE.txt): effect text with level ranges, how to obtain each
    shard, base hunting rates (shards per hour) and every fusion recipe.

Icons that are missing from icons/ are downloaded from sky.coflnet.com.

Run from the repo root:  python scripts/extract_shards.py
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

NEU = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/'
SKY = 'https://raw.githubusercontent.com/Campionnn/SkyShards/master/'
ICON = 'https://sky.coflnet.com/static/icon/'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {'User-Agent': 'ace-hypixel-tools'}

# Shards whose rate ignores Hunting Fortune (from SkyShards src/constants/shards.ts).
NO_FORTUNE = ["C19", "U4", "U16", "U28", "R24", "R25", "R27", "R60", "R64", "L4", "L15", "L30", "L33", "L48", "L51"]


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def clean(s):
    s = re.sub('§.', '', s)
    # Drop resource-pack stat symbols (private-use characters) and stray surrogates.
    return ''.join(c for c in s if not (0xE000 <= ord(c) <= 0xF8FF or 0xD800 <= ord(c) <= 0xDFFF or c == '�'))


def segs(parts):
    """SkyShards text segments -> compact [[text, colour, bold?] | {r:[min,max], u, c}]."""
    out = []
    for p in parts:
        if 'range' in p:
            out.append({'r': p['range'], 'u': p.get('unit', ''), 'c': p.get('c', 'gray')})
        else:
            t = clean(p.get('t', ''))
            if not t:
                continue
            seg = [t, p.get('c', 'gray')]
            if p.get('bold'):
                seg.append(1)
            out.append(seg)
    # collapse double spaces left behind by removed symbols
    text = [s for s in out if isinstance(s, list)]
    for s in text:
        s[0] = re.sub(r' {2,}', ' ', s[0])
    return out


def neu_req(a):
    try:
        d = json.loads(get(NEU + 'items/' + urllib.parse.quote(a['internalName']) + '.json'))
    except Exception:  # noqa: BLE001
        return None
    for line in d.get('lore', []):
        m = re.search(r'Requires (.+?)\.?$', clean(line).strip())
        if m:
            return m.group(1)
    return None


def fetch_icon(name, idx):
    fn = name + '.png'
    if fn in idx:
        return None
    try:
        data = get(ICON + urllib.parse.quote(name))
        if data[:4] != b'\x89PNG':
            return None
        with open(os.path.join(ROOT, 'icons', fn), 'wb') as f:
            f.write(data)
        return fn
    except Exception:  # noqa: BLE001
        return None


def main():
    neu = json.loads(get(NEU + 'constants/attribute_shards.json'))
    fusion = json.loads(get(SKY + 'public/fusion-data.json'))
    rates = json.loads(get(SKY + 'public/rates.json'))
    desc = json.loads(get(SKY + 'src/desc.json'))
    lic = get(SKY + 'LICENSE').decode('utf-8')

    attrs = {a['shardId']: a for a in neu['attributes']}
    with ThreadPoolExecutor(16) as ex:
        reqs = dict(zip(attrs, ex.map(neu_req, attrs.values())))

    shards = []
    for code, s in fusion['shards'].items():
        a = attrs.get(code, {})
        d = desc.get(code, {})
        name = s['name']
        shards.append({
            'code': code,
            'id': s['internal_id'],
            'name': name,
            'rarity': s['rarity'].upper(),
            'alignment': a.get('alignment', ''),
            'family': a.get('family') or [s['family'].replace(' Family', '')],
            'type': s.get('type', ''),
            'ability': a.get('abilityName') or d.get('title', ''),
            'desc': segs(d.get('description', [])),
            'hunt': [segs(line) for line in d.get('how_to_hunt', [])],
            'rate': rates.get(code, 0),
            'noFortune': code in NO_FORTUNE,
            'fuse': s['fuse_amount'],
            'req': reqs.get(code),
            'wiki': 'https://hypixelskyblock.minecraft.wiki/w/' + urllib.parse.quote(name.replace(' ', '_') + '_Shard'),
        })
    order = {'C': 0, 'U': 1, 'R': 2, 'E': 3, 'L': 4}
    shards.sort(key=lambda x: (order[x['code'][0]], int(x['code'][1:])))

    with open(os.path.join(ROOT, 'data', 'shards.json'), 'w', encoding='utf-8') as f:
        json.dump({'levelling': neu['attribute_levelling'], 'shards': shards}, f, ensure_ascii=False, separators=(',', ':'))
    print(f'data/shards.json: {len(shards)} shards')

    # Fusion recipes, compacted: {output: {outputQty: "A,B;C,D;..."}}
    recipes = {o: {q: ';'.join(a + ',' + b for a, b in pairs) for q, pairs in d.items()} for o, d in fusion['recipes'].items()}
    with open(os.path.join(ROOT, 'data', 'fusion.json'), 'w', encoding='utf-8') as f:
        json.dump(recipes, f, separators=(',', ':'))
    print(f'data/fusion.json: recipes for {len(recipes)} shards')
    with open(os.path.join(ROOT, 'data', 'SKYSHARDS-LICENSE.txt'), 'w', encoding='utf-8') as f:
        f.write('Shard descriptions, hunting rates and fusion recipes in shards.json and fusion.json\n'
                'come from SkyShards (https://github.com/Campionnn/SkyShards).\n\n' + lic)

    idx_path = os.path.join(ROOT, 'icons', 'index.json')
    idx = set(json.load(open(idx_path, encoding='utf-8')))
    with ThreadPoolExecutor(16) as ex:
        got = [x for x in ex.map(lambda s: fetch_icon(s['id'], idx), shards) if x]
    idx.update(got)
    with open(idx_path, 'w', encoding='utf-8') as f:
        json.dump(sorted(idx), f, separators=(',', ':'))
    print(f'icons: {len(got)} new shard icons')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
