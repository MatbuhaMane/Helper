# The owner's olive head frames (2026-11-14): 33 winter (snow on top), 34 summer; 2000 x 2000 on white.
# The white outside, the hole and the gaps between the twigs go; edges un-multiplied from white.
# Normalised: each is scaled so its hole (the largest circle inside it) has radius HOLE px, centred on the canvas, so the face
# sits the same in every season. The face's radius is HOLE * TUCK (it tucks under the ring a little), so in tree.css the frame
# is SIDE / (2 * HOLE * TUCK) times the face's width. Sized for the seat at 2x on desktop (the tree at most 760 px, the olive's
# framed face 7.6% of it, so the neighbours' leaves don't touch at 375: a 58 px face).   python docs/design/art/cut-olive-head-frames.py   (numpy, scipy, Pillow)
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
SIDE, HOLE, TUCK = 264, 55.5, 1.04
for n, name in (('33', 'winter'), ('34', 'summer')):
    a = np.asarray(Image.open(f'data/art/owner-2026-11-14/{n}.webp').convert('RGB')).astype(np.float32)
    mn, mx = a.min(-1), a.max(-1)
    w = (mn >= 236) & (mx - mn < 16)
    lab, k = ndi.label(w)
    hole = lab == lab[1000, 1000]
    dt = ndi.distance_transform_edt(hole); cy, cx = np.unravel_index(dt.argmax(), dt.shape); r = dt.max()
    sizes = ndi.sum(w, lab, range(1, k + 1))
    w &= np.isin(lab, 1 + np.flatnonzero(sizes >= 60))          # the outside, the hole, the gaps; specks of shine stay
    fg = ~w
    lab, k = ndi.label(fg); sizes = ndi.sum(fg, lab, range(1, k + 1))
    fg &= np.isin(lab, 1 + np.flatnonzero(sizes >= 200))
    edge = ndi.binary_dilation(~fg, iterations=2) & fg
    alpha = fg.astype(np.float32); rgb = a.copy()
    ea = np.clip((255 - mn) / 215, 0.06, 1.0); alpha[edge] = ea[edge]
    rgb[edge] = 255 - (255 - a[edge]) / ea[edge][:, None]
    img = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8), 'RGBA')
    k_ = HOLE / r                                                 # scale so the hole is HOLE px
    big = img.resize((round(img.width * k_), round(img.height * k_)), Image.LANCZOS)
    out = Image.new('RGBA', (SIDE, SIDE))
    out.paste(big, (round(SIDE / 2 - cx * k_), round(SIDE / 2 - cy * k_)), big)
    bb = out.getchannel('A').getbbox()
    p = f'public/assets/tree/olea/frame-{name}.webp'
    out.save(p, quality=84, alpha_quality=90, method=6)
    import os; print(p, out.size, os.path.getsize(p) // 1024, 'KB', 'hole r src', round(r), 'bbox', bb)
print('frame / face =', round(SIDE / (2 * HOLE * TUCK), 4))
