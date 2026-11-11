"""The elephant, in the companion series style. Head-first proportions, big flapping ears, a segmented trunk."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lib import *  # noqa: E402,F401,F403

reset()
HIDE = mat('hide', '#a39d93', rough=0.55, coat=0.15, sss=0.03)
INNER = mat('inner_ear', '#d8a99a', rough=0.6)
BELLY = mat('belly', '#b8b2a7', rough=0.6)
TUSK = mat('tusk', '#f4efe2', rough=0.3, coat=0.4)
IRIS = mat('iris', '#2b2117', rough=0.2, coat=1.0)
GLINT = mat('glint', '#ffffff', rough=0.1, emit=2.0)
NAIL = mat('nail', '#e9e2d2', rough=0.4)
BLUSH = mat('blush', '#d7a497', rough=0.6)
TUFT = mat('tuft', '#4a4238', rough=0.7)

root = pivot('root', (0, 0, 0))
body = pivot('body', (0, 0.05, 0.36), root)
head = pivot('head', (0, -0.16, 0.56), body)

# Body: a round barrel, a lighter belly
attach([ball('barrel', HIDE, (0, 0.08, 0.4), (0.25, 0.3, 0.22), seg=32, subdiv=2),
        ball('belly', BELLY, (0, -0.03, 0.33), (0.19, 0.2, 0.13))], body)

# Four stumpy legs with toenails (pivots at the hips/shoulders)
for i, (x, y) in enumerate(((0.13, -0.08), (-0.13, -0.08), (0.13, 0.25), (-0.13, 0.25))):
    name = ['leg_FL', 'leg_FR', 'leg_BL', 'leg_BR'][i]
    p = pivot(name, (x, y, 0.3), root)
    nails = [ball(f'nail{i}{k}', NAIL, (x + (k - 1) * 0.032, y - 0.074, 0.03), (0.014, 0.008, 0.013)) for k in range(3)]
    attach([capsule(f'leg{i}', HIDE, (x, y, 0.3), (x, y, 0.06), 0.075, 0.072)] + nails, p)

# Tail with a tuft
tail = pivot('tail', (0, 0.37, 0.43), body)
attach([capsule('tail_s', HIDE, (0, 0.37, 0.43), (0, 0.43, 0.3), 0.016, 0.012),
        ball('tail_t', TUFT, (0, 0.44, 0.28), (0.022, 0.02, 0.035))], tail)

# Head: big and round, forward and up
skull = ball('skull', HIDE, (0, -0.2, 0.68), (0.22, 0.2, 0.2), seg=32, subdiv=2)
brow = ball('brow', HIDE, (0, -0.26, 0.76), (0.17, 0.11, 0.08))
cheeks = [ball(f'blush{s}', BLUSH, (s * 0.13, -0.355, 0.62), (0.035, 0.012, 0.022)) for s in (1, -1)]
tusks = [tube(f'tusk{s}', TUSK, (s * 0.075, -0.38, 0.57), r1=0.022, r2=0.006, depth=0.09, rot=(-62, s * -12, 0)) for s in (1, -1)]
mouth = torus('mouth', mat('lip', '#7a5a50', rough=0.5), (0, -0.37, 0.575 + 0.02), R=0.022, r=0.006, rot=(90, 90, 0), arc=120)
attach([skull, brow, mouth] + cheeks + tusks, head)

# Eyes (own nodes, for blinking)
for side, name in ((1, 'eye_L'), (-1, 'eye_R')):
    e = pivot(name, (side * 0.095, -0.375, 0.7), head)
    attach([ball(f'iris{side}', IRIS, (side * 0.095, -0.37, 0.7), (0.034, 0.013, 0.042)),
            ball(f'glint{side}', GLINT, (side * 0.106, -0.383, 0.716), (0.009, 0.004, 0.009))], e)

# Ears: big soft discs that flap (pivot where they meet the head)
for side, name in ((1, 'ear_L'), (-1, 'ear_R')):
    p = pivot(name, (side * 0.19, -0.15, 0.7), head)
    outer = ball(f'ear{side}', HIDE, (side * 0.31, -0.12, 0.66), (0.16, 0.035, 0.2), rot=(0, side * 12, side * -18))
    inner = ball(f'inner{side}', INNER, (side * 0.31, -0.148, 0.66), (0.12, 0.012, 0.155), rot=(0, side * 12, side * -18))
    attach([outer, inner], p)

# Trunk: tapered segments curving down and a little forward, each its own node so it can sway
z, y, r = 0.64, -0.37, 0.07
parent = head
for i in range(6):
    p = pivot(f'trunk_{i + 1}', (0, y, z), parent)
    dz, dy = -0.07, -0.022 + i * 0.012   # curls back toward the body at the tip
    seg = capsule(f'trunk{i}', HIDE, (0, y, z), (0, y + dy, z + dz), r, r * 0.88)
    parts = [seg]
    if i == 5:
        parts.append(ball('trunk_tip', BELLY, (0, y + dy, z + dz - 0.02), (r * 0.95, r * 0.95, 0.02)))
    attach(parts, p)
    parent, y, z, r = p, y + dy, z + dz, r * 0.88

out = out_dir()
studio()
os.makedirs(f'{out}/figures/renders', exist_ok=True)
for view in sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['3q', 'front']:
    render(f'{out}/figures/renders/elephant_{view}.png', view=view, target_z=0.45, dist=3.1)
export(f'{out}/public/figures/elephant.glb')
print('done')
