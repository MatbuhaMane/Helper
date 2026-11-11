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


def paint(ob, arm):
    """Project the A-pose picture onto the mesh in its rest pose and bake into its own UVs."""
    arm.data.pose_position = 'REST'
    bpy.context.view_layer.update()
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
    back = (~visible & ~(skin | shoes)).astype(float)
    nb = [[] for _ in range(len(U))]
    for e in me.edges:
        a_, b_ = e.vertices
        nb[a_].append(b_)
        nb[b_].append(a_)
    for _ in range(2):
        back = np.array([(back[i] + back[n].mean()) / 2 if n else back[i] for i, n in enumerate(nb)])
    attr = me.color_attributes.new('white_back', 'FLOAT_COLOR', 'POINT')
    attr.data.foreach_set('color', np.repeat(back[:, None], 4, axis=1).ravel())

    m = bpy.data.materials.new('ibn_ezra')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.6
    src = nt.nodes.new('ShaderNodeTexImage')
    src.image = bpy.data.images.load(IMG)
    src.extension = 'EXTEND'
    uvn = nt.nodes.new('ShaderNodeUVMap')
    uvn.uv_map = 'proj'
    nt.links.new(uvn.outputs['UV'], src.inputs['Vector'])
    att = nt.nodes.new('ShaderNodeAttribute')
    att.attribute_name = 'white_back'
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(att.outputs['Fac'], mix.inputs['Factor'])
    nt.links.new(src.outputs['Color'], mix.inputs['A'])
    mix.inputs['B'].default_value = hexc('#e2ded6')
    nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    me.materials.clear()
    me.materials.append(m)
    baked = bpy.data.images.new('ibn_ezra_color', TEX, TEX)
    tgt = nt.nodes.new('ShaderNodeTexImage')
    tgt.image = baked
    nt.nodes.active = tgt
    me.uv_layers.active = me.uv_layers[target_uv]
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    s.cycles.samples = 4
    s.render.bake.use_pass_direct = False
    s.render.bake.use_pass_indirect = False
    s.render.bake.use_pass_color = True
    s.render.bake.margin = 12
    for o in bpy.data.objects:
        o.select_set(o is ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})
    path = f'{ROOT}/figures/build/ibn_ezra_anim_color.png'
    baked.filepath_raw = path
    baked.file_format = 'PNG'
    baked.save()
    # the exported material: just the baked texture on the model's own UVs, both sides lit
    for n in (mix, att, src, uvn):
        nt.nodes.remove(n)
    uvt = nt.nodes.new('ShaderNodeUVMap')
    uvt.uv_map = target_uv
    nt.links.new(uvt.outputs['UV'], tgt.inputs['Vector'])
    nt.links.new(tgt.outputs['Color'], bsdf.inputs['Base Color'])
    m.use_backface_culling = False
    me.uv_layers.remove(me.uv_layers['proj'])
    me.color_attributes.remove(me.color_attributes['white_back'])
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
