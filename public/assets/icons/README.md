# The app icon: the owner's logo, אהל in the old script (2026-11-13)

From 2026-11-13 the app icon is the owner's logo (`docs/design/brand/ohel-logo-inline.svg`) in basalt ink on a warm
limestone tile (#ece6d7, a touch deeper than the page so it holds on a white home screen), with a faint ink edge.
Sources, written by `node docs/design/make-ohel-icons.mjs` (do not edit by hand; pass a .png path to get a contact sheet):
- `ohel.svg` – rounded square, for 180 px and up; `ohel-small.svg` – the logo fills the tile, thicker strokes, for 48/32/16;
  `ohel-maskable.svg` – full bleed, the logo inside the safe circle.
- Rendered: `ohel-icon-{512,192,180,48,32,16}.png` ("any"), `ohel-icon-maskable-{512,192}.png`, `ohel-apple-touch-icon.png`
  (180, from the maskable; iOS rounds it), `ohel-favicon.ico` (16, 32, 48 inside).

The tent below is the previous icon, kept until the master switches the manifest and index.html.

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
