---
name: figure-style
description: The art direction for the family helper's companion figures (bobblehead historic figures and animals). Read before designing, modelling, changing or reviewing any companion figure, its colours, proportions, materials or animations.
---

# Companion figures: the style

The companion is a small collectible figure that lives on the screen. Every figure, person or animal, must look like it
belongs to **one collectible series**: same proportions logic, same finish, same light.

## References (from the owner)
- **Chibi vinyl collectibles** (Harry Potter set): big head, small body, large expressive eyes with painted irises and a
  white catchlight, simple hair as sculpted clumps, clean matte-satin vinyl, a little pet at the feet.
- **"Piece of History" Israeli figurines** (Ben-Gurion, Moshe Sharett): a real caricature face, the person's defining
  features exaggerated (Ben-Gurion's white hair wings), true period clothing, hands in pockets, a calm stance.
- **The blend we want:** chibi proportions and cuteness, with a face that is still recognisably *that* person.

## Proportions (people)
- Total height = 1.0. **Head ≈ 0.42** of the height (chibi, bigger than the Piece of History figures, smaller than full
  Nendoroid 0.5). Body 0.58: torso 0.30, legs 0.24, feet 0.04.
- Head slightly wider than tall (1.0 : 0.95). Shoulders ≈ 0.9 × head width.
- Eyes: large ovals, set low on the face (the eye line at ~55% of the head height from the chin). Iris fills most of the
  eye; a dark pupil; **one white catchlight top-outer**. Brows are sculpted and painted, they carry the expression.
- Nose: small, but shaped to the person (Montefiore long and straight, an elder's rounder).
- Mouth: a small painted line or smile; it opens a little when speaking (morph/scale in the app).
- Hands: simple mitten hands; poses come from the app (wave, point, hands behind back / in pockets at rest).

## Proportions (animals)
- The same "head-first" logic: the head is 35-45 % of the figure, eyes large and front-facing with a catchlight.
- Keep each animal's signature shape strong and readable at 150 px: the elephant's ears and trunk, the donkey's long
  ears and mane, the owl's round face disc and tufts, the octopus's big head and eight curling arms.

## Finish (materials)
- Painted vinyl: Principled BSDF, roughness 0.45-0.6, a light clearcoat (0.15-0.3) on skin and hair, none on cloth.
  Subsurface only on skin, very subtle (0.05) so it reads as soft plastic, never as wax.
- Flat, painted colour fields; no photo textures. Small painted details (buttons, ties, stitching lines) are geometry or
  separate tiny meshes with their own colour.
- Skin tones vary per person, never orange. Hair and beards are sculpted clumps, not strands.
- Palette harmonises with the app (ShemRivers): warm neutrals, olive/vine greens, soil browns, limestone whites. Avoid
  saturated primaries except small accents.

## Light and preview renders
- Three-point soft studio light, warm key from front-left, cool rim from back-right (like the app's three.js scene).
- Preview render: 1024×1024, chalk background `#efeee6`, soft contact shadow, camera at chest height, slight 3/4 view,
  plus one front view. **Always show the owner a render before a figure goes into the app.**

## Structure for the app (so it can animate)
Export glTF (`.glb`), Y-up, 1 unit = figure height, feet at the origin, facing +Z. Named nodes the app animates:
`root` > `body` > `head` (the bobble pivot is at the neck), `arm_L`, `arm_R` (pivot at the shoulder), `leg_L`, `leg_R`
(pivot at the hip), optional `prop`, `tail` / `tail_1..n`, `ear_L` / `ear_R`, `wing_L` / `wing_R`, `trunk_1..n`,
`arm_1..8_1..n` (octopus). The mouth node is `mouth`; eyelids `lid_L` / `lid_R` (for blinking) when present.
Budget: ≤ 25k triangles, ≤ 1.5 MB per figure, no textures larger than 1024 px (prefer none).

## Animations (done live in the app, from the node names)
idle breathing, blink, head bobble (a spring: it lags and overshoots when the body moves), look at the cursor, walk,
wave, point, happy hop, think (hand to chin), sleep, talk (mouth). Animals use their own parts (tail wag, ear flap,
trunk sway, wing flap, tentacle curl).

## Review checklist
1. Is it instantly recognisable at 150 px tall (squint test)?
2. Does it look like the same series as the others (proportions, finish, light)?
3. Cute and respectful: no mockery of the person; dignity of the elderly; religious dress depicted accurately.
4. Node names and pivots as above; within the budget.
