# Arranging the family by dragging (the look)

_Design, 2026-11-14. The logic is ai-features' (`public/family/family.js`); the CSS is in `public/family/family.css`,
section "Arranging"._

Arranging is for people with edit rights, in the views **המשפחה** and **כל הדורות** only (not on the drawn tree).
Two moves:
- **another generation**: drop on a generation's row;
- **another place in the row**: drop between two cards.

Motion is `transform` and `opacity` only. Every control is at least 44 px on a touch screen.

## 1. The "סידור" button

In `.fv-tools`, after the views. Show it only in `family` and `all`, and only to an editor.

```html
<button class="btn small ghost fv-arrange-btn" type="button" aria-pressed="false">סידור</button>
```

- The icon is the six dots (`/assets/bd-icons/drag.svg`), drawn by the CSS.
- `aria-pressed="true"` while arranging.

## 2. Edit mode and the banner

When arranging, add `arranging` to the page's `section.fv`. Put the banner right before `.fv-tree`:

```html
<div class="fv-arrange-bar" role="status">
  <span>גוררים כרטיס לדור אחר, או למקום אחר בשורה.</span>
  <button class="btn primary fv-arrange-done" type="button">סיום</button>
</div>
```

- The banner sticks to the top of the screen while the board scrolls.
- **סיום** leaves edit mode. Esc should do the same.
- While a card is being dragged, add `dragging` to `section.fv`:
  - the cursor becomes "grabbing";
  - text cannot be selected.

## 3. A card while arranging

Every `.fv-card` gets a grip, added by the JS while arranging (inside the card, as its first child):

```html
<span class="fv-grip" aria-hidden="true"></span>
```

- The grip is the touch handle, a 44 × 44 corner at the top of the card (inline-end):
  - it has `touch-action: none`, so a finger on it drags while a finger elsewhere still scrolls the page;
  - with a mouse, the whole card can be dragged (cursor "grab").
- Clicking a card while arranging should not open the person; the JS decides.

**The source card** while it is dragged: `.fv-card.lifted`. It stays in place, faded and dashed, as "this is where it was".

**The ghost**: a copy of the card, appended to `<body>`:

```html
<div class="fv-ghost" aria-hidden="true"> …the card's own markup (a .fv-card clone)… </div>
```

- The JS sets its position every frame with the individual `translate` property, in viewport px:
  `ghost.style.translate = `${x}px ${y}px``. Use the pointer minus the grab offset.
- The CSS gives it the tilt and the lift, through `rotate` and `scale`, so the two never fight.
- To drop it, add `.fv-ghost.landing` for 200 ms, then remove it. It fades into the place.

**From the keyboard** (recommended): Space or Enter on a focused card while arranging picks it up (`.fv-card.picked`, a ring
and a lift). The arrows move the drop line, Enter drops, and Esc puts it back. A `role="status"` line, for example the banner's
span, says where it would go: "דנה, בין יוסי לרות, דור 3".

## 4. The drop targets

**Another generation**: add `drop` to the target row, and remove it from the row the card left.
- In המשפחה, that is the `.fv-gen` (its label lights up too).
- In כל הדורות, it is the `.fv-tree > .fv-row`.

While arranging, every one of them shows a faint dashed outline, so you can see the targets. With `drop`, the outline
fills with a vine tint.

**The place in the row**: one line per board, appended by the JS to the target `.fv-row` (which is `position: relative`):

```html
<i class="fv-drop-line" aria-hidden="true"></i>
```

- Set `--x` and `--y` (px, from the row's **physical** top-left corner, as `getBoundingClientRect` gives them): the middle of
  the gap between the two cards, at the top of the card.
- Set `--h` to the card's height.
- Add `on` to show it. It moves with a 120 ms glide (transform).
- With no `on`, it is hidden (opacity 0). Hide it whenever the drop would change nothing.

## 5. The confirm sheet (moving to another generation)

Moving a person to another generation changes what the tree says, so ask first. Order within a row needs no confirm.
Use `H.modal(body)`, where the body is:

```html
<div class="fv-arrange-confirm">
  <h2>להעביר את דנה לדור אחר?</h2>
  <div class="fv-move">
    <span class="fv-move-from">דור 3</span>
    <i class="fv-move-arrow" aria-hidden="true"></i>
    <span class="fv-move-to">דור 2</span>
  </div>
  <p class="muted">הקשרים שלה במשפחה לא משתנים. אפשר לבטל מיד אחר כך.</p>
  <div class="fv-arrange-actions">
    <button class="btn primary" type="button">להעביר</button>
    <button class="btn ghost" type="button">ביטול</button>
  </div>
</div>
```

- The wording is a placeholder; the JS writes what the move really does.
- On a phone, the two buttons are full width, stacked, with the main one on top.

## 6. Undo

Reuse the delete's undo bar exactly, `undoBar(text, undo, onEnd)` and `.fv-undo`, with no new class. For example:
"דנה עברה לדור 2" with **בטל**.
- After a move inside the row, also give the undo, because a drop can be a slip.
- `H.toast` goes after 6 s, which is too short for undo, so it is not used here.

## Class list

| Class | On | When |
|---|---|---|
| `fv-arrange-btn` | the סידור button | always (editors, family/all) |
| `arranging` | `section.fv` | edit mode |
| `dragging` | `section.fv` | while a card is in the hand |
| `fv-arrange-bar` | the banner | edit mode |
| `fv-arrange-done` | the סיום button | in the banner |
| `fv-grip` | span inside each `.fv-card` | edit mode |
| `lifted` | the source `.fv-card` | while dragged |
| `picked` | `.fv-card` | lifted from the keyboard |
| `fv-ghost` (+ `landing`) | the copy on `<body>` | while dragged / dropping |
| `drop` | `.fv-gen` or `.fv-tree > .fv-row` | the generation under the pointer |
| `fv-drop-line` (+ `on`), `--x --y --h` | the line in the target `.fv-row` | the place under the pointer |
| `fv-arrange-confirm`, `fv-move`, `fv-move-from`, `fv-move-to`, `fv-move-arrow`, `fv-arrange-actions` | the H.modal body | before a generation move |
| `fv-undo` (existing) | the undo bar | after every move |
