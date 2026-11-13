# Generates the tent's holiday dressings (run: python docs/design/holidays/holidays.py public/assets/holidays): SVG overlays in the tent picture's own coordinates (1400 x 794, not mirrored).
import math, sys, os
OUT = sys.argv[1]
INK = '#3b2416'; W = 5
KNOBS = [(275, 372), (515, 275), (790, 205), (1025, 250), (1238, 318)]   # the front poles' tops, left to right
FRONT = (430, 724)   # the front spot: on the mat, left of the first pole (Ibn Ezra stands on the rug further right)

def svg(body, style=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 794" fill="none" stroke="{INK}" stroke-width="{W}" '
            f'stroke-linejoin="round" stroke-linecap="round">' + (f'<style>{style}</style>' if style else '') + body + '</svg>\n')
def f(v): return f'{v:.1f}'.rstrip('0').rstrip('.')
def pts(*p): return ' '.join(f'{f(x)},{f(y)}' for x, y in p)

def rope(a, b, sag):
    """a sagging rope from a to b: the path, and a function t -> (x, y, angle) along it"""
    cx, cy = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag * 2
    def at(t):
        x = (1-t)**2*a[0] + 2*(1-t)*t*cx + t*t*b[0]; y = (1-t)**2*a[1] + 2*(1-t)*t*cy + t*t*b[1]
        dx = 2*(1-t)*(cx-a[0]) + 2*t*(b[0]-cx); dy = 2*(1-t)*(cy-a[1]) + 2*t*(b[1]-cy)
        return x, y, math.degrees(math.atan2(dy, dx))
    return f'<path d="M{f(a[0])} {f(a[1])}Q{f(cx)} {f(cy)} {f(b[0])} {f(b[1])}" stroke="#6b4a2a" stroke-width="4"/>', at

def along(spacing, sag, draw, ends=0.06):
    """draw items hanging from ropes between every two front poles"""
    out = []; idx = 0
    for a, b in zip(KNOBS, KNOBS[1:]):
        path, at = rope(a, b, sag); out.append(path)
        n = max(2, int(math.dist(a, b) / spacing))
        for i in range(n + 1):
            t = ends + (1 - 2*ends) * i / n
            out.append(draw(*at(t), idx)); idx += 1
    return ''.join(out)

def knots(): return ''.join(f'<circle cx="{x}" cy="{y+6}" r="7" fill="#c9a77a" stroke-width="3"/>' for x, y in KNOBS)

def flame(x, y, h=22):
    """a candle flame standing at (x, y), with a soft glow"""
    w = h * .36
    return (f'<circle cx="{f(x)}" cy="{f(y-h*.45)}" r="{f(h*.95)}" fill="url(#glow)" stroke="none"/>'
            f'<path d="M{f(x)} {f(y-h)}C{f(x+w)} {f(y-h*.5)} {f(x+w)} {f(y-h*.08)} {f(x)} {f(y)}C{f(x-w)} {f(y-h*.08)} {f(x-w)} {f(y-h*.5)} {f(x)} {f(y-h)}Z" fill="#ffb627" stroke-width="3"/>'
            f'<path d="M{f(x)} {f(y-h*.55)}C{f(x+w*.45)} {f(y-h*.3)} {f(x+w*.4)} {f(y-h*.05)} {f(x)} {f(y-h*.04)}C{f(x-w*.4)} {f(y-h*.05)} {f(x-w*.45)} {f(y-h*.3)} {f(x)} {f(y-h*.55)}Z" fill="#fff3c4" stroke="none"/>')
GLOW = '<defs><radialGradient id="glow"><stop offset="0" stop-color="#ffd36b" stop-opacity=".75"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient></defs>'
def shadow(x, y, rx, ry=None): return f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(rx)}" ry="{f(ry or rx*.18)}" fill="#2b1a0e" fill-opacity=".28" stroke="none"/>'

files = {}

# Hanukkah: a row hanukkiah at the entrance; #n1..#n8 shows that night's lights (added right to left)
x0, g = FRONT
b = [shadow(x0, g+2, 120),
     f'<path d="M{x0-48} {g}L{x0+48} {g}L{x0+30} {g-22}L{x0-30} {g-22}Z" fill="#d9a441"/>',
     f'<path d="M{x0+20} {g-22}L{x0+30} {g-22}L{x0+48} {g}L{x0+32} {g}Z" fill="#a8752a" stroke="none"/>',
     f'<rect x="{x0-8}" y="{g-176}" width="16" height="156" fill="#d9a441"/>',
     f'<rect x="{x0-112}" y="{g-136}" width="224" height="15" rx="5" fill="#d9a441"/>',
     f'<path d="M{x0-110} {g-123}H{x0+110}" stroke="#a8752a" stroke-width="4"/>']
for x in [x0+102, x0+78, x0+54, x0+30, x0-30, x0-54, x0-78, x0-102]:
    b.append(f'<path d="M{x} {g-136}V{g-150}" stroke-width="7"/><path d="M{x} {g-136}V{g-150}" stroke="#d9a441" stroke-width="3"/>')
cups = [x0+102, x0+78, x0+54, x0+30, x0-30, x0-54, x0-78, x0-102]          # light 1 is the rightmost
def cup(x, top): return f'<path d="M{x-11} {top}H{x+11}L{x+7} {top+16}H{x-7}Z" fill="#e3b14e"/>'
b += [cup(x, g-164) for x in cups] + [cup(x0, g-192)]
b += [f'<g id="n{i}"/>' for i in range(1, 9)]
for i, x in enumerate(cups, 1):
    col = '#f4efe2' if i % 2 else '#7fb6e0'
    b.append(f'<g class="l{i}"><rect x="{x-5}" y="{g-194}" width="10" height="30" rx="2" fill="{col}" stroke-width="3"/>'
             f'<path d="M{x} {g-194}v-5" stroke-width="2.5"/>{flame(x, g-198, 24)}</g>')
b.append(f'<rect x="{x0-5}" y="{g-222}" width="10" height="30" rx="2" fill="#f4efe2" stroke-width="3"/><path d="M{x0} {g-222}v-5" stroke-width="2.5"/>{flame(x0, g-226, 26)}')
hide = ','.join(f'#n{n}:target~.l{i}' for n in range(1, 8) for i in range(n+1, 9))
files['hanukkah'] = svg(GLOW + ''.join(b), hide + '{display:none}')

# Shabbat: two candlesticks and a covered challah at the entrance
def candlestick(x, g, h=150):
    return (f'<path d="M{x-24} {g}H{x+24}L{x+14} {g-12}H{x-14}Z" fill="#c9ccd3"/>'
            f'<path d="M{x} {g-12}V{g-h+40}" stroke-width="13"/><path d="M{x} {g-12}V{g-h+40}" stroke-width="5" stroke="#d9dce2"/>'
            f'<path d="M{x-14} {g-h+40}H{x+14}L{x+8} {g-h+52}H{x-8}Z" fill="#c9ccd3"/>'
            f'<rect x="{x-7}" y="{g-h-2}" width="14" height="42" rx="2" fill="#f7f3ea" stroke-width="3"/><path d="M{x} {g-h-2}v-6" stroke-width="2.5"/>'
            + flame(x, g-h-8, 28))
x0, g = FRONT
files['shabbat'] = svg(GLOW + shadow(x0, g+2, 135) + candlestick(x0-80, g) + candlestick(x0-20, g-6, 158)
    + f'<path d="M{x0+20} {g}C{x0+20} {g-52} {x0+130} {g-58} {x0+140} {g}Z" fill="#f3efe4"/>'      # the cloth over the challah
    + f'<path d="M{x0+30} {g-20}C{x0+60} {g-30} {x0+100} {g-30} {x0+132} {g-20}" stroke="#4a6fa5" stroke-width="5"/>'
    + f'<path d="M{x0+36} {g-9}C{x0+62} {g-16} {x0+100} {g-16} {x0+128} {g-9}" stroke="#d9a441" stroke-width="4"/>')

# Sukkot: schach (palm fronds) along the front edge and on the roof, and fruit hanging between the poles
def frond(x1, y1, x2, y2, leaf=46, every=17, col='#5e8a3a', dark='#43682a'):
    L = math.dist((x1, y1), (x2, y2)); ux, uy = (x2-x1)/L, (y2-y1)/L; nx, ny = -uy, ux
    o = [f'<path d="M{f(x1)} {f(y1)}L{f(x2)} {f(y2)}" stroke="#8a6a3a" stroke-width="6"/>']
    k = int(L / every)
    for i in range(1, k):
        t = i / k; px, py = x1 + ux*L*t, y1 + uy*L*t; s = leaf * (1 - abs(t - .45)*1.1)
        for side in (1, -1):
            ex, ey = px + (nx*side*.95 + ux*.55)*s, py + (ny*side*.95 + uy*.55)*s
            c = col if (i+side) % 3 else dark
            o.append(f'<path d="M{f(px)} {f(py)}Q{f((px+ex)/2 + nx*side*6)} {f((py+ey)/2 + ny*side*6)} {f(ex)} {f(ey)}" stroke="{c}" stroke-width="7"/>')
    return ''.join(o)
roof = [(300, 360, 560, 150), (520, 290, 690, 60), (700, 230, 860, 60), (830, 225, 1030, 120), (1000, 262, 1230, 250), (240, 330, 430, 210)]
fr = ''.join(frond(*r) for r in roof)
edge = ''.join(frond(a[0], a[1]+4, c[0], c[1]+4, leaf=34, every=15, col='#6f9a44') for a, c in zip(KNOBS, KNOBS[1:]))
def fruit(x, y, ang, i):
    k = i % 3; yy = y + 36
    s = f'<path d="M{f(x)} {f(y)}V{f(yy-14)}" stroke="#6b4a2a" stroke-width="3"/>'
    if k == 0: return s + f'<circle cx="{f(x)}" cy="{f(yy)}" r="15" fill="#c2332b"/><path d="M{f(x-6)} {f(yy-14)}l3 -7 3 5 3 -5 3 7" fill="#c2332b" stroke-width="3"/>'
    if k == 1: return s + f'<circle cx="{f(x)}" cy="{f(yy-2)}" r="12" fill="#e9b52f"/><circle cx="{f(x-4)}" cy="{f(yy-6)}" r="3.5" fill="#fff3c4" stroke="none"/>'
    return s + f'<ellipse cx="{f(x)}" cy="{f(yy)}" rx="11" ry="15" fill="#e3c13b"/><path d="M{f(x)} {f(yy-15)}v-5" stroke-width="3"/>'
files['sukkot'] = svg(fr + edge + along(62, 26, fruit, .12) + knots())

# Rosh Hashanah: apples, a pomegranate and honey at the entrance, a shofar on the crates
x0, g = FRONT
def apple(x, y, r=24):
    return (f'<path d="M{f(x)} {f(y-r*.8)}C{f(x+r*1.2)} {f(y-r*1.3)} {f(x+r*1.3)} {f(y+r*.9)} {f(x)} {f(y+r)}C{f(x-r*1.3)} {f(y+r*.9)} {f(x-r*1.2)} {f(y-r*1.3)} {f(x)} {f(y-r*.8)}Z" fill="#c8302a"/>'
            f'<path d="M{f(x)} {f(y-r*.8)}l3 -12" stroke-width="4"/><path d="M{f(x+3)} {f(y-r*1.1)}c8 -10 18 -8 22 -4c-8 6 -16 7 -22 4z" fill="#6f9a44" stroke-width="3"/>'
            f'<ellipse cx="{f(x-r*.45)}" cy="{f(y-r*.3)}" rx="{f(r*.18)}" ry="{f(r*.3)}" fill="#fff" fill-opacity=".45" stroke="none"/>')
files['rosh-hashanah'] = svg(shadow(x0, g+2, 130)
    + f'<ellipse cx="{x0}" cy="{g-8}" rx="112" ry="22" fill="#c08a4a"/><path d="M{x0-104} {g-4}Q{x0} {g+14} {x0+104} {g-4}" stroke="#8a5a28" stroke-width="4"/>'
    + f'<rect x="{x0-6}" y="{g-96}" width="56" height="74" rx="14" fill="#e3a12b"/><path d="M{x0+4} {g-76}V{g-36}" stroke="#fff3c4" stroke-width="5"/>'
    + f'<rect x="{x0-10}" y="{g-108}" width="64" height="16" rx="5" fill="#f3efe4"/>'
    + f'<circle cx="{x0+78}" cy="{g-38}" r="30" fill="#b3262a"/><path d="M{x0+68} {g-66}l4 -12 6 8 6 -8 4 12" fill="#b3262a" stroke-width="4"/>'
    + apple(x0-70, g-34) + apple(x0-26, g-24, 22)
    + '<path d="M1200 512C1232 520 1262 512 1300 470C1318 450 1330 452 1334 466C1338 486 1318 500 1300 506C1262 526 1230 532 1200 528Z" fill="#ead6a8"/>'
    + '<path d="M1300 470C1312 478 1322 492 1316 504" stroke="#b08a52" stroke-width="4"/><path d="M1240 516v14M1270 506v16" stroke="#b08a52" stroke-width="4"/>')

# Tu BiShvat: almond blossom branches tied to the front poles
def branch(x, y, ang, L=150, seed=0):
    a = math.radians(ang); ex, ey = x + math.cos(a)*L, y + math.sin(a)*L
    d = f'M{f(x)} {f(y)}Q{f((x+ex)/2 + 12)} {f((y+ey)/2 - 14)} {f(ex)} {f(ey)}'
    o = [f'<path d="{d}" stroke-width="9"/><path d="{d}" stroke="#7d5a3a" stroke-width="3.5"/>']
    for i in range(1, 6):
        t = i / 6; px, py = x + (ex-x)*t + (1 if i % 2 else -1)*10, y + (ey-y)*t - 14*math.sin(math.pi*t)
        r = 11 + (i + seed) % 3 * 2; col = '#f6d6dc' if (i + seed) % 2 else '#fbeef0'
        o.append(''.join(f'<circle cx="{f(px + math.cos(k*1.2566)*r*.75)}" cy="{f(py + math.sin(k*1.2566)*r*.75)}" r="{f(r*.62)}" fill="{col}" stroke-width="2.5"/>' for k in range(5))
                 + f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(r*.32)}" fill="#c2335a" stroke-width="2"/>')
    return ''.join(o)
files['tu-bishvat'] = svg(branch(515, 300, 200, 130, 1) + branch(515, 300, -20, 120, 2) + branch(790, 230, 196, 120, 3) + branch(790, 230, -16, 120, 4)
    + branch(1025, 275, 194, 120, 5) + branch(1025, 275, -20, 110, 0) + ''.join(f'<path d="M{x-12} {y}h24" stroke="#c9a77a" stroke-width="8"/>' for x, y in [(515, 300), (790, 230), (1025, 275)]))

# Purim: pennants between the poles, and a mask hanging from the first rope
PEN = ['#d8432f', '#f0b62e', '#3d7fc0', '#57a05a', '#b4549a']
def pennant(x, y, ang, i):
    a = math.radians(ang); c, s = math.cos(a), math.sin(a)
    return f'<path d="M{pts((x - c*18, y - s*18), (x + c*18, y + s*18), (x, y + 44))}Z" fill="{PEN[i % 5]}" stroke-width="3.5"/>'
files['purim'] = svg(along(44, 30, pennant, .08) + knots())

# Pesach: matzot, a seder plate and Elijah's cup at the entrance
x0, g = FRONT
files['pesach'] = svg(shadow(x0, g+2, 140)
    + ''.join(f'<path d="M{x0-122} {g-6-k*9}L{x0-46} {g-14-k*9}L{x0-30} {g-2-k*9}L{x0-106} {g+6-k*9}Z" fill="{"#e6c88e" if k % 2 else "#efd7a3"}" stroke-width="3.5"/>' for k in range(3))
    + ''.join(f'<circle cx="{x0-92+dx}" cy="{g-23+dy}" r="2.4" fill="#b8894a" stroke="none"/>' for dx, dy in [(0, 0), (14, -2), (28, -4), (8, 6), (22, 4), (36, 2)])
    + f'<ellipse cx="{x0+28}" cy="{g-10}" rx="70" ry="20" fill="#e8ebef"/><ellipse cx="{x0+28}" cy="{g-12}" rx="52" ry="13" fill="#f7f8fa" stroke-width="3"/>'
    + f'<ellipse cx="{x0+4}" cy="{g-16}" rx="11" ry="7" fill="#fbf7ec" stroke-width="3"/><circle cx="{x0+28}" cy="{g-20}" r="8" fill="#8a5a32" stroke-width="3"/>'
    + f'<path d="M{x0+44} {g-14}c6 -14 18 -14 22 -4" stroke="#5e8a3a" stroke-width="6"/><path d="M{x0+12} {g-6}l18 -4" stroke="#f3efe4" stroke-width="7"/>'
    + f'<path d="M{x0+90} {g-100}H{x0+132}C{x0+132} {g-62} {x0+124} {g-50} {x0+111} {g-48}V{g-12}H{x0+128}V{g}H{x0+94}V{g-12}H{x0+111}V{g-48}C{x0+98} {g-50} {x0+90} {g-62} {x0+90} {g-100}Z" fill="#c9ccd3"/>'
    + f'<path d="M{x0+93} {g-88}H{x0+129}C{x0+128} {g-66} {x0+122} {g-58} {x0+111} {g-57}C{x0+100} {g-58} {x0+94} {g-66} {x0+93} {g-88}Z" fill="#8e2435" stroke="none"/>')

# Yom HaAtzmaut: a string of small flags between the poles, and a big one on the middle pole
def flag(x, y, ang, i):
    w, h = 40, 30; X, Y = x - w/2, y + 2
    return (f'<rect x="{f(X)}" y="{f(Y)}" width="{w}" height="{h}" fill="#fbfbf8" stroke-width="3"/>'
            f'<path d="M{f(X)} {f(Y+5)}h{w}M{f(X)} {f(Y+h-5)}h{w}" stroke="#2457a6" stroke-width="3.5"/>'
            f'<path d="M{f(x)} {f(Y+h/2-6)}l5.2 9h-10.4zM{f(x)} {f(Y+h/2+6)}l5.2 -9h-10.4z" stroke="#2457a6" stroke-width="1.8"/>')
big = ('<path d="M790 205V92" stroke-width="10"/><path d="M790 205V92" stroke="#8a6a3a" stroke-width="4"/>'
       '<rect x="794" y="94" width="96" height="66" fill="#fbfbf8" stroke-width="4"/><path d="M794 106h96M794 148h96" stroke="#2457a6" stroke-width="7"/>'
       '<path d="M842 115l11 19h-22zM842 139l11 -19h-22z" stroke="#2457a6" stroke-width="3.5"/>')
files['yom-haatzmaut'] = svg(along(50, 26, flag, .08) + knots() + big)

# Shavuot: a green garland with flowers between the poles, and sheaves of wheat at two poles
FL = ['#f6f0e2', '#f0b62e', '#e98aa6', '#f6f0e2']
def green(x, y, ang, i):
    a = math.radians(ang + 90 + (25 if i % 2 else -25)); ex, ey = x + math.cos(a)*24, y + math.sin(a)*24
    lc = '#5e8a3a' if i % 3 else '#7aa84c'
    leaf = f'<path d="M{f(x)} {f(y)}Q{f((x+ex)/2 + 8)} {f((y+ey)/2)} {f(ex)} {f(ey)}Q{f((x+ex)/2 - 8)} {f((y+ey)/2)} {f(x)} {f(y)}Z" fill="{lc}" stroke-width="3"/>'
    if i % 4: return leaf
    c = FL[(i // 4) % 4]
    return leaf + ''.join(f'<circle cx="{f(x + math.cos(k*1.2566)*8)}" cy="{f(y + 6 + math.sin(k*1.2566)*8)}" r="6.5" fill="{c}" stroke-width="2.5"/>' for k in range(5)) + f'<circle cx="{f(x)}" cy="{f(y+6)}" r="4" fill="#e3a12b" stroke-width="2"/>'
def sheaf(x, g):
    o = [shadow(x, g+2, 40)]
    for k in range(-3, 4):
        tx, ty = x + k*9, g - 110 + abs(k)*4
        o.append(f'<path d="M{x + k*3} {g}L{tx} {ty}" stroke="#c99a3a" stroke-width="5"/>')
        o.append(f'<ellipse cx="{tx}" cy="{ty-12}" rx="7" ry="17" fill="#e2b552" stroke-width="3"/>')
    o.append(f'<path d="M{x-16} {g-46}Q{x} {g-38} {x+16} {g-46}" stroke="#8a5a28" stroke-width="7"/>')
    return ''.join(o)
files['shavuot'] = svg(along(20, 24, green, .03) + knots() + sheaf(430, 724) + sheaf(1120, 650))

for k, v in files.items():
    open(os.path.join(OUT, k + '.svg'), 'w', encoding='utf-8').write(v)
    print(k, len(v))
