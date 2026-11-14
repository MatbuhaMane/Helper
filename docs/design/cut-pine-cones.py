# The pine's person form (vision batch 24): a pinecone with the portrait on its face disc, one per season.
#   python docs/design/cut-pine-cones.py        (from the repo root; needs numpy, scipy and Pillow)
# Sources, the owner's images in data/art/owner-2026-11-14/ (git-ignored): 12 green (spring), 13 brown (summer and autumn;
# 15 is the same cone), 14 snowy (winter), 11 the pale outline (the empty form, darkened here: it was too faint).
# Output, in /assets/tree/pine/: person-spring|summer|winter|empty|quiet.webp, 240 x 338 each.
#   Every cone is scaled and placed so its face disc lands on the same spot: the disc is 49% of the width, centred
#   (tree.css: --leaf-ar 240/338, --face-w 49%, --face-y 0). "quiet" (those who have passed) is the summer cone, faded.
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
import glob, os

SRC, OUT = 'data/art/owner-2026-11-14/', 'public/assets/tree/pine'
BW, BH, HW, HH = 240, 338, 1.02, 1.44           # the box, and its half-width and half-height in disc diameters
os.makedirs(OUT, exist_ok=True)

def load(n):
    return np.asarray(Image.open(glob.glob(f'{SRC}{n}.*')[0]).convert('RGB')).astype(np.float32)

def cut(a):
    """the outer white out (white enclosed by the drawing stays), edges un-multiplied from white; returns RGBA float, the disc"""
    mn, mx = a.min(-1), a.max(-1)
    bg = (mn >= 236) & (mx - mn < 16)
    lab, _ = ndi.label(bg)
    outer = np.isin(lab, np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    outer &= bg
    fg = ~outer
    lab, n = ndi.label(fg); sizes = ndi.sum(fg, lab, range(1, n + 1))
    fg &= np.isin(lab, 1 + np.flatnonzero(sizes >= 200))
    alpha = fg.astype(np.float32)
    edge = ndi.binary_dilation(~fg, iterations=2) & fg
    ea = np.clip((255 - mn) / 215, 0.06, 1.0)
    rgb = a.copy()
    alpha[edge] = ea[edge]
    rgb[edge] = 255 - (255 - a[edge]) / ea[edge][:, None]
    ys, xs = np.nonzero(fg)
    cy, cx = int(ys.min() + (ys.max() - ys.min()) * 0.47), int((xs.min() + xs.max()) / 2)
    m = np.abs(a - a[cy, cx]).max(-1) < 28
    lab, _ = ndi.label(m)
    disc = ndi.binary_fill_holes(lab == lab[cy, cx])
    return np.dstack([np.clip(rgb, 0, 255), alpha * 255]), disc, fg

def place(rgba, disc):
    dy, dx = np.nonzero(disc)
    cx, cy, D = dx.mean(), dy.mean(), 2 * np.sqrt(disc.sum() / np.pi)
    img = Image.fromarray(rgba.astype(np.uint8), 'RGBA')
    box = (round(cx - HW * D), round(cy - HH * D), round(cx + HW * D), round(cy + HH * D))
    return img.crop(box).resize((BW, BH), Image.LANCZOS), D

def save(img, name):
    img.save(f'{OUT}/person-{name}.webp', quality=86, alpha_quality=90, method=6)
    print(name, os.path.getsize(f'{OUT}/person-{name}.webp') // 1024, 'KB')

for n, name in ((12, 'spring'), (13, 'summer'), (14, 'winter')):
    rgba, disc, _ = cut(load(n))
    img, D = place(rgba, disc)
    save(img, name)
    if name == 'summer':                          # quiet: the same cone, its colour faded toward a dry grey-brown
        q = np.asarray(img).astype(np.float32)
        g = q[..., :3].mean(-1, keepdims=True)
        q[..., :3] = (q[..., :3] * 0.35 + g * 0.65) * 0.92 + np.array([18, 12, 6])
        save(Image.fromarray(np.clip(q, 0, 255).astype(np.uint8), 'RGBA'), 'quiet')

# the empty form: 11's faint lines, darkened to the empty tag's ink, over the cone's silhouette in the empty tag's cream
a = load(11)
_, disc, fg = cut(a)
sil = ndi.binary_fill_holes(ndi.binary_closing(fg, iterations=6))
ink = np.clip((252 - a.mean(-1)) / 22, 0, 1) ** 0.7                # the pencil line, made solid
INK, CREAM = np.array([122, 106, 84], np.float32), np.array([239, 232, 214], np.float32)
rgb = CREAM * (1 - ink[..., None]) + INK * ink[..., None]
alpha = np.maximum(sil * 0.9, ink * sil)
rgba = np.dstack([rgb, alpha * 255])
img, _ = place(rgba, ndi.binary_fill_holes(disc))
save(img, 'empty')
