# The olive with seats (the owner's image 27, 2026-11-14): one clean drawing, no circles in it. The 20 seats are placed here in
# code, the same way as the pine (cut-tree-pine-seats.py): slots.json with perRow 4, tiers bottom-first, the same spot in every
# season. The app draws a ring only where a person sits (tree.css), so the shipped picture has no circles.
# The owner's seasons (autumn, light snow, heavy snow, spring) will be edits of 27 without circles: drop each into SEASONS.
#   python docs/design/cut-tree-olive-seats.py [--preview]   (from the repo root; numpy, scipy, Pillow)
# --preview also writes docs/design/art/olive-seats-preview.webp: the 20 seats drawn white with a thin ink ring, for the check.
#
# Zone 2 (the trunk, 50-80% of the height) is only ~25% of the width wide, so four seats do not fit on it. The low tier is an
# arc: two seats on the trunk where it splits (y 1170) and two higher, at the crown's lower lobes (y 1000).
import numpy as np, json, os, sys
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

SRC, OUT = 'data/art/owner-2026-11-14/', 'public/assets/tree/olea'
SEASONS = {'summer': '27.webp'}
X = lambda p: round(p * 13.34 + 4)            # % of the 1334 box -> source px
SEATS = [                                     # centres in source px, bottom tier first
    ('roots', [(X(26), 1730), (X(41), 1730), (X(59), 1730), (X(74), 1730)]),
    ('low',   [(X(21), 1070), (X(43.5), 1240), (X(57.5), 1240), (X(80), 1070)]),
    ('mid',   [(X(22), 790), (X(40), 790), (X(60), 790), (X(78), 790)]),
    ('crown', [(X(24), 520), (X(41), 520), (X(59), 520), (X(76), 520)]),
    ('top',   [(X(29), 250), (X(43), 250), (X(57), 250), (X(71), 250)]),
]
R_DISC = 67                                   # the same seat as the pine's (10.04% of the width)
os.makedirs(OUT, exist_ok=True)
load = lambda f: np.asarray(Image.open(SRC + f).convert('RGB')).astype(np.float32)

def cutout(a):
    """the white out, edges un-multiplied from white, the thin cream rim (as the pine), into the 1334 x 2001 box"""
    H = a.shape[0]
    mn, mx = a.min(-1), a.max(-1)
    bg = (mn >= 236) & (mx - mn < 16)
    lab, n = ndi.label(bg); sizes = ndi.sum(bg, lab, range(1, n + 1))
    bg &= np.isin(lab, 1 + np.flatnonzero(sizes >= 40))
    fg = ~bg
    lab, n = ndi.label(fg); sizes = ndi.sum(fg, lab, range(1, n + 1))
    fg &= np.isin(lab, 1 + np.flatnonzero(sizes >= 150))
    near_bg = ndi.binary_dilation(~fg, iterations=2) & fg
    alpha = fg.astype(np.float32)
    rgb = a.copy()
    ea = np.clip((255 - mn) / 215, 0.08, 1.0)
    alpha[near_bg] = ea[near_bg]
    rgb[near_bg] = 255 - (255 - a[near_bg]) / ea[near_bg][:, None]
    RIM, RIM_W = np.array([241, 223, 189], np.float32), 2.6
    edge = near_bg & (alpha < 1) & ~ndi.binary_erosion(fg)
    rgb[edge] = rgb[edge] * alpha[edge][:, None] + RIM * (1 - alpha[edge][:, None]); alpha[edge] = 1
    dist = ndi.distance_transform_edt(~fg)
    ring = ~fg & (dist <= RIM_W + 1)
    alpha[ring] = np.clip(RIM_W + 0.5 - dist[ring], 0, 1) * 0.92
    rgb[ring] = RIM
    full = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
    out = np.zeros((2001, 1334, 4), np.uint8); out[:H] = full[:, 4:4 + 1334]
    return Image.fromarray(out, 'RGBA')

for season, f in SEASONS.items():
    img = cutout(load(f)).resize((1000, 1500), Image.LANCZOS)
    p = f'{OUT}/tree-{season}.webp'
    img.save(p, quality=80, alpha_quality=85, method=6)
    print(season, os.path.getsize(p) // 1024, 'KB')
    if '--preview' in sys.argv and season == 'summer':
        prev = Image.new('RGBA', img.size, (255, 255, 255, 255)); prev.alpha_composite(img)
        d = ImageDraw.Draw(prev); k = 1000 / 1334
        for _, s in SEATS:
            for x, y in s:
                cx, cy, r = (x - 4) * k, y * k, R_DISC * k
                d.ellipse((cx - r, cy - r, cx + r, cy + r), fill='white', outline=(49, 35, 31), width=3)
        prev.convert('RGB').resize((500, 750), Image.LANCZOS).save('docs/design/art/olive-seats-preview.webp', quality=80)

pct = lambda sx, sy: [round((sx - 4) / 1334 * 100, 2), round(sy / 2001 * 100, 2)]
notes = {'roots': 'the eldest, the forebears: on the roots and the earth',
         'low': 'grandparents: two on the trunk where it splits, two at the crown\'s lower lobes',
         'mid': 'parents: the crown\'s lower half', 'crown': 'you, your siblings and cousins: the middle of the crown',
         'top': 'children and grandchildren: the top of the crown'}
slots = {
    'box': [1000, 1500], 'ext': 'webp', 'layers': [],
    'seat': round(2 * R_DISC / 1334 * 100, 2), 'perRow': 4,
    'crownPivot': [50, 30], 'trunkPivot': pct(X(50), 1300), 'candleY': 94.5,
    'tiers': [{'name': n, 'note': notes[n], 'line': [pct(x, y) for x, y in s]} for n, s in SEATS],
}
json.dump(slots, open(f'{OUT}/slots.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print('seat', slots['seat'], '%')
