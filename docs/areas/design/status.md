# Status – design

Updated by the department at the end of every meaningful round of work. Short: the master reads it for the board meeting.

_Updated 2026-11-14 (the cushions' flat ellipse; the page turn between windows)._

## Done
- **The family tree, spec 1 (vision's batch):** one fixed drawn tree in the tent's style, in moving layers (ground, boughs,
  trunk, crown) made in code by `docs/design/make-tree.mjs` into `/assets/tree/<kind>/` with `slots.json` (the tiers where
  people hang). **The owner chose the olive** (2026-11-14); the oak and acacia are
  removed. Four people on a tier no longer touch at 375 px (`docs/design/tree-family-olive.jpg`). People are leaves with a
  wooden name tag; the passed get an autumn leaf, a dark tag and stillness; a yahrzeit candle by the roots, a birthday glow,
  the "+" bud. Soft Web Audio sounds (`tree-sound.js`: a wooden tok, a low quiet tone for the passed, no confetti).
  `tree.css` documents the markup for ai-features; the prototype is `docs/design/prototype/tree.html`. Checked at 375 and
  1280, light and dark, reduced motion.
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

- **The app icon (94a111c):** a simple tent drawn by hand as SVG (`tent.svg`, `tent-small.svg` for 16–48 px,
  `tent-maskable.svg`), every PNG size and `tent-favicon.ico` rendered from it (`node docs/design/make-icons.mjs`);
  checked at 16/32/192/512 on light and dark. The manifest and the `<link>`s are the master's (exact lines sent to the CEO).
- **The parasha study room on the phone (the owner's tour):** the sheet is half the screen and the verse stays pinned above it;
  the chapter arrows point the reading way; `--rs-scale` + `.rs-size` for ai-features' A−/A+. The two "הפרק הבא/הקודם"
  labels at the page's end need their glyphs swapped in study.js:141–142 (ai-features).
- **News cards on the phone (0b9a857):** opacity and transform only: the hover/press shade fades on a layer under the content,
  the list no longer clips with a rounded overflow, off-screen rows skip rendering (`content-visibility`). Checked at 375
  (light, dark, list and cards) and 1280. The JS side (full list rebuilds that replay the entry) is with ai-features.
- **The phone's tab bar (the owner):** a floating glass capsule, our own round icons in `/assets/tab-icons/` (outline and
  filled), the current tab in a pale-vine pebble; checked at 375 in light and dark, the menu above it, no overflow.
- **The cushions away from the fire (the owner):** the ring lower and wider, clear space round the fire; checked at 375 and
  1280, no overlap, no page overflow. A patch for the master's `index.html`: `design-index-cushions-2026-11-14.patch` in the notes.
- **The cushions on a flat ellipse again (the owner):** closer to the fire on a flatter orbit for depth (ry/rx 0.64 on the phone,
  0.33 on PC); the front cushions keep 10–14 px from the logs and flames, the label stays clear of the caption, and the back cushion
  passes partly behind the flames, which gives the depth. Checked at 375 and 1280, light and dark. Patch for `index.html`:
  `design-index-cushions-ellipse-2026-11-14.patch`. Live in v83; the owner approved the depth ("It's good").
- **A quiet page turn between windows (the owner):** cross-document View Transitions in base.css. The page fades and moves 6 px
  the Hebrew way (160 ms out, 200 ms in), and the top bar and tab bar stand still. It is off with reduced motion (the
  device's or the app's), and other browsers navigate as before. Checked in headless Chrome and at 375 and 1280.
  - A patch for the master's `common.js` (`design-common-nav-steady-2026-11-14.patch`): the navigation shows from the
    cached user, so it doesn't blink out while `/api/me` answers.
  - Live in v83, with the patch.

- **Settings in folding categories** (settings.css + `prototype/settings.html`): a card per category with its own drawn mark
  and colour, a line of what is set now, closed at first; ai-features to switch `section()` to `<details>`.
- **The four animals polished:** the owl's big ringed eyes, a slow owl blink and a far tilt when it thinks; the fennec tosses
  its head, the lamb springs twice, the hedgehog curls into a ball when touched.

- **The setup wizard (block 1):** `public/welcome/welcome.css` + `prototype/welcome.html` – six steps, one question each,
  big springy answers, the figure speaking and glad, colours repainting the page live, a trail that fills, stars and one
  soft sound at the end; ai-features to build `/welcome/` from it.

- **The game layer's look (block 2):** `assets/game.css` + `assets/celebrate.js` + `prototype/profile.html` – the profile
  banner (an embroidered frame, the companion's live head as the avatar via the new `Figure2D.mountHead`, five drawn
  backgrounds, three badges, the title's plaque), badges as stitched patches (locked, new), titles (a glow behind the
  name, wings, a crown, the founder's gold), and a small celebration (`Celebrate.at(el)`).

- **הדלת האחורית, the look (489f08b):** `admin/admin.css` + `assets/bd-icons/` (9 line icons) + `prototype/backdoor.html`:
  the dashboard on top (the tent's state across; שימוש and פניות side by side on a computer; number cards with a trend and
  a spark), then the nine parts as toolbox apps coloured by `data-bd`, a count badge, the open part under the tiles.
  Checked at 375 (3×3) and 1280 (5+4), light and dark, no overflow. The markup went to ai-features for `admin.js`.

## In progress
- The rest of the style check, after the image quota resets (00:00 UTC): the tool icons, the record, a painted, image-made tree as a
  fourth version if the owner wants one (about 6 images); then, by the owner's decisions, the big folder and tab pictures (food, tools,
  entertainment) and our own symbols in place of the emoji, gradually – next among them the weather's sky icons (a small
  drawn set: sun, partly cloudy, cloud, rain, storm, snow, fog, night; one image, cut).
- After the image reset (00:00 UTC): **the 19 approved badges** (the owner approved the names 2026-11-14; prompts ready in
  the design scratchpad's `badge.mjs`, one run: `badges-tools-run.sh`, ~$1.30), then cut each to `/assets/badges/<id>.webp`.
- Waiting for the master's speed/motion tool to fix by its report (CLS, real frame rate).

## Blockers
- The companion's size and the single record need ai-features' `daemon.js` / `music.js` changes in the same merge.
- The image quota for 2026-11-13 is used (40/40, checked again 06:00 UTC): the 19 badges wait for 00:00 UTC (the tent icon is done as SVG, no image needed).

## Decided by the owner (2026-11-14, the focus round)
- The app icon: a simple small tent at **every** size (done as a hand-drawn SVG, 94a111c).
- Titles on the banner: **the person chooses** which earned effect to show (glow, wings, crown, the founder's gold).
- The horizon: only the hills, **low, on the line where the sun and moon meet the ground** (patch for index.html in the notes).

## Needs the owner
- Nothing open. (Decided 2026-11-14: line icons stay small, the big ones drawn; the emoji replaced gradually, ✓ and ★ stay.)
