"""Download SkyBlock item icons into icons/ so the site can serve them itself.

Item IDs come from the public Hypixel item list plus every item mentioned in the
NEU item repo zip (pets, enchanted books, recipe ingredients...). Icons come from
sky.coflnet.com. Existing files are skipped, so re-running only fetches new items.

usage: python -I scripts/fetch_icons.py [NotEnoughUpdates-REPO-master.zip]
       (run from the repo root)
"""
import concurrent.futures
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

OUT = 'icons'
ICON_URL = 'https://sky.coflnet.com/static/icon/'
UA = {'User-Agent': 'ace-hypixel-icon-sync/1.0'}


def icon_file(item_id):
    """Must match iconFile() in ironman/app.js."""
    return re.sub(r'[^A-Za-z0-9_]', lambda m: '-%d-' % ord(m.group(0)), item_id) + '.png'


def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return 404, b''
            time.sleep(1 + i * 2)
        except Exception:
            time.sleep(1 + i * 2)
    return 0, b''


def collect_ids(zip_path):
    ids = set()
    status, body = get('https://api.hypixel.net/v2/resources/skyblock/items')
    if status == 200:
        ids.update(i['id'] for i in json.loads(body)['items'])
    if zip_path:
        z = zipfile.ZipFile(zip_path)
        for n in z.namelist():
            if '/items/' in n and n.endswith('.json'):
                ids.add(urllib.parse.unquote(n.rsplit('/', 1)[1][:-5]))
    return sorted(ids)


def main():
    os.makedirs(OUT, exist_ok=True)
    ids = collect_ids(sys.argv[1] if len(sys.argv) > 1 else None)
    todo = [i for i in ids if not os.path.exists(os.path.join(OUT, icon_file(i)))]
    print(f'{len(ids)} item ids, {len(todo)} to download')
    ok = missing = failed = 0

    def fetch(item_id):
        status, data = get(ICON_URL + urllib.parse.quote(item_id, safe=''))
        if status == 200 and data[:8] == b'\x89PNG\r\n\x1a\n':
            with open(os.path.join(OUT, icon_file(item_id)), 'wb') as f:
                f.write(data)
            return 'ok'
        return 'missing' if status == 404 else 'failed'

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for n, res in enumerate(pool.map(fetch, todo), 1):
            ok += res == 'ok'; missing += res == 'missing'; failed += res == 'failed'
            if n % 500 == 0:
                print(f'  {n}/{len(todo)}  ok={ok} missing={missing} failed={failed}', flush=True)

    files = [f for f in os.listdir(OUT) if f.endswith('.png')]
    size = sum(os.path.getsize(os.path.join(OUT, f)) for f in files)
    with open(os.path.join(OUT, 'index.json'), 'w') as f:
        json.dump(sorted(files), f, separators=(',', ':'))
    print(f'done: ok={ok} missing={missing} failed={failed}; {len(files)} icons, {size / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
