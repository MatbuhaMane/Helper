# The app icon: a small tent (hand-drawn SVG, 2026-11-14)

The icon of האוהל is a simple brown tent with a warm glow in its opening, on a patch of sand, on limestone. It is drawn by hand
as SVG (no image generation), so it stays sharp at every size. The family logo (`/icon.svg`, `/icon-*.png`, `/favicon.ico`)
is the owner's personal icon; the master serves it per user.

Sources:
- `tent.svg` – the full drawing (rounded square, transparent corners), for 180 px and up.
- `tent-small.svg` – fewer details and thicker shapes, for 48, 32 and 16 px.
- `tent-maskable.svg` – full bleed, the tent inside the safe circle.

Rendered (do not edit by hand; run `node docs/design/make-icons.mjs` from the repo root after changing an SVG):
- `tent-icon-{512,192,180}.png` (from tent.svg) and `tent-icon-{48,32,16}.png` (from tent-small.svg) – "any".
- `tent-icon-maskable-{512,192}.png` – "maskable".
- `apple-touch-icon.png` (180, from the maskable drawing; iOS rounds it).
- `tent-favicon.ico` – 16, 32 and 48 px inside.
