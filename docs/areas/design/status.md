# Status – design

Updated by the department at the end of every meaningful round of work. Short: the master reads it for the board meeting.

_Updated 2026-11-14 (family batch, deploy 1)._

## Done
- **Companions (Figure2D):** 24 figures in one illustrated series, every one with its palette (5 colourways, free, by the
  owner's rule; the doll excepted). New paid ones: הקוסם (redrawn taller), הרואה (her hair chosen, white by default), קוסם
  הלילה, קוסמת היער, the little wizard pair (with harmless, switchable pranks: `pranks.js`). Dracula redrawn young,
  Cleopatra's counterpart, no longer tagged horror.
- **Pages' look:** the founders page and the purchase page (paid in credits, terms before the button), opt-in founders.
- **Locks:** `lock.js` + `lock.css`: the padlock and its locking move, the lock screen (dots, keypad, passkey), the tree's
  first-visit window, the privacy section's parts in `settings.css`. Live in v61 through ai-features' `lock-screen.js`;
  the drawn padlock in the menu merged by the master (e24beb2).
- **Readiness bar, condition 1 (graphics):** the sky redrawn in the tent's style (sun, the moon's eight phases from one
  drawing, the eclipse). With the campfire, style-check items 1–4 are ✅ (`docs/design/style-check.md`).
- **Readiness bar, condition 2 (motion), first pass:** layout-driven animations made transforms, animated shadows made
  fading rings, no animated blur; the list in `style-check.md`.
- **Readiness bar, speed (from ai-features' measurement):** the home page's pictures made lighter (535 → 348 KB for the
  stump, cushions and fire; the tent in 700/1000 px versions and a 7 KB mask, for the master's `index.html`).
- **The owner's messages** (`.owner-msgs`/`.owner-msg` in base.css: floating cards, drawn marks by level, above the
  groceries' cart button) and **the weather page** (`weather.css`, `.wx-*`): wired by ai-features (34be7be), off inline styles.

- **The family batch, first deploy (quick visual fixes):** one layer scale for everything that floats (`--z-*` in
  base.css: bubbles, menus, sheets and messages no longer land under each other); the companion much smaller
  (`--dm-size` 140/112/96 px × `--dm-scale`); the sky's blob gone (halos fade as the body sinks) and soft hills on the
  horizon; one record (music.css `.on-stump`). The `index.html` parts are patches for the CEO in the shared notes.

- **The app icon (vision batch 8):** a small tent in all sizes in `public/assets/icons/` (any, maskable, Apple touch);
  the manifest and the `<link>`s are the master's.

- **Settings in folding categories** (settings.css + `prototype/settings.html`): a card per category with its own drawn mark
  and colour, a line of what is set now, closed at first; ai-features to switch `section()` to `<details>`.
- **The four animals polished:** the owl's big ringed eyes, a slow owl blink and a far tilt when it thinks; the fennec tosses
  its head, the lamb springs twice, the hedgehog curls into a ball when touched.

## In progress
- The rest of the style check, after the image quota resets (00:00 UTC): the tool icons, the record, the tree's 12
  drawings (about 14 images, ~$0.96); then, by the owner's decisions, the big folder and tab pictures (food, tools,
  entertainment) and our own symbols in place of the emoji, gradually – next among them the weather's sky icons (a small
  drawn set: sun, partly cloudy, cloud, rain, storm, snow, fog, night; one image, cut).
- Vision batch 8 (the wizard, the social screens): on hold until the owner decides whether a wizard suits the parents.
- After the image reset: a simplified small tent for the 32/48 px icons.
- Waiting for the master's speed/motion tool to fix by its report (CLS, real frame rate).

## Blockers
- The companion's size and the single record need ai-features' `daemon.js` / `music.js` changes in the same merge.
- The image quota for 2026-11-13 is used (40/40).

## Needs the owner
- Nothing open. (Decided 2026-11-14: line icons stay small, the big ones drawn; the emoji replaced gradually, ✓ and ★ stay.)
