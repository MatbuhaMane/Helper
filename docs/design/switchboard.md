# The back door's switchboard, and the tent's moods (the look)

_Design, 2026-11-14. The logic is ai-features' (`public/admin/admin.js`, and whoever sets the mood on `<html>`). The CSS is:
- `public/admin/admin.css`, sections "מצב האוהל, collapsible" and "The switchboard";
- `public/assets/base.css`, section "The tent's moods" (חגיגה, אבל, קודש: they apply on every page)._

Every control is at least 44 px on a touch screen. Motion is `transform` and `opacity` only, and `prefers-reduced-motion` is respected.

## 1. מצב האוהל, collapsible

A `<details>`, so it opens and closes with no JS and is keyboard-friendly. The JS remembers `open` per device (localStorage)
if it wants to.

```html
<details class="card bd-state" open>
  <summary class="bd-state-sum">
    <h2>מצב האוהל</h2>
    <span class="bd-state-line">נטו ₪1,240 · AI היום $0.42 · 14 חברים · 9 נכנסו השבוע</span>   <!-- shown only when closed -->
    <i class="bd-state-chev" aria-hidden="true"></i>
  </summary>
  …the alerts and the .ad-tiles, as today…
</details>
```

- **Closed:** one line. The title, then the summary line (it ellipsizes on a phone), then the chevron.
- **An alert while closed:** add `.has-alert` to the `<details>`. A small dot shows by the title, so an alert is never hidden by the fold.

## 2. The switchboard

Under מצב האוהל. One card per category, in a responsive grid: one column on a phone, two or three on a PC.

```html
<section class="sb" aria-labelledby="sb-h">
  <header class="sb-head">
    <h2 id="sb-h">לוח המתגים</h2>
    <p class="muted">כל המתגים של האוהל, לפי נושא. שינוי חל מיד על כולם.</p>
  </header>
  <div class="sb-cats">
    <section class="sb-cat" style="--c:#3557a8">              <!-- --c: the category's colour (an app's c2 is fine) -->
      <h3 class="sb-cat-h"><span class="sb-cat-ic" aria-hidden="true">(H.icon(name))</span>כניסה וחשבונות</h3>
      <ul class="sb-list">

        <!-- on/off -->
        <li class="sb-row">
          <div class="sb-txt"><b id="sw-google">כניסה עם גוגל</b><small>אפשר להיכנס עם חשבון גוגל</small></div>
          <button class="sb-switch" type="button" role="switch" aria-checked="true" aria-label="כניסה עם גוגל"></button>
        </li>

        <!-- three states: a segmented control (radios as buttons) -->
        <li class="sb-row sb-row-seg">
          <div class="sb-txt"><b id="sw-exp">כלים נסיוניים</b><small>מה רואים בארגז הכלים</small></div>
          <div class="sb-seg" role="radiogroup" aria-labelledby="sw-exp">
            <button type="button" role="radio" aria-checked="true" data-v="hide">הסתר נסיוני</button>
            <button type="button" role="radio" aria-checked="false" data-v="only">רק נסיוני</button>
            <button type="button" role="radio" aria-checked="false" data-v="all">הכל</button>
          </div>
        </li>

        <!-- the mood: the same segment; data-v colours the chosen one -->
        <li class="sb-row sb-row-seg">
          <div class="sb-txt"><b id="sw-mood">מצב רוח</b><small>חגיגה: קונפטי בפתיחה. אבל: נרות וצבעים שקטים.</small></div>
          <div class="sb-seg sb-mood" role="radiogroup" aria-labelledby="sw-mood">
            <button type="button" role="radio" aria-checked="true" data-v="normal">רגיל</button>
            <button type="button" role="radio" aria-checked="false" data-v="party">חגיגה</button>
            <button type="button" role="radio" aria-checked="false" data-v="mourning">אבל</button>
          </div>
        </li>
      </ul>
    </section>
  </div>
</section>
```

- **The switch's name** goes in `aria-label` (the row's title), not `aria-labelledby`: the page audit reads only the first.
- **The keys** of a radiogroup (the arrows move the choice) are the JS's job.
- **Row states:**
  - `.sb-row.saving` while the server answers: the control dims a little and cannot be pressed.
  - `.sb-row.saved` for one second after it is saved: a soft tint washes over the row.
  - `.sb-row.failed` when saving failed: the JS puts the control back, and the row's `small` says why in `--danger`.
- **A switch that cannot be changed now:** `aria-disabled="true"` on the switch, with the reason in its row's `small`.
- **A row that differs from the default:** `.sb-row.changed` gets a small dot in the category's colour before its title.
- **A dangerous switch** (one that stops something for everyone): add `.sb-row.danger`. Its "on" state is drawn in `--danger`, not the vine.

## 3. The moods, on `<html>` (every page)

| Attribute | What it does |
|---|---|
| `data-mood="party"` | A warm, festive tint (gold accent). On opening, the confetti and balloons below. |
| `data-mood="mourning"` | A faded, quiet palette (greys, the vine turned slate), pictures desaturated, and a candle note if the JS adds one. |
| `data-kodesh` (any value, e.g. `"1"`) | A calm Shabbat look: cream and a deep blue by day, a night blue and soft gold at night. Modest, tokens only. |

- Each one works in light and dark, and with the person's own palette (`data-palette`); the mood wins over the palette.
- When both are set, `data-mood="mourning"` wins over `data-kodesh`. That is only a look default: what קודש means, and whether
  mourning shows on Shabbat, is for the owner to decide.

### The effects layer (ai-features' `switches.js` draws and animates it)

`<div class="mood-fx" aria-hidden="true">`: a fixed layer over the page that nothing can click (`pointer-events: none`).

- **The JS:** it sets `--x` (the inline start), `--c` (the colour) and, for confetti, `--r` (a rotation) on each piece, and it animates them with transform and opacity. Under reduced motion it draws nothing.
- **The CSS:** it gives the shapes.
  - `i.mood-confetti`: an 8×12 rectangle.
  - `i.mood-balloon` > `i.mood-string`: a 38×48 balloon with a highlight, a knot and a string. It starts just below the window.
  - `div.mood-candles` > `span.mood-candle` × 2 > `i.mood-flame`: they rest in the bottom inline-end corner, above the tab bar on a phone. The flame flickers in CSS (transform and opacity) and stands still under reduced motion.

### The candle note (mourning, optional)

```html
<p class="mood-note" role="note"><i class="mood-candle" aria-hidden="true"></i>האוהל באבל על …</p>
```

- Put it at the top of `main`, or on the home page only.
- The candle is `/assets/tree/candle.svg`, with the flame flickering gently (opacity and scale). With reduced motion the flame is still.

## Class list

| Class | On | Note |
|---|---|---|
| `bd-state` (`details`, `open`, `.has-alert`) | מצב האוהל | collapsible |
| `bd-state-sum`, `bd-state-line`, `bd-state-chev` | its summary | the line shows only when closed |
| `sb`, `sb-head` | the switchboard | |
| `sb-cats`, `sb-cat` (`--c`), `sb-cat-h`, `sb-cat-ic` | the category cards | |
| `sb-list`, `sb-row` (`.saving`, `.saved`, `.failed`, `.danger`), `sb-txt` | a row | |
| `sb-switch[role=switch][aria-checked]` | on/off | `aria-disabled` |
| `sb-row-seg`, `sb-seg[role=radiogroup]` > `button[role=radio][aria-checked]` | three states | |
| `sb-mood` + `data-v` | the mood's segment | coloured per mood |
| `html[data-mood="party"\|"mourning"]`, `html[data-kodesh]` | every page | token overrides |
| `mood-fx` > `mood-confetti`, `mood-balloon` > `mood-string`, `mood-candles` > `mood-candle` > `mood-flame` | the effects | ai-features draws them |
| `mood-note`, `mood-candle` | the mourning note | optional |
