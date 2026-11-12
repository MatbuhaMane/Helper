# Area: Design & graphics

**Worktree:** `M:\Claude Code\Helper-design` · **Branch:** `design` · **Dev server:** `npm run dev -- --port 8789 --inspector-port 9230`

## Scope

How the hub looks and feels on the phone (the PWA) and on the PC (the wide layout and the Electron program): visual design,
UI/UX, motion, graphics, icons, the companion figures.

## Owned paths

- `public/**/*.css`, including `public/assets/base.css` (the design tokens: limestone, basalt ink, vine, olive; Rubik)
- images, icons and fonts under `public/assets/` (not `common.js`), `public/figures/`
- `figures/` and the figure skills (`figure-style`, `blender-figures`, `historic-figures` in `.claude/skills/`)
- `docs/design/`

Page JavaScript belongs to ai-features; markup that a page builds in JS is changed together with them (propose it, or
agree on it in `docs/decisions.md`). `public/index.html` and `common.js` are the master's.

## Goals

- **The forest** (stage 3 of `docs/family-forest.md`): the smooth zoom out from the family tree into the forest of linked
  trees, with the glowing line from us to the person we look for. The owner said the graphics come later; start with sketches.
- The family tree's look at 375 px and on desktop, light and dark: cards, lines, the animated move between relatives.
- The tool icons in `public/assets/tool-icons/` (not used yet): where they go.
- Small polish batches across the pages, each checked with `tools/audit.js`.

## Rules that matter here

- Hebrew, right to left; logical properties only (`inline-size`, `margin-inline-start`), never raw left/right.
- Use the tokens in `base.css`; a new or changed token is a decision (other areas see it), so log it.
- Done means checked at 375 px and desktop width, in light and dark mode, and `prefers-reduced-motion` respected.

## Open questions

- How should the forest look and move: a map, a network, a canopy? How far can it zoom before names are hidden?
- Do the tool icons belong to the PC guide, the tools page, or the home wheel?
