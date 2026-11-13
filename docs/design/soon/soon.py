# Draws the "בקרוב" pictures for the big ideas that wait (vision batch 15): run
#   python docs/design/soon/soon.py public/assets/soon
# Each is a small scene in the tent's own look: one warm ink outline (#3b2416), flat painted fills, a soft ground shadow.
# 320 x 240, read well from 90 px (the home's strip) up to 260 px (the sheet). The pictures keep their colours at night,
# like the tent does.
import sys, os
OUT = sys.argv[1]
INK = '#3b2416'

def svg(title, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" fill="none" stroke="{INK}" stroke-width="4" '
            f'stroke-linejoin="round" stroke-linecap="round"><title>{title}</title>' + body + '</svg>\n')

def shadow(cx, cy, rx, ry):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#2e2a1e" fill-opacity=".16" stroke="none"/>'

def pine(x, base, h, fill, dark):
    """a pine of three tiers on a short trunk, its shade side darker"""
    w = h * .42
    t = (f'<path d="M{x-3} {base}v-{h*.16:.0f}h6v{h*.16:.0f}z" fill="#6b4a2a" stroke-width="3"/>'
         f'<path d="M{x} {base-h:.0f}L{x+w*.62:.0f} {base-h*.58:.0f}H{x+w*.36:.0f}L{x+w*.82:.0f} {base-h*.34:.0f}H{x+w*.5:.0f}'
         f'L{x+w:.0f} {base-h*.14:.0f}H{x-w:.0f}L{x-w*.5:.0f} {base-h*.34:.0f}H{x-w*.82:.0f}L{x-w*.36:.0f} {base-h*.58:.0f}'
         f'H{x-w*.62:.0f}Z" fill="{fill}" stroke-width="3.5"/>'
         f'<path d="M{x} {base-h+6:.0f}L{x+w*.5:.0f} {base-h*.6:.0f}M{x+w*.2:.0f} {base-h*.5:.0f}L{x+w*.7:.0f} {base-h*.36:.0f}'
         f'M{x+w*.3:.0f} {base-h*.28:.0f}L{x+w*.88:.0f} {base-h*.16:.0f}" stroke="{dark}" stroke-width="3" opacity=".7"/>')
    return t

def tent(x, y, w, h, fill, flag):
    """a friend's small tent on the slope: a canvas triangle, a dark door, a pennant on its pole"""
    return (f'<path d="M{x} {y-h}v-12" stroke-width="3"/><path d="M{x} {y-h-12}l10 3-10 4z" fill="{flag}" stroke-width="2.5"/>'
            f'<path d="M{x-w} {y}L{x} {y-h}L{x+w} {y}Z" fill="{fill}"/>'
            f'<path d="M{x-w*.3:.1f} {y}L{x} {y-h*.6:.1f}L{x+w*.3:.1f} {y}Z" fill="{INK}" fill-opacity=".85" stroke-width="3"/>')

def hill():
    b = [shadow(160, 222, 146, 12)]
    # the forest behind
    b += [pine(36, 186, 70, '#4f7a34', '#2f4f22'), pine(70, 176, 84, '#5e8a3a', '#2f4f22'),
          pine(252, 178, 82, '#5e8a3a', '#2f4f22'), pine(288, 190, 66, '#4f7a34', '#2f4f22')]
    # the hill, a sunlit crown, grass
    b.append('<path d="M16 220C52 146 104 96 166 94C232 92 272 146 306 220Z" fill="#7fa84c"/>')
    b.append('<path d="M104 120C130 100 206 98 232 120C204 110 132 110 104 120Z" fill="#a4c86a" stroke="none"/>')
    tuft = lambda x, y: f'M{x-4} {y}l-2-6M{x} {y}v-8M{x+4} {y}l2-6'
    b.append(f'<path d="{"".join(tuft(x, y) for x, y in ((62, 198), (248, 202), (120, 180), (200, 146), (84, 172), (270, 196)))}" stroke="#4f7a34" stroke-width="2.5"/>')
    # the path up, outlined: an ink stroke under a sand one
    p = 'M150 221C118 198 204 184 172 160C146 142 190 128 168 104'
    b.append(f'<path d="{p}" stroke-width="17"/><path d="{p}" stroke="#ead7a6" stroke-width="10"/>')
    # friends' tents on the slopes
    b += [tent(96, 160, 20, 30, '#c2332b', '#f0b62e'), tent(238, 166, 18, 28, '#d9a441', '#2457a6'), tent(214, 124, 12, 18, '#c9a77a', '#c2332b')]
    # on the crown: a shade canopy on two poles, lights strung under it, a small fire between
    b.append('<path d="M138 100V62M198 100V62" stroke-width="4"/>')
    b.append('<path d="M126 66Q168 36 210 66L203 73Q168 52 133 73Z" fill="#a8752a"/>')
    b.append('<path d="M146 60Q168 48 190 60" stroke="#f4e3bc" stroke-width="3"/>')
    b.append('<path d="M138 74Q168 92 198 74" stroke="#6b4a2a" stroke-width="2.5"/>')
    b += [f'<circle cx="{x}" cy="{y}" r="3.6" fill="#ffd36b" stroke-width="2"/>' for x, y in ((148, 80), (158, 84), (168, 85), (178, 84), (188, 80))]
    b.append('<path d="M156 101l24-6M156 95l24 6" stroke="#6b4a2a" stroke-width="5"/>')
    b.append('<path d="M168 98C158 92 160 82 166 76C166 84 172 82 172 76C178 84 178 94 168 98Z" fill="#f0b62e" stroke-width="3"/>')
    b.append('<path d="M168 96C164 92 165 88 168 85C170 89 172 92 168 96Z" fill="#fff3c4" stroke="none"/>')
    # a round olive tree in front, a pine on the other side
    b.append('<path d="M38 222c0-10 1-18-2-26" stroke-width="5"/>')
    b.append('<path d="M14 196c-6-12 6-24 18-20c4-12 24-12 28 0c12-2 18 12 10 20c4 10-8 16-16 12c-6 6-20 6-24 0c-10 4-20-4-16-12Z" fill="#7a9a52"/>')
    b.append('<path d="M28 188c4-4 10-4 14 0M46 196c3-3 8-3 11 0" stroke="#4f6e34" stroke-width="3"/>')
    b.append(pine(292, 226, 58, '#5e8a3a', '#2f4f22'))
    return svg('גבעה ביער', ''.join(b))

def garage():
    b = [shadow(160, 224, 146, 11)]
    # the driveway
    b.append('<path d="M92 222L106 190H210L228 222Z" fill="#dccfb1" stroke-width="3"/>')
    # the building, a stone wall
    b.append('<rect x="58" y="94" width="214" height="98" fill="#eadcbc"/>')
    b.append('<path d="M66 112h18M70 160h14M226 160h20M256 176h10M236 110h0" stroke-width="2.5" opacity=".35"/>')
    b.append('<path d="M46 100L165 38L284 100Z" fill="#a8752a"/><path d="M46 100H284" stroke-width="4"/>')
    b.append('<path d="M70 92L165 46L260 92" stroke="#c9944e" stroke-width="3"/>')
    b.append('<circle cx="165" cy="76" r="9" fill="#f6e6b4"/><path d="M165 67v18M156 76h18" stroke-width="2.5"/>')
    # a smart antenna on the roof, its signal
    b.append('<path d="M228 70V50" stroke-width="3.5"/><circle cx="228" cy="47" r="4" fill="#f0b62e" stroke-width="2.5"/>')
    b.append('<path d="M218 38a14 14 0 0 1 20 0M211 30a24 24 0 0 1 34 0" stroke="#5e8a3a" stroke-width="3.5"/>')
    # the open door: the dark inside, the car's nose, the rolled-up door above it
    b.append('<rect x="96" y="114" width="114" height="78" fill="#3a2a22"/>')
    b.append('<path d="M108 192V170Q110 154 126 152H180Q196 154 198 170V192Z" fill="#c2332b"/>')
    b.append('<path d="M112 168Q114 158 128 156H178Q192 158 194 168" stroke="#e05a4c" stroke-width="3"/>')
    b.append('<circle cx="124" cy="172" r="7" fill="#fff3c4" stroke-width="3"/><circle cx="182" cy="172" r="7" fill="#fff3c4" stroke-width="3"/>')
    b.append('<rect x="141" y="167" width="24" height="10" rx="3" fill="#3b2416" stroke-width="2.5"/>')
    b.append('<rect x="102" y="181" width="102" height="9" rx="4.5" fill="#c9ccd3" stroke-width="3"/>')
    b.append('<rect x="96" y="114" width="114" height="40" fill="#c9a77a"/>')
    b.append('<path d="M96 124h114M96 134h114M96 144h114" stroke-width="2.2" opacity=".55"/>')
    b.append('<rect x="143" y="148" width="20" height="4" rx="2" fill="#3b2416" stroke="none"/>')
    # a wall lamp, lit
    b.append('<path d="M70 118h8" stroke-width="3.5"/><path d="M78 112h10l-2 14h-6Z" fill="#ffd36b" stroke-width="3"/>')
    b.append('<path d="M83 132v6M74 130l-4 4M92 130l4 4" stroke="#e3a12b" stroke-width="3"/>')
    # an air conditioner on the wall, its cool breath
    b.append('<rect x="218" y="114" width="46" height="26" rx="4" fill="#f3efe4"/>')
    b.append('<path d="M224 133h34" stroke-width="2.5"/><circle cx="252" cy="123" r="2.5" fill="#5e8a3a" stroke="none"/>')
    b.append('<path d="M226 148c4 4 0 8 4 12M240 148c4 4 0 8 4 12M254 148c4 4 0 8 4 12" stroke="#6f9ccc" stroke-width="3"/>')
    # a robot vacuum at work on the ground
    b.append('<path d="M38 206v4a24 8 0 0 0 48 0v-4" fill="#4a4a52" stroke-width="3"/>')
    b.append('<ellipse cx="62" cy="206" rx="24" ry="8" fill="#76767f" stroke-width="3"/>')
    b.append('<ellipse cx="62" cy="205" rx="11" ry="3.6" fill="#5a5a62" stroke-width="2"/><circle cx="76" cy="204" r="2" fill="#7ee07e" stroke="none"/>')
    b.append('<path d="M92 200h12M94 210h16" stroke-width="3" opacity=".45"/>')
    return svg('המוסך', ''.join(b))

os.makedirs(OUT, exist_ok=True)
for name, fn in (('hill', hill), ('garage', garage)):
    with open(os.path.join(OUT, name + '.svg'), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(fn())
    print(name, os.path.getsize(os.path.join(OUT, name + '.svg')))
