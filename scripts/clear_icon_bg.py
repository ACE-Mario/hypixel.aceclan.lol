"""Make the solid square background of some item icons transparent (flood fill from the edges).

usage: python -I scripts/clear_icon_bg.py   (only touches 16x16 icons whose corners (at least three) share one opaque colour)
"""
import glob
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
done = []
for f in glob.glob(os.path.join(ROOT, 'icons', '*.png')):
    im = Image.open(f).convert('RGBA')
    w, h = im.size
    if w > 16:
        continue
    px = im.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = max(set(corners), key=corners.count)
    if corners.count(bg) < 3 or bg[3] != 255:   # the item itself may touch one corner
        continue
    stack = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    seen = set()
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h) or px[x, y] != bg:
            continue
        seen.add((x, y))
        px[x, y] = (0, 0, 0, 0)
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    im.save(f)
    done.append((os.path.basename(f), len(seen)))
print(len(done), done)
