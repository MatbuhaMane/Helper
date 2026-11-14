# Motion: the Telegram test across the whole tent

_Design, 2026-11-14. Vision batch 30, which widens batch 16's premium-motion rule to every screen. The CSS is the "Motion" section at the end of `public/assets/base.css`. The look is the tent's own: our tokens, font and backgrounds._

**The test:** a screen that feels slower or clumsier on a phone than Telegram is not done.

## The rules (for every department)

1. **Only `transform` and `opacity` move.** Never width, height, margin or top. The audit lists every violation.
2. **Instant feedback.**
   - A press answers within one frame: the `.btn` give, or `scale(.985)` on a pressable card or row.
   - The answer is optimistic: show the result at once, and roll it back with a toast if the server says no.
3. **No spinners for a fast answer.**
   - `.spinner` and the `.loading` text wait 400 ms in silence before they fade in.
   - For a list or a card that is loading, draw its shape with `.skel`.
4. **Nothing jumps.**
   - New content fades in (`.swap-in`), and a list arrives (`.arrive`, with `--i` on each item).
   - Keep a box's size while it loads (a skeleton the same height), so nothing below it moves.
5. **Timing:**

   | Token | Value | Use |
   |---|---|---|
   | `--dur-press` | 120 ms | a press |
   | `--dur-quick` | 200 ms | a fade or a menu |
   | `--dur-draw` | 340 ms | something arriving |
   | `--dur-settle` | 420 ms | something springing back after a gesture |

   - Easing: `--ease-river` (out) for arrivals, `--ease-spring` for anything a finger let go of, and `--ease-leave` for leaving.
6. **Reduced motion** (from the system, or `data-motion="reduce"`): everything still works, only without the movement.
7. **Page to page:** cross-document view transitions are already on (the bars stay put, the page slides 6 px and fades).

## The pieces (the JS sets the variables; the CSS gives the look)

| Piece | Markup | The JS |
|---|---|---|
| A skeleton | `.skel.line` (`--w`), `.skel.round`, `.skel` | swap it for the content when the content arrives |
| A list that arrives | `.arrive` > items with `style="--i:n"` | — |
| Swipe to act | `.swipe` > `.swipe-acts` > `button(.danger)` + `.swipe-body` | `--dx` in px while dragging, plus `.dragging`; on release remove it (it springs), and act past the threshold |
| Swipe to reply | `.swipe` > `span.swipe-reply` + `.swipe-body` | `--p` 0–1 as the drag nears the threshold; `.armed` once past it (with a short vibration if the device can) |
| Long-press menu | `.lp-dim` + `.lp-menu` > `button` / `hr`, with `.lp-lift` on the pressed item | open after about 450 ms; set `--ox` / `--oy` (the transform origin, near the finger); close on the dim |
| The phone's sheet | `.sheet-grip` as the first child of `.modal-glass` | drag down: `--drag` (px), `--drag-p` (0–1), `.dragging` on `.modal`; close past a third or on a fast flick |
| Hold to speed up a video | `span.vid-speed` (`.on`) inside the player box | hold for 2×; slide sideways to go up to 3× in steps; show the rate in the pill |

## What changed already, everywhere

- **Pressable things** have `touch-action: manipulation`, so a tap has no 300 ms wait.
- **Scrolling:** smooth inside a page, and panes keep the page still behind them (`overscroll-behavior: contain`).
- **The spinner** shows only after 400 ms.
- **The sheet on a phone** rises with a soft spring.

## Wave 2 (after the family launch): the chat

These are planned, not designed yet:
- grouped bubbles with the time inside them;
- the voice-record gesture;
- a media viewer (pinch to zoom, swipe down to close);
- stickers and a wallpaper per chat;
- floating bubbles;
- the live card;
- communities as umbrellas of groups.
