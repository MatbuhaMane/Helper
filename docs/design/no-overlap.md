# No control on another (design → master and ai-features)

Vision batch 17 (2026-11-14). The owner: a button that sits on another button is a defect, in every interface. The master's
`tools/audit.js` now lists such pairs. This is what its first run at 375 px found and who does what.

## Fixed in the CSS (design, on `design`)
- **The home ring** (`campfire.css`): the cushions' pictures, with their clear margins, overlapped their neighbours, so a tap on a
  cushion's edge opened the next one.
  - A cushion is now pressed only on its core, an oval in the middle of the picture (`.pillow::after`, inset 28% 20%), and the
    front cushion also on its name. The rest of its box lets the touch through to the ring, so a drag still spins it.
  - Measured over a whole turn at 375 px: no two cores touch. Each core's centre is its own cushion.
  - The look and the ring's geometry are unchanged.
  - **For the audit:** the `.wheel-item` links now have `pointer-events: none`, so the audit skips them. The check above
    stands in for it.
- **The music corner** (`campfire.css`):
  - While the player's record is parked on the stump (`body.mu-docked`), the empty slot under it can't be pressed. The parked
    record is the one to press.
  - The songbook cushion is pressed only clear of the record (`.song::after`). Its part under the record was a second button.

## For ai-features
- **The recipe book's ＋** covered the cards under it. It moves into the book's top row as a "＋ מתכון" button with the same ids;
  see `shopping-lists.md` §5. The CSS (`.book-add`, `.book-add-btn`) is ready.
- **The floating ראב"ע** stands on the calculator's 7 and 4, on the calendar's days and on the settings' colour themes.
  - **The rule:** where the figure comes to rest (on load, after a walk, after a resize), it must not cover a pressable control.
  - **The test,** in daemon.js: take a 3 × 3 grid of points in the middle 60% of the stage, and look under each one with
    `document.elementsFromPoint`, skipping the stage itself. Any `button, a[href], input, select, textarea, [role=button]` there
    means the spot is taken.
  - **The fallbacks,** in order:
    1. the inline-end corner above the tab bar (as now);
    2. the inline-start corner above the tab bar;
    3. under the app bar at the inline-end;
    4. if all three are taken, fold to the side tab (`.dm-tab`), as the person's own fold does. The person's own placement wins:
       a spot they dragged it to stays, even over a control.
  - **Run it** when the page settles, and again after a view changes (a tab, a sheet that closes). Never run it while a person
    is dragging the figure.
  - Content that scrolls under a resting figure is fine. The room at the end of every page (`daemon.css`) lets the last
    buttons come out from under it.

## For the master
- **The audit** counts only the first screen, and only elements that take the pointer. Hit areas made of pseudo-elements (the
  ring, the songbook cushion) are invisible to it. A note in the audit's header would save a false "fixed".
- **Re-run at 375** after merging `design`. Expect the home ring and the corner to drop out. The book and the daemon wait for
  ai-features.
