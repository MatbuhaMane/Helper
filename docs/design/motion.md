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
   | `--dur-settle` | 340 ms (most of the way in ~200 ms) | something springing back after a gesture |

   - Easing: `--ease-river` (out) for arrivals, `--ease-spring` for anything a finger let go of, and `--ease-leave` for leaving.
6. **Reduced motion** (from the system, or `data-motion="reduce"`): everything still works, only without the movement.
7. **Page to page:** cross-document view transitions are already on (the bars stay put, the page slides 6 px and fades).

## The Telegram test: checks per screen (for `tools/audit.js`)

**Who runs it:** each department runs these on every screen it changes, at 375 px and at desktop width, in light and dark mode.
**Status:** "Must" is a defect; "Should" is a warning.

| # | Check | Threshold | How the audit can measure it |
|---|---|---|---|
| T1 | Motion is only `transform`, `opacity` (and `translate`, `scale`, `rotate`) | Must: no layout property (width, height, inset/top/left, margin, padding, font-size, grid/flex sizes) in any `transition-property` or `@keyframes` | read `document.styleSheets`: transitions and keyframe rules |
| T2 | Paint-only transitions (`color`, `background-color`, `border-color`, `box-shadow`, `filter`) stay short | Should: ≤ 200 ms | the same pass |
| T3 | Durations | Must: a press ≤ 150 ms; a fade, a menu or a popover 150–250 ms; a sheet, a page or a window 200–250 ms for the main movement (a spring may settle until 340 ms); no one-time animation over 400 ms, except the allowlist in T4 | `document.getAnimations()` after each interaction: `effect.getComputedTiming().duration` |
| T4 | Endless animations only where they belong | Must: `infinite` only for a name on the allowlist below; one-time decorations (moods, egg, `gk-ok`) are allowed up to 2.6 s | the keyframe names of animations with `iterations: Infinity` |
| T5 | A tap answers at once | Must: on `pointerdown`, the control's `transform`, `opacity` or `background-color` changes within one frame; the visible result of a click (a DOM change) comes within 100 ms, optimistically if the server is slower | dispatch `pointerdown`/`click` on each visible control, then compare computed styles on the next `requestAnimationFrame` and time the first `MutationObserver` record |
| T6 | No tap delay | Must: every control's computed `touch-action` is `manipulation` (or `none` / `pan-y` on a gesture surface) | `getComputedStyle(el).touchAction` |
| T7 | Nothing jumps | Must: CLS ≤ 0.02 from load to 3 s, and 0 after an interaction that did not ask for it; every `img`/`video` has a size (`width`/`height` or `aspect-ratio`) | a `PerformanceObserver` on `layout-shift`; check the media attributes and computed `aspect-ratio` |
| T8 | No spinner for a fast answer | Must: a `.spinner` is at opacity 0 for its first 400 ms; a list or card that loads over 400 ms shows `.skel` in the same size | computed opacity at insertion and at +450 ms |
| T9 | Smooth | Should: while scrolling the page and opening and closing a sheet, ≤ 5% of frames over 32 ms and no long task over 50 ms | `requestAnimationFrame` deltas plus a `longtask` observer, during `scrollBy({top: 1200, behavior: 'smooth'})` and an `H.modal` round trip |
| T10 | Scroll panes keep the page still | Should: every element with `overflow-y: auto|scroll` and more than 300 px of content has `overscroll-behavior: contain` | computed style |
| T11 | Reduced motion is respected | Must: with `data-motion="reduce"`, `getAnimations()` holds nothing that moves (`transform`), only short opacity changes | `data-motion="reduce"`, then the interactions of T5 |
| T12 | Dark mode is excellent | Must: the same contrast rules as light (the current audit), no pure #000 background, and no white flash between pages (`html` has `--bg` before the CSS loads) | contrast pass in dark; the first paint colour of the page |

### The allowlist: endless animations, and the scenery (T3, T4)

An endless animation is allowed only in one of four kinds. A new one is added here first, in its kind, and copied into `ENDLESS` in `tools/audit.js`.

| Kind | Why it may run on | The names |
|---|---|---|
| Waiting | it says "working", and stops when the answer comes | `spin`, `rec-spin`, `rs-spin`, `fun-spin`, `fun-pull-spin`, `mu-spin`, `ga-calc-wait`, `cx-dots`, `gl-dot`, `skel-sheen`, `shimmer`, `pb-sheen` |
| Live | something is recording, playing, speaking or calling now | `gl-rec`, `rb-speak`, `mu-listen`, `mu-eq`, `gp-wave`, `sos-pulse`, `st-ring`, `dm-z`, `dm-flow` |
| Edit mode | the arranging wiggle, as on a phone's home screen | `app-wiggle`, `arr-wiggle` |
| Scenery | the tent's calm life: sky, fire, tree, figures, moods | `sky-twinkle`, `twinkle`, `sun-breathe`, `glow`, `breath`, `shb-breathe`, `strip-breathe`, `rp-breathe`, `wz-breathe`, `wz-tri`, `cf-spark`, `cf-roar`, `cf-chosen`, `plump`, `tr-fall`, `tr-drift`, `tr-sway`, `tr-sway-low`, `tr-hang`, `tr-glow`, `tr-flicker`, `tr-candle-glow`, `f2-glow`, `f2-tw`, `f2-z`, `fe-flick`, `mood-flicker`, `egg-live`, `egg-rock` |

**The scenery may also be slow (T3).** A slow change of light or a breath on a decorative element is fine, for example the sky turning to night or the moon rising. The element must not be a reply to a tap: `pointer-events: none` or `aria-hidden`. A reply to a tap is never scenery, even on a scene: a pressed sun or moon gives way within 150 ms. Every scenery animation stops under reduced motion.

**What only a person can judge:** the feel itself. Before a screen is marked done, compare it once side by side with Telegram on the same phone. If it feels slower or clumsier, it is not done.

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

## Smooth: the patterns (the owner's priority, 2026-11-14)

The rule for every department: pick the pattern from this table. Do not invent a new curve or duration. CSS is in the second "Telegram-smooth" section at the end of `base.css`.

| Thing | In | Out | Curve | How |
|---|---|---|---|---|
| Sheet on a phone (`.modal`, ≤520 px) | 240 ms, rises from the bottom | 170 ms, down | `--ease-sheet` in, `--ease-leave` out (no overshoot, so no gap under it) | `sheet-up` / `sheet-down` |
| Window on a desktop | 200 ms, scale .96→1 + fade | 170 ms, .97 + fade | the same | `pop-in` / `pop-out` |
| Backdrop | fade 200 ms | fade 170 ms | linear-ish | opacity only (no animated blur) |
| Menu or popover (`.navmenu`, `.lp-menu`, `.tr-menu`) | 200 ms, scale .96→1 + fade, grows from its trigger | 120 ms | `--ease-sheet` / `--ease-leave` | `--ox` / `--oy` is the trigger's centre; `.closing` on exit |
| Page to page | old leaves 140 ms, new arrives 220 ms after 40 ms, 20 px on the reading axis | — | `--ease-leave` / `--ease-river` | cross-document view transition; `html[data-vt="back"]` reverses it |
| Active tab | the pebble slides to the new tab in 280 ms (its own view transition, `tab-pebble`) | — | `--ease-river` | the bar and header stay still |
| Press | 120 ms | 120 ms | `--ease-river` | `scale(.97)` on `.btn`, `.96` on chips, tabs, menu rows, `.985` on a card or row |

- **Tokens:** `--ease-sheet` is `cubic-bezier(.2, .9, .25, 1)`, `--dur-sheet-in` 240 ms, `--dur-sheet-out` 170 ms. A closing thing is always faster than an opening one.
- **A finger that lets go** (a dragged sheet, a swipe) uses `--ease-spring`, which may overshoot. Anything that opens by itself uses `--ease-sheet`, which does not.
- **Only `transform` and `opacity`.** The tap highlight is off (`-webkit-tap-highlight-color`), and `touch-action: manipulation` is on every pressable thing already.
- **Reduced motion:** a closing sheet only fades; the page turn, the pebble's slide and every press give are off.
- **Not supported** (a browser without cross-document view transitions): the page loads as before, the pebble fades in on the new tab, and the rest is plain CSS and works everywhere.
- **Still for a real phone:** frame smoothness is judged by the owner. T9 is not measured in the pane.
