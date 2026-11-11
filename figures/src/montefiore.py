"""Sir Moses Montefiore (1784-1885) as a bobblehead collectible. See .claude/skills/historic-figures."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lib import *  # noqa: E402,F401,F403

reset()
SKIN = mat('skin', '#ecc6a6', rough=0.5, coat=0.2, sss=0.05)
BLUSH = mat('blush', '#e6ae98', rough=0.55)
COAT = mat('coat', '#1c1a16', rough=0.62)
TROUSERS = mat('trousers', '#24221d', rough=0.7)
SHIRT = mat('shirt', '#f4f1e8', rough=0.55)
CRAVAT = mat('cravat', '#141210', rough=0.4, coat=0.3)
HAT = mat('hat', '#191714', rough=0.3, coat=0.35)
BAND = mat('band', '#3d362c', rough=0.6)
WHITE = mat('white_hair', '#f1eee5', rough=0.6, coat=0.1)
IRIS = mat('iris', '#3a2b1d', rough=0.2, coat=1.0)
GLINT = mat('glint', '#ffffff', rough=0.1, emit=2.0)
LIP = mat('lip', '#8c4c40', rough=0.45)
SHOE = mat('shoe', '#1a1714', rough=0.3, coat=0.4)
CANE = mat('cane', '#3a2a1e', rough=0.4, coat=0.3)
GOLD = mat('gold', '#b9994a', rough=0.3, metal=0.8)
BUTTON = mat('button', '#3b362f', rough=0.4)

root = pivot('root', (0, 0, 0))
body = pivot('body', (0, 0, 0.28), root)
head = pivot('head', (0, 0, 0.58), body)
arm_L = pivot('arm_L', (0.16, 0, 0.555), body)
arm_R = pivot('arm_R', (-0.16, 0, 0.555), body)
leg_L = pivot('leg_L', (0.058, 0, 0.28), root)
leg_R = pivot('leg_R', (-0.058, 0, 0.28), root)

# Legs and shoes
for side, piv in ((1, leg_L), (-1, leg_R)):
    x = side * 0.058
    attach([capsule(f'leg{side}', TROUSERS, (x, 0, 0.06), (x, 0, 0.28), 0.046, 0.05),
            ball(f'shoe{side}', SHOE, (x, -0.025, 0.028), (0.052, 0.085, 0.032))], piv)

# Frock coat: the torso, the flared skirt, the white shirt front, the cravat and buttons
torso = box('torso', COAT, (0, 0, 0.445), (0.33, 0.215, 0.29), bevel=0.9)
skirt = tube('skirt', COAT, (0, 0.005, 0.31), r1=0.168, r2=0.152, depth=0.15, round_edge=0.3)
skirt.scale = (1, 0.72, 1)
shirt = ball('shirt', SHIRT, (0, -0.088, 0.53), (0.06, 0.03, 0.055))
collar = torus('collar', SHIRT, (0, -0.005, 0.585), R=0.07, r=0.018, size=(1, 0.85, 1))
cravat = ball('cravat', CRAVAT, (0, -0.105, 0.555), (0.05, 0.022, 0.026))
knot = ball('knot', CRAVAT, (0, -0.112, 0.555), (0.018, 0.015, 0.02))
lapel_l = box('lapel_l', COAT, (0.05, -0.1, 0.5), (0.05, 0.015, 0.13), rot=(0, -18, 0), bevel=0.8)
lapel_r = box('lapel_r', COAT, (-0.05, -0.1, 0.5), (0.05, 0.015, 0.13), rot=(0, 18, 0), bevel=0.8)
buttons = [ball(f'btn{i}', BUTTON, (0.0, -0.106, 0.445 - i * 0.05), (0.011, 0.006, 0.011)) for i in range(3)]
attach([torso, skirt, shirt, collar, cravat, knot, lapel_l, lapel_r] + buttons, body)

# Arms (sleeves and hands); the cane hangs from the right hand
for side, piv in ((1, arm_L), (-1, arm_R)):
    x = side * 0.16
    parts = [capsule(f'sleeve{side}', COAT, (x, 0, 0.555), (side * 0.19, -0.01, 0.37), 0.052, 0.046),
             ball(f'cuff{side}', SHIRT, (side * 0.192, -0.012, 0.355), (0.04, 0.04, 0.014)),
             ball(f'hand{side}', SKIN, (side * 0.195, -0.015, 0.325), (0.036, 0.034, 0.042))]
    if side < 0:
        parts += [tube('cane', CANE, (-0.2, -0.04, 0.17), r1=0.011, r2=0.01, depth=0.34, seg=16, round_edge=0),
                  ball('cane_knob', GOLD, (-0.2, -0.04, 0.345), (0.02, 0.02, 0.016))]
    attach(parts, piv)

# Head
skull = ball('skull', SKIN, (0, 0, 0.785), (0.205, 0.19, 0.215), seg=32, subdiv=2)
ears = [ball(f'ear{s}', SKIN, (s * 0.2, 0.01, 0.775), (0.026, 0.017, 0.048)) for s in (1, -1)]
nose = ball('nose', SKIN, (0, -0.192, 0.752), (0.024, 0.04, 0.05), rot=(-18, 0, 0))
blush = [ball(f'blush{s}', BLUSH, (s * 0.125, -0.16, 0.735), (0.032, 0.012, 0.02)) for s in (1, -1)]
brows = [ball(f'brow{s}', WHITE, (s * 0.077, -0.172, 0.84), (0.046, 0.016, 0.016), rot=(0, s * -8, 0)) for s in (1, -1)]
mouth = torus('mouth', LIP, (0, -0.183, 0.7 + 0.026), R=0.026, r=0.0065, rot=(90, 90, 0), arc=130)
# The white chin-curtain: under the jaw from ear to ear, with sideburns; the chin and upper lip stay clean.
beard = torus('beard', WHITE, (0, 0.01, 0.665), R=0.168, r=0.052, rot=(0, 26, -90), arc=230, size=(1.02, 1.08, 1), seg=48)
lumpy(beard, strength=0.012, scale=0.03)
side_burns = [ball(f'burn{s}', WHITE, (s * 0.178, -0.04, 0.735), (0.04, 0.06, 0.095), rot=(12, 0, 0)) for s in (1, -1)]
for sb in side_burns:
    lumpy(sb, strength=0.01, scale=0.03)
tufts = [ball(f'tuft{s}', WHITE, (s * 0.185, 0.04, 0.875), (0.04, 0.075, 0.035)) for s in (1, -1)]
# Top hat
brim = tube('brim', HAT, (0, 0, 0.925), r1=0.235, r2=0.235, depth=0.02, round_edge=0.45)
brim.scale = (1, 0.9, 1)
crown = tube('crown', HAT, (0, 0, 1.05), r1=0.168, r2=0.18, depth=0.24, round_edge=0.12)
band = tube('band', BAND, (0, 0, 0.955), r1=0.171, r2=0.172, depth=0.035, round_edge=0.1)
attach([skull, nose, mouth, beard, brim, crown, band] + ears + blush + brows + side_burns + tufts, head)

# Eyes on their own nodes, so the app can blink them.
for side, name in ((1, 'eye_L'), (-1, 'eye_R')):
    e = pivot(name, (side * 0.074, -0.172, 0.785), head)
    attach([ball(f'iris{side}', IRIS, (side * 0.074, -0.172, 0.785), (0.036, 0.013, 0.046)),
            ball(f'glint{side}', GLINT, (side * 0.074 + side * 0.012, -0.184, 0.802), (0.009, 0.004, 0.009))], e)

out = out_dir()
studio()
os.makedirs(f'{out}/figures/renders', exist_ok=True)
for view in sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['3q', 'front']:
    render(f'{out}/figures/renders/montefiore_{view}.png', view=view, target_z=0.55, dist=3.0)
export(f'{out}/public/figures/montefiore.glb')
print('done')
