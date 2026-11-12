"""Cut the moon's artwork into the pictures the home page uses.

  python tools/moon-art.py            (reads data/art/, writes public/assets/moon/*.webp and public/assets/eclipse.webp)

The artwork has its "transparent" checkerboard painted into the pixels, so:
  * each moon is a disc: it is cut out with a round mask, its radius found from its dark outline
  * the eclipse's corona is see-through: the checkerboard is rebuilt and the light above it becomes the corona's opacity

data/art/moon-phases.(png|jpg)   the sheet of phases (4 + 3 + 3 discs, labelled)
data/art/moon-full.(png|jpg)     the full moon, large
data/art/eclipse.(png|jpg)       the total solar eclipse
"""
import glob, os
import numpy as np
from PIL import Image

R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ART = os.path.join(R, 'data', 'art')
OUT = os.path.join(R, 'public', 'assets', 'moon')
SIZE = 256


def find(name):
    hits = glob.glob(os.path.join(ART, name + '.*'))
    if not hits: raise SystemExit(f'missing data/art/{name}.png (or .jpg)')
    return Image.open(hits[0]).convert('RGB')


def disc(img, cx, cy, r_guess):
    """the disc round (cx, cy): its radius is where its dark outline ends along many rays"""
    a = np.asarray(img).astype(int)
    h, w, _ = a.shape
    radii = []
    for th in np.linspace(0, 2 * np.pi, 72, endpoint=False):
        last = None
        for r in range(int(r_guess * 0.7), int(r_guess * 1.25)):
            x, y = int(cx + r * np.cos(th)), int(cy + r * np.sin(th))
            if not (0 <= x < w and 0 <= y < h): break
            if a[y, x].max() < 90: last = r          # the outline (and the dark face) are dark; the checkerboard is not
        if last: radii.append(last)
    r = float(np.median(radii)) + 1.0
    return cx, cy, r


def cut(img, cx, cy, r):
    s = int(np.ceil(r)) + 2
    box = img.crop((int(cx - s), int(cy - s), int(cx + s), int(cy + s))).convert('RGBA')
    n = box.size[0]
    yy, xx = np.mgrid[0:n, 0:n]
    d = np.hypot(xx + 0.5 - n / 2, yy + 0.5 - n / 2)
    alpha = np.clip(r - d + 0.5, 0, 1)                # a soft, anti-aliased edge
    px = np.asarray(box).copy(); px[:, :, 3] = (alpha * 255).astype(np.uint8)
    return Image.fromarray(px).resize((SIZE, SIZE), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    sheet = find('moon-phases')
    W, H = sheet.size
    k = W / 1932                                       # positions measured on the 1932 px sheet
    spots = {  # name: (x, y, r) on the sheet – the labels are the sheet's own; row 3's first disc is a last-quarter twin
        'new': (285, 322, 210), 'waxing-crescent': (715, 322, 210), 'first-quarter': (1182, 322, 182), 'waxing-gibbous': (1640, 322, 210),
        'waning-gibbous': (1640, 945, 175), 'third-quarter': (1188, 1500, 185), 'waning-crescent': (1640, 1500, 175),
    }
    for name, (x, y, r) in spots.items():
        cx, cy, rr = disc(sheet, x * k, y * k, r * k)
        cut(sheet, cx, cy, rr).save(os.path.join(OUT, name + '.webp'), quality=90, method=6)
        print(name, round(rr))
    full = find('moon-full')
    fw, fh = full.size
    cx, cy, rr = disc(full, fw / 2, fh / 2, min(fw, fh) * 0.49)
    cut(full, cx, cy, rr).save(os.path.join(OUT, 'full.webp'), quality=90, method=6)
    print('full', round(rr))

    # the eclipse: rebuild the dark checkerboard from the empty corners, then the corona is the light above it
    ec = find('eclipse')
    a = np.asarray(ec).astype(float)
    eh, ew, _ = a.shape
    corner = a[: eh // 8, : ew // 8].mean(2)
    lo, hi = np.percentile(corner, 20), np.percentile(corner, 80)
    # the size of a square: the distance between colour changes along the top row
    row = corner[4] > (lo + hi) / 2
    edges = np.flatnonzero(np.diff(row.astype(int)))
    sq = int(np.median(np.diff(edges))) if len(edges) > 2 else max(1, ew // 64)
    yy, xx = np.mgrid[0:eh, 0:ew]
    first_light = row[0]
    checker = ((xx // sq + yy // sq) % 2 == 0) == first_light
    bg = np.where(checker, hi, lo)[:, :, None] * np.ones(3)
    light = np.clip((a - bg) / np.maximum(1, 255 - bg), 0, 1).max(2)
    alpha = np.clip((light - 0.06) / 0.94, 0, 1)        # the faint stars and the noise go
    # the sun's ring and the moon's face are solid
    cx, cy = ew / 2, eh * 0.465
    d = np.hypot(xx - cx, yy - cy)
    ring = (a.mean(2) > 0) & (d < ew * 0.247)
    alpha = np.where(ring, 1.0, alpha)
    rgb = np.where(ring[:, :, None], a, np.clip((a - bg * (1 - alpha[:, :, None])) / np.maximum(alpha[:, :, None], 1e-3), 0, 255))
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    img = Image.fromarray(out, 'RGBA')
    # only the round part (the words under it are left out), square round the sun
    half = int(ew * 0.40)
    img = img.crop((int(cx - half), int(cy - half), int(cx + half), int(cy + half))).resize((SIZE * 2, SIZE * 2), Image.LANCZOS)
    img.save(os.path.join(R, 'public', 'assets', 'eclipse.webp'), quality=90, method=6)
    print('eclipse', sq, lo, hi)


if __name__ == '__main__':
    main()
