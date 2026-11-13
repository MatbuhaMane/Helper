# The home page's pictures, full size (2026-11-14)

The masters of what the home page shows, kept before they were made lighter for the readiness bar (LCP on 4G):
- `tent.webp` (1400): `public/assets/tent.webp` stays as is; beside it `tent-1000.webp` and `tent-700.webp` for srcset, and
  `tent-mask.webp` (420, the outline only) for the light layers' CSS mask, so the full picture is fetched once.
- `stump-guitar.webp` (700) → `public/assets/stump-guitar.webp` at 400 (it shows at about 80–180 px).
- `pillows/` (up to 420×299) → `public/assets/pillows/` at 250 high (they show at most 132×124).
- `campfire/` (base 640, flames 420 high) → `public/assets/campfire/` at 420 / 280 (the fire shows at 124–168 px).
Together the stump, pillows and fire went from 535 KB to 348 KB.
