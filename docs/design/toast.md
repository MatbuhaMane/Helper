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

## What `H.toast` (common.js) needs
- **The times:** 2.6 s without an action, 5 s with one (now 3.8 s and 6 s).
- **A click or a tap** anywhere on the toast, except on its button, closes it at once.
- **A swipe:**
  - on `pointerdown` stop the timer;
  - on `pointermove` set `--dx` (sideways) and `--dy` (only upward, ≤ 0) in px, `--o` = `max(.2, 1 - (|dx| + |dy|) / 140)`,
    and the class `dragging`;
  - on `pointerup`:
    - past 60 px sideways or 24 px up, remove `show`;
    - otherwise remove the three properties and `dragging`, and restart a 2 s timer.
  - Clear `--dx`, `--dy` and `--o` when a new message shows.
- **The action button** stops the click from reaching the toast (`stopPropagation`), runs the action, then closes.
- **Never nag:**
  - one toast at a time, the new one replacing the old;
  - no toast for something the person can already see happen (an item that appears in the list needs no "נוסף");
  - errors are fine.
- **The songbook's recognition note** (`.mu-peek`, music.js) follows the same rule: short, and a swipe or a click closes it.
  A switch in the settings turns it off per user (`H.prefs`). Its look stays (a glass card above the tab bar), since it carries buttons.

## Less motion
The toast fades in place, with no slide.
