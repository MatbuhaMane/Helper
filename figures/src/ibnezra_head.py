"""Rabbi Avraham ibn Ezra (1089-1167): portrait study. No contemporary portrait exists; this follows the traditional
image of a medieval Sephardi sage: a lean, wise face with a wry smile, a long grey beard and moustache, a wrapped turban.
Head units: chin to crown = 1.0, face toward -Y. See .claude/skills/historic-figures."""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from lib import *  # noqa: E402,F401,F403
from sdf import Field, hair_grooves  # noqa: E402

CARICATURE = 1.12
HEAD_LO, HEAD_HI = (-0.56, -0.74, -1.35), (0.56, 0.56, 0.62)
RES = 260


def build_head(res=RES):
    F = Field(HEAD_LO, HEAD_HI, res)
    N = CARICATURE
    F.add(F.ellipsoid((0, 0.06, 0.12), (0.34, 0.41, 0.42)), 0.05)                 # cranium (under the turban)
    F.add(F.ellipsoid((0, -0.2, 0.2), (0.29, 0.2, 0.24)), 0.08)                   # forehead
    F.add(F.ellipsoid((0, -0.11, -0.15), (0.28, 0.31, 0.34)), 0.08)               # face mass: lean
    for s in (1, -1):
        F.add(F.capsule((s * 0.26, 0.04, -0.12), (s * 0.12, -0.25, -0.44), 0.085, 0.07), 0.07)   # jawline
        F.add(F.ellipsoid((s * 0.22, -0.26, 0.0), (0.095, 0.085, 0.07)), 0.05)                   # high cheekbones
        F.cut(F.ellipsoid((s * 0.2, -0.33, -0.12), (0.07, 0.04, 0.08)), 0.05)                    # hollow cheeks
    F.add(F.ellipsoid((0, -0.3, -0.44), (0.1, 0.08, 0.075)), 0.06)                                # chin
    F.add(F.capsule((-0.21, -0.335, 0.12), (0.21, -0.335, 0.12), 0.045), 0.06)                    # brow ridge
    F.add(F.ellipsoid((0, -0.36, 0.08), (0.055, 0.05, 0.06)), 0.04)
    for s in (1, -1):
        F.cut(F.ellipsoid((s * 0.13, -0.37, 0.04), (0.085, 0.07, 0.058)), 0.035)                  # deep-set eyes
        F.add(F.ellipsoid((s * 0.13, -0.345, 0.088), (0.08, 0.06, 0.028), rot=(0, s * 8, 0)), 0.015)   # upper lid
        F.add(F.ellipsoid((s * 0.13, -0.34, -0.012), (0.07, 0.055, 0.022)), 0.015)                  # lower lid
        F.cut(F.sphere((s * 0.13, -0.322, 0.038), 0.074), 0.004)
        # a smile in the eyes: lifted lower lids, crow's feet
        F.wrinkle((s * 0.21, -0.33, 0.05), (s * 0.27, -0.29, 0.01), 0.006, 0.006)
        F.wrinkle((s * 0.21, -0.335, 0.025), (s * 0.27, -0.3, 0.035), 0.005, 0.006)
    # Nose: long, gently aquiline (a bump on the bridge)
    F.add(F.capsule((0, -0.38, 0.06), (0, -0.37 - 0.16 * N, -0.12 * N), 0.03, 0.042), 0.04)
    F.add(F.ellipsoid((0, -0.45, -0.02), (0.035, 0.03, 0.04)), 0.03)                              # the aquiline bump
    F.add(F.sphere((0, -0.38 - 0.16 * N, -0.14 * N), 0.05 * N), 0.035)
    for s in (1, -1):
        F.add(F.ellipsoid((s * 0.05, -0.42 - 0.07 * N, -0.17 * N), (0.04, 0.048, 0.034)), 0.03)
        F.cut(F.sphere((s * 0.03, -0.44 - 0.09 * N, -0.19 * N), 0.016), 0.01)
    # Mouth: a wry half-smile (one corner higher)
    F.add(F.ellipsoid((0, -0.395, -0.27), (0.095, 0.05, 0.03)), 0.03)
    F.add(F.ellipsoid((0, -0.385, -0.318), (0.083, 0.048, 0.028)), 0.03)
    F.cut(F.ellipsoid((0.0, -0.445, -0.29), (0.092, 0.05, 0.0065), rot=(0, -6, 0)), 0.008)
    for i, z in enumerate((0.26, 0.31)):
        F.wrinkle((-0.16, -0.37 + i * 0.012, z), (0.16, -0.37 + i * 0.012, z), 0.004, 0.008)
    for s in (1, -1):
        F.add(F.ellipsoid((s * 0.35, 0.05, 0.0), (0.042, 0.095, 0.14), rot=(0, 0, s * 10)), 0.03)  # ears
        F.cut(F.ellipsoid((s * 0.375, 0.04, 0.0), (0.02, 0.055, 0.085)), 0.02)
    F.add(F.capsule((0, 0.04, -0.35), (0, 0.08, -0.85), 0.19, 0.21), 0.1)
    F.noise(0.0016, 90)
    return F


def build_turban(res=170):
    """Wrapped cloth: overlapping tilted bands around a soft crown, with a tail tucked at the side."""
    F = Field((-0.62, -0.62, 0.0), (0.62, 0.62, 0.78), res)
    F.add(F.ellipsoid((0, 0.04, 0.42), (0.39, 0.45, 0.28)), 0.05)                                  # crown
    for i in range(7):
        a = i * 26
        tilt = 14 if i % 2 else -12
        z = 0.2 + i * 0.045
        r = 0.44 - abs(i - 2.5) * 0.025
        # a band = a flattened torus approximated by a capsule ring (many short capsules)
        segs = 26
        for k in range(segs):
            t0, t1 = 2 * math.pi * k / segs, 2 * math.pi * (k + 1) / segs
            def pt(t):
                x, y = r * math.cos(t + math.radians(a)), (r + 0.04) * math.sin(t + math.radians(a)) + 0.04
                return (x, y, z + math.sin(t) * math.radians(tilt) * 0.3)
            F.add(F.capsule(pt(t0), pt(t1), 0.055), 0.04)
    F.noise(0.003, 40, seed=3)
    return F


def build_beard(head):
    """The beard grows out of the face: an inflated copy of the head kept only where a beard grows (jaw, cheeks below
    the cheekbones, chin, a moustache), flowing down into a long sage's beard; the lips stay visible."""
    F = Field(HEAD_LO, HEAD_HI, RES)
    F.d = (head.d - 0.035).astype(np.float32)                      # a shell over the face
    # the beard line: low under the nose, rising toward the sideburns at the ears
    line = np.minimum(0.02, -0.17 + 0.6 * np.maximum(0, np.abs(F.X) - 0.11))
    F.keep((F.Z - line).astype(np.float32), 0.04)                  # a soft edge at the beard line
    F.keep((F.Y - 0.08).astype(np.float32), 0.05)                  # not around the back of the neck
    F.keep((-(F.Z + 0.52)).astype(np.float32), 0.06)               # not down the neck: the long beard hangs free
    F.cut(F.ellipsoid((0, -0.53, -0.12), (0.1, 0.17, 0.12)), 0.02)                # the nose
    F.cut(F.ellipsoid((0, -0.445, -0.3), (0.06, 0.1, 0.024)), 0.012)              # the lips show
    F.add(F.ellipsoid((0, -0.34, -0.55), (0.22, 0.16, 0.18)), 0.12)                 # under the chin
    F.add(F.capsule((0, -0.37, -0.6), (0, -0.33, -1.18), 0.17, 0.045), 0.15)        # the long beard
    F.add(F.ellipsoid((0, -0.36, -0.86), (0.16, 0.11, 0.2)), 0.12)
    for s in (1, -1):                                                              # moustache, drooping
        F.add(F.capsule((s * 0.02, -0.455, -0.225), (s * 0.1, -0.44, -0.275), 0.028, 0.026), 0.03)
        F.add(F.capsule((s * 0.1, -0.44, -0.275), (s * 0.13, -0.41, -0.36), 0.026, 0.03), 0.04)
    hair_grooves(F, amp=0.006, freq=120, flow='down', wave=0.05)
    F.noise(0.0018, 60, seed=5)
    return F


def build_brows(res=120):
    F = Field((-0.3, -0.48, 0.05), (0.3, -0.25, 0.22), res)
    for s in (1, -1):
        F.add(F.capsule((s * 0.05, -0.375, 0.135), (s * 0.24, -0.33, 0.125), 0.024, 0.016), 0.02)  # bushy brows
    hair_grooves(F, amp=0.0025, freq=260, flow='side', wave=0.01)
    return F


def head_parts():
    F = build_head()
    skin = skin_mat('skin_ie', base='#c9a18a', flush='#bf8a78', sss=0.25)     # a weathered Mediterranean complexion
    head = F.mesh('head_sculpt', skin)
    parts = [head]
    for s, name in ((1, 'eyeL'), (-1, 'eyeR')):
        parts += eye(name, (s * 0.13, -0.3, 0.035), 0.067, iris='#4a3420', look=(s * -0.04, -1, 0.03))
    T = build_turban()
    cloth = cloth_mat('turban', '#ece2cc', rough=0.85, sheen=0.5, weave=0.15)
    turban = T.mesh('turban', cloth, smooth_iter=4)
    parts.append(turban)
    grey = cloth_mat('beard_grey', '#b8b3a8', rough=0.55, sheen=0.6, weave=0.0)
    parts.append(build_beard(F).mesh('beard', grey, smooth_iter=2))
    parts.append(build_brows().mesh('brows', grey, smooth_iter=1))
    return head, parts


def hair(head):
    grey = hair_mat('grey_hair', melanin=0.22, redness=0.05, roughness=0.36, tint='#f2efe8')

    def beard(p):
        # a full beard with moustache: below the cheekbones, around the mouth; the lips stay visible
        if p.z > 0.0 or p.z < -0.8:
            return 0
        if p.y < -0.33 and -0.34 < p.z < -0.25 and abs(p.x) < 0.09:   # the lips
            return 0
        if p.y < -0.38 and p.z > -0.22:                                # the nose
            return 0
        if abs(p.x) < 0.17 and p.y < -0.26 and p.z > -0.1:             # upper cheeks clean
            return 0
        return 1.0

    def brows(p):
        return 1.0 if p.y < -0.33 and 0.1 < p.z < 0.165 and 0.05 < abs(p.x) < 0.25 else 0

    grow_hair(head, 'beard', beard, grey, count=14000, length=0.3, children=8, radius=0.0014, clump=0.65, rough=0.012, comb=(0, -0.15, -1.0))
    grow_hair(head, 'brows', brows, grey, count=700, length=0.04, children=5, radius=0.0011, clump=0.4, rough=0.008, comb=(0, 0, 0.3))


if __name__ == '__main__':
    reset()
    head, parts = head_parts()
    out = out_dir()
    studio()
    for o in bpy.data.objects:
        if o.name == 'floor':
            o.location.z = -1.4
    render(f'{out}/figures/renders/ibnezra_head.png', view='3q', target_z=-0.3, dist=5.6, res=900, samples=96)
    print('done')
