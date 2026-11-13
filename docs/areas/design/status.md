# Status – design

Updated by the department at the end of every meaningful round of work. Short: the master reads it for the board meeting.

_Updated 2026-11-13 (main v99: the owner's logo in the bar and the tree batch; ready: the app icon set, the tree smoother, the reports look, the family story's look)._

**Where we stand (a brief for the next round):**
- **Ready to merge: the messages inbox in the top bar (v125, main merged in):** `.dm-inbox` in base.css with `bd-icons/envelope.svg`:
  - the triangle's twin: 44×44, a 24px line envelope at stroke 1.9, no circle, in the text's ink, the vine on hover;
  - the unread `.dm-dot` sits on the envelope's corner, and the two icons sit a little closer to each other than to the chip;
  - checked with an injected button on the real bar at 375 and 1280, light and dark: no overflow, contrast 12.3:1 light, 14:1 dark.
- **Ready to merge: "איפה הבית?" in the welcome (v123, main merged in):**
  - `.wz-place`, `.wz-sugg` and `.wz-home` in welcome.css, plus the icons `bd-icons/pin.svg` and `home.svg`;
  - the list sits under the input, with 44px rows and a pin on each; the chosen row (`aria-selected`) is in the vine;
  - a long name gets an ellipsis; the place marked as home is a vine pill with a house; when empty (free text) it is hidden;
  - checked on a prototype (`?s=city`) at 375 and 1280, light and dark: no overflow, contrast 6.3:1 and up.
- **Live in main (v91):**
  - **The fire roulette.** It is checked:
    - with the mouse at 375 and 1280, in light mode;
    - with a real touch long press at 375, in dark mode;
    - with reduced motion.
  - **The family profile's look.** It is `public/family/profile.css` with five covers, `/assets/covers/*.svg`.
- **Live in main (v93, v95): the covers at night** (e83f5ed) and **הרגלי אכילה's own icon** (d7b8192 and its common.js patch).
- **Waiting for the owner: the new brand mark** (1a32930, `docs/design/brand/`, the sheet `options.jpg`). Three options join the tent and the old script:
  - A: the script with the tent at its start; the app icon stays the tent.
  - B: the shin glowing in the tent's doorway, one mark for the bar and the icon (recommended). The letter reads only from ~32 px.
  - C: the shin turned over as a two-peaked roof; at small sizes it looks a little like mountains.
  - Once the owner chooses, the `--bm-*` tokens go into base.css and the SVG goes to the CEO for BRAND in common.js.
- **Ready to merge:** the profile faces' initial is darker (≥ 4.5:1 in light, it was 2.9:1, from ai-features' audit), and the tree prototype names עץ ב׳ (canopy) first and the olive עץ א׳ (v97).
- **Ready to merge: the app icon from the owner's logo** (`public/assets/icons/ohel-*`, `docs/design/make-ohel-icons.mjs`): limestone tile, basalt ink,
  any + maskable, 16/32/48/180/192/512, `ohel-favicon.ico`, `ohel-apple-touch-icon.png`; looked at on a light and a dark ground. The master wires manifest.json and index.html.
  base.css `.brand-mark` now carries the logo's size (26 px, 405.4/159.4), so BRAND's inline style in common.js can go. The bar is checked at 375 and 1280, light and dark.
- **Ready to merge: the back door's tab, the folded usage, the second list (v111)**: `.ad-edge` in base.css (a vine tag at the inline-start edge under the top bar, a door line icon `/assets/bd-icons/door.svg`, only the icon on a phone), `.ad-fold` (summary row with a turning chevron) and `.ad-sugg` beside `#ad-sugg` in admin.css. Checked on a prototype (375/1280, light/dark); ai-features removes the inline fallbacks.
- **Ready to merge: the members search's suggestion list** (9d14517): `admin.css` `.ad-combo` and `#ad-sugg` (tokens, 44px rows, the chosen row by `aria-selected`), to merge together with ai-features' admin.js that drops the inline style. Checked on a prototype (375/1280, light/dark); the live back door needs the owner's passkey.
- **Ready to merge: the tree batch look** (afdbcc8): `.fv-tools` wraps under 600px (the forest search gets its own row at 375), `.fv-gliding`,
  the related picker (`.fv-pick`, `.fv-chosen`, `.fv-rel-out`), and the vault modals' form classes in settings.css. Fixes the live search box
  (base `input[type=search]` gave it a second box) and `.fs-results[hidden]`.
- **Ready to merge: the reports in the menu, and dark ink** (on top of v104, main merged in): `.navmenu-reports` (the two entries as menu rows,
  two side by side) and dark text on the light vine at night (`--primary-ink`) for the pressed `.rx-filters` / `.rx-state`, `.rp-sent-ic`, `.rm-send`.
- **Ready to merge: the reports look** (bff1c28): `/assets/reports.css` (the report sheet, the menu items, the person's inbox and conversation),
  admin.css's תיבת פניות (`rx-*`, the `data-bd="reports"` tile), `.mi-dot` on the user chip, icons in `/assets/reports/`. The contract went to ai-features;
  prototype `docs/design/prototype/reports.html`. Checked at 375 and 1280, light and dark.
- **Ready to merge: the family story's look** (5dc67a7): `public/family/story/story.css` and `/assets/story/*.svg`, for ai-features' `claude/story-4cc985`;
  the sheet is opaque below 900 px. Prototype `docs/design/prototype/story.html`. Checked at 375 and 1280, light and dark; not seen with the real page and server.
- **Ready to merge: the tree smoother while scrolling** (the owner: jumpy). The sway keyframes are plain numbers (no CSS variable), the two big layers hold
  `will-change: transform`, `.tree.off` pauses everything (the JS adds it off screen), and the search switch's knob slides by translate. Not measured on a phone.
- **Live in main (v99): the owner's tree batch (design's part).** ai-features does the JS to the classes agreed with them.
  - `tree.css`: the tree breathes slower and smaller (sine easing, no overshoot). Moving the tree leans it a little through a transition on `rotate`, so the breath no longer jumps. Reduced motion stops everything.
  - People on the tree: on hover a small lift, a soft shadow and a warm light (a lantern glow at night). On press they sink in, then settle back without the wiggle.
  - `family.css`: the member card in view mode (`.mc`: banner, avatar, name, family logo, facts; the pencil only on `.mc.mine`) and חיפוש ביער (`.fs`: a pill box, the "קרובי משפחה בלבד" switch, the results floating under it, a vine leaf on relatives). The markup is in the comments; the prototype is `docs/design/prototype/tree-card-search.html`.
  - Checked at 375 and 1280, light and dark: no overflow, all text ≥ 5:1. Hover is checked on desktop and reduced motion through the app's own setting. A real touch press is not checked yet.
- **Live: the owner's logo** (03f971c), אהל in the old script, cut to `public/assets/brand/` (SVG, light SVG, a transparent PNG).
- **Launch prep, the page audit (v92, 28 pages incl. /food/diet/habits/, at 375 and 1280, light and dark): clean.**
  - The check found no overflow, broken images, nameless controls or contrast under 3:1.
  - It skips oklab colours, so the home page's 53 oklab texts were measured separately on a canvas: all ≥ 4.5:1.
  - Not covered: text over pictures (the cushions' names by the fire) and the profile page, which does not exist yet.
- **Waiting for ai-features:**
  - **The profile page.** Its markup contract is in the header of `docs/design/prototype/family-profile.html`. We adjust the CSS on request.
  - **The keto.js patch for the diet stamps.** It is `design-keto-diet-stamps-2026-11-13.patch` in the notes folder.
- **Next, after the image quota resets (02:00 Israel):**
  1. One run of `badges-tools-run.sh` from the design scratchpad makes the 19 badges.
  2. Each badge is cut to `/assets/badges/<id>.webp`.
- **Queued from vision, batch 10, for after the launch when the master schedules it:** the family story, "a living museum" (`docs/vision/story.md`), and the owner's choice of tree.
- **Tidied:** the untracked `public/tree-proto.html` was a byte-identical copy of `docs/design/prototype/tree.html`, so it was deleted.


## Done
- **The kind of report and three welcome slides (the owner, 2026-11-13):** `.rp-kind` in reports.css (תקלה / הצעה לשיפור, real radios; a fault in
  the triangle's red, a suggestion in the vine with a new bulb icon `bd-icons/idea.svg`; the sheet's head icon turns into the bulb). `.rp-alert` moved
  from reports.css to base.css so /welcome/ draws the very same triangle. welcome.css: `.wz-show`, `.wz-points`, the report slide (a mini top bar
  with the breathing triangle), the helper slide (`.wz-hero`, the figure big, the corner friend steps aside), the tree slide (the olive with five faces),
  and a tighter trail for nine stops on a phone. Markup in the comments and in `docs/design/prototype/welcome-slides.html`. 375/1280 checked.
- **/messages/ has its own look (`public/messages/messages.css`, 2026-11-13):** list and thread side by side from 900px, one at a time
  on a phone (`data-open`); my bubbles in the vine at the start, theirs on a warm neutral; "נקרא" under my last one; a pill send button.
  `.dm-msg`/`.dm-compose` collide with daemon.css, so they are scoped under `.dm-thread`. `.dm-dot` (the unread dot on the chip) moved to base.css.
  Checked 375/1280, light and dark, no overflow. Waits on ai-features: link the CSS in `messages/index.html`, drop the inline styles in messages.js and dm.js.
- **A second family tree, "canopy" (עץ ב׳), beside the olive (the owner's Gemini drawing, 2026-11-13), ready to merge:**
  cut into our four layers by `docs/design/cut-tree-canopy.mjs` (webp, a cream rim so it holds at night, leafy side twigs).
  Its box is **1000×1500**, not 1800: the tree is wide and short, and five tiers of 90 px people need ~95 px each at 375.
  `slots.json` gains `"ext": "webp"` (svg when absent) and `"candleY"`; `tree.css` keys the box on `data-kind`, so the page
  swaps trees by a pref with no new code. **Hanging oval frames** for both trees: `data-look="frame"` on `.tree` (gilt, bronze for
  the passed). The olive got small leafy side twigs. The prototype has זית / עץ ב׳ and עלים / מסגרות switches. Checked at 375 and
  1280, light and dark, reduced motion: no people overlap (only the candle and the "+" bud, beside their person by design).
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
- **Diet stamps on the shopping list (the owner, 2026-11-13, f01ee33):** no grey chips. Each diet is an ink stamp
  (✓/⚠/✗ plus the name, coloured by the verdict), with one pie at the side, and the stamps wrap beside it. The pie's window
  grows out of the pie and shrinks back into it; with reduced motion it opens without movement.
  - The CSS is in groceries/style.css and base.css (`.modal.grow`/`.shrinking`).
  - The markup is a patch for keto.js (ai-features), and `H.modalFrom` is a patch for common.js (the master); both are in the notes folder.
  - Checked at 375 and 1280, light and dark; the grow and shrink were checked in headless Chrome.
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
- **The report kind and two welcome slides, fitted to ai-features' markup (a7275c0):**
  - `fieldset.rp-kind` (legend across, תקלה in the triangle's red and הצעה לשיפור in the vine with a bulb); on a suggestion the
    head icon becomes the bulb. `.rm-chip.idea` in the thread, `.rx-tag.idea` in the back door.
  - `.wz-intro` with `.wz-helper` (the figure on a soft disc; the corner friend hides on that step) or `.wz-alert` (the bar's
    triangle at 2.4×, the same colours, breathing). Above the lines on a phone, beside them from 700px.
  - Checked at 375 and 1280, light and dark, no overflow; the triangle 5.35 light / 6.77 dark.
- **The bar's triangle without its circle (the owner, 2026-11-13):** only the triangle, 24px, in a new `--alert` token (coral #cc5a46 by
  day, 3.53:1; pastel #e79a85 at night, 8.77:1); still a 44×44 target, a ring only on keyboard focus. The welcome slide's big one matches.
- **The tree slide (`.wz-tree`, ai-features 7289525):** the app's own olive (four layers) on the soft disc with five faces on its slots
  (grandparents, parents, "me" in the vine at the top); it grows in gently. Checked at 375 and 1280, no overflow.
- **The triangle's first showing (`.rp-coach` in reports.css, the owner approved: "a gentle arrow, along the screen, a short note"):**
  once per person after /welcome/, a soft veil with a window around the bar's real triangle (the wizard has no bar, so it lives in
  the app), a dashed vine arrow from a short note up to it, a breathing ring. Checked at 375 and 1280, light and dark.
  Waits for ai-features (reports.js) to add the markup and --x/--y; sample in `docs/design/prototype/triangle-coach.html`.
- **The guitar sways alone** (2026-11-13): stump-guitar.webp split into `stump.webp` + `guitar.webp` (same canvas, 400 in public/assets, the script in docs/design/split-stump-guitar.py); the sway CSS (`.guitar-img`, pivot at its foot, rocks off the stump with a short buzz) sent to the CEO for index.html; sample docs/design/prototype/guitar-sway.html.

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
