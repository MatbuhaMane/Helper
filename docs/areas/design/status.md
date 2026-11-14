# Status – design

Updated by the department at the end of every meaningful round of work. Short: the master reads it for the board meeting.

_Updated 2026-11-14: a full handover. This chat moves to a fresh one with the same name (the owner's decision)._

## Handover (2026-11-14) – read this first

**Who and where:**
- I am the design department (ד).
- I work only in `M:\Claude Code\Helper-design`, on branch `design`. Dev server: port 8789, inspector 9230 (`.claude/launch.json`).
- I answer the owner in Hebrew.

**My files:**
- `public/**/*.css` (base.css with the tokens, launcher.css, sides.css, tree.css, admin.css, campfire.css…);
- images, icons and fonts under `public/assets/` (not `common.js` or `apps.js`);
- `public/figures/`, `figures/`, the figure skills in `.claude/skills/`, `docs/design/`, and this file.
- Files owned by others get a proposal, never an edit.

**The rules I work by:**
- **Commits:** small ones, ending with the `Co-Authored-By` line.
- **Never:** bump `CACHE`, merge into main, or push. Merging main into design is allowed, and wanted before each commit.
- **Send each finished piece for merge right away,** in small, frequent batches.
- **Scope class names** with a component prefix (`tb-`, `tr-`, `st-`…), and scope a page's rules under its root, as sides.css
  is under `.pager-page`.
- **"Done"** means checked at 375 and 1280, light and dark, with the audit clean. Motion is `transform` and `opacity` only.
- **Saving usage:** check with text or JS first; screenshots at scale ≤ 0.5 or `zoom`.
- **Security:** never read or print `.dev.vars`. Ask the owner before installing any tool.
- **Not run in the browser pane:** the IntersectionObserver, smooth scrolling, CSS transitions and view transitions. To
  check, add `*{animation:none!important;transition:none!important}`, set the classes by hand, and use
  `scrollIntoView({behavior:'instant'})`.
- **Running the audit:** copy `tools/audit.js` to `public/__audit.js`, load it in the page, then run
  `await __auditDesk(['/page/'], 375, 812)` and `(…, 1280, 800)`. Delete the copy afterwards.
- **The audit's blind spots:** it doesn't see text over a pseudo-element background, or hit areas made of pseudo-elements.
- **A known trap:** a pseudo-element inside `:is()` is dropped silently. Write `X::before` as its own selector.
- **When SendMessage is blocked:** hand-overs go to the shared notes folder (`side-session-notes/local_3881a822-…/design-*.md`).

**Unmerged on `design`** (oldest first; main is fully merged in, the last merge cbc6abb (299b135)):
- 868cfb9, 90bd6a4, 9ced735: batch 18, the tree after test run 1. CSS plus the contract `docs/design/tree-18.md`.
- 17bdc33, 0089d21, 5274c04: the side pages beside the tent (`sides.css`, `soon/garage-scene.svg`).
- 892a1d6, 3fc1a5c: the toolbox's new look (`launcher.css` `tb-`, contract `docs/design/toolbox.md`).
- The future items' pictures: batch 19 (a49ae07) and batch 20 (bc3ce8c).
- All of it is inert until its markup arrives, so it is safe to merge now.

**Open:**
1. **The side pages.**
   - The master adds `<link rel="stylesheet" href="/assets/sides.css">` in index.html, after campfire.css.
   - **A risk:** the parts are hidden until `.is-here`. If the observer never fires, they stay hidden. The proposed safety
     net: the master sets `pager.dataset.watch` when it starts the observer, and I hide the parts only under `[data-watch]`.
   - **A limit:** a side page is as tall as the tent page, so you can scroll down into empty space. A fix in index.html:
     pages out of view get `block-size: 100svh; overflow: hidden`.
   - **A proposal:** rename `.side` to `.pg-side` in index.html. sides.css would follow.
   - **Not seen:** the entrance moving.
2. **The toolbox look.**
   - Waiting for ai-features' markup, by `docs/design/toolbox.md`: `.folder.tb`, `.tb-sort` (a radiogroup), `.tb-cats` and
     `.tb-cat`, `button.app.tb-future` with `.tag-soon` "בעתיד", and the beta badge through `H.expTag`.
   - When the markup lands:
     - check the slide and the arrange mode together;
     - check whether the בעתיד icon is too pale at night (`.app.tb-future .ic > * { opacity: .5 }`).
   - **Proposals:** sticky category headers on a phone; a letter divider in לפי שם; folding a category by its count.
3. **`st-ph`, the drop spot in עץ מבנה** (admin.css ~387).
   - **The defect:** `@keyframes st-ph { from { block-size: 0; opacity: 0 } }` animates a layout property, which breaks the
     motion rule.
   - **The proposed fix:** fade it in with `opacity` and `scale: 1 .6`, with `transform-origin: top`, and no `block-size`.
     The rows then make room at once instead of opening smoothly; that is the price of the rule.
   - Check it on `docs/design/prototype/structure.html`. Not started (the master: nothing new before the handover).
4. **Batch 18, the tree.**
   - Waiting for ai-features (`family.js`), by `tree-18.md` sections 1–8.
   - Not checked: touch (the pinch, the long press, the dock drag) and the view transitions animating.
5. **Waiting on ai-features from earlier rounds:**
   - `.mk` in study.js, and the `.bd-inv` markup;
   - the book's ＋ in the top row, and the daemon's resting spot (`no-overlap.md`);
   - the shopping list's markup (`shopping-lists.md`).
6. **For the master's audit (`tools/audit.js`):**
   - a check for a pseudo-element inside `:is()` (grep `:is([^)]*::`);
   - contrast over pseudo-element backgrounds;
   - hit areas made of pseudo-elements.

7. **Vision batch 19 (2026-11-14): the three future items have pictures.**
   - `public/assets/soon/kitchen.svg`, `breath.svg` and `howto.svg`, in the batch 15 style (320×240, ink #3b2416).
   - **In the toolbox:** `.app.tb-future .ic.tb-pic > img` (`launcher.css`), described in `toolbox.md` §3.
   - **The note's place:** עוזר מטבח in the recipe book, איך אני עושה in the tools menu. It is the uniform "בקרוב" note
     (`.tag-soon` or `.soon-card`).
   - The tools themselves are not ours to build.
   - **Checked:** 375 and 1280, light and dark. The audit is clean on the prototype and on `/tools/`.

8. **Vision batch 20 (2026-11-14): the four future tools have pictures (bc3ce8c).**
   - `public/assets/soon/garden.svg`, `home.svg`, `translate.svg` and `homework.svg`, the ids fixed in `H.FUTURE` on main
     (299b135). The same style and the same `.tb-pic` tile as batch 19.
     - garden: a pot with a plant, a watering can pouring, a seedling and a trowel, a sun;
     - home: a house with a check badge, a wrench, a bulb and a drop (the things that need a look);
     - translate: a globe, two bubbles (א and A), arrows between them, a die for the language game to come;
     - homework: an open squared notebook with shapes, a pencil and an eraser, a lightbulb (it explains, it doesn't solve).
   - **הסיפורים של סבא וסבתא** stays a note in a person's profile in the tree (`ul.tr-full-soon`, `tree-18.md` §8). No
     picture was asked for, and it has no `H.FUTURE` id.
   - **Checked:** 375 and 1280, light and dark, as tiles in the prototype. The audit is clean on the prototype and `/tools/`.

---

## History (newest first)

**Where we stand (a brief for the next round):**
- **Ready: the toolbox's new look (the owner, 2026-11-14), CSS only, waiting for ai-features' markup.** Commit 892a1d6.
  - In `launcher.css`, with the `tb-` prefix:
    - the sort switch `.tb-sort`: three ways, a vine stone, and a trail that slides by `:has`;
    - the category headers `.tb-cat`;
    - the "בעתיד" items `.app.tb-future`, with a `.tag-soon` in the corner;
    - the beta badge reuses `.tag-exp`.
  - The folder takes `.tb`, so the tool rack stays.
  - **The contract for ai-features:** `docs/design/toolbox.md`, with the prototype `docs/design/prototype/toolbox.html`.
  - **Checked:** 375 and 1280, light and dark. The audit is clean on the prototype and on `/tools/`.
- **Ready: the side pages beside the tent (the owner, 2026-11-14), for the master to link and merge.**
  - `public/assets/sides.css`. **The master adds** `<link rel="stylesheet" href="/assets/sides.css">` in index.html after campfire.css.
    - The page is centred in the first screen, over the tent's own sky and limestone.
    - When a page gets `.is-here`, its parts rise and fade in, staggered by `--i`. Reduced motion shows them still.
    - The dots are restyled at 44px: small stones, and the page in view is a vine stone.
  - `public/assets/soon/garage-scene.svg`: a symbolic shed with tools, a charging post on the right and a workbench on the left.
  - **Checked:** 375 and 1280, light and dark. The audit of `/` is clean, motion included.
  - **Not seen:** the entrance moving, because the pane runs neither the IntersectionObserver nor transitions.
- **Ready: vision batch 18, design part (2026-11-14).** The contract for ai-features is `docs/design/tree-18.md`; the prototype is
  `docs/design/prototype/tree-18.html`.
  - **868cfb9, the assets:**
    - autumn, winter and spring tiles in `assets/tree/season/`: a dress masked by the crown, and a sparse fall;
    - `leaf-empty.svg`, a dashed leaf;
    - generated by `docs/design/make-seasons.mjs`.
  - **90bd6a4, tree.css** (block "vision batch 18"):
    - the seasons (`data-season`; "לפי העונה" goes by the month, kept in prefs `family.treeSeason`);
    - `.fit` for one screen, and the stage with pinch and zoom (`--z`, `--px`, `--py`);
    - the empty leaf;
    - the floating glass menu (פרופיל, תמונות, הודעה, and עריכה on a long press);
    - leaf ⇄ banner ⇄ full profile through view transitions (a sheet on a phone, a 420px panel from 900px);
    - the profile docked as a side tab;
    - the leaf detached by a drag;
    - the "בקרוב" notes: the "עיצובים" chip and a list in the profile.
    - Also fixed: pseudo-elements inside `:is()` dropped silently, so the fall didn't stop under reduced motion or pause off
      screen. An old rule had the same flaw.
  - **Checked:**
    - at 375 and 1280, light and dark;
    - no overflow;
    - the menu clamped, with its arrow on the leaf;
    - contrast about 8:1;
    - buttons of 44px or more.
  - **Not checked:**
    - touch: the pinch, the long press, the dock drag;
    - the view transitions animating, since the pane doesn't run them.
  - **Waiting for ai-features:** the tree code (`family.js`), which is theirs.
- **Merged: vision batch 17b** (a474983, 4fc5227, e95ed41, 99d77fd), in main as v149 and v150.
- **Batch 17b details (merged):**
  - **a474983, the toast:** fits the v148 `H.toast` (centred by margin, so `translate` is the swipe alone; `.dragging` without
    transition; pointer cursor, touch-action none). For the master: clear `translate` only after the fade (`docs/design/toast.md`).
  - **4fc5227, no control on another (`campfire.css`, `docs/design/no-overlap.md`):**
    - the home ring's cushions are pressed on their core only; swept over a whole turn at 375: no two cores touch;
    - the music corner: the slot under the parked record and the songbook's part under it no longer take a press;
    - for ai-features: the book's ＋ into the top row, and the daemon's resting spot (a test with `elementsFromPoint`, three
      fallback spots, then fold to the tab);
    - for the master: the audit can't see hit areas made of pseudo-elements.
  - **e95ed41, the shopping list part 2 (`groceries/style.css`, `shopping-lists.md` §2b, §2c, §5):** "למקרר" in the choosing bar
    (two lines on a phone), a grip to drag rows while choosing (translate only, drop into a category or a list chip, arrows
    without a pointer), the book's "＋ מתכון" button. Checked at 375 and 1024, light and dark.
  - **Not tested:** the swipe and the drag on a real touch screen; the daemon (it doesn't show locally); the ring at desktop.
- **Ready: vision batch 17, design part (2026-11-14).**
  - **The toast (base.css):**
    - a light glass pill under the app bar, middle, never over its buttons;
    - the swipe and click hooks (`--dx`, `--dy`, `--o`, `.dragging`);
    - the contract is `docs/design/toast.md` (master: `H.toast` times 2.6 s and 5 s, click and swipe to close).
  - **The shopping list (groceries/style.css):**
    - the lists panel (`.lists-track` and `.lists-btn`, the menu reusing `.tab-menu`);
    - choosing many (`#list.selecting`, `.sel-box`, `.sel-cat`, the sticky `.sel-bar`);
    - the icon picker (`.icon-pick`);
    - the contract is `docs/design/shopping-lists.md` (ai-features); the sample is `docs/design/prototype/shopping-lists.html`.
  - **Checked:**
    - 375 and desktop, light and dark;
    - no overflow, and no overlapping buttons on the shopping page's three views at the bottom of the scroll;
    - the current flat lists markup still wraps until app.js changes.
  - **v147 daily card:** checked with candles and calendar rows; `.dsum-more` fixed as a button (eb66171).
- **Ready: vision batch 16, design part (2026-11-14).**
  - **e456754, the recipe card flip (sheet.css):**
    - a lighter shadow;
    - no rounded clip on the turning back;
    - the body contained;
    - will-change on the flip and the fade while `.moving`.
    The rest of the stutter is in sheet.js, which is ai-features'. Sent there:
    - no aim on a re-open or a resize mid-flip;
    - fill the body after the turn;
    - a double rAF before `.open`.
    Not measured here (the pane is hidden, so rAF does not run). The test is the owner's phone.
  - **01df868, the animation audit:** endless animations now use transform and opacity only:
    - the chosen cushion's glow;
    - the wizard's current step;
    - the reports coach.
    Left on purpose:
    - two tiny strips (dm-flow, cx-dots), and the admin egg.
    - Progress bars that animate `inline-size` (care, music, groceries, parnasa, goals) wait for ai-features to set `--p`, so they can scale instead.
  - **53d2b38, "סיכום היום" every day (seasons.css):**
    - the day's leaf (the Hebrew day and month);
    - a facts row: the weather by its sky, the sunset, or the candles on a Friday;
    - the calendar in "היום";
    - a calm line for a quiet day.
    Contract `docs/design/daily.md`; the master wires it.
  - **fbb1cbf, the recipe book's tab menu:**
    - in base.css, a tab that opens its own menu (`.tab-menu`), usable by any tab;
    - "ספר המתכונים שלי" and "מתכונים ששותפו איתי", with the book's heading, an empty book and the sender on a shared card.
    Contract `docs/design/recipe-book-menu.md`; ai-features builds the lists.
  - Checked at 375 and desktop width, light and dark.
- **Ready: vision batch 15, design part (2026-11-14).**
  - e414817 `public/assets/soon/hill.svg` and `garage.svg`, drawn in the tent's look from `docs/design/soon/soon.py`.
  - 86d725d base.css adds one note `.tag-soon` (`--soon`, dusk blue), the home's strip "בקרוב ליד האוהל" under the ring, the serious home's last group "בקרוב", and the tap sheet `.soon-sheet`. It also styles `.app-tag` after a name on the serious home.
  - Contract `docs/design/soon.md`. Recommendation: the strip under the ring, not in the tent's picture (the ring and the sky are there). The master wires index.html.
- **Ready: vision batch 14, design part (2026-11-14).**
  - Test-run fixes:
    - 1573cc3 centres "הלאה" on every wizard step;
    - the home sky blotch is the tent-glow layers in index.html sharing the classes `.sun` and `.moon` with the sky. The fix (rename them `glow-sun` and `glow-moon`) went to the master, who owns that file.
  - 750b3a3 adds `public/assets/arrange.css`: arrange mode as a tray, not the ring. Cushions wiggle; each has an × to remove it, fixed ones carry a lock, and the last slot is "הוסף כרית" with an add sheet. Contract `docs/design/arrange.md`.
  - e069673 adds two things to base.css:
    - the "ניסיוני" tag `.tag-exp`, with the token `--exp`, for a tile, a cushion and the tray;
    - the "חיפוש בגוגל" pill `.g-search`.
  - 16262da adds four notes views, chosen by `data-view` (cols, panes, list, a cork board), plus the look of the formatting toolbar, which had none. Contract `docs/design/notes-views.md`.
  - Checked at 375 and desktop width, light and dark.
  - Waiting on others:
    - the master: link arrange.css, the arrange markup in index.html and apps.js, `tag` in H.APPS, the glow rename;
    - ai-features: saving the arrangement, the Google links, the notes view switch in H.prefs.
- **Ready: the Shabbat screen, the holiday tent and "סיכום היום" (vision batch 13, 2026-11-13).**
  - The CSS is `public/assets/seasons.css`; the dressings are `public/assets/holidays/*.svg`, from the generator `docs/design/holidays/holidays.py`.
  - The contract is `docs/design/seasons.md` and the sample `prototype/seasons.html`.
  - Nine dressings in the tent's style, each with its source: Shabbat, Rosh Hashanah, Sukkot, Hanukkah (by the night, `#n1`–`#n8`), Tu BiShvat, Purim, Pesach, Yom HaAtzmaut and Shavuot.
  - The calm Shabbat and festival screen keeps the emergency button from care.css.
  - The summary card is short on a phone.
  - Checked at 375 and 1280, light and dark.
  - Waiting on others:
    - ai-features: the JS, the dates (hebdate.ts) and the Shabbat mode;
    - the master: linking seasons.css and adding `<img class="holiday">` in `.camp` in index.html.
  - The other traditions have only the mechanism; their dressings wait for a source.
- **Ready: grandparents mode, the emergency button and kids mode (vision batch 12, 2026-11-13).**
  - The CSS is `public/assets/care.css`, the contract `docs/design/care.md`, the sample `prototype/care.html`.
  - It covers the grandparents' home (four tiles, read-aloud buttons, עוד), the emergency button (hold 3 s, the ring fills), the sent screen (10 s cancel, who is on it, 101/100/102), the family's alert, and the kids' home.
  - Checked at 375 and 1280, light and dark.
  - The master links care.css from index.html.
  - Also from batch 12: the family tree keeps the app's current tree. My three versions (olive, Tabor oak, acacia) were not chosen.
- **Ready: פרנסה's look (the owner's money tool, 2026-11-13).**
  - The CSS is in `public/tools/parnasa/parnasa.css`, the contract in `docs/design/parnasa.md`, the sample in `prototype/parnasa.html`.
  - It covers the dashboard (balance, quick entry with one-tap repeats, the split as a readable list, recurring, tips, recent, investments), the entry sheet, the bank import with a review step, and the shared קופה badge.
  - The cushion is p16 (teal and gold, p01 recoloured). The line icon `parnasa` goes into common.js's ICONS (the master's file).
  - Checked at 375 and 1280, light and dark.
  - ai-features builds the JS.
- **Ready: the ancient letters for every member.** 'Ohel Ivri' (self-hosted, unicode-range U+10900-1091F) is near the end of every font stack: base.css, including each data-font choice, and groceries, news (`--serif` too), parasha, study, settings and calendar. Text the owner writes in ancient mode shows in the Phoenician font on any page, so common.js's Google Fonts fallback can go (the master's file).
- **Ready: the "חבר עוזר חינמי" guide (ai-invite.js, the logic is ai-features').** In base.css as `.gk`:
  - three steps, each with a line drawing (`/assets/ai-invite/signin|key|paste.svg`) and a number;
  - only the current step (`aria-current="step"`) shows its big 56px button; finished steps get `data-done` and a ✓;
  - `.gk-err` for a key that failed; `data-state="done"` shows `.gk-done` (a big check, "מחובר ✓"); `.gk-ok.small` is the tag for a settings row;
  - big type for older eyes. Sample: `docs/design/prototype/ai-key-guide.html` (`?s=1|2|3|err|done`). Checked at 375 and 1280, light and dark; contrast ≥5.9.
- **Ready: editing and deleting in the family tree (a user's bug, 2026-11-13; the logic is ai-features').**
  - **The person's panel:** big edit and delete buttons with icons in the header (`.fv-pacts` / `.fv-pact`). At 375 they take their own row, 48px tall.
  - **Undo for 10 seconds:** `.fv-undo` above the tab bar, with a draining line. The deleted person stays on the tree, faded (`.tr-p.going` / `.fv-card.going`).
  - **Waiting for approval:** a `.fv-pend` tag, a `.fv-pendbox` with the change (`.fv-diff`, struck old value and new value), and a clock on the leaf (`.tr-p.pending`).
  - **The approval request:** the `.fv-ask` card with אשר / דחה.
  - **Sample and checks:** `docs/design/prototype/family-edit.html`. Checked at 375 and 1280, light and dark. All text contrast ≥5.7.
- **Ready: the look of עץ מבנה (the owner's new back door tab, 2026-11-13).** The logic is ai-features' after the feedback round.
  - **The tree** (admin.css `.st`): rows for parts and tools, with the pillow and the icon. Dragging starts only from the ⠿ grip, so the page still scrolls under a finger. The states are `.away`, `.st-ghost`, `.st-ph`, `.into`, `.no`, `.st-zone.over`, `.held` (keyboard) and `.landed`.
  - **The edit panel** (`.st-panel`): name, description, an icon picker, the 15 pillows (a dot marks a taken one) and colour swatches with "other", over a live preview. It sits beside the tree on a computer and is a bottom sheet on a phone.
  - **The fire editor** (`.fe`): the ring drawn with CSS cos/sin from `--a`, with × to remove, a dashed + to add, and a tray to replace a pillow.
  - **The eggs:** a new drawing, `assets/egg/egg.svg` (limestone shell, vine tatreez band, honey dots). `.egg` in base.css rocks a little every 7s; when found it cracks along the band and a bubble rises over the tab bar. The back door card `.bd-egg` lists page, text, dates, finders and state, and has a form.
  - Sample: `docs/design/prototype/structure.html`. Checked at 375 and 1280, light and dark: no overflow, and text contrast ≥4.7.
- **Ready to merge: the users' feedback round (v127, main merged in):**
  - **Marking verses** (study.css): `.rs-v.mk` is a see-through honey wash with no frame, and marked verses in a row join into one band. It looks the same at all three levels, and the browser's selection is a quiet honey. The verse numbers are faint pebbles that say "tap me". Checked on Genesis 1 at 375 and 1280, light and dark.
  - **The invitations card** (admin.css `.bd-inv`): the inbox's filter pills, quiet rows, and a state pill (sent grey, opened honey, joined vine, expired red). Checked on `docs/design/prototype/invites.html` at 375 and 1280, light and dark, contrast 9:1 and up.
  - **Fun:** a two-word tab ("מצחיק ואמיתי") stays one line at 375; the tile widens and the row scrolls.
  - **Waiting on ai-features:** `.mk` in study.js and the `.bd-inv` markup (the classes were sent to them).
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
- **Serious mode, round 1** (vision batch 11, 2026-11-13): `<html data-style="serious">` in base.css (tighter corners, a hairline for the shadow, firmer headings; `.deco` and the companion hidden) and the serious home `.sr-home` (search, tools as a grid or a list from H.APPS, `data-pillows="keep"` keeps the cushions); sample docs/design/prototype/serious-home.html. Wiring: ai-features (apply.js) and the master (common.js early settings, index.html).
- **Fonts kept here** (the owner's OK, 2026-11-13): public/assets/fonts/ with the OFL licences. Noto Sans Phoenician as 'Ohel Ivri' and `.ivri` (the ancient letters, the Hebrew kept for screen readers and shown on a tap; toIvri() in docs/design/prototype/ivri.html), and Alef as a font choice, `data-font="alef"`. Wiring: the settings' font list (ai-features) and common.js's early list (master).

## In progress
- **Vision batch 11, still to come:** the clean tree diagram (serious mode's family tree and museum), the profile frames (open and secret), the default covers in the tent's style, an animated picture for each companion figure, the business card's structure, (Noto Sans Phoenician is in, see Done).
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
