# The sky: one global layer behind every scene

_Design, 2026-11-14. The CSS is the "The sky" section at the end of `public/assets/base.css`._

**The problem it fixes:** the tent's sky used to live in a box inside the pager. On a wide window, that box ended in a hard edge, and its low hills made a flat strip.

**How it works now:**
- The sky is drawn on `body::before` and `body::after`, plus `main::before` for the twinkle.
- All three are `position: fixed; inset: 0`, so the sky covers the whole window at any width and height.
- The scenes only place their own picture on it.

## Turning it on

- **The tent:** on automatically, because the home page has `.sky`, matched with `:root:has(.sky)`.
- **Any other scene** (the garage, the hill): put `data-scene` (with any value) on `<html>`, then draw only the scene's picture, centred. Don't draw a sky box of its own.
- **Other pages:** no sky. Their background stays `--bg`.

## Tokens (on `:root`)

| Token | Day | Night |
|---|---|---|
| `--sky-top` | a soft blue at the top | a deep navy |
| `--sky-mid` | none | a faint blue halfway down |
| `--sky-stars` | 0 | 1 (how strongly the stars show) |

- A season, a mood or a scene can set these tokens for itself, for example `:root[data-scene="hill"] { --sky-top: … }`.
- Night follows the theme: dark mode, or the system's dark mode.

## The stars

- Two tiled fields of small dots. Their tile sizes (331×263 and 457×389) don't repeat together, so no pattern shows at any width.
- They fade towards the bottom.
- The second field twinkles by `opacity` only. With reduced motion it stands still at 60%.

## What changed in the tent's box (`index.html`, the master's)

Nothing changed in the file itself; base.css overrides it with `:root .sky`.
- The box keeps only the sun, the moon and the sun's glow.
- The box's own tint is gone, and its stars are hidden (`.sky .stars { display: none }`), because the global layer draws both now.
- From 700 px up, the box's sides fade out (a mask, 14% each side). The low hills fade with them, so no edge or strip shows.
- **A later cleanup for the master (optional):** stop building the 46 star `<i>` elements and the `--sky-top` setting in index.html, since nothing shows them now.
