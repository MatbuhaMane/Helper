# The toolbox's new look (design → ai-features)

The owner asked for this on 2026-11-14. `public/tools/` shows every app, with a sort switch: ידני, לפי שם or לפי קטגוריה.
The categories come from `H.CATS` and the future items from `H.FUTURE` (apps.js, main 1ca3564).

- **The CSS** is ready, at the end of `public/assets/launcher.css` (block "The toolbox"). Every class carries the `tb-` prefix.
- **The prototype** is `docs/design/prototype/toolbox.html`. To view it, copy it into `public/` on a dev server. It builds the
  category view from the real `H.CATS`, `H.APPS` and `H.FUTURE`. Take its JS as a sketch, not as code to ship.
- **The motion rule:** the JS only sets attributes and classes. All the motion is in the CSS, in transform and opacity.

## 0. The folder
- Add `tb` to the folder's class: `<div class="folder tb">`.
  - This keeps the tool rack over the title once the grid sits inside the category sections.
  - The old rule needed the grid to be a direct child of the folder.

## 1. The sort switch: a three-way segmented control
- **Where:** pass it as `under` to `H.folder`, between the head and the apps.
- **The markup:**
  ```html
  <div class="tb-sort" role="radiogroup" aria-label="סידור הכלים">
    <button type="button" role="radio" aria-checked="true">ידני</button>
    <button type="button" role="radio" aria-checked="false">לפי שם</button>
    <button type="button" role="radio" aria-checked="false">לפי קטגוריה</button>
  </div>
  ```
  - Keep this order. The CSS finds the chosen one by `:nth-child`.
- **What the JS does:**
  - It sets `aria-checked` on the buttons. The vine stone and the trail that slides to it follow by `:has`, with no JS.
  - Arrow keys move the choice, as a radiogroup should. Only the chosen button has `tabindex="0"`; the others have `-1`.
  - The choice is kept in prefs, e.g. `H.prefs('tools', { sort: 'hand' })`, with the values `hand`, `name` and `cat`.
- **The arrange button** ("סידור") means something only in ידני.
  - Hide it in the other two views (`hidden`).
  - While arranging, the CSS dims the switch and makes it inert.

## 2. By category
- **The markup:** one section for each `H.CATS` entry, in its order.
  ```html
  <div class="tb-cats">
    <section class="tb-cat" style="--k:0" aria-labelledby="tb-cat-work">
      <h2 class="tb-cat-head" id="tb-cat-work"><span>כלי עבודה</span><span class="tb-cat-count" aria-label="5 כלים">5</span></h2>
      <nav class="apps-grid flat" aria-label="כלי עבודה"> …the .app tiles, --n restarting at 0 in each section… </nav>
    </section>
    …
  </div>
  ```
- **`--k`** is the section's index. The sections rise one after another, 70ms apart.
- **The header:** the CSS draws a vine leaf before the name and a line that fades away after the count.
- **An app with no `cat`** goes in a last section, "עוד", so nothing is lost.
- **ידני and לפי שם:** a single `.apps-grid.flat`, as today. לפי שם sorts with `localeCompare(…, 'he')`.

## 3. "בעתיד": the future items
- These are the `'soon:x'` items in a category, and `H.FUTURE` in the other views (in ידני and לפי שם, at the end).
- **The markup:**
  ```html
  <button type="button" class="app tb-future" style="--n:4" aria-label="מדיטציה ונשימה, בעתיד">
    <span class="ic tb-pic"><img src="/assets/soon/breath.svg" alt="" decoding="async"></span>
    <span class="name">מדיטציה ונשימה</span>
    <span class="tag-soon">בעתיד</span>
  </button>
  ```
- **The picture** (vision batch 19): each future item has its drawing at `/assets/soon/<id>.svg`.
  - The ids: `kitchen`, `breath` and `howto` (batch 19); `garden`, `home`, `translate` and `homework` (batch 20); `eye` (batch 22).
    All are in the batch 15 style.
  - The `.ic` takes `tb-pic`, with an `<img>` inside it in place of the line icon.
  - If a future id has no drawing yet, use `<span class="ic">` with `H.appIcon(f.ic)`; the CSS covers both.
- **The accessible name** comes from `f.label` when the item has one, else from `f.name`: `aria-label="${f.label || f.name}, בעתיד"`.
  - `eye` is named "ع ב-ע" but labelled "עין בעין", so a screen reader doesn't spell out the letters.
  - The visible name stays `f.name` as it is, with no `<bdi>` or `dir` needed. Every letter in it is right-to-left, so it reads
    ع, ב, -, ע from the right.
  - The self-hosted Rubik has an Arabic subset, so the ع is drawn in Rubik too. Checked at 375.
- **The look:** the picture (or a pale icon) in a dashed ring, the name in `--muted`, and the "בעתיד" pill in the corner in the dusk blue of
  בקרוב. It doesn't lift on hover.
- **A tap** shows its `line`: `H.toast(f.line)`. It isn't a link.
- **In arrange mode:** it can't be dragged or pinned.

## 4. The beta badge ("ניסיוני")
- Nothing new is needed. `H.expTag(a)` already gives `span.tag-exp`, and `.app > .tag-exp` puts it in the top corner, as
  launcher.js does today.
- An app with `access: 'beta'` is drawn only when `H.mayOpen(a)` allows it, and it carries its tag.

## Checked (design, the prototype, 2026-11-14)
- **Widths:** 375 and 1280, light and dark. No horizontal overflow.
- **The audit:** `tools/audit.js` is clean, on the prototype and on the current `/tools/`, for contrast, motion, names and
  overflow.
- **The switch:** every button is 44px tall, and the stone lines up with each of the three choices.
- **Not checked:**
  - the sliding motion itself, since the browser pane doesn't run transitions;
  - the arrange mode together with the switch (that needs the real JS).
