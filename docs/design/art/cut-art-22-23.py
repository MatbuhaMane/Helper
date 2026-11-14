# The owner's images 22 and 23 (2026-11-14, data/art/owner-2026-11-14/, git-ignored).
#   python docs/design/art/cut-art-22-23.py [frames|stickers]     (from the repo root; numpy, scipy, Pillow)
# 22: six round frames for family members (asset-prompts-full.md "מסגרות לבני משפחה"), transparent inside and outside.
# 23: 20 die-cut stickers with a cream border ("מדבקות"), one sprite each; only the white round them goes (a daisy keeps its petals).
import numpy as np, glob, os, sys
from PIL import Image
from scipy import ndimage as ndi

SRC = 'data/art/owner-2026-11-14/'
load = lambda n: np.asarray(Image.open(glob.glob(f'{SRC}{n}.*')[0]).convert('RGB')).astype(np.float32)

def white(a):
    mn, mx = a.min(-1), a.max(-1)
    return (mn >= 236) & (mx - mn < 16)

def rgba(a, fg):
    """fg mask -> RGBA, the outer 2px un-multiplied from white so no white fringe shows on a dark page"""
    mn = a.min(-1)
    alpha = fg.astype(np.float32)
    edge = ndi.binary_dilation(~fg, iterations=2) & fg
    ea = np.clip((255 - mn) / 215, 0.06, 1.0)
    rgb = a.copy(); alpha[edge] = ea[edge]
    rgb[edge] = 255 - (255 - a[edge]) / ea[edge][:, None]
    return np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)

def pieces(fg, n, gap=6):
    """the n largest drawings (parts closer than gap px join), rows top to bottom, each row left to right (the sheet's order)"""
    grown = ndi.binary_dilation(fg, iterations=gap)
    lab, k = ndi.label(grown)
    sizes = ndi.sum(fg, lab, range(1, k + 1))
    keep = 1 + np.argsort(sizes)[::-1][:n]
    boxes = [(ndi.find_objects((lab == i).astype(int))[0], i) for i in keep]
    boxes.sort(key=lambda b: (round(b[0][0].start / 150), b[0][1].start))   # rows, then left to right
    return [(sl, lab == i) for sl, i in boxes]

def square(img, side, pad):
    img = img.crop(img.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
    k = (side - 2 * pad) / max(img.size); img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    out = Image.new('RGBA', (side, side)); out.alpha_composite(img, ((side - img.width) // 2, (side - img.height) // 2))
    return out

def save(img, path, q=86):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, quality=q, alpha_quality=90, method=6); print(path, img.size, os.path.getsize(path) // 1024, 'KB')

FRAMES = ['wood', 'gold', 'flowers', 'stone', 'rope', 'embroidery']
STICKERS = ['tent', 'fire', 'olive', 'heart', 'star', 'candle', 'umbrella', 'daisy', 'sun', 'moon',
            'cup', 'pomegranate', 'note', 'book', 'house', 'balloon', 'gift', 'swirl', 'leaf', 'cloud']

def frames():
    a = load(22)
    w = white(a)
    lab, n = ndi.label(w); sizes = ndi.sum(w, lab, range(1, n + 1))
    w &= np.isin(lab, 1 + np.flatnonzero(sizes >= 400))          # the outside and each ring's middle; tiny highlights stay
    fg = ~w
    lab, n = ndi.label(fg); sizes = ndi.sum(fg, lab, range(1, n + 1))
    fg &= np.isin(lab, 1 + np.flatnonzero(sizes >= 150))
    base = a
    for name, (sl, m) in zip(FRAMES, pieces(fg, 6, gap=4)):
        a = base
        mm = m & fg
        if name == 'embroidery':
            # a light smear along the ring's right edge, outside and inside: pale areas (the frame's own colours are darker)
            # that touch the white round it go
            mn, mx = a.min(-1), a.max(-1)
            pale = mm & (mn >= 185) & (mx - mn < 60)
            lab, k = ndi.label(pale)
            touch = np.unique(lab[ndi.binary_dilation(w, iterations=2) & pale]); touch = touch[touch > 0]
            mm &= ~np.isin(lab, touch)
            # outside the rim it is a darker streak too: fit the outer circle on the clean left half, cut 2px beyond it
            edge = mm & ~ndi.binary_erosion(mm, iterations=1)
            ys, xs = np.nonzero(edge); cx0, cy0 = xs.mean(), ys.mean()
            far = np.hypot(ys - cy0, xs - cx0); outer = far > np.percentile(far, 40)
            left = outer & (xs < cx0)
            X, Y = xs[left].astype(float), ys[left].astype(float)
            A = np.c_[2 * X, 2 * Y, np.ones_like(X)]; (cx, cy, c), *_ = np.linalg.lstsq(A, X**2 + Y**2, rcond=None)
            R = np.sqrt(c + cx**2 + cy**2)
            yy, xx = np.indices(mm.shape)
            mm &= np.hypot(yy - cy, xx - cx) <= R + 2
            # the right side of the gold rims is washed out in the drawing itself; the frame is symmetric, so the rim bands on
            # the right (the outer 9% and the inner band, within 75 degrees of the right) are taken from the left, mirrored
            inner = (far < np.percentile(far, 40)) & (xs < cx0)
            Xi, Yi = xs[inner].astype(float), ys[inner].astype(float)
            Ai = np.c_[2 * Xi, 2 * Yi, np.ones_like(Xi)]; (ix, iy, ic), *_ = np.linalg.lstsq(Ai, Xi**2 + Yi**2, rcond=None)
            Rin = np.sqrt(ic + ix**2 + iy**2)
            d = np.hypot(yy - cy, xx - cx); ang = np.degrees(np.arctan2(yy - cy, xx - cx))
            band = (xx > cx) & (np.abs(ang) < 75) & ((d > R * 0.91) | (d < Rin * 1.10)) & (d <= R + 2)
            mx_ = np.clip(np.round(2 * cx - xx).astype(int), 0, a.shape[1] - 1)
            a = a.copy(); a[band] = a[yy[band], mx_[band]]
            src = mm[yy, mx_]
            mm = np.where(band, src, mm)
        img = Image.fromarray(rgba(a, mm)[sl], 'RGBA')
        save(square(img, 512, 6), f'public/assets/frames/round-{name}.webp', q=84)

def stickers():
    a = load(23)
    w = white(a)
    lab, _ = ndi.label(w)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])); edge = edge[edge > 0]
    fg = ~np.isin(lab, edge)                                       # only the white joined to the outside goes
    for name, (sl, m) in zip(STICKERS, pieces(fg, 20, gap=3)):
        img = Image.fromarray(rgba(a, m & fg)[sl], 'RGBA')
        save(square(img, 256, 6), f'public/assets/kit/stickers/{name}.webp')

what = sys.argv[1:] or ['frames', 'stickers']
for w_ in what: globals()[w_]()
