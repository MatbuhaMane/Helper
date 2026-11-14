# The owner's sheet 38 (2026-11-14, data/art/owner-2026-11-14/38.webp, git-ignored): 21 app icons, 7x3, each on a light pink
# tile on magenta, in the style of the tools page's flat icons (a pastel fill, a dark round outline).
#   python docs/design/art/cut-tool-icons-38.py          (from the repo root; numpy, scipy, Pillow)
# Out: public/assets/app-icons/<name>.webp, 256x256, transparent. One scale for all (no per-icon fitting), so the outline
# keeps one weight across the set; the pink round each icon goes, its edge un-mixed from the pink so no fringe shows.
import numpy as np, os
from PIL import Image
from scipy import ndimage as ndi

a = np.asarray(Image.open('data/art/owner-2026-11-14/38.webp').convert('RGB')).astype(np.float32)
NAMES = ['family', 'tools', 'settings', 'news', 'songs', 'messages', 'mail',
         'habits', 'restaurant', 'parnasa', 'pc', 'kitchen', 'howto', 'garden',
         'home', 'translate', 'eye', 'homework', 'breath', 'hill', 'garage']
ROWS = [(34, 264), (303, 533), (572, 793)]                       # the tiles, measured on the sheet
COLS = [(47, 289), (323, 566), (601, 844), (878, 1121), (1156, 1398), (1432, 1675), (1709, 1951)]
SIDE, OUT = 236, 256                                             # the square cut round each tile's middle, and the file

def pinkish(c):
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    return (r > 215) & (b > 200) & (g < 165)                     # the tile and the magenta; no icon colour is this

def cut(cell, inside):
    bg = pinkish(cell) | ~inside                                 # outside the tile (the labels' tops) goes too
    lab, n = ndi.label(bg)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])); edge = edge[edge > 0]
    out = np.isin(lab, edge)                                     # the pink joined to the tile's edge goes,
    tile0 = np.median(cell[out & inside], axis=0)
    for i in range(1, n + 1):                                    # and a hole the tile shows through (the gear, the wrench),
        m = lab == i                                             # but not a pink of the icon's own (the translator's bubble)
        if not out[m].any() and np.linalg.norm(np.median(cell[m], axis=0) - tile0) < 40: out |= m
    fg = ~out
    lab, n = ndi.label(fg); sz = ndi.sum(fg, lab, range(1, n + 1))
    fg &= np.isin(lab, 1 + np.flatnonzero(sz >= 40))             # specks
    # the edge: 2px of fg next to the pink are a mix of the pink and the colour inside; un-mix them
    tile = np.median(cell[out], axis=0)
    band = ndi.binary_dilation(out, iterations=2) & fg
    inner = fg & ~band
    _, (iy, ix) = ndi.distance_transform_edt(~inner, return_indices=True)
    cin = cell[iy, ix]
    num = np.linalg.norm(cell - tile, axis=-1); den = np.maximum(np.linalg.norm(cin - tile, axis=-1), 1)
    alpha = fg.astype(np.float32)
    ea = np.clip(num / den, 0.0, 1.0)
    alpha[band] = ea[band]
    rgb = cell.copy()
    m = band & (ea > 0.02)
    rgb[m] = (cell[m] - (1 - ea[m])[:, None] * tile) / ea[m][:, None]
    rgb = np.clip(rgb, 0, 255)
    alpha[band & (ea < 0.06)] = 0
    return np.dstack([rgb, alpha * 255]).astype(np.uint8)

os.makedirs('public/assets/app-icons', exist_ok=True)
k = 0
for y0, y1 in ROWS:
    for x0, x1 in COLS:
        cy, cx = (y0 + y1) // 2, (x0 + x1) // 2
        h = SIDE // 2
        yy, xx = np.mgrid[cy - h:cy + h, cx - h:cx + h]
        inside = (yy >= y0 + 2) & (yy < y1 - 2) & (xx >= x0 + 2) & (xx < x1 - 2)
        img = Image.fromarray(cut(a[cy - h:cy + h, cx - h:cx + h], inside), 'RGBA').resize((OUT, OUT), Image.LANCZOS)
        p = f'public/assets/app-icons/{NAMES[k]}.webp'
        img.save(p, quality=88, alpha_quality=92, method=6); print(p, os.path.getsize(p) // 1024, 'KB')
        k += 1
