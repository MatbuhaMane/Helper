"""Split the home page's stump-with-guitar drawing into two layers, so the guitar can sway on its own (index.html .corner).

  python -I docs/design/split-stump-guitar.py [--debug DIR]

Reads the 700px master figures/art/library/home/stump-guitar.webp and writes, at the same size and position:
  figures/art/library/home/stump.webp, guitar.webp           (700, the masters)
  public/assets/stump.webp, public/assets/guitar.webp        (400, what the page loads, like stump-guitar.webp)
The guitar is cut by colour (its warm wood, then its ink outline around it, the pegs above the stump); the stump's edge
that hid behind the guitar is drawn back in (grey wood and the ink line), so a small sway shows no hole.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage.color import rgb2hsv
from skimage.morphology import convex_hull_image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'figures/art/library/home/stump-guitar.webp'
debug = Path(sys.argv[sys.argv.index('--debug') + 1]) if '--debug' in sys.argv else None

im = np.asarray(Image.open(SRC).convert('RGBA')).astype(np.float32) / 255
rgb, a = im[..., :3], im[..., 3]
H, W = a.shape
hsv = rgb2hsv(rgb)
hue, sat, val = hsv[..., 0] * 360, hsv[..., 1], hsv[..., 2]
opaque = a > 0.5
yy, xx = np.mgrid[0:H, 0:W]

# 1. the warm wood of the guitar (body, neck, head) – the stump is grey
warm = opaque & (sat > 0.32) & (hue > 8) & (hue < 58) & (val > 0.22)
warm = ndi.binary_opening(warm, iterations=1)
lab, n = ndi.label(ndi.binary_dilation(warm, iterations=3))
sizes = ndi.sum(warm, lab, range(1, n + 1))
keep = [i + 1 for i, s in enumerate(sizes) if s > 400]
guitar = np.isin(lab, keep)

# 2. above the stump's top everything opaque on the right belongs to the guitar (the pegs, the head's outline)
stump_top = int(np.argmax(((opaque & ~guitar & (xx < W * 0.45)).sum(1)) > W * 0.2))
guitar |= opaque & (yy < stump_top - 4) & (xx > W * 0.35)
# 3. fill the strings and the sound hole, then take the ink outline around it
guitar = ndi.binary_fill_holes(ndi.binary_closing(guitar, iterations=6))
guitar = ndi.binary_dilation(guitar, iterations=6) & opaque
guitar = ndi.binary_fill_holes(guitar)

# 4. the black capo on the neck: its clip hangs over the stump's top. The thick near-black blob there that touches the
#    guitar (an opening drops the stump's thin ink lines), taken with its convex hull so its grey highlight comes along
box = (yy > 165) & (yy < 236) & (xx > 385) & (xx < 475)
dark = opaque & ~guitar & box & (val < 0.33)   # the capo is near black, the bark ~0.39
lab, n = ndi.label(ndi.binary_opening(dark, iterations=3))
touch = ndi.binary_dilation(guitar, iterations=3)
ids = [i for i in range(1, n + 1) if (touch & (lab == i)).any()]
if ids:
    seed = ndi.binary_dilation(np.isin(lab, ids), iterations=2)
    guitar |= convex_hull_image(seed) & ndi.binary_dilation(opaque & (val < 0.33), iterations=3)   # not the bark between

# 5. the stump layer: its main piece, and the part of its (convex) outline the guitar hid drawn back in: the nearest
#    wood colour, softened, and the ink line along the edge
lab, n = ndi.label(opaque & ~guitar)
stump = lab == (1 + int(np.argmax(ndi.sum(np.ones_like(a), lab, range(1, n + 1)))))
guitar |= opaque & ~stump                                   # the few loose bits by the neck go with the guitar
# the soft anti-aliased rim (alpha below a half) goes with whichever layer it borders
soft = (a > 0) & ~opaque
near_g = ndi.distance_transform_edt(~guitar) < ndi.distance_transform_edt(~stump)
guitar_rim, stump_rim = soft & near_g, soft & ~near_g
hull = convex_hull_image(stump)
hidden = hull & ~stump & opaque
wood = stump & (val > 0.3)
_, (iy, ix) = ndi.distance_transform_edt(~wood, return_indices=True)
fill = im[iy, ix].copy()
fill[..., :3] = ndi.uniform_filter(fill[..., :3], size=(9, 9, 1))
ink = np.median(rgb[stump & (val < 0.18)], 0)
out_s = np.where((stump | stump_rim)[..., None], im, 0).copy()
out_s[hidden] = fill[hidden]
out_s[hidden, 3] = 1
line = hidden & (ndi.distance_transform_edt(hull) <= 5)
out_s[line, :3] = ink
out_g = np.where((guitar | guitar_rim)[..., None], im, 0)

def save(arr, name):
    img = Image.fromarray((arr * 255).round().astype(np.uint8), 'RGBA')
    img.save(ROOT / 'figures/art/library/home' / f'{name}.webp', quality=92, method=6)
    img.resize((400, round(400 * H / W)), Image.LANCZOS).save(ROOT / 'public/assets' / f'{name}.webp', quality=88, method=6)

if '--dry' not in sys.argv:
    save(out_s, 'stump'); save(out_g, 'guitar')

if debug:
    debug.mkdir(parents=True, exist_ok=True)
    dbg = (im * 255).astype(np.uint8).copy()
    dbg[guitar, 0] = 255; dbg[guitar, 1] //= 2
    Image.fromarray(dbg).save(debug / 'mask.png')
    Image.fromarray(dbg[150:260, 360:480]).resize((360, 330), Image.NEAREST).save(debug / 'capo.png')
    Image.fromarray((out_s * 255).astype(np.uint8)).crop((300, 140, 520, 640)).save(debug / 'stump-edge.png')
    print('stump top', stump_top, 'guitar px', int(guitar.sum()), 'hidden px', int(hidden.sum()))
