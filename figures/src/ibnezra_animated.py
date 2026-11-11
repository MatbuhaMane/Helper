"""Ibn Ezra, fully animated: the Mixamo-rigged A-pose model with the chosen Mixamo clips, painted from the owner's
A-pose picture, exported as one GLB with all the animations (for three.js AnimationMixer in the app).

Inputs:  figures/ref/mixamo/*.fbx (the first one With Skin), figures/ref/ibnezra_apose_gemini.jpg
Output:  public/figures/ibn_ezra.glb (replaces the static figure), figures/renders/ibnezra_anim_*.png
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from lib import *  # noqa: E402,F401,F403
import ibnezra_figure as F  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

ROOT = out_dir()
MIX = f'{ROOT}/figures/ref/mixamo'
IMG = f'{ROOT}/figures/ref/ibnezra_apose_gemini.jpg'
BASE = 'Breathing Idle'
# app name -> Mixamo file
CLIPS = {
    'idle': 'Breathing Idle', 'wave': 'Waving', 'bow': 'Quick Formal Bow', 'point': 'Pointing',
    'point_forward': 'Pointing Forward', 'talk': 'Talking', 'talk2': 'Talking (1)', 'think': 'Thinking',
    'secret': 'Telling A Secret', 'shrug': 'Shrugging', 'happy': 'Happy Idle', 'walk': 'Walking',
    'walk_start': 'Start Walking', 'walk_stop': 'Stop Walking', 'sleep': 'Sleeping Idle',
    # the owner likes the anachronisms: a medieval sage on a phone is part of the comedy
    'phone': 'Talking On A Cell Phone', 'texting_walk': 'Walking While Texting', 'rap': 'Rapping',
    'yell': 'Yelling', 'limp': 'Injured Walking', 'point_low': 'Kneeling Pointing',
    'fall': 'Falling',     # flailing while being dragged across the screen
}
TEX = 4096


def import_fbx(name):
    before = set(bpy.data.objects)
    acts_before = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=f'{MIX}/{name}.fbx', automatic_bone_orientation=False)
    new = [o for o in bpy.data.objects if o not in before]
    act = [a for a in bpy.data.actions if a not in acts_before]
    return new, act[0] if act else None


def in_place(action):
    """Keep the hips' up-and-down, drop travel across the floor (the app moves the figure itself)."""
    fcs = action.fcurves if hasattr(action, 'fcurves') else []
    if not fcs and hasattr(action, 'layers'):
        fcs = [fc for layer in action.layers for strip in layer.strips for bag in strip.channelbags for fc in bag.fcurves]
    for fc in fcs:
        if fc.data_path.endswith('location') and 'Hips' in fc.data_path:
            vals = [k.co[1] for k in fc.keyframe_points]
            if vals and (max(vals) - min(vals)) > 12:          # cm: travel, not a bob
                v0 = vals[0]
                for k in fc.keyframe_points:
                    k.co[1] = v0
                    k.handle_left[1] = v0
                    k.handle_right[1] = v0


def round_head_normals(ob, U, W, arm):
    """The generated mesh is crumpled around the nose, brow and turban: folded slivers whose normals point every
    which way and light up black. The painted picture already carries the face's shading, so the head gets smooth
    normals pointing out from its centre (a sculpted figurine's soft light), fading into the real ones at the neck."""
    me = ob.data
    co = np.array([v.co[:] for v in me.vertices])
    head_c = (co[U[:, 2] > 0.6].min(0) + co[U[:, 2] > 0.6].max(0)) / 2
    # turn the head's folded faces around so every face looks outward (they render lit, not as black holes)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    flip = [f for f in bm.faces if U[[v.index for v in f.verts], 2].mean() > 0.57
            and f.normal.dot(f.calc_center_median() - Vector(head_c)) < 0]
    # the body: outward is away from the nearest bone of the skeleton (world space, rest pose)
    segs = [(arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones
            if not any(k in b.name for k in ('Head', 'Eye', 'Top', 'Hand', 'Thumb', 'Index', 'Middle', 'Ring', 'Pinky'))]
    A = np.array([a[:] for a, _ in segs])
    B = np.array([b[:] for _, b in segs])
    AB = B - A
    for f in bm.faces:
        ids = [v.index for v in f.verts]
        if U[ids, 2].mean() > 0.57 or len(ids) < 3:
            continue
        P = W[ids]
        c = P.mean(0)
        n = np.cross(P[1] - P[0], P[2] - P[0])
        t = np.clip(((c - A) * AB).sum(1) / np.maximum((AB * AB).sum(1), 1e-9), 0, 1)
        Q = A + t[:, None] * AB
        k = np.argmin(np.linalg.norm(c - Q, axis=1))
        if np.dot(n, c - Q[k]) < 0:
            flip.append(f)
    bmesh.ops.reverse_faces(bm, faces=flip)
    bm.to_mesh(me)
    bm.free()
    me.update()
    print('turned', len(flip), 'head faces outward')
    vn = np.array([v.normal[:] for v in me.vertices])
    t = np.clip((U[:, 2] - 0.55) / 0.08, 0, 1)
    w = t * t * (3 - 2 * t)
    head = U[:, 2] > 0.6
    c = (co[head].min(0) + co[head].max(0)) / 2
    radial = co - c
    radial /= np.linalg.norm(radial, axis=1, keepdims=True) + 1e-9
    n = radial * w[:, None] + vn * (1 - w[:, None])
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
    me.normals_split_custom_set_from_vertices([tuple(x) for x in n])
    print('rounded head normals on', int((w > 0).sum()), 'vertices')


def rebuild_head(ob, cut=0.62, N=150):
    """The generated head is crumpled (folded slivers, one side worse than the other). Replace it with a clean head
    built the way the picture is painted on, straight from the front: depth maps of the head's front and back
    surfaces are median-filtered (slivers gone), mirrored about the nose so the two sides match exactly, smoothed,
    rounded at the silhouette and stitched into one closed surface, skinned to the head bone."""
    import bmesh
    from scipy.ndimage import distance_transform_edt, gaussian_filter, median_filter
    me = ob.data
    M = np.array(ob.matrix_world)
    co = np.array([v.co[:] for v in me.vertices])
    W = (np.c_[co, np.ones(len(co))] @ M.T)[:, :3]
    z0, z1 = W[:, 2].min(), W[:, 2].max()
    Hh = z1 - z0
    zc = z0 + cut * Hh
    head = W[:, 2] > zc
    hw = W[head]
    med_y = np.median(hw[:, 1])
    fs = -1.0 if (med_y - hw[:, 1].min()) >= (hw[:, 1].max() - med_y) else 1.0   # the front is fs * Y
    band = head & (W[:, 2] < z0 + 0.78 * Hh)
    nose_x = W[band][np.argmax(W[band, 1] * fs)][0]
    half = max(nose_x - hw[:, 0].min(), hw[:, 0].max() - nose_x) + 0.01
    xs = np.linspace(nose_x - half, nose_x + half, N)
    zb = zc - 0.03 * Hh
    NZ = int(N * (z1 + 0.01 - zb) / (2 * half))
    zs = np.linspace(zb, z1 + 0.01, NZ)
    polys = [list(p.vertices) for p in me.polygons]
    bvh = BVHTree.FromPolygons([Vector(p) for p in W], polys)
    y_far = hw[:, 1].min() - 1, hw[:, 1].max() + 1
    Df = np.full((NZ, N), np.nan)
    Db = np.full((NZ, N), np.nan)
    for j, z in enumerate(zs):
        for i, x in enumerate(xs):
            o_front = Vector((x, y_far[1] if fs > 0 else y_far[0], z))
            o_back = Vector((x, y_far[0] if fs > 0 else y_far[1], z))
            hf = bvh.ray_cast(o_front, Vector((0, -fs, 0)), 4)[0]
            hb = bvh.ray_cast(o_back, Vector((0, fs, 0)), 4)[0]
            if hf is not None and hb is not None:
                Df[j, i], Db[j, i] = hf.y, hb.y
    mask = ~np.isnan(Df)
    # mirror about the nose: the head is the union of both sides, the depths their average
    mask = mask | mask[:, ::-1]
    from scipy.ndimage import binary_closing, binary_opening, binary_fill_holes
    mask = binary_fill_holes(binary_opening(binary_closing(mask, iterations=3), iterations=2))
    def fill(D):
        D = D.copy()
        m = ~np.isnan(D)
        if (~m).any():
            idx = distance_transform_edt(~m, return_distances=False, return_indices=True)
            D = D[tuple(idx)]
        return D
    Df, Db = fill(Df), fill(Db)
    Df = median_filter(Df, size=7)
    Db = median_filter(Db, size=7)
    Df = (Df + Df[:, ::-1]) / 2
    Db = (Db + Db[:, ::-1]) / 2
    Df = gaussian_filter(Df, 1.2)
    Db = gaussian_filter(Db, 1.6)
    # round the silhouette: near the edge both surfaces close in on their middle
    dist = distance_transform_edt(mask)
    k = np.sqrt(np.clip(dist / 6.0, 0, 1))
    mid = (Df + Db) / 2
    Df = mid + (Df - mid) * k
    Db = mid + (Db - mid) * k
    # out with the old head
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    dead = [f for f in bm.faces if all(head[v.index] for v in f.verts)]
    bmesh.ops.delete(bm, geom=dead, context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    # in with the new one, skinned to the head (fading to the neck at its bottom edge)
    dl = bm.verts.layers.deform.verify()
    gh = ob.vertex_groups['mixamorig:Head'].index
    gn = ob.vertex_groups['mixamorig:Neck'].index
    inv = np.linalg.inv(M)
    F, B = {}, {}
    for j in range(NZ):
        t = float(np.clip((zs[j] - zb) / (0.08 * Hh), 0, 1))
        for i in range(N):
            if not mask[j, i]:
                continue
            for store, D in ((F, Df), (B, Db)):
                v = bm.verts.new((inv @ np.r_[xs[i], D[j, i], zs[j], 1])[:3])
                v[dl][gh] = 0.15 + 0.85 * t
                v[dl][gn] = 0.85 * (1 - t)
                store[j, i] = v
    quads = [(j, i) for j in range(NZ - 1) for i in range(N - 1)
             if all((jj, ii) in F for jj, ii in ((j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i)))]
    qs = set(quads)
    edge_count = {}
    for j, i in quads:
        c4 = [(j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i)]
        bm.faces.new([F[c] for c in c4])
        bm.faces.new([B[c] for c in c4[::-1]])
        for a_, b_ in zip(c4, c4[1:] + c4[:1]):
            key = tuple(sorted((a_, b_)))
            edge_count[key] = edge_count.get(key, 0) + 1
    for (a_, b_), n in edge_count.items():
        if n == 1:          # the silhouette: stitch front to back
            bm.faces.new([F[a_], F[b_], B[b_], B[a_]])
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    me.update()
    print('rebuilt the head:', N, 'x', NZ, 'grid,', len(quads), 'quads a side; vertices now', len(me.vertices))


def paint(ob, arm):
    """Project the A-pose picture onto the mesh in its rest pose and bake into its own UVs."""
    arm.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    # clean surface first: consistent normals and fresh UVs (the scanned mesh's own UVs had tiny, overlapping and
    # degenerate islands that baked as black holes in the face)
    for o in bpy.data.objects:
        o.select_set(o is ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    deps = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(deps)
    me_ev = ev.to_mesh()
    W = np.array([(ob.matrix_world @ v.co)[:] for v in me_ev.vertices])
    polys = [list(p.vertices) for p in me_ev.polygons]
    ev.to_mesh_clear()
    lo, hi = W.min(0), W.max(0)
    H = hi[2] - lo[2]
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    U = (W - np.array([cx, cy, lo[2]])) / H                  # unit height, feet at 0, centred
    # which way does it face? the face (high, front) should be toward -Y; flip if the nose points +Y
    head = U[U[:, 2] > 0.6]
    front_is_neg_y = abs(head[:, 1].min()) >= abs(head[:, 1].max())
    if not front_is_neg_y:
        U[:, 1] *= -1
        U[:, 0] *= -1
    F.REF_IMG = IMG
    im, P = F.load_picture()
    ppu = P['base_top'] - P['top']
    u = (P['cx'] + U[:, 0] * ppu) / P['w']
    v = 1 - (P['base_top'] - U[:, 2] * ppu) / P['h']
    me = ob.data
    target_uv = me.uv_layers[0].name
    proj = me.uv_layers.new(name='proj')
    loops_v = np.array([l.vertex_index for l in me.loops])
    proj.data.foreach_set('uv', np.stack([u[loops_v], v[loops_v]], axis=1).ravel())
    # front/back by visibility toward the viewer (robust to inverted faces)
    bvh = BVHTree.FromPolygons([Vector(p) for p in U], polys)
    visible = np.array([bvh.ray_cast(Vector(p) + Vector((0, -0.004, 0)), Vector((0, -1, 0)), 5)[0] is None for p in U])
    xi = np.clip((u * P['w']).astype(int), 0, P['w'] - 1)
    yi = np.clip(((1 - v) * P['h']).astype(int), 0, P['h'] - 1)
    c = im[yi, xi]
    r, g, b = c[:, 0], c[:, 1], c[:, 2]
    skin = (r > g) & (g > b) & (r - b > 0.12) & (r - b < 0.45) & (r > 0.45) & (U[:, 2] < 0.55)
    shoes = U[:, 2] < 0.05
    # only the back half of each height slice may turn plain: the front always takes the picture, even where an
    # overhang (the turban over the brow, the beard over the chest) blocks the straight ray
    zb = np.clip((U[:, 2] * 60).astype(int), 0, 60)
    mid = np.zeros(61)
    for k in range(61):
        ys = U[zb == k, 1]
        mid[k] = (ys.min() + ys.max()) / 2 if len(ys) else 0
    behind = U[:, 1] > mid[zb]
    face = (U[:, 2] > 0.63) & (np.abs(U[:, 0]) < 0.16) & (U[:, 1] < (mid[zb] - 0.02))
    back = (~visible & ~(skin | shoes) & ~face).astype(float)
    nb = [[] for _ in range(len(U))]
    for e in me.edges:
        a_, b_ = e.vertices
        nb[a_].append(b_)
        nb[b_].append(a_)
    for _ in range(2):
        back = np.array([(back[i] + back[n].mean()) / 2 if n else back[i] for i, n in enumerate(nb)])
    # No bake: the bake cut the picture into thousands of tiny islands whose seams showed as shards across the face.
    # The model reads the picture directly instead: front faces at their spot in it, back faces at a robe-white
    # patch added in the picture's empty top corner.
    from PIL import Image as PILImage
    pic = PILImage.open(IMG).convert('RGB')
    pw, ph = pic.size
    patch = max(24, pw // 40)
    pic.paste(tuple(int(round(c * 255)) for c in hexc('#e2ded6')[:3]), (0, 0, patch, patch))
    tex_path = f'{ROOT}/figures/build/ibn_ezra_tex.jpg'
    pic.save(tex_path, quality=93)
    patch_uv = (patch / 2 / pw, 1 - patch / 2 / ph)
    uv = np.stack([u, v], axis=1)
    loop_uv = uv[loops_v].copy()
    for poly in me.polygons:
        ids = list(poly.vertices)
        if back[ids].mean() > 0.5:
            loop_uv[poly.loop_start:poly.loop_start + poly.loop_total] = patch_uv
    proj.data.foreach_set('uv', loop_uv.ravel())
    for l in [l for l in me.uv_layers if l.name != 'proj']:
        me.uv_layers.remove(l)
    m = bpy.data.materials.new('ibn_ezra')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.6
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(tex_path)
    tex.extension = 'EXTEND'
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    m.use_backface_culling = False
    me.materials.clear()
    me.materials.append(m)
    round_head_normals(ob, U, W, arm)
    arm.data.pose_position = 'POSE'


if __name__ == '__main__':
    reset()
    objs, base_act = import_fbx(BASE)
    arm = [o for o in objs if o.type == 'ARMATURE'][0]
    ob = [o for o in objs if o.type == 'MESH'][0]
    arm.name = 'ibn_ezra_rig'
    ob.name = 'ibn_ezra'
    # bring the figure to the series' scale (1 unit tall) so lights and cameras match the other figures
    bpy.context.view_layer.update()
    hs = [(ob.matrix_world @ Vector(c)).z for c in ob.bound_box]
    arm.scale = arm.scale * (1.0 / (max(hs) - min(hs)))
    bpy.context.view_layer.update()
    arm.animation_data_create()
    actions = {}
    for app_name, file in CLIPS.items():
        if file == BASE:
            act = base_act
        else:
            new, act = import_fbx(file)
            for o in new:
                bpy.data.objects.remove(o, do_unlink=True)
        if act is None:
            print('no action in', file)
            continue
        act.name = app_name
        act.use_fake_user = True
        if app_name.startswith('walk') or app_name in ('texting_walk', 'limp', 'fall'):
            in_place(act)
        actions[app_name] = act
    # one NLA track per clip, so the glTF exporter writes each as its own animation
    for name, act in actions.items():
        tr = arm.animation_data.nla_tracks.new()
        tr.name = name
        tr.strips.new(name, int(act.frame_range[0]), act)
        tr.mute = True
    arm.animation_data.action = None
    print('clips:', ', '.join(f'{k} ({int(v.frame_range[1] - v.frame_range[0])}f)' for k, v in actions.items()))
    paint(ob, arm)
    # previews: a few poses from the clips
    studio()
    for name, frame in (('idle', 1), ('wave', 8), ('phone', 80), ('rap', 60)):
        arm.animation_data.action = actions[name]
        bpy.context.scene.frame_set(frame)
        render(f'{ROOT}/figures/renders/ibnezra_anim_{name}.png', view='3q', target_z=0.5, dist=2.6, res=600, samples=24)
    arm.animation_data.action = None
    for o in bpy.data.objects:
        o.select_set(o in (arm, ob))
    bpy.ops.export_scene.gltf(filepath=f'{ROOT}/public/figures/ibn_ezra.glb', export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=False, export_skins=True, export_animations=True,
                              export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_image_format='JPEG',
                              export_jpeg_quality=90, export_cameras=False, export_lights=False)
    print('done')
