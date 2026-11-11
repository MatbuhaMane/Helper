"""Sculpting with signed distance fields: anatomical forms (ellipsoids, capsules) blended with smooth unions and carved
with smooth subtractions, then meshed with marching cubes into one continuous organic surface.

Coordinates: Blender (Z-up), the face looks toward -Y. Distances are in the units of the shape being built."""

import numpy as np
from skimage import measure

import bpy
import bmesh


class Field:
    def __init__(self, lo, hi, res):
        self.lo = np.array(lo, float)
        self.hi = np.array(hi, float)
        self.step = (self.hi - self.lo).max() / res
        axes = [np.arange(self.lo[i], self.hi[i] + self.step, self.step) for i in range(3)]
        self.X, self.Y, self.Z = np.meshgrid(*axes, indexing='ij')
        self.d = np.full(self.X.shape, 1e3, dtype=np.float32)

    # ---- primitives (approximate signed distances) ----
    def ellipsoid(self, c, r, rot=None):
        x, y, z = self._local(c, rot)
        r = np.array(r, float)
        k0 = np.sqrt((x / r[0]) ** 2 + (y / r[1]) ** 2 + (z / r[2]) ** 2)
        k1 = np.sqrt((x / r[0] ** 2) ** 2 + (y / r[1] ** 2) ** 2 + (z / r[2] ** 2) ** 2) + 1e-9
        return (k0 * (k0 - 1) / k1).astype(np.float32)

    def capsule(self, a, b, ra, rb=None):
        rb = ra if rb is None else rb
        a, b = np.array(a, float), np.array(b, float)
        ba = b - a
        px, py, pz = self.X - a[0], self.Y - a[1], self.Z - a[2]
        h = np.clip((px * ba[0] + py * ba[1] + pz * ba[2]) / ba.dot(ba), 0, 1)
        dx, dy, dz = px - ba[0] * h, py - ba[1] * h, pz - ba[2] * h
        return (np.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h)).astype(np.float32)

    def sphere(self, c, r):
        return (np.sqrt((self.X - c[0]) ** 2 + (self.Y - c[1]) ** 2 + (self.Z - c[2]) ** 2) - r).astype(np.float32)

    def _local(self, c, rot):
        x, y, z = self.X - c[0], self.Y - c[1], self.Z - c[2]
        if rot is None:
            return x, y, z
        # rotation (degrees) around X then Y then Z, applied inversely to the points
        ax, ay, az = [np.radians(-a) for a in rot]
        x, y = x * np.cos(az) - y * np.sin(az), x * np.sin(az) + y * np.cos(az)
        x, z = x * np.cos(ay) + z * np.sin(ay), -x * np.sin(ay) + z * np.cos(ay)
        y, z = y * np.cos(ax) - z * np.sin(ax), y * np.sin(ax) + z * np.cos(ax)
        return x, y, z

    # ---- blending ----
    def add(self, d, k=0.03):
        """Smooth union (k = blend radius)."""
        h = np.clip(0.5 + 0.5 * (d - self.d) / k, 0, 1)
        self.d = (d * (1 - h) + self.d * h - k * h * (1 - h)).astype(np.float32)

    def cut(self, d, k=0.02):
        """Smooth subtraction."""
        h = np.clip(0.5 - 0.5 * (self.d + d) / k, 0, 1)
        self.d = (self.d * (1 - h) + (-d) * h + k * h * (1 - h)).astype(np.float32)

    def keep(self, d, k=0.02):
        """Smooth intersection: keep only where d is inside."""
        h = np.clip(0.5 - 0.5 * (d - self.d) / k, 0, 1)
        self.d = (d * (1 - h) + self.d * h + k * h * (1 - h)).astype(np.float32)

    def wrinkle(self, a, b, depth, width):
        """A crease: a soft groove along a line on the surface."""
        dist = self.capsule(a, b, 0.0)
        self.d += (depth * np.exp(-(dist / width) ** 2)).astype(np.float32)

    def noise(self, amp, freq, seed=0):
        """Fine skin irregularity (cheap value noise from a few sines)."""
        rng = np.random.default_rng(seed)
        n = np.zeros_like(self.d)
        for _ in range(6):
            k = rng.normal(size=3)
            k = k / np.linalg.norm(k) * freq * rng.uniform(0.7, 1.4)
            n += np.sin(self.X * k[0] + self.Y * k[1] + self.Z * k[2] + rng.uniform(0, 6.28)).astype(np.float32)
        self.d += amp * n / 6

    # ---- meshing ----
    def mesh(self, name, material=None, smooth_iter=6):
        v, f, _, _ = measure.marching_cubes(self.d, level=0.0, spacing=(self.step,) * 3)
        v = v + self.lo
        me = bpy.data.meshes.new(name)
        me.from_pydata(v.tolist(), [], f[:, ::-1].tolist())
        me.validate()
        bm = bmesh.new()
        bm.from_mesh(me)
        for _ in range(smooth_iter):
            bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = True
        ob = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(ob)
        if material is not None:
            me.materials.append(material)
        return ob


def hair_grooves(F, amp=0.004, freq=160, flow='down', wave=0.04, seed=0):
    """Sculpted hair: fine parallel grooves along the hair's flow, gently wavy (like a carved, painted figurine)."""
    rng = np.random.default_rng(seed)
    X, Y, Z = F.X, F.Y, F.Z
    if flow == 'down':        # beard, falling: grooves go around the vertical axis and run straight down
        theta = np.arctan2(X, -(Y + 0.25))
        u = theta * 0.32 + wave * np.sin(Z * 9 + rng.uniform(0, 6)) * 0.3
    else:                     # brows/moustache, sideways: run along x
        u = Z + wave * np.sin(X * 14 + rng.uniform(0, 6))
    # locks: the phase drifts with a slow noise so grooves bunch into clumps instead of an even rib
    ph = np.zeros_like(F.d)
    for _ in range(4):
        k = rng.normal(size=3)
        k = k / np.linalg.norm(k) * rng.uniform(5, 11)
        ph += np.sin(X * k[0] + Y * k[1] + Z * k[2] + rng.uniform(0, 6.28)).astype(np.float32)
    g = np.sin(u * freq + ph * 1.6) + 0.45 * np.sin(u * freq * 2.7 + ph * 2.2 + 1.7)
    depth = 0.6 + 0.4 * np.sin(ph * 1.3)
    F.d += (amp * depth * g / 1.45).astype(np.float32)
