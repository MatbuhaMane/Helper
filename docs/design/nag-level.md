# "רמת הניג'וס": notification levels (the look, batch 31)

_Design, 2026-11-14. Vision batch 31 (vision d5472bf, the owner's name: keep it). The logic is ai-features'. It replaces the batch 28 phone switch (`.st-ntf`, goals-2.md §4)._
_Where the CSS is:_
- _`public/assets/base.css`, section "רמת הניג'וס": the picker, the bell and the mark, used in every tool;_
- _`public/settings/settings.css`, section "התראות": the screen and the quiet hours._

Four levels, each with a colour and a bell, set by `data-nag`:

| `data-nag` | Name | The bell |
|---|---|---|
| `off` | כבוי | crossed out, grey |
| `quiet` | שקט | "z", olive (only in the daily summary) |
| `normal` | רגיל | plain, vine |
| `nag` | נודניק | ringing, ember (repeats until marked handled) |

## The picker (anywhere)

```html
<fieldset class="nag"><legend>רמת הניג׳וס: מטרות</legend>
  <label class="nag-opt" data-nag="off"><input type="radio" name="n-goals" value="off"><span class="nag-ic"></span><span>כבוי</span></label>
  …quiet, normal, nag…
</fieldset>
<p class="nag-note">רק בסיכום היומי.</p>          <!-- optional: one line on the chosen level -->
```

## The settings screen "התראות"

```html
<ul class="st-nags">
  <li class="st-nag" data-nag="quiet"><span class="nag-ic"></span><div><b>מטרות</b><small>תזכורת לצעד הבא</small></div>
    <fieldset class="nag">…</fieldset>
    <p class="st-nag-own">פריט אחד בהגדרה משלו</p></li>        <!-- when items override it -->
  <li class="st-nag fixed" data-nag="nag">…emergency: the radios disabled, the reason in small…</li>
</ul>
<div class="st-quiet-hours"><b>שעות השקט</b>
  <div><label>מ־<input type="time" aria-label="תחילת שעות השקט"></label><label>עד <input type="time" aria-label="סוף שעות השקט"></label></div>
  <small>וגם בשבת ובחג. חירום וטיימר שהפעלת עכשיו עוברים תמיד.</small></div>
```

- **The row's `data-nag`** follows the checked level (the JS sets it), so the icon at the start shows it.
- **Layout:** on a phone the picker is under the name, full width; from 720 px it sits at the row's end.

## Inside a tool: the bell, and an item that differs

```html
<button class="nag-bell" data-nag="quiet" aria-label="רמת הניג׳וס: שקט"><span class="nag-ic"></span></button>
<button class="nag-bell own" data-nag="nag" aria-label="רמת הניג׳וס: נודניק, שונה מהכללי">…</button>   <!-- .own: a dot -->
<span class="nag-mark" data-nag="nag"><span class="nag-ic"></span>נודניק</span>   <!-- beside an item's name, only when it differs -->
<label class="nag-inherit"><input type="checkbox">כמו הממשק (שקט)</label>          <!-- in an item's picker: back to the tool's level -->
```

- **The bell** sits in the tool's head and opens the picker in `H.modal`.
- **The dot (`.own`)** shows when this tool differs from the general setting, or an item differs from its tool.
- **An item** shows `.nag-mark` only when it differs. The specific setting wins over the general one.

The audit is clean at 375 and 1280 px, in light and dark mode, with the Telegram checks.
