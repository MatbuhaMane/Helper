"""Ibn Ezra in A-pose (TRELLIS shape and texture) prepared for rigging: base removed, scaled to 1 unit, the dark guessed
back repainted as white cloth, exported as FBX for Mixamo's auto-rigger and as GLB."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from lib import *  # noqa: E402,F401,F403
import ibnezra_figure as F  # noqa: E402

ROOT = out_dir()
SRC = f'{ROOT}/figures/ref/ibnezra_apose_trellis.glb'


def keep_material_after_clean():
    bpy.ops.import_scene.gltf(filepath=SRC)
    src = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    return src.data.materials[0]


if __name__ == '__main__':
    reset()
    ob = F.clean_mesh(SRC)
    m = ob.data.materials[0] if ob.data.materials else None
    me = ob.data
    nrm = np.array([v.normal[:] for v in me.vertices])
    back = np.clip((nrm[:, 1] - 0.05) / 0.35, 0, 1)
    attr = me.color_attributes.new('white_back', 'FLOAT_COLOR', 'POINT')
    attr.data.foreach_set('color', np.repeat(back[:, None], 4, axis=1).ravel())
    # repaint: mix the original texture with white cloth where the surface faces away; bake to a new 2K texture
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Metallic'].default_value = 0.0     # TRELLIS leaves glTF's default metallic=1; cloth and skin are not metal
    b.inputs['Roughness'].default_value = 0.55
    tex = [n for n in nt.nodes if n.type == 'TEX_IMAGE'][0]
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    a = nt.nodes.new('ShaderNodeAttribute')
    a.attribute_name = 'white_back'
    nt.links.new(a.outputs['Fac'], mix.inputs['Factor'])
    nt.links.new(tex.outputs['Color'], mix.inputs['A'])
    mix.inputs['B'].default_value = hexc('#dedad1')
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    baked = bpy.data.images.new('ibn_ezra_apose_color', 2048, 2048)
    target = nt.nodes.new('ShaderNodeTexImage')
    target.image = baked
    nt.nodes.active = target
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    s.cycles.samples = 4
    s.render.bake.use_pass_direct = False
    s.render.bake.use_pass_indirect = False
    s.render.bake.use_pass_color = True
    s.render.bake.margin = 8
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})
    os.makedirs(f'{ROOT}/figures/build', exist_ok=True)
    baked.filepath_raw = f'{ROOT}/figures/build/ibn_ezra_apose_color.png'
    baked.file_format = 'PNG'
    baked.save()
    nt.links.new(target.outputs['Color'], b.inputs['Base Color'])
    for n in (mix, a, tex):
        nt.nodes.remove(n)
    me.color_attributes.remove(me.color_attributes['white_back'])
    studio()
    for view in ('front', '3q', 'back'):
        render(f'{ROOT}/figures/renders/ibnezra_apose_{view}.png', view=view, target_z=0.5, dist=2.4, res=600, samples=32)
    for o in bpy.data.objects:
        o.select_set(o is ob)
    os.makedirs(f'{ROOT}/figures/build', exist_ok=True)
    bpy.ops.export_scene.fbx(filepath=f'{ROOT}/figures/build/ibn_ezra_for_mixamo.fbx', use_selection=True,
                             path_mode='COPY', embed_textures=True, apply_unit_scale=True, global_scale=100.0,
                             object_types={'MESH'})
    print('done')
