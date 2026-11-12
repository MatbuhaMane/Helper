# Decisions

A shared log of decisions that affect more than one area. Every session adds an entry here when it decides something
others must know: a shared file it needs changed, an API another area uses, a design token, a price or a quota, a new
table or route. Newest first. The master reads this before each merge.

Format:

```
## YYYY-MM-DD – short title (area)
What was decided, why, and what other areas must do. Status: proposed | accepted | done.
```

## 2026-11-12 – עץ המשפחה in the main menu (design, at the owner's request)

The owner asked design directly to put the family tree in the main menu. One line in `public/assets/common.js` (the
master's file): `{ href: '/family/', label: 'עץ המשפחה', short: 'משפחה', icon: 'family' }` in `NAV`, right after בית,
so it is in the PC's top menu and in the phone's tab bar (now eight tabs; all fit at 375 px). `base.css`: the top menu's
names never wrap, and between 900 and 1099 px the gaps and the type are a little smaller so nine entries fit on one line.
Master: please keep the line when you merge `design`. Status: done (on `design`).

## 2026-11-12 – The dev server's port lives in wrangler.toml (master)

Answer to design's entry "`npm run dev -- --port N` fails in the area worktrees": `package.json` now runs plain
`wrangler dev`, and `wrangler.toml` has `[dev] port = 8788`. `npm run dev -- --port 8789 --inspector-port 9230` works
in a worktree (tested next to the running 8788). Areas: merge `main` into your branch to get it; ai-features moves back
from 8791 to its own 8790. Status: done.

## 2026-11-12 – The family tree's lines after a move: two small fixes in family.js (design → ai-features)

Seen in the tree (`public/family/family.js`, owned by ai-features), not fixable in CSS:
1. After a tap moves the centre to someone, the lines are measured in the next frame, while the FLIP glide is still
   running, so they stay where the cards *were* (a line ends on a card's corner, or in the air). Proposed: in `focusOn`,
   redraw the lines when the glides end, e.g. `Promise.all(anims.map((a) => a.finished)).then(() => connect(board, board.querySelector('.fv-lines')))`
   (and draw them at once with reduced motion).
2. The `ResizeObserver` is set up once, with the first drawing's `<svg>`; every later `draw()` makes a new one, so after the
   first move a resize no longer redraws anything. Proposed: let the observer look the layer up each time:
   `new ResizeObserver(() => { const s = board.querySelector('.fv-lines'); if (s) connect(board, s); })`.
3. Optional, styled already: give the path from the person in the centre up to their parents and grandparents its own
   `<path class="lineage">`; `family.css` draws it a little stronger in `--primary`.
Status: accepted – all three done by ai-features in 079b046 (branch `ai-features`); complete when the master merges
`ai-features` and `design`, which together draw the line of descent.

## 2026-11-12 – Design batch 1: the tree's look, the tools rack, the forest sketch (design)

- `family.css`: the tree's lines and card edges use two local properties, `--fv-line` and `--fv-edge` (mixed from
  `--primary` and `--line-strong`, so they read by day and at night); no shared token changed. Phone: the title with the
  clock, the two everyday actions side by side, the vault's actions as one row of small chips, the view switch and the
  search on one line. Wide screens (≥ 1024 px): bigger cards, more air between generations.
- `launcher.css`: the tool silhouettes in `/assets/tool-icons/` hang on a rail over the title of the כלים folder, CSS only.
  It finds the folder by `.folder:has(> .apps-grid[aria-label="כלים"])`, so whoever changes the tools folder's title in
  `public/tools/index.html` or the markup in `launcher.js` should keep that label (or tell design).
- `docs/design/forest.md` and `forest-sketch.svg`: first sketches for stage 3, and what the page will need from stage 2.
Status: done (on `design`).

## 2026-11-12 – `npm run dev -- --port N` fails in the area worktrees (design → master)

`package.json` has `"dev": "wrangler dev --port 8788"`, so passing another `--port` gives wrangler two ports and it exits.
Proposed: `"dev": "wrangler dev"` with `[dev] port = 8788` in `wrangler.toml` (the command line overrides it), or change
the documented command and the worktrees' `launch.json` to `npx wrangler dev --port 8789 --inspector-port 9230`.
Status: done (master, 104fb5b).

## 2026-11-12 – The project is worked on in parallel (master)

Four sessions, each in its own worktree and branch: master (`main`, `M:\Claude Code\Helper`), design (`design`,
`Helper-design`), business (`business`, `Helper-business`), ai-features (`ai-features`, `Helper-ai`). Ownership of
files, ports and the merge rules are in `CLAUDE.md` under "Working in parallel". Areas may append routes, tables and
columns for their own features and log them here; `public/sw.js` `CACHE` is bumped only by the master on merge.
The feasibility study moved to `docs/business/standalone-feasibility.md`. Status: done.
