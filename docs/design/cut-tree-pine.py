# The pine (אורן), the default family tree after vision batch 23: cut from the owner's image 16 into our layer set.
#   python docs/design/cut-tree-pine.py        (from the repo root; needs numpy, scipy and Pillow)
# Source: data/art/owner-2026-11-14/16.webp (git-ignored; the owner keeps the originals). 1342 x 2000, the tree on white.
# Output, in /assets/tree/pine/: ground.webp, boughs.webp, trunk.webp, crown.webp (one 1000 x 1500 box, drawn at 1334 x 2001),
#   and foliage.webp: the green clumps only, the mask for the season dress (--crown-mask).
#   - The seams: two faint lines across the trunk (rows 749-752 and 1453-1456), leftovers of the guide-line version (21),
#     are filled from the rows above and below where they are darker than that.
#   - Alpha: the white is taken out; the edge pixels are un-multiplied from white, so no white fringe on a dark page.
#   - A thin warm rim (cream, crisp) round the whole silhouette, as on the canopy: lost on the light page, an outline at night.
#   - The layers are a partition of the drawing, so at rest the stack is the drawing itself; each overlaps its neighbour by
#     a few px so the sway never opens a gap.
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
import json, os

SRC, OUT = 'data/art/owner-2026-11-14/16.webp', 'public/assets/tree/pine'
os.makedirs(OUT, exist_ok=True)
a = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
H, W = a.shape[:2]
lum = lambda x: x.mean(-1)

# 1. the seams: rows y0..y1 are rebuilt from the rows just outside them, only where the seam made them darker
for y0, y1 in ((748, 753), (1452, 1457)):
    top, bot = a[y0 - 1], a[y1 + 1]
    for y in range(y0, y1 + 1):
        t = (y - y0 + 1) / (y1 - y0 + 2)
        want = top * (1 - t) + bot * t
        dark = lum(a[y]) < lum(want) - 12
        a[y][dark] = want[dark]

# 2. background: near-white and neutral; small white islands inside the drawing are highlights, kept
mn, mx = a.min(-1), a.max(-1)
bg = (mn >= 236) & (mx - mn < 16)
lab, n = ndi.label(bg)
sizes = ndi.sum(bg, lab, range(1, n + 1))
bg &= np.isin(lab, 1 + np.flatnonzero(sizes >= 40))
fg = ~bg
lab, n = ndi.label(fg)
sizes = ndi.sum(fg, lab, range(1, n + 1))
fg &= np.isin(lab, 1 + np.flatnonzero(sizes >= 150))
print('pieces kept', int((sizes >= 150).sum()), '| dropped', int((sizes < 150).sum()))

# 3. edge alpha (un-multiply from white) and the rim outside
near_bg = ndi.binary_dilation(~fg, iterations=2) & fg
alpha = np.where(fg, 1.0, 0.0).astype(np.float32)
rgb = a.copy()
ea = np.clip((255 - a.min(-1)) / 215, 0.08, 1.0)
alpha[near_bg] = ea[near_bg]
rgb[near_bg] = 255 - (255 - a[near_bg]) / ea[near_bg][:, None]
RIM, RIM_W = np.array([241, 223, 189], np.float32), 2.6
edge = near_bg & (alpha < 1) & ~ndi.binary_erosion(fg)          # the outermost drawing pixels: solid over the rim
rgb[edge] = rgb[edge] * alpha[edge][:, None] + RIM * (1 - alpha[edge][:, None]); alpha[edge] = 1
dist = ndi.distance_transform_edt(~fg)
ring = ~fg & (dist <= RIM_W + 1)
alpha[ring] = np.clip(RIM_W + 0.5 - dist[ring], 0, 1) * 0.92
rgb[ring] = RIM
full = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)

# 4. the parts, in source px (the drawing: crown cluster above y 430, three bough tiers, the trunk column, the roots and earth)
yy, xx = np.mgrid[0:H, 0:W]
def poly(pts):
    from PIL import ImageDraw
    m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon(pts, fill=1); return np.asarray(m).astype(bool)
trunk_poly = poly([(600, 420), (745, 420), (758, 760), (770, 1100), (790, 1400), (850, 1560), (1000, 1735),
                   (320, 1735), (480, 1560), (545, 1400), (565, 1100), (585, 760)])
crown = yy < 445
ground = (yy >= 1720) | ((yy >= 1560) & ~trunk_poly)
trunk = trunk_poly & ~crown & ~ground
boughs = ~crown & ~ground & ~trunk
OV = 4                                                            # the overlap, px: each moving layer reaches under its neighbour
grow = lambda m: ndi.binary_dilation(m, iterations=OV)
parts = {'ground': grow(ground), 'boughs': grow(boughs), 'trunk': trunk | (grow(trunk) & (yy > 445)), 'crown': grow(crown)}
# the foliage: everything above the earth that is not the red-brown bark (the needles are green, their outline near black),
# opened to drop the thin twigs, closed and filled, a little grown to take in the clumps' dark outline
g = ~(a[..., 0] > a[..., 1] + 12) & (a[..., 1] >= a[..., 2] - 4) & fg & ~(trunk_poly & (yy > 1030)) & (yy < 1500)
fol = ndi.binary_fill_holes(ndi.binary_closing(ndi.binary_opening(g, iterations=2), iterations=4))
lab, n = ndi.label(fol); sizes = ndi.sum(fol, lab, range(1, n + 1))
fol = ndi.binary_dilation(np.isin(lab, 1 + np.flatnonzero(sizes >= 600)), iterations=3) & (alpha > 0)

# 5. into the 1000 x 1500 box: the source is cropped to 2:3 (x 4..1338) and padded one row at the bottom
X0, CW, CH = 4, 1334, 2001
def place(img):
    out = np.zeros((CH, CW, 4), np.uint8); out[:H] = img[:, X0:X0 + CW]; return Image.fromarray(out, 'RGBA')
for name, m in parts.items():
    layer = full.copy(); layer[..., 3] = np.where(m, layer[..., 3], 0)
    place(layer).save(f'{OUT}/{name}.webp', quality=84, alpha_quality=90, method=6)
mask = np.zeros((H, W, 4), np.uint8); mask[..., 3] = (fol * 255).astype(np.uint8)
place(mask).resize((667, 1000), Image.LANCZOS).save(f'{OUT}/foliage.webp', quality=70, alpha_quality=80, method=6)
for f in sorted(os.listdir(OUT)): print(f, os.path.getsize(f'{OUT}/{f}') // 1024, 'KB')

# 6. slots.json: the tiers follow the clumps (the circles of the guide version 21 sat at x 31/43/57/69 % on these rows)
pct = lambda sx, sy: [round((sx - X0) / CW * 100, 1), round(sy / CH * 100, 1)]
slots = {
  'box': [1000, 1500], 'ext': 'webp',
  'crownPivot': pct(671, 440), 'trunkPivot': pct(671, 1100), 'candleY': 94.5,
  'tiers': [
    {'name': 'roots', 'note': 'the eldest, the forebears: on the roots and the earth', 'line': [pct(240, 1685), pct(520, 1670), pct(820, 1670), pct(1100, 1685)]},
    {'name': 'low', 'note': 'grandparents: the low boughs, either side of the trunk', 'line': [pct(230, 1268), pct(470, 1256), pct(870, 1256), pct(1110, 1268)]},
    {'name': 'mid', 'note': 'parents: the wide middle boughs', 'line': [pct(140, 925), pct(430, 912), pct(910, 912), pct(1200, 925)]},
    {'name': 'crown', 'note': 'you, your siblings and cousins: the upper boughs', 'line': [pct(150, 572), pct(430, 560), pct(910, 560), pct(1190, 572)]},
    {'name': 'top', 'note': 'children and grandchildren: across the crown', 'line': [pct(330, 228), pct(560, 215), pct(780, 215), pct(1010, 228)]},
  ],
}
json.dump(slots, open(f'{OUT}/slots.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(json.dumps(slots['crownPivot']), slots['tiers'][0]['line'])
