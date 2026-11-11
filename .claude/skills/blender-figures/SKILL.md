---
name: blender-figures
description: How to model, render, check and export the companion figures with Blender (bpy, headless) for the family helper. Use whenever a companion figure (person or animal) is created, changed, rendered or exported, together with the figure-style skill.
---

# Building companion figures in Blender

## Setup
- Blender runs headless as a Python module: `pip install bpy==5.3.0` (Python 3.13; a large download, ~10 minutes).
- Scripts live in `figures/src/`. `lib.py` holds the building blocks; each figure is one script
  (`figures/src/<slug>.py`) that builds the figure from scratch, renders previews and exports.
- Run: `python3 figures/src/<slug>.py -- 3q front` → renders in `figures/renders/<slug>_<view>.png`,
  model in `public/figures/<slug>.glb`.

## Building blocks (`lib.py`)
- `mat(name, '#hex', rough, coat, sss, metal, emit)` – painted vinyl materials (see figure-style for values).
- Shapes (all smooth, subdivided): `ball` (ellipsoid), `box` (rounded box), `tube` (tapered cylinder), `capsule` (limb
  from point a to b), `torus` (ring or arc: smiles, collars, beards), `lumpy` (soft sculpted irregularity for hair).
- `pivot(name, location, parent)` creates a joint node; `attach([meshes], pivot)` bakes the meshes into one object that
  hangs from it. **Put every pivot at its real joint** (neck, shoulder, hip, ear root, tail root): the app rotates
  around it.
- `studio()` + `render(path, view)` – the series' studio light on the chalk background (Cycles, CPU, denoised).
- `export(path)` – GLB, Y-up, modifiers applied, lights/camera/floor left out.

## Conventions
- Blender Z-up, figure on the origin, ~1 unit tall, **front = -Y** (the exporter makes it +Z for three.js).
  The figure's left (`_L`) is +X.
- Node names are a contract with the app (`public/assets/daemon.js`): `root`, `body`, `head`, `eye_L/eye_R`,
  `arm_L/arm_R`, `leg_L/leg_R` (people) or `leg_FL/FR/BL/BR` (four legs), `ear_L/ear_R`, `tail`, `trunk_1..n`,
  `wing_L/wing_R`, `tentacle_<i>_<j>`. Missing nodes are fine; wrong names silently don't animate.
- Colours from the figure-style palette; one material per colour, reused.

## Workflow for a new figure
1. Read figure-style and (for people) historic-figures; write the likeness notes first.
2. Copy the closest existing script, change the parts. Keep proportions from figure-style.
3. Render `3q` and `front`, **look at the renders yourself** and fix what reads wrong (scale, intersections, a part
   inside the head, eyes too small). Iterate until it passes the figure-style checklist.
4. Check the export: size (`ls -la public/figures`), node names
   (`python3 -c "import json,struct;..."` or load it in the app preview).
5. Show the owner the renders. Only then add it to `public/figures/index.json` and commit.

## Pitfalls
- `bpy.ops` calls need a context: prefer the `bmesh`/data API used in `lib.py`.
- Subdivision shrinks shapes a little: make parts that must touch overlap slightly.
- Thin parts (canes, whiskers) under ~0.008 units vanish at 150 px; keep ≥ 0.009.
- Rendering on CPU: 64 samples + denoising at 900 px takes about a minute per view; don't raise it for previews.

## Lessons from the animated ibn Ezra (generated mesh + Mixamo)
- Don't bake a front-projected picture into the generated mesh's UVs (or a Smart UV): thousands of tiny islands, and
  their seams show as shards across the face. Use the projection itself as the model's UV and the picture as its
  texture; faces the picture never sees point at a plain robe-coloured patch painted into an empty corner.
- Folded slivers in generated meshes light up black: turn head faces outward (from the head's centre) and body faces
  outward (away from the nearest bone), give the head rounded normals, and light the figure mostly by its own colours
  in the app (emissiveMap = map), since the picture already carries the shading.
- Keep head turns small in the app: the beard follows the head bone and the chest doesn't, so big turns open a dark seam.
- Tried and dropped: Laplacian smoothing of the face, mirroring half the head (the head isn't symmetric underneath),
  star-shaped and front/back depth-map head shells (lost the profile, blocky silhouette).
