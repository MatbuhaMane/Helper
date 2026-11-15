# The "יד ביד" icon (vision batch 34): an open hand with a sprout on the palm, in the app icons' look (a pastel fill, one dark
# round outline). Not a coin, not money. Drawn with Pillow at 4x and shrunk.
#   python docs/design/art/draw-yad-icon.py          (from the repo root)
# Out: public/assets/app-icons/yad.webp, 256x256, transparent.
from PIL import Image, ImageDraw
S = 1024
INK, SKIN, SKIN2, LEAF, LEAF2, CUFF = '#3b2416', '#f4cfa6', '#e9b887', '#7fae52', '#a6cf72', '#5e8a3a'
W = 20  # outline

def layer(shapes, fill, grow=0):
    im = Image.new('L', (S, S), 0); d = ImageDraw.Draw(im)
    for kind, box, r in shapes:
        b = [box[0]-grow, box[1]-grow, box[2]+grow, box[3]+grow]
        if kind == 'rr': d.rounded_rectangle(b, radius=r+grow, fill=255)
        elif kind == 'el': d.ellipse(b, fill=255)
    return im

def thumb():
    im = Image.new('L', (S, S), 0); t = Image.new('L', (S, S), 0)
    ImageDraw.Draw(t).rounded_rectangle([0, 0, 110, 250], radius=55, fill=255)
    t = t.rotate(40, expand=True, resample=Image.BICUBIC)
    im.paste(t, (160, 520), t); return im

hand = [('rr', (330, 520, 730, 840), 90),           # palm
        ('rr', (330, 250, 420, 600), 45),           # four fingers, tallest in the middle
        ('rr', (432, 190, 522, 600), 45),
        ('rr', (534, 220, 624, 600), 45),
        ('rr', (636, 300, 726, 620), 45)]
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
def paint(mask, col): img.paste(Image.new('RGBA', (S, S), col), (0, 0), mask)
def union(a, b):
    from PIL import ImageChops; return ImageChops.lighter(a, b)
from PIL import ImageFilter
body = union(layer(hand, 255), thumb())
def grow(m, n): return m.filter(ImageFilter.MaxFilter(n))
cuff = layer([('rr', (290, 800, 770, 960), 40)], 255)
paint(grow(union(body, cuff), 2*W+1), INK)
paint(body, SKIN); paint(cuff, CUFF)
# a crease line across the palm for a hand-drawn feel
d = ImageDraw.Draw(img)
d.arc((380, 560, 700, 760), 20, 160, fill=SKIN2, width=14)
d.rounded_rectangle((330, 800, 730, 815), radius=6, fill=INK)
# the sprout on the palm: a stem and two leaves, each with its own outline
def leaf(pts, col):
    d.polygon(pts, fill=INK); 
def leafshape(cx, cy, w, h, ang, col):
    t = Image.new('L', (S, S), 0); td = ImageDraw.Draw(t)
    td.ellipse((cx-w, cy-h, cx+w, cy+h), fill=255)
    t = t.rotate(ang, center=(cx, cy), resample=Image.BICUBIC)
    paint(grow(t, 2*W+1), INK); paint(t, col)
d.line((530, 700, 530, 560), fill=INK, width=44)
d.line((530, 700, 530, 560), fill=CUFF, width=18)
leafshape(450, 520, 78, 40, 35, LEAF)
leafshape(612, 500, 78, 40, -35, LEAF2)
out = img.resize((256, 256), Image.LANCZOS)
out.save('public/assets/app-icons/yad.webp', quality=92, method=6)
print('ok')
