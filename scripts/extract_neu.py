"""Build minions.json and forge.json for the ACE Hypixel tools from a NEU-REPO zip.

usage: python -I extract.py <repo.zip> <out_dir>
"""
import json
import re
import sys
import zipfile

zip_path, out_dir = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(zip_path)
prefix = next(n for n in z.namelist() if n.endswith('/items/')).rsplit('items/', 1)[0]

items = {}
for n in z.namelist():
    if n.startswith(prefix + 'items/') and n.endswith('.json'):
        try:
            d = json.loads(z.read(n).decode('utf-8'))
        except Exception:
            continue
        items[d.get('internalname') or n.rsplit('/', 1)[1][:-5]] = d

SLOTS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3']


def stack(s):
    if not s:
        return None
    i = s.rfind(':')
    if i < 0:
        return s, 1.0
    try:
        return s[:i], float(s[i + 1:])
    except ValueError:
        return s, 1.0


def merge(stacks):
    out = {}
    for st in stacks:
        if st:
            out[st[0]] = out.get(st[0], 0) + st[1]
    return [[k, int(v) if v == int(v) else v] for k, v in out.items()]


def color_name(d):
    s = (d.get('displayname') or '').replace('Â', '')
    s = re.sub(r'\[Lvl \{LVL\}\]\s*', '', s)
    m = re.search(r'§([0-9a-f])', s)
    return (m.group(1) if m else 'f'), re.sub(r'§.', '', s).strip()


def craft_recipe(d):
    if d.get('recipe'):
        return d['recipe']
    for r in d.get('recipes') or []:
        if r.get('type') == 'crafting':
            return r
    return None


def req_text(d):
    return re.sub(r'^Requires:?\s*', '', d.get('crafttext') or '', flags=re.I).strip()


names = {}


def note(i):
    if i in items and i not in names:
        c, n = color_name(items[i])
        names[i] = [c, n]


# ---- minions ----
minions = {}
for iid, d in items.items():
    m = re.fullmatch(r'(.+)_GENERATOR_(\d+)', iid)
    if not m:
        continue
    base, tier = m.group(1), int(m.group(2))
    lore = '\n'.join(d.get('lore') or [])
    plain = re.sub(r'§.', '', lore)
    tba = re.search(r'Time Between Actions:\s*([\d.]+)s', plain)
    sto = re.search(r'Max Storage:\s*([\d,]+)', plain)
    color, nm = color_name(d)
    r = craft_recipe(d)
    inputs = []
    if r:
        inputs = [x for x in merge(stack(r.get(k)) for k in SLOTS) if not x[0].endswith('_GENERATOR_%d' % (tier - 1))]
        for x in inputs:
            note(x[0])
    entry = minions.setdefault(base, {'name': re.sub(r'\s+[IVXL]+$', '', nm), 'tiers': {}})
    entry['tiers'][tier] = {
        't': float(tba.group(1)) if tba else None,
        's': int(sto.group(1).replace(',', '')) if sto else None,
        'in': inputs,
        'req': req_text(d),
    }

minion_out = []
for base, e in sorted(minions.items(), key=lambda kv: kv[1]['name']):
    tiers = [dict(tier=t, **v) for t, v in sorted(e['tiers'].items())]
    if not any(t['t'] for t in tiers):
        continue
    minion_out.append({'id': base, 'name': e['name'], 'tiers': tiers})

# ---- forge ----
forge = []
for iid, d in items.items():
    for r in d.get('recipes') or []:
        if r.get('type') != 'forge':
            continue
        inputs = merge(stack(s) for s in r.get('inputs') or [])
        coins = 0
        clean = []
        for k, v in inputs:
            if k == 'SKYBLOCK_COIN':
                coins += v
            else:
                clean.append([k, v])
                note(k)
        color, nm = color_name(d)
        forge.append({'id': iid, 'name': nm, 'c': color, 'dur': r.get('duration') or 0,
                      'count': r.get('count') or 1, 'in': clean, 'coins': coins, 'req': req_text(d)})
        break
forge.sort(key=lambda f: f['name'])

with open(out_dir + '/minions.json', 'w', encoding='utf-8') as f:
    json.dump({'minions': minion_out, 'names': {k: v for k, v in names.items() if any(k == x[0] for m in minion_out for t in m['tiers'] for x in t['in'])}}, f, ensure_ascii=False, separators=(',', ':'))
with open(out_dir + '/forge.json', 'w', encoding='utf-8') as f:
    json.dump({'forge': forge, 'names': {k: v for k, v in names.items() if any(k == x[0] for fr in forge for x in fr['in'])}}, f, ensure_ascii=False, separators=(',', ':'))

print('minions', len(minion_out), 'forge', len(forge))
