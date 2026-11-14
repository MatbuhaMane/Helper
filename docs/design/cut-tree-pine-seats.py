# The pine with seats (the owner's decision, 2026-11-14): the trees drawn with 20 empty circles (21 summer, 20 autumn, 17 light
# snow, 18 heavy snow) are the family tree. The drawn circles are filled back in here, from the clean tree (16), so the shipped
# picture has only the clearings the circles left in the foliage; the app draws a ring only where a person sits (tree.css),
# so an empty seat is never seen.
#   python docs/design/cut-tree-pine-seats.py        (from the repo root; needs numpy, scipy and Pillow)
# Sources: data/art/owner-2026-11-14/ (git-ignored). All five are 1342 x 2000 and aligned to the pixel (the circles are within
# 1 px of each other in all four).
# Output, in /assets/tree/pine/: tree-summer|autumn|winter|snow.webp, one still picture per season, 1000 x 1500
#   (cut at 1334 x 2001, the same box as the layered pine before, then scaled), and slots.json with the seats.
#
# How a circle is filled (the circle with its outline is r <= 71 px, faded out to 75):
#   - from 16 at the same coordinates: its bark, its trunk and its sky as they are;
#   - 16's foliage clump by clump: a clump is kept where the seasonal tree has foliage round the circle there. The seasonal
#     trees were drawn with clearings round the middle and lower circles (bare boughs), so 16's clumps there would float as
#     green discs; there the sky is kept, and a kept clump that runs into that sky is bitten back and re-outlined.
#     In the crown and top tiers 16 goes in whole.
#   - the foliage taken from 16 keeps its drawing on the season's own colour field (the season's needles round the circle,
#     blurred smoothly over it, snow left out), so a patch in the autumn crown is yellow, not green.
#   - the guide lines (rows 421-428, 747-754, 1098-1106, 1451-1458) are filled from the rows above and below.
# Supersedes cut-tree-pine.py (the layered pine) and cut-pine-cones.py (the cones), kept as history.
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
import json, os

SRC, OUT = 'data/art/owner-2026-11-14/', 'public/assets/tree/pine'
SEASONS = {'summer': '21.webp', 'autumn': '20.webp', 'winter': '17.webp', 'snow': '18.webp'}
# the 20 circle centres in source px, bottom tier first (measured from the white discs, the same in all four trees)
SEATS = [
    ('roots', [(366, 1580), (574, 1580), (768, 1580), (972, 1580)]),
    ('low',   [(394, 1241), (578, 1241), (765, 1241), (948, 1241)]),
    ('mid',   [(394, 911), (578, 911), (764, 911), (950, 911)]),
    ('crown', [(394, 588), (578, 588), (766, 588), (950, 588)]),
    ('top',   [(414, 286), (582, 275), (760, 275), (928, 286)]),
]
R_FULL, R_FADE, R_DISC = 71, 75, 67          # filled to 71 px, faded out by 75; the drawn ring's outer edge is ~67 px
OUTLINE = np.array([44, 50, 36], np.float32)  # the clumps' own dark outline, for a clump's new edge
os.makedirs(OUT, exist_ok=True)
load = lambda f: np.asarray(Image.open(SRC + f).convert('RGB')).astype(np.float32)
clean = load('16.webp')
H, W = clean.shape[:2]
yy, xx = np.mgrid[0:H, 0:W]

def lines_out(a, rows):
    """thin horizontal lines: rebuilt from the rows just outside them, where they are darker"""
    for y0, y1 in rows:
        top, bot = a[y0 - 1].copy(), a[y1 + 1].copy()
        for y in range(y0, y1 + 1):
            t = (y - y0 + 1) / (y1 - y0 + 2)
            want = top * (1 - t) + bot * t
            dark = a[y].mean(-1) < want.mean(-1) - 12
            a[y][dark] = want[dark]

def foliage(a):
    """the needles: not background, not the red-brown bark (green, the autumn yellow, the snow on the clumps)"""
    mn = a.min(-1)
    bg = (mn >= 236) & (a.max(-1) - mn < 16)
    bark = (a[..., 0] > a[..., 1] + 12) & (a[..., 1] - a[..., 2] < 34)
    return ~bg & ~bark & (mn < 250)

lines_out(clean, ((748, 753), (1452, 1457)))              # 16's own faint seams (see cut-tree-pine.py)
f16 = foliage(clean)
fol16 = ndi.binary_dilation(ndi.binary_fill_holes(ndi.binary_closing(ndi.binary_opening(f16, iterations=2), iterations=4)), iterations=3)

def fill(a):
    out = a.copy()
    fa = foliage(a)
    for tier, seats in SEATS:
        for cx, cy in seats:
            P = R_FADE + 30
            y0, y1, x0, x1 = cy - P, cy + P, cx - P, cx + P
            sy, sx = slice(y0, y1), slice(x0, x1)
            d = np.hypot(xx[sy, sx] - cx, yy[sy, sx] - cy)
            ring = (d > R_FADE) & (d < R_FADE + 22)
            # the clean tree's foliage, clump by clump: a clump is kept when, outside the circle, the season has foliage
            # where the clump is (it continues a clump that is there); a clump wholly inside the circle follows the ring
            src = clean[sy, sx].copy()
            folp = fol16[sy, sx]
            lab, n = ndi.label(folp)
            keep = np.zeros_like(folp)
            out_ring = d > R_DISC + 3
            pa = a[sy, sx]
            dense = tier in ('crown', 'top')          # in the crown the season's drawing matches 16's: 16 goes in whole
            around = fa[sy, sx][ring].mean()
            for c in range(1, n + 1):
                comp = lab == c
                part = comp & out_ring
                ok = dense or (fa[sy, sx][part].mean() > 0.4 if part.sum() > 60 else around > 0.5)
                if ok: keep |= comp
            # where a kept clump runs out of the circle into the season's sky, it would end on the circle's own line (a disc):
            # it is bitten back from there, its new edge softened and given the clumps' dark outline, so it reads as drawn
            sky_out = (d > R_FULL) & (d < R_FADE + 6) & keep & ~ndi.binary_dilation(fa[sy, sx], iterations=4)
            if sky_out.any() and not dense:
                bite = ndi.distance_transform_edt(~sky_out) < 26
                k2 = ndi.gaussian_filter((keep & ~bite).astype(np.float32), 2.2) > 0.5
                cut = keep & ~k2
                keep = k2 & keep
                edge = keep & ndi.binary_dilation(cut, iterations=3) & ~ndi.binary_erosion(keep, iterations=1)
                edge = ndi.binary_dilation(edge, iterations=1) & keep
            else:
                edge = np.zeros_like(keep)
            # the kept foliage takes the season's colour: 16's drawing (its detail) on the season's own colour field, which is
            # the season's foliage outside the circle spread smoothly over it (a normalised blur), so a patch is yellow where
            # the clumps beside it are yellow and green where they are green
            def field(img, m, s=32):
                w = ndi.gaussian_filter(m.astype(np.float32), s) + 1e-3
                return np.dstack([ndi.gaussian_filter(img[..., c] * m, s) for c in range(3)]) / w[..., None], w
            mS = fa[sy, sx] & out_ring & (pa.min(-1) < 190)     # the needles' colour, not the snow on them
            if mS.sum() > 300:
                lowS, wS = field(pa, mS)
                low16, _ = field(src, folp)
                t = np.clip(wS / 0.03, 0, 1)[..., None]           # far from any season foliage: 16's own colour
                adj = np.clip(src + (lowS - low16) * t, 0, 255)
            else:
                adj = src
            folh = fol16[sy, sx]
            drop = folh & ~keep
            # soften the cut between kept and dropped foliage a little, so no straight radial edge shows
            soft = ndi.gaussian_filter(drop.astype(np.float32), 1.6)[..., None]
            val = np.where(folh[..., None], adj, src)
            val[edge] = OUTLINE
            val = val * (1 - soft) + 255 * soft
            m = np.clip((R_FADE - d) / (R_FADE - R_FULL), 0, 1)[..., None]
            out[sy, sx] = out[sy, sx] * (1 - m) + val * m
    return out

def cutout(a):
    """the white out, edges un-multiplied from white, the thin cream rim (as cut-tree-pine.py), into the 1334 x 2001 box"""
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
    a = load(f)
    lines_out(a, ((421, 428), (747, 754), (1098, 1106), (1451, 1458)))
    img = cutout(fill(a))
    p = f'{OUT}/tree-{season}.webp'
    img = img.resize((1000, 1500), Image.LANCZOS)     # 1000 px: sharp at the tree's widest (760 css px) on a phone's 3x
    img.save(p, quality=80, alpha_quality=85, method=6)
    print(season, os.path.getsize(p) // 1024, 'KB')

# slots.json: the seats, in % of the box (x from the left, y from the top); a tier's line is its four seats
pct = lambda sx, sy: [round((sx - 4) / 1334 * 100, 2), round(sy / 2001 * 100, 2)]
notes = {'roots': 'the eldest, the forebears: on the roots and the earth', 'low': 'grandparents: the low boughs',
         'mid': 'parents: the middle boughs', 'crown': 'you, your siblings and cousins: the upper boughs',
         'top': 'children and grandchildren: in the crown'}
slots = {
    'box': [1000, 1500], 'ext': 'webp', 'layers': [],
    'seat': round(2 * R_DISC / 1334 * 100, 2),             # a seat's diameter (the drawn ring), in % of the box width
    'perRow': 4, 'crownPivot': [50, 22], 'trunkPivot': pct(671, 1100), 'candleY': 94.5,
    'tiers': [{'name': n, 'note': notes[n], 'line': [pct(x, y) for x, y in s]} for n, s in SEATS],
}
json.dump(slots, open(f'{OUT}/slots.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print('seat', slots['seat'], '%;', slots['tiers'][0]['line'])
