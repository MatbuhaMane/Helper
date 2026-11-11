"""Building blocks for the companion figures (see .claude/skills/figure-style).

Blender is Z-up; figures stand on the origin, 1 unit tall, and face -Y (the glTF exporter turns that into +Z, toward the
app's camera). Parts are parented to empties named after the app's animation nodes (head, arm_L, ...), with each empty
placed at the part's pivot (neck, shoulder, hip)."""

import math
import os
import sys

import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

# ---------------------------------------------------------------- scene

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.unit_settings.system = 'METRIC'
    return s


# ---------------------------------------------------------------- materials

_mats = {}

def hexc(h):
    h = h.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, 1.0)


def mat(name, color, rough=0.5, coat=0.0, sss=0.0, metal=0.0, emit=0.0):
    """Painted vinyl. Cached by name."""
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = hexc(color)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    for key, val in (('Coat Weight', coat), ('Subsurface Weight', sss)):
        if key in b.inputs:
            b.inputs[key].default_value = val
    if sss and 'Subsurface Radius' in b.inputs:
        b.inputs['Subsurface Radius'].default_value = (0.02, 0.01, 0.008)
    if emit and 'Emission Strength' in b.inputs:
        b.inputs['Emission Color'].default_value = hexc(color)
        b.inputs['Emission Strength'].default_value = emit
    m.diffuse_color = hexc(color)
    _mats[name] = m
    return m


# ---------------------------------------------------------------- shapes

def _obj(name, bm, material, smooth=True, subdiv=1):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if material is not None:
        me.materials.append(material)
    if subdiv:
        mod = ob.modifiers.new('subd', 'SUBSURF')
        mod.levels = subdiv
        mod.render_levels = subdiv
    return ob


def place(ob, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    ob.location = loc
    ob.rotation_euler = Euler([math.radians(a) for a in rot], 'XYZ')
    ob.scale = scale if isinstance(scale, (tuple, list)) else (scale, scale, scale)
    return ob


def ball(name, material, loc=(0, 0, 0), size=(1, 1, 1), rot=(0, 0, 0), r=1.0, seg=24, subdiv=1):
    """An ellipsoid: radius r scaled by size (x, y, z)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(8, seg // 2), radius=r)
    return place(_obj(name, bm, material, subdiv=subdiv), loc, rot, size)


def box(name, material, loc=(0, 0, 0), size=(1, 1, 1), rot=(0, 0, 0), bevel=0.3, subdiv=2):
    """A soft rounded box (size = full dimensions)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    if bevel:
        bmesh.ops.bevel(bm, geom=bm.edges[:] + bm.verts[:], offset=bevel * 0.5, segments=2, affect='EDGES', profile=0.5)
    return place(_obj(name, bm, material, subdiv=subdiv), loc, rot, size)


def tube(name, material, loc=(0, 0, 0), r1=0.1, r2=0.1, depth=1.0, rot=(0, 0, 0), seg=40, subdiv=0, cap=True, round_edge=0.25):
    """A (tapered) cylinder along local Z, centred, with softly rounded rims (no subdivision: it would pinch)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=depth)
    if cap and round_edge:
        rims = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > 1.0]
        bmesh.ops.bevel(bm, geom=rims, offset=min(r1, r2, depth) * round_edge, segments=3, affect='EDGES', profile=0.5)
    ob = _obj(name, bm, material, subdiv=subdiv)
    ob.data.shade_auto_smooth() if hasattr(ob.data, 'shade_auto_smooth') else None
    return place(ob, loc, rot)


def capsule(name, material, a, b, r1, r2=None, seg=32):
    """A rounded limb from point a to point b: a smooth tapered cylinder with half-spheres at the ends."""
    r2 = r1 if r2 is None else r2
    a, b = Vector(a), Vector(b)
    d = b - a
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=seg, radius1=r1, radius2=r2, depth=d.length)
    ob = _obj(name, bm, material, subdiv=0)
    ob.location = (a + b) / 2
    ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    ea = ball(name + '_a', material, a, (r1, r1, r1), seg=32)
    eb = ball(name + '_b', material, b, (r2, r2, r2), seg=32)
    return join([ob, ea, eb], name)


def torus(name, material, loc=(0, 0, 0), R=0.2, r=0.04, rot=(0, 0, 0), size=(1, 1, 1), arc=360, seg=32, rseg=12, subdiv=1):
    """A torus or a torus arc (degrees) in the local XY plane."""
    bm = bmesh.new()
    verts = []
    steps = seg if arc >= 360 else seg + 1
    for i in range(steps):
        t = math.radians(arc) * i / seg - (math.radians(arc) / 2 if arc < 360 else 0)
        ring = []
        for j in range(rseg):
            p = 2 * math.pi * j / rseg
            x = (R + r * math.cos(p)) * math.cos(t)
            y = (R + r * math.cos(p)) * math.sin(t)
            z = r * math.sin(p)
            ring.append(bm.verts.new((x, y, z)))
        verts.append(ring)
    rings = len(verts) if arc >= 360 else len(verts) - 1
    for i in range(rings):
        a, b = verts[i], verts[(i + 1) % len(verts)]
        for j in range(rseg):
            bm.faces.new((a[j], a[(j + 1) % rseg], b[(j + 1) % rseg], b[j]))
    if arc < 360:
        for ring in (verts[0], verts[-1]):
            bm.faces.new(ring[::-1] if ring is verts[0] else ring)
    bm.normal_update()
    return place(_obj(name, bm, material, subdiv=subdiv), loc, rot, size)


def lumpy(ob, strength=0.01, scale=0.05, seed=1):
    """A soft sculpted irregularity (hair, beards, fur clumps)."""
    tex = bpy.data.textures.new(ob.name + '_n', 'CLOUDS')
    tex.noise_scale = scale
    tex.noise_depth = 1
    d = ob.modifiers.new('lumps', 'DISPLACE')
    d.texture = tex
    d.strength = strength
    d.mid_level = 0.5
    ob.modifiers.move(len(ob.modifiers) - 1, 0) if False else None
    return ob


def join(obs, name):
    """Join meshes into one object (each with its modifiers applied)."""
    deps = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    materials = []
    for ob in obs:
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(deps), preserve_all_data_layers=False, depsgraph=deps)
        me.transform(ob.matrix_world)
        remap = []
        for m in me.materials:
            if m not in materials:
                materials.append(m)
            remap.append(materials.index(m))
        for poly in me.polygons:
            poly.material_index = remap[poly.material_index] if remap else 0
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    for ob in obs:
        bpy.data.objects.remove(ob, do_unlink=True)
    out = bpy.data.meshes.new(name)
    bm.to_mesh(out)
    bm.free()
    for m in materials:
        out.materials.append(m)
    for poly in out.polygons:
        poly.use_smooth = True
    ob = bpy.data.objects.new(name, out)
    bpy.context.collection.objects.link(ob)
    return ob


# ---------------------------------------------------------------- hierarchy

def pivot(name, loc, parent=None):
    """An empty at a joint; the app animates it by name."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.03
    bpy.context.collection.objects.link(e)
    e.location = loc
    if parent:
        e.parent = parent
        e.location = Vector(loc) - parent.matrix_world.translation
    bpy.context.view_layer.update()
    return e


def attach(obs, parent):
    """Bake meshes into one object and hang it from a pivot, keeping its place in the world."""
    obs = obs if isinstance(obs, list) else [obs]
    ob = join(obs, parent.name + '_mesh')
    bpy.context.view_layer.update()
    ob.parent = parent
    ob.matrix_parent_inverse = parent.matrix_world.inverted()
    return ob


# ---------------------------------------------------------------- render & export

def studio(bg='#efeee6'):
    s = bpy.context.scene
    w = bpy.data.worlds.new('w')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = hexc(bg)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.35
    s.world = w
    def light(name, kind, loc, energy, color, size):
        l = bpy.data.lights.new(name, kind)
        l.energy = energy
        l.color = hexc(color)[:3]
        if kind == 'AREA':
            l.size = size
        o = bpy.data.objects.new(name, l)
        o.location = loc
        bpy.context.collection.objects.link(o)
        o.rotation_euler = (Vector((0, 0, 0.5)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    light('key', 'AREA', (-1.6, -2.2, 2.2), 120, '#fff1dc', 1.6)
    light('fill', 'AREA', (2.0, -1.8, 1.0), 40, '#f3f1ea', 2.0)
    light('rim', 'AREA', (1.4, 1.8, 1.8), 110, '#dceaf1', 1.2)
    floor = box('floor', mat('floor', bg, rough=0.9), (0, 0, -0.05), (8, 8, 0.1), bevel=0, subdiv=0)
    floor.is_shadow_catcher = True
    return floor


def render(path, view='3q', res=900, samples=64, target_z=0.5, dist=2.6):
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.cycles.samples = samples
    s.cycles.use_denoising = True
    s.render.resolution_x = s.render.resolution_y = res
    s.render.film_transparent = True
    s.view_settings.view_transform = 'Standard'
    s.view_settings.look = 'None'
    cam = bpy.data.cameras.new('cam')
    cam.lens = 70
    co = bpy.data.objects.new('cam', cam)
    bpy.context.collection.objects.link(co)
    ang = {'3q': -28, 'front': 0, 'side': -80}[view]
    a = math.radians(ang)
    co.location = (dist * math.sin(a), -dist * math.cos(a), target_z + 0.18)
    co.rotation_euler = (Vector((0, 0, target_z)) - co.location).to_track_quat('-Z', 'Y').to_euler()
    s.camera = co
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(co, do_unlink=True)
    _on_chalk(path)


def _on_chalk(path, bg='#efeee6'):
    """Put the transparent render (figure + its contact shadow) on the app's chalk ground."""
    img = bpy.data.images.load(path)
    w, h = img.size
    px = list(img.pixels)
    r, g, b, _ = [c for c in (int(bg[i:i + 2], 16) / 255 for i in (1, 3, 5))] + [1]
    out = []
    for i in range(0, len(px), 4):
        a = px[i + 3]
        out += [px[i] * a + r * (1 - a), px[i + 1] * a + g * (1 - a), px[i + 2] * a + b * (1 - a), 1.0]
    img.pixels = out
    img.save()
    bpy.data.images.remove(img)


def export(path):
    for ob in list(bpy.data.objects):
        if ob.name in ('floor', 'key', 'fill', 'rim') or ob.type in ('LIGHT', 'CAMERA'):
            ob.hide_set(True)
            ob.select_set(False)
    keep = [o for o in bpy.data.objects if not o.hide_get()]
    for o in keep:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_animations=False, export_cameras=False, export_lights=False)
    for ob in bpy.data.objects:
        ob.hide_set(False)


def out_dir():
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(here, '..', '..'))


# ---------------------------------------------------------------- realistic materials (renders)

def skin_mat(name='skin_real', base='#e2b596', flush='#d98a78', sss=0.35, pores=0.25):
    """Skin: subsurface scattering, a little colour variation (redder nose and cheeks come from vertex position),
    fine pores and a soft sheen."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.42
    b.inputs['Subsurface Weight'].default_value = sss
    b.inputs['Subsurface Radius'].default_value = (1.0, 0.38, 0.22)
    if 'Subsurface Scale' in b.inputs:
        b.inputs['Subsurface Scale'].default_value = 0.012
    if 'Specular IOR Level' in b.inputs:
        b.inputs['Specular IOR Level'].default_value = 0.45
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 18
    noise.inputs['Detail'].default_value = 6
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = hexc(base)
    ramp.color_ramp.elements[1].color = hexc(flush)
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[1].position = 0.75
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.inputs['Scale'].default_value = 900
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = pores
    bump.inputs['Distance'].default_value = 0.0004
    nt.links.new(vor.outputs['Distance'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    m.diffuse_color = hexc(base)
    return m


def hair_mat(name, melanin=0.0, redness=0.0, roughness=0.32, tint='#ffffff'):
    """Strand hair (Cycles Principled Hair). melanin 0 = white, 0.2 = grey-blond, 0.8 = dark brown, 1 = black."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type == 'BSDF_PRINCIPLED':
            nt.nodes.remove(n)
    h = nt.nodes.new('ShaderNodeBsdfHairPrincipled')
    h.parametrization = 'MELANIN'
    h.inputs['Melanin'].default_value = melanin
    h.inputs['Melanin Redness'].default_value = redness
    h.inputs['Roughness'].default_value = roughness
    h.inputs['Tint'].default_value = hexc(tint)
    nt.links.new(h.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    m.diffuse_color = (0.9, 0.9, 0.88, 1) if melanin < 0.2 else (0.2, 0.15, 0.1, 1)
    return m


def cloth_mat(name, color, rough=0.78, sheen=0.4, weave=0.08):
    """Wool/cloth: soft sheen and a faint weave bump."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = hexc(color)
    b.inputs['Roughness'].default_value = rough
    if 'Sheen Weight' in b.inputs:
        b.inputs['Sheen Weight'].default_value = sheen
    wave = nt.nodes.new('ShaderNodeTexWave')
    wave.inputs['Scale'].default_value = 260
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = weave
    nt.links.new(wave.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    m.diffuse_color = hexc(color)
    return m


def eye(name, center, radius, iris='#5a4632', look=(0, -1, 0), parent=None):
    """A realistic eye: sclera, a radial iris, a pupil, and a clear cornea on top."""
    import math as _m
    sclera = mat(name + '_sclera_m', '#efe8e0', rough=0.25, coat=0.2, sss=0.1)
    irm = bpy.data.materials.new(name + '_iris_m')
    irm.use_nodes = True
    nt = irm.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.3
    grad = nt.nodes.new('ShaderNodeTexWave')
    grad.wave_type = 'RINGS'
    grad.inputs['Scale'].default_value = 3
    grad.inputs['Distortion'].default_value = 14
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = hexc('#1a120b')
    ramp.color_ramp.elements[1].color = hexc(iris)
    nt.links.new(grad.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    corm = bpy.data.materials.new(name + '_cornea_m')
    corm.use_nodes = True
    cb = corm.node_tree.nodes['Principled BSDF']
    cb.inputs['Base Color'].default_value = (1, 1, 1, 1)
    cb.inputs['Roughness'].default_value = 0.0
    cb.inputs['Transmission Weight'].default_value = 1.0
    cb.inputs['IOR'].default_value = 1.376
    corm.diffuse_color = (1, 1, 1, 0.1)
    c = Vector(center)
    lk = Vector(look).normalized()
    parts = [ball(name + '_ball', sclera, c, (radius,) * 3, seg=40)]
    ir = ball(name + '_iris', irm, c + lk * radius * 0.86, (radius * 0.52, radius * 0.52, radius * 0.18), seg=40)
    ir.rotation_euler = lk.to_track_quat('Z', 'Y').to_euler()
    pu = ball(name + '_pupil', mat('pupil', '#050403', rough=0.2), c + lk * radius * 0.9, (radius * 0.22, radius * 0.22, radius * 0.12), seg=24)
    pu.rotation_euler = ir.rotation_euler
    co = ball(name + '_cornea', corm, c + lk * radius * 0.18, (radius * 0.98,) * 3, seg=40)
    parts += [ir, pu, co]
    return parts


def grow_hair(ob, name, weight_fn, material, count=4000, length=0.05, children=6, radius=0.0012, clump=0.6,
              rough=0.002, comb=(0, 0, -1), seed=1):
    """Strand hair on a region of a mesh. weight_fn(vertex_co) -> 0..1 says where hair grows (and how dense)."""
    vg = ob.vertex_groups.new(name=name)
    for v in ob.data.vertices:
        w = weight_fn(ob.matrix_world @ v.co)
        if w > 0:
            vg.add([v.index], float(min(1.0, w)), 'REPLACE')
    mod = ob.modifiers.new(name, 'PARTICLE_SYSTEM')
    ps = mod.particle_system
    ps.vertex_group_density = name
    ps.vertex_group_length = name
    ps.seed = seed
    st = ps.settings
    st.type = 'HAIR'
    st.count = count
    st.hair_length = length
    st.use_advanced_hair = True
    st.emit_from = 'FACE'
    st.normal_factor = 0.6
    st.object_align_factor = comb
    st.child_type = 'INTERPOLATED'
    st.child_percent = children
    st.rendered_child_count = children
    st.clump_factor = clump
    st.roughness_1 = rough
    st.roughness_endpoint = rough * 2
    st.root_radius = 1.0
    st.radius_scale = radius
    st.tip_radius = 0.2
    st.hair_step = 6
    st.display_step = 3
    st.render_step = 5
    ob.data.materials.append(material)
    st.material = len(ob.data.materials)
    return ps
