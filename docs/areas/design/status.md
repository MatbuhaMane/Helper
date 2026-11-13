# Status – design

Updated by the department at the end of every meaningful round of work. Short: the master reads it for the board meeting.

_Updated 2026-11-14._

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

## In progress
- The rest of the style check: the tool icons, the record, the tree's 12 drawings (about 14 images, ~$0.96) – after the
  image quota resets (00:00 UTC).
- Waiting for the master's speed/motion tool to fix by its report (CLS, real frame rate).

## Blockers
- The image quota for 2026-11-13 is used (40/40).
- Asked of ai-features: `music.js` to grow the music bar by transform (`.mu-bar.scaled`, `--p`); the mail page's bar.

## Needs the owner
- Two style decisions: keep the small line icons (draw only the big ones)? Replace the emoji in the interface gradually?
