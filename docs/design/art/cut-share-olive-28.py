# The owner's image 28 (2026-11-14): a 9:16 olive-garland share frame, 1116 x 2000. Two washed-out leaves on the right edge
# (rows ~600-715 and ~1215-1320, leaves with no outline) are replaced with a clean band of the same garland from elsewhere on
# that edge, picked where the band's top and bottom rows match best (the stem lines up), feathered in; then the white is cut
# out, outside and inside, edges un-multiplied from white.  python docs/design/art/cut-share-olive-28.py [--check]
import numpy as np, sys
from PIL import Image
from scipy import ndimage as ndi
a = np.asarray(Image.open('data/art/owner-2026-11-14/28.webp').convert('RGB')).astype(np.float32)
X0, X1 = 900, 1100                     # the right garland's columns
BAD = [(600, 715), (1215, 1320)]
def ok(y0, y1): return all(y1 <= b0 - 10 or y0 >= b1 + 10 for b0, b1 in BAD) and 220 < y0 and y1 < 1780
for y0, y1 in BAD:
    h, M = y1 - y0, 14
    best = None
    for sy in range(220, 1780 - h):
        if not ok(sy - M, sy + h + M): continue
        for dx in range(-14, 15, 2):
            d = np.abs(a[y0 - M:y0, X0:X1] - a[sy - M:sy, X0 + dx:X1 + dx]).mean() + np.abs(a[y1:y1 + M, X0:X1] - a[sy + h:sy + h + M, X0 + dx:X1 + dx]).mean()
            if best is None or d < best[0]: best = (d, sy, dx)
    _, sy, dx = best; print('band', y0, y1, '<- rows', sy, 'dx', dx, 'match', round(best[0], 1))
    src = a[sy - M:sy + h + M, X0 + dx:X1 + dx]
    t = np.ones(h + 2 * M, np.float32); ramp = np.linspace(0, 1, M + 1)[1:]
    t[:M] = ramp; t[-M:] = ramp[::-1]
    a[y0 - M:y1 + M, X0:X1] = a[y0 - M:y1 + M, X0:X1] * (1 - t[:, None, None]) + src * t[:, None, None]
mn, mx = a.min(-1), a.max(-1)
bg = (mn >= 236) & (mx - mn < 16)
lab, n = ndi.label(bg); sizes = ndi.sum(bg, lab, range(1, n + 1))
bg &= np.isin(lab, 1 + np.flatnonzero(sizes >= 400))
for y0, y1 in BAD:                       # in the mended bands the blend leaves pale specks between leaf and stem: a looser key
    sl = (slice(y0 - 16, y1 + 16), slice(X0, X1))
    bg[sl] |= (mn[sl] >= 214) & (mx[sl] - mn[sl] < 30)
fg = ~bg
lab, n = ndi.label(fg); sizes = ndi.sum(fg, lab, range(1, n + 1))
fg &= np.isin(lab, 1 + np.flatnonzero(sizes >= 60))
edge = ndi.binary_dilation(~fg, iterations=2) & fg
alpha = fg.astype(np.float32); rgb = a.copy()
ea = np.clip((255 - mn) / 215, 0.06, 1.0); alpha[edge] = ea[edge]
rgb[edge] = 255 - (255 - a[edge]) / ea[edge][:, None]
img = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8), 'RGBA')
out = 'public/assets/frames/olive-share.webp'
img.resize((558, 1000), Image.LANCZOS).save(out, quality=72, alpha_quality=85, method=6)
if '--check' in sys.argv:
    S = sys.argv[sys.argv.index('--check') + 1]
    bgc = Image.new('RGBA', img.size, (20, 24, 30, 255)); bgc.alpha_composite(img)
    c = [bgc.crop((880, y0 - 60, 1100, y1 + 60)) for y0, y1 in BAD]
    sh = Image.new('RGB', (450, max(x.height for x in c)), 'black'); sh.paste(c[0], (0, 0)); sh.paste(c[1], (230, 0)); sh.save(S)
print(out)
