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


def discs(img):
    """every disc on the picture: blue or dark pixels (the checkerboard is neutral grey), in round, solid groups"""
    from skimage import measure, morphology
    a = np.asarray(img).astype(int)
    ink = ((a[:, :, 2] - a[:, :, 0]) > 18) | (a.max(2) < 90)
    ink = morphology.closing(ink, morphology.disk(3))
    out = []
    for r in measure.regionprops(measure.label(ink)):
        y0, x0, y1, x1 = r.bbox
        h, w = y1 - y0, x1 - x0
        if h > img.size[1] * 0.08 and 0.85 < w / h < 1.18 and r.area > 0.6 * np.pi * (h / 2) ** 2:   # round and filled (not a label)
            out.append(((x0 + x1) / 2, (y0 + y1) / 2, w / 2, h / 2))
    return out


def cut(img, cx, cy, rx, ry):
    """the disc as an ellipse (rx, ry), with a soft edge, scaled to a square picture"""
    sx, sy = int(np.ceil(rx)) + 2, int(np.ceil(ry)) + 2
    box = img.crop((int(cx - sx), int(cy - sy), int(cx + sx), int(cy + sy))).convert('RGBA')
    w, h = box.size
    yy, xx = np.mgrid[0:h, 0:w]
    e = np.hypot((xx + 0.5 - w / 2) / rx, (yy + 0.5 - h / 2) / ry)      # 1 on the edge
    alpha = np.clip((1 - e) * min(rx, ry) + 0.5, 0, 1)
    px = np.asarray(box).copy(); px[:, :, 3] = (alpha * 255).astype(np.uint8)
    return Image.fromarray(px).resize((SIZE, SIZE), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    sheet = find('moon-phases')
    W, H = sheet.size
    k = W / 1932                                       # where each phase sits (measured on a 1932 px copy of the sheet)
    spots = {  # the labels are the sheet's own; row 3's first disc (a last-quarter twin) and row 2's see-through one are left out
        'new': (285, 322), 'waxing-crescent': (715, 322), 'first-quarter': (1182, 322), 'waxing-gibbous': (1640, 322),
        'waning-gibbous': (1640, 945), 'third-quarter': (1188, 1500), 'waning-crescent': (1640, 1500),
    }
    found = discs(sheet)
    for name, (x, y) in spots.items():
        cx, cy, rx, ry = min(found, key=lambda d: (d[0] - x * k) ** 2 + (d[1] - y * k) ** 2)
        cut(sheet, cx, cy, rx - 2.5, ry - 2.5).save(os.path.join(OUT, name + '.webp'), quality=90, method=6)   # (the edge pixels are half checkerboard)
        print(name, round(cx), round(cy), round(rx), round(ry))
    full = find('moon-full')
    cx, cy, rx, ry = max(discs(full), key=lambda d: d[2])
    cut(full, cx, cy, rx - 4, ry - 4).save(os.path.join(OUT, 'full.webp'), quality=90, method=6)
    print('full', round(cx), round(cy), round(rx), round(ry))

    # the eclipse: rebuild the dark checkerboard from the empty corners, then the corona is the light above it
    ec = find('eclipse')
    a = np.asarray(ec).astype(float)
    eh, ew, _ = a.shape
    L = a.mean(2)
    corner = L[: eh // 10, : ew // 10]
    lo, hi = np.percentile(corner, 15), np.percentile(corner, 85)
    # the squares: their exact size (a fraction of a pixel matters over 2000 px) from the colour changes along the top row
    row = L[6] > (lo + hi) / 2
    edges = np.flatnonzero(np.diff(row.astype(int))) + 0.5
    steps = np.diff(edges); steps = steps[(steps > np.median(steps) * 0.6) & (steps < np.median(steps) * 1.4)]
    sq = float(np.mean(steps))
    x0 = float(np.median((edges - edges[0]) % sq + edges[0] % sq)) % sq
    yy, xx = np.mgrid[0:eh, 0:ew].astype(float)
    first_light = bool(row[int(x0 + sq / 2) % ew])
    cell = (np.floor((xx - x0) / sq) + np.floor((yy - x0) / sq)) % 2 == 0
    checker = cell == first_light
    # near a square's edge the two colours blur together: count it as the lighter one (never invents corona there)
    fx, fy = ((xx - x0) / sq) % 1, ((yy - x0) / sq) % 1
    near = (np.minimum(fx, 1 - fx) * sq < 2) | (np.minimum(fy, 1 - fy) * sq < 2)
    from scipy import ndimage
    bgL = np.where(checker, hi, lo)
    light = np.clip((L - bgL) / np.maximum(1, 255 - bgL), 0, 1)
    keep = (~near).astype(float)
    light = np.where(near, ndimage.gaussian_filter(light * keep, 3) / np.maximum(ndimage.gaussian_filter(keep, 3), 1e-3), light)
    light = ndimage.gaussian_filter(light, 1.2)
    alpha = np.clip((light - 0.05) / 0.95, 0, 1)        # the faint stars and the noise go
    # the sun's ring and the moon's face are solid
    cx, cy = ew / 2, eh * 0.465
    d = np.hypot(xx - cx, yy - cy)
    gold = (a[:, :, 0] > 190) & (a[:, :, 1] > 140) & (a[:, :, 2] < 170) & (d < ew * 0.3)
    ring_r = np.percentile(d[gold], 99.5) + 1
    ring = d < ring_r
    alpha = np.where(ring, 1.0, alpha)
    corona = np.array([236, 243, 255], float)          # the corona's light, a little blue
    rgb = np.where(ring[:, :, None], a, corona)
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    img = Image.fromarray(out, 'RGBA')
    # only the round part (the words under it are left out), square round the sun
    half = int(ew * 0.35)
    # the corona fades out before the edge of the square (the words under it, and the stars, stay outside)
    fade = np.clip((half - np.hypot(xx - cx, yy - cy)) / (half * 0.18), 0, 1)
    px = np.asarray(img).copy(); px[:, :, 3] = (px[:, :, 3] * fade).astype(np.uint8); img = Image.fromarray(px, 'RGBA')
    img = img.crop((int(cx - half), int(cy - half), int(cx + half), int(cy + half))).resize((SIZE * 2, SIZE * 2), Image.LANCZOS)
    img.save(os.path.join(R, 'public', 'assets', 'eclipse.webp'), quality=90, method=6)
    print('eclipse', round(sq, 3), round(x0, 2), lo, hi, round(ring_r))


if __name__ == '__main__':
    main()
