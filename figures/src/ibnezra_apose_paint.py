"""Repaint the A-pose ibn Ezra from the owner's Gemini A-pose picture (front projection), with clean white cloth behind
(hands and shoes keep their colour), baked at 4K onto the model's own UV layout so it fits the Mixamo-rigged copy."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from lib import *  # noqa: E402,F401,F403
import ibnezra_figure as F  # noqa: E402

ROOT = out_dir()
SRC = f'{ROOT}/figures/ref/ibnezra_apose_trellis.glb'
IMG = f'{ROOT}/figures/ref/ibnezra_apose_gemini.jpg'
OUT_TEX = f'{ROOT}/figures/build/ibn_ezra_apose_paint.png'

if __name__ == '__main__':
    F.REF_IMG = IMG
    reset()
    ob = F.clean_mesh(SRC)
    pic = F.load_picture()
    im, P = pic
    me = ob.data
    # a fresh, non-overlapping layout to bake into (the Mixamo copy gets it by data transfer later)
    for uv in list(me.uv_layers):
        me.uv_layers.remove(uv)
    atlas = me.uv_layers.new(name='atlas')
    me.uv_layers.active = atlas
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004)
    bpy.ops.object.mode_set(mode='OBJECT')
    target_uv = 'atlas'
    F.project(ob, pic)                       # adds the 'proj' UVs and masks (white_back, skin, brass)
    # behind: white cloth, except skin (hands) and the shoes at the bottom
    co = np.array([v.co[:] for v in me.vertices])
    nrm = np.array([v.normal[:] for v in me.vertices])
    uv_u = (P['cx'] + co[:, 0] * (P['base_top'] - P['top'])) / P['w']
    uv_v = 1 - (P['base_top'] - co[:, 2] * (P['base_top'] - P['top'])) / P['h']
    xi = np.clip((uv_u * P['w']).astype(int), 0, P['w'] - 1)
    yi = np.clip(((1 - uv_v) * P['h']).astype(int), 0, P['h'] - 1)
    c = im[yi, xi]
    r, g, b = c[:, 0], c[:, 1], c[:, 2]
    skin = (r > g) & (g > b) & (r - b > 0.12) & (r - b < 0.45) & (r > 0.45) & (co[:, 2] < 0.55)
    shoes = co[:, 2] < 0.05
    # front or back by visibility (robust to inverted faces): a point takes the picture's colour only if a ray from it
    # toward the viewer (-Y) escapes without hitting the figure
    from mathutils.bvhtree import BVHTree
    bvh = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    visible = np.zeros(len(co), bool)
    for i, p in enumerate(co):
        hit = bvh.ray_cast(Vector(p) + Vector((0, -0.004, 0)), Vector((0, -1, 0)), 5)
        visible[i] = hit[0] is None
    back = (~visible & ~(skin | shoes)).astype(float)
    # soften the edge a little (average over each vertex's neighbours, twice)
    nb = [[] for _ in range(len(co))]
    for e in me.edges:
        a_, b_ = e.vertices
        nb[a_].append(b_); nb[b_].append(a_)
    for _ in range(2):
        back = np.array([(back[i] + back[n].mean()) / 2 if n else back[i] for i, n in enumerate(nb)])
    me.color_attributes['white_back'].data.foreach_set('color', np.repeat(back[:, None], 4, axis=1).ravel())

    m = bpy.data.materials.new('paint')
    nt = m.node_tree if m.node_tree else None
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Metallic'].default_value = 0.0
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(IMG)
    tex.extension = 'EXTEND'
    uvn = nt.nodes.new('ShaderNodeUVMap')
    uvn.uv_map = 'proj'
    nt.links.new(uvn.outputs['UV'], tex.inputs['Vector'])
    att = nt.nodes.new('ShaderNodeAttribute')
    att.attribute_name = 'white_back'
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(att.outputs['Fac'], mix.inputs['Factor'])
    nt.links.new(tex.outputs['Color'], mix.inputs['A'])
    mix.inputs['B'].default_value = hexc('#e2ded6')
    nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    me.materials.clear()
    me.materials.append(m)

    baked = bpy.data.images.new('ibn_ezra_apose_paint', 4096, 4096)
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
    os.makedirs(os.path.dirname(OUT_TEX), exist_ok=True)
    baked.filepath_raw = OUT_TEX
    baked.file_format = 'PNG'
    baked.save()

    # preview with the baked texture on the model's own UVs
    for n in (mix, att, tex, uvn):
        nt.nodes.remove(n)
    uvt = nt.nodes.new('ShaderNodeUVMap')
    uvt.uv_map = target_uv
    nt.links.new(uvt.outputs['UV'], tgt.inputs['Vector'])
    nt.links.new(tgt.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.55
    m.use_backface_culling = False
    studio()
    for view in ('front', '3q', 'back'):
        render(f'{ROOT}/figures/renders/ibnezra_apose_{view}.png', view=view, target_z=0.5, dist=2.4, res=700, samples=40)
    print('done')
