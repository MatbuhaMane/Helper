# The family tree after test run 1 (design → ai-features)

This is vision batch 18 (2026-11-14), the design part of the decision "The family tree after test run 1" in `docs/decisions.md`
on the `vision` branch. The owner approved all of it, and the CEO schedules it.

- **The CSS:** everything is ready in `public/assets/tree.css`, in the block "vision batch 18". Each piece has its markup
  written in a comment above its rules.
- **The prototype:** `docs/design/prototype/tree-18.html`. To view it, copy it into `public/` on a dev server.
  - URL parameters: `?season=auto|summer|autumn|winter|spring&kind=olive|canopy&state=menu|edit|banner|full|dock&theme=dark`.
  - It shows every state working with the real tree pictures. Take the JS from it as a sketch, not as code to ship.
- **The motion rule:** every motion here is `transform`, `translate`, `scale`, `rotate` or `opacity`. Keep it that way in the
  JS: set variables and classes, never `top`, `left`, `width` or `height`.

## 1. The seasons
- **Markup:** two empty spans, right after the crown picture, before the people:
  ```html
  <img class="tree-l tree-crown" …>
  <span class="tree-l tree-dress" aria-hidden="true"></span>
  <span class="tree-l tree-fall" aria-hidden="true"></span>
  ```
- **Choosing the season:** set `data-season` on `.tree` to `autumn`, `winter` or `spring`. With none, or `summer`, the tree
  is as drawn.
- **The person's choice:** a radiogroup of chips, the same `.fv-views` bar as the kind chips:
  - לפי העונה · קיץ · סתיו · חורף · אביב;
  - kept in prefs as `H.prefs('family', { treeSeason: 'auto' })`.
- **"לפי העונה" goes by the month,** as the prototype's `autoSeason()` does:
  - Sep–Nov (Elul to Kislev): autumn;
  - Dec–Feb: winter;
  - Mar–May: spring;
  - otherwise summer.
- **What the CSS does:**
  - The crown, boughs and ground take a tint through `--season-f`. In dark mode it chains with the night's dimming.
  - The dress (fallen leaves, snow, blossom) is masked by the crown's own picture, so it sways with the crown.
  - Something falls slowly in front of the boughs.
  - With `.tree.off` (off screen), everything pauses. With reduced motion, nothing falls and nothing sways.
- **The assets:** `public/assets/tree/season/<season>-{dress,fall}.svg`, from `docs/design/make-seasons.mjs`.

## 2. The empty leaf, and "כל הדורות"
- **A person with no record:**
  ```html
  <button class="tr-p empty" style="--x; --y" aria-label="אין רשומה: אבא של משה. הוספה">
    <span class="tr-leaf"><span class="tr-face">?</span></span>
    <span class="tr-tag"><b>אבא של משה</b></span>
  </button>
  ```
  - The leaf is `assets/tree/leaf-empty.svg`, pale with a dashed outline.
  - A tap opens adding that person, with the relation already filled in.
- **"כל הדורות"** draws up to the parents of the great-grandparents (four generations above the person). Where a parent is
  missing, it draws an empty leaf instead of leaving a gap.

## 3. One screen, pinch and zoom
- **The markup:**
  ```html
  <div class="tree-stage">
    <div class="tree fit" style="--tree-chrome: 190px">…</div>
    <div class="tree-zoom">
      <button class="tz-in" aria-label="הגדלה">…</button>
      <button class="tz-out" aria-label="הקטנה">…</button>
      <button class="tz-fit" aria-label="כל העץ במסך">…</button>
    </div>
  </div>
  ```
- **`.fit`** sizes the tree by the height left on the screen. `--tree-chrome` is everything the page keeps above and below
  it (the app bar, the chips, the tab bar). Measure it once on load and on resize.
- **Pinch and pan** set `--z` (1 to 4), `--px` and `--py` (px) on `.tree-stage`. The tree moves by `scale` and `translate`
  with `transform-origin: 0 0`.
  - Keep the tree's edge from leaving the stage.
  - Add `.zooming` during the gesture, so nothing lags behind the fingers.
  - A double tap fits the tree again.
- **The zoom buttons:**
  - On a touch screen, only "fit" (`.tz-fit`) shows; ＋ and − are hidden by `hover: none`.
  - They sit in the stage's bottom inline-end corner. Check that the daemon doesn't rest on them (`no-overlap.md`).
- **`touch-action: none`** is set on the stage, so a finger on the tree doesn't scroll the page. With `.fit` the page doesn't
  need to scroll. If a page ever does, set the stage to `touch-action: pan-y` while `--z` is 1.

## 4. The floating menu (a tap on a person)
- **The markup** is in the CSS comment: `.tr-menu` with `.tr-menu-name`, then `.tr-menu-acts`, holding פרופיל, תמונות,
  הודעה and, with permission, עריכה.
- **Variables:**
  - `--mx` is the leaf's centre, measured from the inline-start edge. In RTL that is `innerWidth − centreX`.
  - `--my` is the leaf's top. When the leaf is near the top of the screen, use its bottom and add `data-place="below"`.
  - The CSS keeps the menu inside the screen and points its arrow at the leaf.
- **On open:** add `.menu-on` to the leaf and focus the first item.
- **On close** (Esc, a tap outside, a choice): add `.closing`, then remove the menu after 180ms.
- **The items:**
  - פרופיל grows the leaf into the banner (§5);
  - תמונות opens the person's photos;
  - הודעה opens a message to the person, or is hidden if they have no account;
  - עריכה opens the edit sheet.
- **A long press** (about 550ms, with permission) opens the menu with `data-edit` and shows עריכה. Without permission it's
  hidden (`hidden` on the button).

## 5. Leaf ⇄ banner ⇄ full profile
- **The banner** (`.tr-banner`) stands at the person's place (`--x` and `--y`, as for the leaf), and the leaf steps away
  (`.away`).
  - A tap on its main part opens the full profile.
  - The fold button returns it to a leaf.
  - `.passed` marks a person who has died.
- **The full profile** (`.tr-full`):
  - on a phone, a sheet from the bottom;
  - from 900px wide, a 420px panel at the inline-end, with the tree in sight beside it.
  - Its head has three 44px buttons: fold (back to the banner), dock (§6) and close (back to the leaf).
  - Its body holds the profile, as `/family/profile.html` shows it.
- **The morph,** both ways, uses `document.startViewTransition(() => swap())`. Before the swap:
  - put `view-transition-name: tr-face` on the face of the state that leaves, and on the avatar of the one that comes;
  - put `tr-card` on the leaf, the banner or the panel;
  - put `view-transition-class: tr-morph` on both.
  - Clear the names after `finished`.
  - Without view transitions, just swap. The CSS fades and grows the new state in.
- **Esc and back:** Esc folds one step. The browser's back button closes the full profile.

## 6. The docked profile
- **The markup:**
  ```html
  <button class="tr-dock" style="--i:0" aria-label="רחל כהן, פרופיל מעוגן. פתיחה">
    <img src="…" alt=""><b>רחל</b>
  </button>
  ```
  - Use `<span class="tr-dock-ini">` instead of the picture when there is none.
- **Where it sits:** at the inline-start edge, the right in RTL, since the helper's tab is on the other side. Several tabs
  stack by `--i`.
- **The drag is vertical only.** While dragging, add `.dragging` and set `--dy`.
- **A tap** opens the full profile again.
- **Keep the docked profiles** per device in `localStorage` (where they stand on this screen), like the daemon's spot.

## 7. A leaf detached by a drag (editing, with permission)
- **While dragging:** add `.detached` to the person and set `--dx` and `--dy` (px). The leaf lifts and tilts.
- **A drop target:** a person it can be joined to glows with `.drop-near`.
- **On release:** add `.settling` and clear `--dx` and `--dy` to bring it back, or draw the tree again after a join.
- **Without permission,** a drag on a leaf pans the tree (§3).

## 8. The "בקרוב" notes (the uniform note from `docs/design/soon.md`)
- **A chip "עיצובים"** with `.tag-soon`, after the kind chips, disabled. This is where tree, frame and background designs
  unlocked by use will go.
- **Inside the full profile,** a quiet list `ul.tr-full-soon`, each line with a `.tag-soon`:
  - "דף אישי: שורת מצב, מוזיקה, סיפורים": the profile as a personal page;
  - "שיתוף הישגים בתמונה": sharing achievements graphically;
  - "קישוט תמונות וסרטונים": decorating media.

## Checked (design, prototype, 2026-11-14)
- **Phone, 375px:**
  - no horizontal overflow in any state;
  - the tree fits one screen (359 × 539);
  - the menu stays inside the screen with its arrow on the leaf;
  - the banner fits inside the tree;
  - the sheet leaves the tree's top in sight.
- **Desktop, 1280px:** the side panel (420px) doesn't cover the tree.
- **Light and dark:** both checked.
- **Contrast:** the empty leaf's text is about 8:1.
- **Every button** is at least 44px.
- **Not checked:**
  - on a real touch screen: the pinch, the long press, the dock drag;
  - the view transitions animating, since the browser pane doesn't run them.
