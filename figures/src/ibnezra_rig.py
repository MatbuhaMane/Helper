"""Ibn Ezra: a full skeleton for animation (spine, neck, head, jaw, arms, hands and the armillary sphere).

Joint positions are read from the owner's picture (pixels) and placed in the model: x and z map from the picture, and
the depth (y) is measured inside the model by casting rays through it. Skin weights come from distance to each bone,
with region rules (the head and beard follow the head; the sphere follows its own bone).
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from lib import *  # noqa: E402,F401,F403
from mathutils.bvhtree import BVHTree  # noqa: E402
import ibnezra_figure as F  # noqa: E402

# Joints in picture pixels (x, y) on the 1024 px image; see figures/ref and the grid check in the history.
PIX = {
    'pelvis': (500, 720), 'chest': (500, 560), 'neck': (500, 450), 'head_top': (500, 95), 'chin': (505, 420),
    'jaw_tip': (505, 470),
    'shoulder_R': (420, 505), 'elbow_R': (410, 625), 'wrist_R': (495, 580), 'hand_R': (545, 565),
    'shoulder_L': (585, 500), 'elbow_L': (612, 640), 'wrist_L': (660, 628), 'hand_L': (690, 622),
    'sphere': (683, 485), 'sphere_top': (683, 410),
}
# Which surface span gives the depth: 'mid' = middle of the whole body, 'front' = the first span the ray meets
DEPTH = {'pelvis': 'mid', 'chest': 'mid', 'neck': 'mid', 'head_top': 'mid', 'chin': 'front', 'jaw_tip': 'front',
         'shoulder_R': 'mid', 'elbow_R': 'mid', 'wrist_R': 'front', 'hand_R': 'front',
         'shoulder_L': 'mid', 'elbow_L': 'mid', 'wrist_L': 'front', 'hand_L': 'front', 'sphere': 'front', 'sphere_top': 'front'}

BONES = [  # name, head joint, tail joint, parent
    ('root', None, None, None),
    ('body', 'pelvis', 'chest', 'root'),
    ('chest', 'chest', 'neck', 'body'),
    ('head', 'neck', 'head_top', 'chest'),
    ('jaw', 'chin', 'jaw_tip', 'head'),
    ('upper_arm_R', 'shoulder_R', 'elbow_R', 'chest'),
    ('forearm_R', 'elbow_R', 'wrist_R', 'upper_arm_R'),
    ('hand_R', 'wrist_R', 'hand_R', 'forearm_R'),
    ('upper_arm_L', 'shoulder_L', 'elbow_L', 'chest'),
    ('forearm_L', 'elbow_L', 'wrist_L', 'upper_arm_L'),
    ('hand_L', 'wrist_L', 'hand_L', 'forearm_L'),
    ('sphere', 'sphere', 'sphere_top', 'hand_L'),
]


def joints(ob, pic):
    _, P = pic
    ppu = P['base_top'] - P['top']
    bvh = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    out = {}
    for name, (px, py) in PIX.items():
        x = (px - P['cx']) / ppu
        z = (P['base_top'] - py) / ppu
        hits = []
        origin = Vector((x, -3, z))
        while True:
            loc, nrm, idx, dist = bvh.ray_cast(origin, Vector((0, 1, 0)), 6)
            if loc is None:
                break
            hits.append(loc.y)
            origin = Vector((x, loc.y + 1e-4, z))
            if len(hits) > 20:
                break
        if len(hits) >= 2:
            y = (hits[0] + hits[1]) / 2 if DEPTH[name] == 'front' else (hits[0] + hits[-1]) / 2
            out[name] = Vector((x, y, z))
        else:
            # the ray missed thin parts (fingers, the sphere's rings): take the nearest surface and step inside it
            loc, nrm, idx, dist = bvh.find_nearest(Vector((x, -0.15, z)))
            out[name] = loc - nrm * 0.02 if loc is not None else Vector((x, -0.1, z))
    return out


def build_rig(ob, J):
    arm = bpy.data.armatures.new('rig')
    ro = bpy.data.objects.new('rig', arm)
    bpy.context.collection.objects.link(ro)
    bpy.context.view_layer.objects.active = ro
    bpy.ops.object.mode_set(mode='EDIT')
    for name, a, b, parent in BONES:
        bn = arm.edit_bones.new(name)
        if name == 'root':
            bn.head, bn.tail = (0, 0, 0), (0, 0, 0.06)
        else:
            bn.head, bn.tail = J[a], J[b]
            if (bn.tail - bn.head).length < 0.01:
                bn.tail = bn.head + Vector((0, 0, 0.03))
        if parent:
            bn.parent = arm.edit_bones[parent]
            bn.use_connect = False
        bn.roll = 0
    bpy.ops.object.mode_set(mode='OBJECT')
    return ro


def seg_dist(P, a, b):
    ab = b - a
    t = np.clip(((P - a) @ ab) / max(ab @ ab, 1e-9), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1), t


def weights(ob, ro, J):
    co = np.array([v.co[:] for v in ob.data.vertices])
    j = {k: np.array(v[:]) for k, v in J.items()}
    W = {}
    # limbs by distance to their segments (soft Gaussian falloff)
    limb = {
        'upper_arm_R': ('shoulder_R', 'elbow_R', 0.07), 'forearm_R': ('elbow_R', 'wrist_R', 0.06), 'hand_R': ('wrist_R', 'hand_R', 0.045),
        'upper_arm_L': ('shoulder_L', 'elbow_L', 0.07), 'forearm_L': ('elbow_L', 'wrist_L', 0.06), 'hand_L': ('wrist_L', 'hand_L', 0.045),
        'body': ('pelvis', 'chest', 0.16), 'chest': ('chest', 'neck', 0.13),
    }
    for name, (a, b, sigma) in limb.items():
        d, _ = seg_dist(co, j[a], j[b])
        W[name] = np.exp(-(d / sigma) ** 2)
    # arms only on their own side of the body: a sleeve never pulls the other side
    W['upper_arm_R'] *= (co[:, 0] < j['chest'][0] - 0.03)
    W['upper_arm_L'] *= (co[:, 0] > j['chest'][0] + 0.03)
    # the robe's skirt stays with the body
    W['body'] += np.clip((j['chest'][2] - co[:, 2]) / 0.2, 0, 1) * 0.8
    # head: everything above the neck, and the beard in front of the chest
    neck_z = j['neck'][2]
    t = np.clip((co[:, 2] - (neck_z - 0.03)) / 0.06, 0, 1)
    head = t * t * (3 - 2 * t)
    beard = (co[:, 1] < j['chest'][1] - 0.02) & (np.abs(co[:, 0] - j['chin'][0]) < 0.13) & (co[:, 2] > j['jaw_tip'][2] - 0.1)
    head = np.where(beard, np.maximum(head, 0.9), head)
    # the jaw: the lower beard and mouth area
    dj, _ = seg_dist(co, j['chin'], j['jaw_tip'])
    jaw = np.exp(-(dj / 0.06) ** 2) * beard
    # the armillary sphere and its stand: rigid, on its own bone
    ball = np.linalg.norm(co - j['sphere'], axis=1) < 0.072
    stem_bottom = j['hand_L'] + np.array([0, 0, 0.035])
    dstem, _ = seg_dist(co, stem_bottom, j['sphere'])
    sphere = (ball | (dstem < 0.022)).astype(float)
    # combine: the head region overrides the body bones above the neck
    for k in W:
        W[k] = W[k] * (1 - head) * (1 - sphere)
    W['head'] = head * (1 - jaw) * (1 - sphere)
    W['jaw'] = jaw * (1 - sphere)
    W['sphere'] = sphere
    total = sum(W.values()) + 1e-6
    for name, w in W.items():
        w = w / total
        vg = ob.vertex_groups.new(name=name)
        for i in np.where(w > 0.01)[0]:
            vg.add([int(i)], float(w[i]), 'REPLACE')
    mod = ob.modifiers.new('rig', 'ARMATURE')
    mod.object = ro
    ob.parent = ro


def aim(ro, bone, direction):
    """Point a bone along a world direction (keeps its position; children follow)."""
    pb = ro.pose.bones[bone]
    bpy.context.view_layer.update()
    cur = pb.matrix.copy()
    y = (cur.to_3x3() @ Vector((0, 1, 0))).normalized()
    rot = y.rotation_difference(Vector(direction).normalized()).to_matrix().to_4x4()
    m = Matrix.Translation(cur.translation) @ rot @ Matrix.Translation(-cur.translation) @ cur
    pb.matrix = m
    bpy.context.view_layer.update()


def pose(ro, rots):
    """rots: {bone: (x, y, z) degrees} on the pose bones (local axes)."""
    for pb in ro.pose.bones:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = [math.radians(a) for a in rots.get(pb.name, (0, 0, 0))]
    bpy.context.view_layer.update()


def build():
    reset()
    pic = F.load_picture()
    ob = F.clean_mesh()
    F.project(ob, pic)
    F.figure_material(ob)
    J = joints(ob, pic)
    ro = build_rig(ob, J)
    weights(ob, ro, J)
    return ob, ro, J, pic


if __name__ == '__main__':
    ob, ro, J, pic = build()
    for k, v in J.items():
        print(f'{k:12s}', tuple(round(c, 3) for c in v))
    studio()
    tests = {
        'rest': ({}, {}),
        'wave': ({'head': (0, 12, 8)}, {'upper_arm_R': (-0.55, -0.25, 0.8), 'forearm_R': (-0.1, -0.35, 1.0)}),
        'point': ({'head': (0, -25, 0)}, {'upper_arm_R': (-0.85, -0.35, -0.2), 'forearm_R': (-1.0, -0.45, 0.1)}),
        'lift_sphere': ({'head': (10, -20, 0)}, {'forearm_L': (0.25, -0.55, 0.8)}),
        'talk': ({'jaw': (18, 0, 0), 'head': (-8, 0, -6)}, {'forearm_R': (0.2, -0.8, 0.55)}),
    }
    out = out_dir()
    for name, (rots, aims) in tests.items():
        pose(ro, rots)
        for bone, d in aims.items():
            aim(ro, bone, d)
        render(f'{out}/figures/renders/ibnezra_pose_{name}.png', view='3q', target_z=0.52, dist=2.4, res=500, samples=24)
    print('done')
