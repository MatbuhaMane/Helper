"""Ibn Ezra as the companion: from the owner's Gemini figurine picture and its Hunyuan3D-2 shape to an app-ready model.

Steps: clean the scan (drop the base, close the hole, scale to 1 unit, feet at the origin, facing -Y), colour it by
projecting the picture from the front (the back of the head becomes white turban cloth), rig it with a smooth
head/body skeleton for the bobble, decimate for phones, bake the colour into one texture, render previews, export.

Inputs:  figures/ref/ibnezra_hunyuan.glb, figures/ref/ibnezra_gemini.webp
Outputs: figures/renders/ibnezra_*.png, public/figures/ibn_ezra.glb
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from lib import *  # noqa: E402,F401,F403

ROOT = out_dir()
REF_MESH = f'{ROOT}/figures/ref/ibnezra_hunyuan.glb'
REF_IMG = f'{ROOT}/figures/ref/ibnezra_gemini.webp'
TEX_SIZE = 4096
TARGET_FACES = 150000   # quality first: size is not a concern for the family's phones
VIEWS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['3q', 'front', 'back']


# ---------------------------------------------------------------- the picture

def load_picture():
    from PIL import Image
    im = np.asarray(Image.open(REF_IMG).convert('RGB')).astype(np.float32) / 255
    h, w, _ = im.shape
    bg = np.median(np.concatenate([im[:40, :40].reshape(-1, 3), im[:40, -40:].reshape(-1, 3)]), axis=0)
    diff = np.abs(im - bg).sum(axis=2)
    fig = diff > 0.12
    dark = im.mean(axis=2) < 0.25
    rows = np.where(fig.any(axis=1))[0]
    top = rows.min()
    # the black base: the first row (from the top) where a wide run of dark pixels starts
    base_top = next(r for r in range(h // 2, h) if dark[r].sum() > w * 0.18)
    cols = np.where(fig[top:top + int((base_top - top) * 0.25)].any(axis=0))[0]   # the turban's width → centre
    cx = (cols.min() + cols.max()) / 2
    return im, {'top': top, 'base_top': base_top, 'cx': cx, 'w': w, 'h': h}


# ---------------------------------------------------------------- the mesh

def clean_mesh(path=None):
    bpy.ops.import_scene.gltf(filepath=path or REF_MESH)
    ob = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    for o in list(bpy.data.objects):
        if o is not ob:
            bpy.data.objects.remove(o, do_unlink=True)
    ob.parent = None
    me = ob.data
    me.transform(ob.matrix_world)
    ob.matrix_world = Matrix.Identity(4)
    co = np.array([v.co[:] for v in me.vertices])
    # find the base: slice by height; the base is the wide flat disc at the bottom
    zmin, zmax = co[:, 2].min(), co[:, 2].max()
    zs = np.linspace(zmin, zmin + (zmax - zmin) * 0.2, 60)
    radius = []
    for z0, z1 in zip(zs[:-1], zs[1:]):
        sl = co[(co[:, 2] >= z0) & (co[:, 2] < z1)]
        radius.append(np.hypot(sl[:, 0] - co[:, 0].mean(), sl[:, 1] - co[:, 1].mean()).max() if len(sl) else 0)
    radius = np.array(radius)
    base_r = radius[:5].max()
    k = next(i for i in range(5, len(radius)) if radius[i] < base_r * 0.86)
    cut_z = zs[k] + (zs[1] - zs[0]) * 0.5
    bm = bmesh.new()
    bm.from_mesh(me)
    gone = [f for f in bm.faces if all(v.co.z < cut_z for v in f.verts)]
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    # cut faces straddling the plane, then close the bottom
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, cut_z), plane_no=(0, 0, 1), clear_inner=True)
    boundary = [e for e in bm.edges if e.is_boundary]
    bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
    # generated meshes sometimes come with faces pointing inward: make every face point outward
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    # normalise: feet on the origin, centred, 1 unit tall
    co = np.array([v.co[:] for v in me.vertices])
    lo, hi = co.min(axis=0), co.max(axis=0)
    s = 1.0 / (hi[2] - lo[2])
    centre = Vector(((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]))
    me.transform(Matrix.Scale(s, 4) @ Matrix.Translation(-centre))
    for p in me.polygons:
        p.use_smooth = True
    ob.name = 'ibn_ezra'
    me.name = 'ibn_ezra'
    return ob


# ---------------------------------------------------------------- colour

def project(ob, pic):
    """UVs that project the picture onto the figure from the front, plus masks (back of head, skin, brass)."""
    im, P = pic
    me = ob.data
    # The picture's figure spans top → base_top in pixels; the mesh spans 1.0 in height.
    px_per_unit = (P['base_top'] - P['top'])
    uv = me.uv_layers.new(name='proj')
    co = np.array([v.co[:] for v in me.vertices])
    u = (P['cx'] + co[:, 0] * px_per_unit) / P['w']
    v = 1 - (P['base_top'] - co[:, 2] * px_per_unit) / P['h']
    loops_v = np.array([l.vertex_index for l in me.loops])
    uv.data.foreach_set('uv', np.stack([u[loops_v], v[loops_v]], axis=1).ravel())

    # masks, per vertex, from the picture colour at the projected point and the surface direction
    me.calc_normals_split() if hasattr(me, 'calc_normals_split') else None
    nrm = np.array([vv.normal[:] for vv in me.vertices])
    xi = np.clip((u * P['w']).astype(int), 0, P['w'] - 1)
    yi = np.clip(((1 - v) * P['h']).astype(int), 0, P['h'] - 1)
    col = im[yi, xi]
    r, g, b = col[:, 0], col[:, 1], col[:, 2]
    facing_back = np.clip((nrm[:, 1] - 0.05) / 0.35, 0, 1)            # +Y is the back
    brass = ((r - b > 0.18) & (g - b > 0.08) & (r < 0.85) & (np.abs(co[:, 0]) > 0.1)).astype(np.float32)
    # everything seen from behind is plain white cloth (turban and robe); only the brass sphere stays metal
    white_back = facing_back * (1 - brass)
    skin = ((r > g) & (g > b) & (r - b > 0.12) & (r - b < 0.45) & (r > 0.45)).astype(np.float32) * (1 - white_back)
    for name, vals in (('white_back', white_back), ('skin', skin), ('brass', brass)):
        attr = me.color_attributes.new(name, 'FLOAT_COLOR', 'POINT')
        attr.data.foreach_set('color', np.repeat(vals[:, None], 4, axis=1).ravel())
    return im


def figure_material(ob):
    m = bpy.data.materials.new('ibn_ezra_paint')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    img = bpy.data.images.load(REF_IMG)
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.extension = 'EXTEND'
    uvn = nt.nodes.new('ShaderNodeUVMap')
    uvn.uv_map = 'proj'
    nt.links.new(uvn.outputs['UV'], tex.inputs['Vector'])

    def attr(name):
        a = nt.nodes.new('ShaderNodeAttribute')
        a.attribute_name = name
        return a.outputs['Fac']

    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(attr('white_back'), mix.inputs['Factor'])
    nt.links.new(tex.outputs['Color'], mix.inputs['A'])
    mix.inputs['B'].default_value = hexc('#dedad1')
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    # painted-vinyl finish; skin gets a little subsurface, brass is metallic
    b.inputs['Roughness'].default_value = 0.5
    if 'Coat Weight' in b.inputs:
        b.inputs['Coat Weight'].default_value = 0.12
    sss = nt.nodes.new('ShaderNodeMath')
    sss.operation = 'MULTIPLY'
    sss.inputs[1].default_value = 0.12
    nt.links.new(attr('skin'), sss.inputs[0])
    nt.links.new(sss.outputs[0], b.inputs['Subsurface Weight'])
    b.inputs['Subsurface Radius'].default_value = (1.0, 0.4, 0.25)
    if 'Subsurface Scale' in b.inputs:
        b.inputs['Subsurface Scale'].default_value = 0.01
    met = nt.nodes.new('ShaderNodeMath')
    met.operation = 'MULTIPLY'
    met.inputs[1].default_value = 0.85
    nt.links.new(attr('brass'), met.inputs[0])
    nt.links.new(met.outputs[0], b.inputs['Metallic'])
    ob.data.materials.clear()
    ob.data.materials.append(m)
    return m


# ---------------------------------------------------------------- rig

NECK_Z = 0.6     # where the head (turban, face, beard) meets the body; refined from the picture


def rig(ob):
    arm = bpy.data.armatures.new('rig')
    ro = bpy.data.objects.new('rig', arm)
    bpy.context.collection.objects.link(ro)
    bpy.context.view_layer.objects.active = ro
    bpy.ops.object.mode_set(mode='EDIT')
    def bone(name, head, tail, parent=None):
        bn = arm.edit_bones.new(name)
        bn.head, bn.tail = head, tail
        if parent:
            bn.parent = arm.edit_bones[parent]
        return bn
    bone('root', (0, 0, 0), (0, 0, 0.08))
    bone('body', (0, 0, 0.08), (0, 0, NECK_Z), 'root')
    bone('head', (0, 0, NECK_Z), (0, 0, 1.0), 'body')
    bpy.ops.object.mode_set(mode='OBJECT')
    co = np.array([v.co[:] for v in ob.data.vertices])
    # the head bone takes the turban, face and beard; a soft blend over the neck so nothing tears
    t = np.clip((co[:, 2] - (NECK_Z - 0.05)) / 0.1, 0, 1)
    head_w = t * t * (3 - 2 * t)
    # the beard hangs below the neck in front: it follows the head too
    beard = (co[:, 1] < -0.02) & (np.abs(co[:, 0]) < 0.14) & (co[:, 2] > NECK_Z - 0.16)
    head_w = np.where(beard, np.maximum(head_w, np.clip((co[:, 2] - (NECK_Z - 0.16)) / 0.08, 0, 1)), head_w)
    body_w = 1 - head_w
    vh = ob.vertex_groups.new(name='head')
    vb = ob.vertex_groups.new(name='body')
    for i in range(len(co)):
        if head_w[i] > 0:
            vh.add([i], float(head_w[i]), 'REPLACE')
        if body_w[i] > 0:
            vb.add([i], float(body_w[i]), 'REPLACE')
    mod = ob.modifiers.new('rig', 'ARMATURE')
    mod.object = ro
    ob.parent = ro
    return ro


# ---------------------------------------------------------------- for the app

def decimate_and_bake(ob):
    d = ob.modifiers.new('decimate', 'DECIMATE')
    d.ratio = TARGET_FACES / len(ob.data.polygons)
    ob.modifiers.move(len(ob.modifiers) - 1, 0)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier='decimate')
    # an atlas for the baked colour
    atlas = ob.data.uv_layers.new(name='atlas')
    ob.data.uv_layers.active = atlas
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
    bpy.ops.object.mode_set(mode='OBJECT')
    baked = bpy.data.images.new('ibn_ezra_color', TEX_SIZE, TEX_SIZE)
    nt = ob.data.materials[0].node_tree
    target = nt.nodes.new('ShaderNodeTexImage')
    target.image = baked
    nt.nodes.active = target
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    s.cycles.samples = 8
    s.render.bake.use_pass_direct = False
    s.render.bake.use_pass_indirect = False
    s.render.bake.use_pass_color = True
    s.render.bake.margin = 6
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})
    path = f'{ROOT}/figures/build/ibn_ezra_color.png'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    baked.filepath_raw = path
    baked.file_format = 'PNG'
    baked.save()
    return baked


def app_material(ob, baked):
    """A simple textured vinyl material the glTF exporter understands."""
    m = bpy.data.materials.new('ibn_ezra')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = baked
    uvn = nt.nodes.new('ShaderNodeUVMap')
    uvn.uv_map = 'atlas'
    nt.links.new(uvn.outputs['UV'], tex.inputs['Vector'])
    nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.55
    ob.data.materials.clear()
    ob.data.materials.append(m)
    # keep only the atlas UVs and drop the masks in the exported file
    for uv in [u for u in ob.data.uv_layers if u.name != 'atlas']:
        ob.data.uv_layers.remove(uv)
    for a in [a for a in ob.data.color_attributes]:
        ob.data.color_attributes.remove(a)


if __name__ == '__main__':
    reset()
    pic = load_picture()
    ob = clean_mesh()
    project(ob, pic)
    figure_material(ob)
    ro = rig(ob)
    print('faces (full):', len(ob.data.polygons))
    studio()
    os.makedirs(f'{ROOT}/figures/renders', exist_ok=True)
    for view in VIEWS:
        render(f'{ROOT}/figures/renders/ibnezra_{view}.png', view=view, target_z=0.52, dist=2.3, samples=64)
    baked = decimate_and_bake(ob)
    app_material(ob, baked)
    print('faces (app):', len(ob.data.polygons))
    export(f'{ROOT}/public/figures/ibn_ezra.glb', jpeg=True)
    print('done')
