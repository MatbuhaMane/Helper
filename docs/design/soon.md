# The big ideas that wait: "בקרוב" (design → master)

Vision batch 15 (2026-11-14). The rule: a big idea is not built. It gets a picture and one note. A tap opens only its one sentence.

The sample is `docs/design/prototype/soon.html`; copy it to `public/` to view it.
- `?sheet=hill|garage` opens the sheet.
- `?view=list` shows the serious home as a list.
- `&theme=dark` works on any of them.

Checked at 375 and at desktop width, light and dark, with no sideways overflow.

## The pictures (`public/assets/soon/<id>.svg`)
- **`hill.svg`, גבעה ביער:**
  - a green hill in a pine forest;
  - a sand path winding up it;
  - friends' small tents on the slopes, each with its own pennant;
  - on the crown, a shade canopy with lights strung under it and a small fire.
- **`garage.svg`, המוסך:** a stone garage with its door rolled up and a red car's nose inside. Around it:
  - a lit wall lamp;
  - an air conditioner breathing cool air;
  - an antenna sending a signal;
  - a robot vacuum at work on the ground.

**The style:** both are in the tent's look (one warm ink outline, flat fills, a soft ground shadow). They are 320×240 and read from 90 px up. Like the tent, they keep their colours at night.

**Source:** `docs/design/soon/soon.py`. A new big idea gets its own function there, and its file is named by the idea's `id` in `H.SOON`.

## The one note (`.tag-soon`, base.css)
**The token:** `--soon` is a calm dusk blue in light and in dark. It is not the vine (that is the active state) and not the amber of "ניסיוני".

The word comes from `note` in `H.SOON`. "בקרוב" and "בפיתוח" look the same.
```html
<span class="tag-soon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5v-8"/><path d="M12 12.5C12 8.6 9.2 6.5 5 6.5c0 3.9 2.8 6 7 6Z"/><path d="M12 14.5c0-3.2 2.4-5.2 6.5-5.2 0 3.2-2.4 5.2-6.5 5.2Z"/></svg>בקרוב</span>
```
The sprout is optional. Without it, the pill is the same.

## Where they sit: my recommendation is a strip under the ring, not by the tent itself
**Why not by the tent:**
- The ring arcs over the tent, and the sun and the moon pass behind it. There is no free spot in that picture at any width.
- On a phone the tent already fills the width.

**The strip:** right after `wheel.caption` in `index.html`, before the logout line. Its heading says "ליד האוהל", which matches the `line` texts.
```html
<section class="soon-row" aria-labelledby="soon-h">
  <h2 id="soon-h">בקרוב ליד האוהל</h2>
  <ul>
    <li><button class="soon-card" type="button" data-id="hill"><img src="/assets/soon/hill.svg" alt=""><b>גבעה ביער</b>(tag-soon)</button></li>
    …one li for each item in H.SOON
  </ul>
</section>
```
- Two cards side by side, at 375 too. Each is dashed: drawn, not built yet.
- The picture is decorative (`alt=""`); the name is the label.

## The serious home
**The group:** the last group, after the tools' groups.
```html
<section class="sr-group sr-soon"><h2>בקרוב</h2>
  <ul class="sr-tools" data-view="(the same view)">
    <li><button class="sr-tool" type="button" data-id="hill"><span class="sr-ic"><img src="/assets/soon/hill.svg" alt=""></span>
      <span class="sr-txt"><b>גבעה ביער<span class="tag-soon">בקרוב</span></b><small>(line)</small></span></button></li>
  </ul></section>
```
- It is a `button` and not a link, since there is no page.
- The search hides it as it hides a tool.

## The tap
A tap opens only this, through `H.modal(div.soon-sheet)`:
```html
<div class="soon-sheet"><img src="/assets/soon/hill.svg" alt=""><h2>גבעה ביער</h2>(tag-soon)<p>(line)</p></div>
```
There is no other button. The modal's own ✕ closes it.

## `.app-tag` (the "ניסיוני" after a name on the serious home)
- It is styled in base.css, the same pill as `.tag-exp` without the icon, with a small gap after the name.
- The markup at `index.html:439` stays as it is.

**On the tools page and the ring:** the tag is `span.tag-exp` with the flask, placed as in `docs/design/arrange.md` §2:
- the last child of the `.app` link;
- inside `.wheel-item .pillow`, after the img.
