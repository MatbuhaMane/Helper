"""Cut the plain white background out of a generated drawing (the Gemini image tool returns JPEGs on white).

  python figures/art/cut-white.py <in.jpg> <out.webp> [--width N] [--height N]

The background is the near-white area connected to the picture's edges (so white inside the drawing, behind its ink
outline, stays). Its soft anti-aliased rim gets a partial alpha, and the colour of those rim pixels is un-mixed from
white, so the drawing has no white halo on a dark background. The result is cropped to the drawing and scaled down.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

def cut(src, dst, width=None, height=None):
    im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
    lo = im.min(axis=2)                       # how far each pixel is from white
    light = lo > 200                          # near white (the background and its rim)
    lab, _ = ndimage.label(light)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, edge[edge > 0])
    # alpha: 0 in the clear background (>= 245), rising through the rim (200..245) to 1 in the drawing
    a = np.ones(lo.shape, np.float32)
    rim = bg & (lo < 245)
    a[bg] = 0
    a[rim] = (245 - lo[rim]) / 45.0
    a = ndimage.grey_dilation(a, size=1)
    # un-mix white from the rim: c = a*fg + (1-a)*255  ->  fg = (c - (1-a)*255) / a
    rgb = im.copy()
    m = (a > 0.02) & (a < 1)
    for k in range(3):
        ch = rgb[..., k]
        ch[m] = np.clip((ch[m] - (1 - a[m]) * 255) / a[m], 0, 255)
    out = np.dstack([rgb, a * 255]).astype(np.uint8)
    img = Image.fromarray(out, 'RGBA')
    box = img.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if box:
        pad = 6
        img = img.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(img.width, box[2] + pad), min(img.height, box[3] + pad)))
    if width and img.width > width: img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    if height and img.height > height: img = img.resize((round(img.width * height / img.height), height), Image.LANCZOS)
    img.save(dst, 'WEBP', quality=86, method=6)
    return img.size

if __name__ == '__main__':
    args = sys.argv[1:]
    w = int(args[args.index('--width') + 1]) if '--width' in args else None
    h = int(args[args.index('--height') + 1]) if '--height' in args else None
    print(cut(args[0], args[1], w, h))
