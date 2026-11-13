# The locks: their look (design)

For the master's "Locks and privacy" (docs/decisions.md, 2026-11-14). Prototype: `docs/design/prototype/lock.html` (copy it
into `public/` for a moment and open it on the dev server; the code there is 1234).

## The pieces

`/assets/lock.js` (it loads `/assets/lock.css`) draws and moves; the server decides.

- **The padlock:** `Lock.padlock('open' | 'closed')` returns a `<span class="pl">` with one drawing whose shackle swings.
  In the menu: a `button.pl-btn` holding it.
  - Pressing it: `await Lock.close(pl)` drops the shackle with a small bounce (about 300 ms).
  - Then `POST /api/lock/lock`, then the lock screen, which fades in over a blurred, dimmed page (about 340 ms).
  - The whole move takes about 600 ms. With reduced motion it is instant.
- **The lock screen:** `Lock.screen({ who, passkey, onCode, onPasskey, onForgot })`.
  - The layout: a padlock, "האוהל נעול", the person's name, 4 dots, a big keypad in phone order (left to right even in
    Hebrew), with the passkey key and the delete key on the bottom row, and "שכחתי את הקוד".
  - The keyboard's digits and Backspace work too.
  - The page behind is made `inert`.
  - `onCode(code)` answers `{ ok }`, or `{ ok: false, msg, wait }`:
    - a wrong code shakes the dots and shows `msg`;
    - `wait` pauses the digit keys; the passkey key stays.
  - `s.done` resolves once unlocked: the dots turn the vine colour and the screen fades.
  - **Setting a code** uses the same screen: `Lock.screen({ title: 'קוד חדש', hint: 'בחרו 4 ספרות', onCode, onCancel })`, and
    again with the hint 'עוד פעם, לאישור'.
- **The window on the first visit to the tree:** `H.modal(Lock.warnCard({ onSetup, onLater, onNever }))`.
  - A padlock, "כדאי לנעול את העץ", one sentence, and three answers: "להגדיר עכשיו", "אחר כך", "לא להציג שוב".
  - On a phone it is a bottom sheet.
- **"פרטיות ואבטחה" in settings** (`settings.css`), built from the existing parts:
  - `.st-choices` for the app lock (כבויה / בקוד / בטביעת אצבע) and its timer (דקה / 5 / 15 / שעה);
  - `.st-switch` for the tree lock;
  - new: `.st-code`, the code row (a padlock, "הקוד מוגדר", "לשנות קוד", "שכחתי את הקוד");
  - new: `.chip[data-level="low"]`, amber when chosen;
  - new: `.st-warn`, the warning under the low level ("לא מומלץ…");
  - new: `.st-safe`, what no setting opens ("בכל רמה, מסמכים מוגבלים… נשארים מאחורי טביעת אצבע").

Checked at 375 px and 1280 px, light and dark. Contrast holds everywhere: the lowest is 8.9 on the lock screen.
