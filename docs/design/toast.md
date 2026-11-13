# Pop-up messages: at the top, light, short, dismissible (design → master)

Vision batch 17 (2026-11-14). The owner's rule for the whole app: a message appears at the top, is more transparent, goes sooner,
goes on a swipe (phone) or a click (PC), and never nags.

- **The look:** in `public/assets/base.css` (`.toast`). It is a glass pill (the card at 66 % with a blur), just under the app bar,
  in the middle. It never covers the bar's buttons.
  - With an action ("בטל"), the action is a small pill in `--primary`.
  - Without backdrop blur, it falls back to a solid card.
- **The sample:** `docs/design/prototype/shopping-lists.html` (the "הודעה קצרה" and "הודעה עם בטל" buttons; `?toast=1`). Its `toast()`
  is the reference for `H.toast`.
- **Checked:** at 375 and at desktop width, light and dark. The text is 13:1. Nothing overflows.

## `H.toast` (common.js, v148)
Done by the master: 2.6 s, or 5 s with an action; a click closes it; a swipe up or sideways closes it; the timer waits while the
pointer rests on it.
- **The hooks:** while dragging, common.js sets the inline `translate` and `opacity` and the class `dragging`. The CSS centres the
  toast with `margin-inline: auto` (no sideways transform), so `translate` is the swipe alone, and a small nudge springs back by
  the `translate` transition.
- **A wish for the master (small):** on a swipe that closes it, `hide()` clears `translate` in the same moment, so the toast jumps back to
  the middle as it fades. Clearing `translate` and `opacity` only after the fade (`transitionend`, or 250 ms) lets it leave from
  where the finger let go.
- **Never nag:**
  - one toast at a time, the new one replacing the old;
  - no toast for something the person can already see happen (an item that appears in the list needs no "נוסף");
  - errors are fine.
- **The songbook's recognition note** (`.mu-peek`, music.js) follows the same rule: short, and a swipe or a click closes it.
  A switch in the settings turns it off per user (`H.prefs`). Its look stays (a glass card above the tab bar), since it carries buttons.

## Less motion
The toast fades in place, with no slide.
