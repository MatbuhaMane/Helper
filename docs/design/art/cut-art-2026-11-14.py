# The owner's first images (2026-11-14, data/art/owner-2026-11-14/, git-ignored): the ones that are not the tree.
#   python docs/design/art/cut-art-2026-11-14.py [frame|sprites|scenes]     (from the repo root; numpy, scipy, Pillow)
import numpy as np, glob, os, sys, json
from PIL import Image
from scipy import ndimage as ndi

SRC = 'data/art/owner-2026-11-14/'
load = lambda n: np.asarray(Image.open(glob.glob(f'{SRC}{n}.*')[0]).convert('RGB')).astype(np.float32)

def unwhite(a, min_island=40, keep=150):
    """every near-white region out (enclosed ones too, unless tiny highlights), edges un-multiplied from white -> RGBA uint8"""
    mn, mx = a.min(-1), a.max(-1)
    bg = (mn >= 236) & (mx - mn < 16)
    lab, n = ndi.label(bg); sizes = ndi.sum(bg, lab, range(1, n + 1))
    bg &= np.isin(lab, 1 + np.flatnonzero(sizes >= min_island))
    fg = ~bg
    lab, n = ndi.label(fg); sizes = ndi.sum(fg, lab, range(1, n + 1))
    fg &= np.isin(lab, 1 + np.flatnonzero(sizes >= keep))
    alpha = fg.astype(np.float32)
    edge = ndi.binary_dilation(~fg, iterations=2) & fg
    ea = np.clip((255 - mn) / 215, 0.06, 1.0)
    rgb = a.copy(); alpha[edge] = ea[edge]
    rgb[edge] = 255 - (255 - a[edge]) / ea[edge][:, None]
    return np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)

def save(img, path, q=84):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, quality=q, alpha_quality=90, method=6); print(path, img.size, os.path.getsize(path) // 1024, 'KB')

def frame():
    # 4: a 9:16 border of olive branches. All the white goes, the inside too: the page shows through.
    img = Image.fromarray(unwhite(load(4)), 'RGBA')
    save(img.resize((558, 1000), Image.LANCZOS), 'public/assets/frames/olive-border.webp', q=72)

def sprite(rgba, path, side=256, pad=10):
    """trim to the drawing, contain it in a square (centred, resting on the bottom pad), webp"""
    img = Image.fromarray(rgba, 'RGBA'); img = img.crop(img.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
    k = (side - 2 * pad) / max(img.size); img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    out = Image.new('RGBA', (side, side)); out.alpha_composite(img, ((side - img.width) // 2, side - pad - img.height))
    save(out, path, q=86)

def auto_boxes(rgba, grow=8, min_area=8000):
    """the separate drawings on a sheet, as boxes, in reading order for a row layout (top row first, then by x)"""
    m = ndi.binary_dilation(rgba[..., 3] > 8, iterations=grow)
    lab, n = ndi.label(m); boxes = [s for s in ndi.find_objects(lab) if (s[0].stop - s[0].start) * (s[1].stop - s[1].start) >= min_area]
    rows = sorted(boxes, key=lambda s: s[0].start); out, row = [], []
    for s in rows:
        if row and s[0].start > row[0][0].stop - 40: out += sorted(row, key=lambda t: t[1].start); row = []
        row.append(s)
    return out + sorted(row, key=lambda t: t[1].start)

def sprites():
    # 6, the garage: each object cut by a box that stops above its drawn English label (labels are not ours to ship)
    a = unwhite(load(6))
    for name, (x0, y0, x1, y1) in {'robot-vacuum': (95, 150, 480, 410), 'car': (555, 160, 1130, 415), 'ev-charger': (1205, 100, 1455, 432),
                                   'floor-heating': (1530, 165, 1955, 405), 'tv': (155, 575, 720, 972), 'set-top-box': (945, 840, 1210, 955),
                                   'remote': (1545, 740, 1815, 950)}.items():
        sprite(a[y0:y1, x0:x1], f'public/assets/kit/garage/{name}.webp')
    for n, folder, names in ((7, 'garden', ['monstera', 'pothos', 'snake-plant', 'cactus', 'basil', 'mint', 'tomato', 'olive']),
                             (8, 'kitchen', ['measuring-jug', 'tablespoon', 'teaspoon', 'scale', 'timer'])):
        a = unwhite(load(n)); boxes = auto_boxes(a)
        assert len(boxes) == len(names), (n, len(boxes))
        for name, (sy, sx) in zip(names, boxes):
            part = a[sy, sx].copy()
            if name == 'measuring-jug':   # glass: the whole body is frosted glass (a white veil), its lines solid; no holes
                raw = load(n)[sy, sx]
                sil = ndi.binary_fill_holes(ndi.binary_closing(part[..., 3] > 8, iterations=5))
                veil = np.clip(0.42 + (255 - raw.min(-1)) / 60, 0.42, 1.0)
                part = np.dstack([raw, np.where(sil, veil, 0) * 255]).astype(np.uint8)
            sprite(part, f'public/assets/kit/{folder}/{name}.webp')

what = sys.argv[1:] or ['frame', 'sprites', 'scenes']
for w in what: globals()[w]()
