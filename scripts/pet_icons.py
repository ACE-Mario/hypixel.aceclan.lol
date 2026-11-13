"""Make icons/PET_<TYPE>.png pet head icons from the skin each NEU pet item uses (front face + hat layer).

usage: python -I scripts/pet_icons.py NotEnoughUpdates-REPO-master.zip TYPE [TYPE ...]   (or 'all')
"""
import base64
import io
import json
import os
import re
import sys
import urllib.request
import zipfile
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {'User-Agent': 'ace-hypixel-icon-sync/1.0'}


def main(zpath, types):
    z = zipfile.ZipFile(zpath)
    root = z.namelist()[0].split('/')[0]
    names = [n for n in z.namelist() if re.search(r'/items/[A-Z0-9_]+;\d\.json$', n)]
    # Runes and other items use the same TYPE;N file names, so 'all' means every real pet type.
    pets = set(json.loads(z.read(f'{root}/constants/petnums.json').decode('utf8')))
    pets |= set(json.loads(z.read(f'{root}/constants/pets.json').decode('utf8')).get('pet_types', {}))
    by_type = {}
    for n in sorted(names):
        t, r = n.split('/')[-1][:-5].split(';')
        if (types == ['all'] and t in pets) or t in types:
            if t not in by_type or r == '4':
                by_type[t] = n
    for t, n in sorted(by_type.items()):
        out = os.path.join(ROOT, 'icons', f'PET_{t}.png')
        if os.path.exists(out):
            continue
        j = json.loads(z.read(n))
        m = re.search(r'Value:"([A-Za-z0-9+/=]+)"', j.get('nbttag', ''))
        if not m:
            print('no skin', t)
            continue
        url = json.loads(base64.b64decode(m.group(1)))['textures']['SKIN']['url'].replace('http://', 'https://')
        skin = Image.open(io.BytesIO(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20).read())).convert('RGBA')
        face = skin.crop((8, 8, 16, 16))
        hat = skin.crop((40, 8, 48, 16))
        face.alpha_composite(hat)
        face.resize((16, 16), Image.NEAREST).save(out)
        print('made', t)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2:])
