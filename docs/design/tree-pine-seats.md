# The pine with seats (the owner's decision, 2026-11-14)

The family tree's default look is the owner's pine drawn with empty circles (images 21, 20, 17 and 18). The circles are
**seats**: a person sits only in a seat. Built by `docs/design/cut-tree-pine-seats.py` from the originals in
`data/art/owner-2026-11-14/` (git-ignored).

## What ships (`public/assets/tree/pine/`)

- `tree-summer.webp` (21), `tree-autumn.webp` (20), `tree-winter.webp` (17, light snow), `tree-snow.webp` (18, heavy snow):
  one still picture per season, 1000 × 1500.
- The drawn rings are **not** in the pictures. Every circle was filled back in from the clean tree (16), at the same
  coordinates, with the season's own foliage colour. So an empty seat is invisible, and only the clearings the circles
  left in the foliage remain.
- The ring is drawn by CSS only round a seated person (`tree.css`, the pine block): `.tr-face` gets a
  `#31231f` border in the drawing's line weight; an empty-person form (`.tr-p.empty`) gets a dashed ring on cream.
- Spring has no picture of its own: summer with a fresh tint (`--pine-f`).

## The 20 seats

There are **20** seats, not 16: five tiers of four. They are identical (within 1 px) in all four seasonal pictures.

| Tier (bottom first) | Who | Centres, source px (1342 × 2000) |
|---|---|---|
| `roots` | the eldest, the forebears | (366,1580) (574,1580) (768,1580) (972,1580) |
| `low` | grandparents | (394,1241) (578,1241) (765,1241) (948,1241) |
| `mid` | parents | (394,911) (578,911) (764,911) (950,911) |
| `crown` | you, siblings, cousins | (394,588) (578,588) (766,588) (950,588) |
| `top` | children and grandchildren | (414,286) (582,275) (760,275) (928,286) |

In % of the box (x from the left, y from the top), as `slots.json` has them: `[(sx − 4) / 1334 × 100, sy / 2001 × 100]`.
The roots line, for example, is `[27.14,78.96] [42.73,78.96] [57.27,78.96] [72.56,78.96]`.

A seat's diameter (the drawn ring's outer edge, r ≈ 67 px) is **10.04 %** of the box width: `slots.seat`.
The closest seats are 13.8 % apart, so a name tag on the pine is capped at 13.4cqi.

## `slots.json` for family.js (ai-features)

```json
{ "box": [1000,1500], "ext": "webp", "layers": [], "seat": 10.04, "perRow": 4,
  "crownPivot": [50,22], "trunkPivot": [50,54.97], "candleY": 94.5,
  "tiers": [ { "name": "roots", "note": "…", "line": [[27.14,78.96], …] }, … ] }
```

- `layers: []`: no `<img>` layers; the picture is the `.tree::before` background (tree.css).
- `seat`: when present, people go **on the seats**, not spread along the line. The rule (as `seats()` in
  `docs/design/prototype/tree-18.html`):
  - n ≤ 4: take the n seats nearest the middle of the line, in their left-to-right order
    (1 → a middle seat, 2 → the two middle ones, 3 → the middle three);
  - n > 4: fall back to `spread()` along the line (the rings are CSS, so a fifth person still gets a ring; it just
    stands between the drawn clearings).
- The face size: `--leaf: 10.04cqi` on `.tr-p` (tree.css sets it for the pine), so the ring matches the clearing.
- **Seasons:** set `data-season="summer|autumn|winter|snow|spring"` on `.tree`. family.js doesn't set it yet; without it
  the summer picture shows. `snow` is heavy snow (18), `winter` light snow (17); which one a date gets is ai-features'
  choice (for example, `snow` only in the coldest weeks).

## Known weak spots

- At the outer seats of the `low` and `mid` tiers a filled-in clump is a little rounded where it meets the clearing.
  It shows only when that seat is empty.
- 229–305 KB per season picture; only the active one loads.
- The pine no longer sways: it is a still picture.
