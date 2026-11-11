"""Montefiore's head: anatomical sculpt (SDF), realistic eyes, skin and strand hair. A portrait study render.
Head units: chin to crown = 1.0, centred near the origin, face toward -Y."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lib import *  # noqa: E402,F401,F403
from sdf import Field  # noqa: E402

CARICATURE = 1.15   # how far the signature features are pushed


def build_head(res=230):
    F = Field((-0.56, -0.74, -0.95), (0.56, 0.56, 0.62), res)
    N = CARICATURE
    # Cranium: tall (Montefiore's high forehead), and the back of the head
    F.add(F.ellipsoid((0, 0.06, 0.13), (0.355, 0.42, 0.43)), 0.05)
    # Forehead plane, slightly flattened at the front
    F.add(F.ellipsoid((0, -0.2, 0.22), (0.3, 0.2, 0.25)), 0.08)
    # Face mass, jaw and chin: a long face
    F.add(F.ellipsoid((0, -0.1, -0.15), (0.3, 0.32, 0.34)), 0.08)
    for s in (1, -1):
        F.add(F.capsule((s * 0.27, 0.04, -0.12), (s * 0.13, -0.24, -0.43), 0.09, 0.075), 0.08)   # jawline
        F.add(F.ellipsoid((s * 0.215, -0.25, -0.02), (0.1, 0.085, 0.075)), 0.06)                 # cheekbones
        F.add(F.ellipsoid((s * 0.17, -0.27, -0.25), (0.095, 0.08, 0.1)), 0.06)                   # jowls (age)
    F.add(F.ellipsoid((0, -0.29, -0.44), (0.105, 0.085, 0.075)), 0.06)                            # chin
    # Brow ridge and heavy brows of an old man
    F.add(F.capsule((-0.22, -0.335, 0.12), (0.22, -0.335, 0.12), 0.05), 0.06)
    F.add(F.ellipsoid((0, -0.36, 0.08), (0.06, 0.05, 0.06)), 0.04)                                # glabella
    # Eye sockets and the eyes' openings (eyeballs sit inside)
    for s in (1, -1):
        F.cut(F.ellipsoid((s * 0.135, -0.37, 0.04), (0.085, 0.07, 0.058)), 0.035)
        # upper lid (heavy, hooded) and lower lid with a bag
        F.add(F.ellipsoid((s * 0.135, -0.355, 0.075), (0.085, 0.065, 0.04), rot=(0, s * 6, 0)), 0.02)
        F.add(F.ellipsoid((s * 0.135, -0.35, -0.005), (0.075, 0.06, 0.03)), 0.02)
        F.add(F.ellipsoid((s * 0.14, -0.335, -0.045), (0.07, 0.05, 0.03)), 0.03)                 # eye bag
        F.cut(F.sphere((s * 0.135, -0.315, 0.035), 0.071), 0.006)                                # opening for the eyeball
    # Nose: long and straight, a strong bridge (the caricature lever)
    F.add(F.capsule((0, -0.38, 0.06), (0, -0.375 - 0.15 * N, -0.12 * N), 0.032, 0.045), 0.04)
    F.add(F.sphere((0, -0.39 - 0.15 * N, -0.135 * N), 0.056 * N), 0.04)                          # tip
    for s in (1, -1):
        F.add(F.ellipsoid((s * 0.055, -0.43 - 0.06 * N, -0.17 * N), (0.042, 0.05, 0.036)), 0.03)  # alae
        F.cut(F.sphere((s * 0.032, -0.45 - 0.08 * N, -0.19 * N), 0.017), 0.01)                   # nostrils
    # Mouth: thin old lips, corners turned slightly down
    F.add(F.ellipsoid((0, -0.395, -0.265), (0.1, 0.055, 0.032)), 0.03)
    F.add(F.ellipsoid((0, -0.385, -0.315), (0.088, 0.05, 0.03)), 0.03)
    F.cut(F.ellipsoid((0, -0.445, -0.29), (0.095, 0.05, 0.007)), 0.008)
    for s in (1, -1):
        F.wrinkle((s * 0.07, -0.42, -0.14), (s * 0.12, -0.38, -0.31), 0.012, 0.012)             # nasolabial folds
        F.wrinkle((s * 0.1, -0.39, -0.3), (s * 0.115, -0.35, -0.38), 0.008, 0.01)                # marionette lines
        F.wrinkle((s * 0.22, -0.33, 0.06), (s * 0.27, -0.29, 0.01), 0.005, 0.006)                # crow's feet
        F.wrinkle((s * 0.22, -0.335, 0.03), (s * 0.27, -0.3, 0.035), 0.004, 0.006)
    for i, z in enumerate((0.27, 0.32, 0.37)):                                                    # forehead lines
        F.wrinkle((-0.17, -0.37 + i * 0.015, z), (0.17, -0.37 + i * 0.015, z + 0.01), 0.005, 0.008)
    # Ears: large (they grow with age)
    for s in (1, -1):
        F.add(F.ellipsoid((s * 0.36, 0.05, 0.0), (0.045, 0.1, 0.15), rot=(0, 0, s * 10)), 0.03)
        F.cut(F.ellipsoid((s * 0.385, 0.04, 0.0), (0.02, 0.06, 0.09)), 0.02)
    # Neck
    F.add(F.capsule((0, 0.04, -0.35), (0, 0.08, -0.85), 0.2, 0.22), 0.1)
    F.noise(0.0018, 90)
    return F


def head_parts():
    F = build_head()
    skin = skin_mat('skin_mf', base='#e4b89a', flush='#d48e7c')
    head = F.mesh('head_sculpt', skin)
    parts = [head]
    for s, name in ((1, 'eyeL'), (-1, 'eyeR')):
        parts += eye(name, (s * 0.135, -0.3, 0.035), 0.068, iris='#6b5a44', look=(s * -0.05, -1, 0.02))
    return head, parts


def hair(head):
    white = hair_mat('white_hair', melanin=0.04, redness=0.0, roughness=0.36, tint='#f4f2ec')

    def beard(p):
        # the chin-curtain: from the sideburns down the jaw and under the chin; chin front and upper lip stay clean
        if p.z > 0.06 or p.z < -0.75:
            return 0
        if p.y < -0.33 and p.z > -0.48:     # the mouth and the front of the chin
            return 0
        if abs(p.x) < 0.14 and p.y < -0.27 and p.z > -0.36:   # cheeks in front of the beard line
            return 0
        side = abs(p.x) > 0.2 and p.y > -0.3
        under = p.z < -0.3
        return 1.0 if side or under else 0

    def scalp(p):
        # white fringe above the ears and at the back, below the hat line
        return 1.0 if (abs(p.x) > 0.25 or p.y > 0.2) and -0.02 < p.z < 0.3 else 0

    def brows(p):
        return 1.0 if p.y < -0.33 and 0.1 < p.z < 0.17 and 0.05 < abs(p.x) < 0.26 else 0

    grow_hair(head, 'beard', beard, white, count=9000, length=0.11, children=8, radius=0.0014, clump=0.55, rough=0.01, comb=(0, 0, -0.6))
    grow_hair(head, 'scalp', scalp, white, count=5000, length=0.07, children=6, radius=0.0012, clump=0.5, rough=0.01, comb=(0, 0.3, -0.5))
    grow_hair(head, 'brows', brows, white, count=700, length=0.05, children=5, radius=0.0011, clump=0.4, rough=0.008, comb=(0, 0, 0.3))


if __name__ == '__main__':
    reset()
    head, parts = head_parts()
    hair(head)
    out = out_dir()
    studio()
    # portrait camera on the face
    for o in bpy.data.objects:
        if o.name == 'floor':
            o.location.z = -1.2
    render(f'{out}/figures/renders/montefiore_head.png', view='3q', target_z=0.0, dist=4.2, res=900, samples=96)
    print('done')
