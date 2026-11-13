# Arranging the home cushions, the "ניסיוני" tag, the "חיפוש בגוגל" button (design → master, ai-features)

Vision batch 14 (2026-11-14). The sample is `docs/design/prototype/arrange.html`; copy it to `public/` to view it.
- `?add=1` opens the add sheet.
- `?drag=2` lifts the third cushion.
- `&theme=dark` works on any of them.

Checked at 375 and at desktop width, light and dark, with no sideways overflow.

## 1. Arrange mode on the home (`public/assets/arrange.css`)

**Loading:** the home (`index.html`, the master's) links `/assets/arrange.css` after base.css. It is small, so it can load always.

**Why a tray and not the ring.** Half the ring is behind the fire, and the cushions there are hidden. Reordering by hand on a ring is hard on a phone.
- A long press on a cushion hides `.wheel` and shows the tray below in its place.
- The tray holds the same cushions in the ring's order.
- "סיום" saves, then shows the ring again, spun to the cushion that was pressed.

```html
<section class="arr" aria-labelledby="arr-h">
  <header class="arr-bar">
    <div><h2 id="arr-h">סידור הכריות</h2><p>גוררים כרית כדי להזיז אותה, ✕ כדי להוריד. כריות עם מנעול נשארות תמיד.</p></div>
    <button class="btn primary arr-done" type="button">סיום</button>
  </header>
  <ul class="arr-tray">
    <!-- one per cushion, in the ring's order; --n is its index (staggers the wiggle) -->
    <li class="arr-item" style="--n:0" tabindex="0" aria-roledescription="כרית שאפשר להזיז">
      <span class="arr-pillow"><img src="/assets/pillows/p03.webp" alt=""><span class="badge">(H.icon of the app)</span></span>
      <b class="arr-name">מתכונים</b>
      <button class="arr-x" type="button" aria-label="הורדת מתכונים מהבית">(x icon)</button>
    </li>
    <!-- a fixed cushion: data-fixed, a lock instead of the × -->
    <li class="arr-item" data-fixed style="--n:1" tabindex="0" aria-roledescription="כרית שאפשר להזיז">
      …<span class="arr-fixed" role="img" aria-label="כרית קבועה" title="כרית קבועה: אפשר להזיז, לא להוריד">(lock icon)</span>
    </li>
    <!-- an experimental tool: the tag after the name -->
    <li class="arr-item" …>…<b class="arr-name">סידור המייל</b><span class="tag-exp">(flask)ניסיוני</span><button class="arr-x" …>…</button></li>
    <!-- always last -->
    <li><button class="arr-add" type="button"><span class="arr-slot">(plus icon)</span><b>הוסף כרית</b></button></li>
  </ul>
</section>
```

**States**
- **Wiggle:** every `.arr-item` wiggles gently, like the tools folder's arrange mode. A fixed one stays still. Less motion stops it (`data-motion="reduce"` and prefers-reduced-motion).
- **Dragging:** `.arr-item.dragging` is lifted, slightly larger and with a deeper shadow. The place it will drop into is an `.arr-item.ghost`: a dashed cushion shape whose children are hidden. Use pointer events, the same as the tools folder.
- **Keyboard:** Space picks a cushion up (`aria-grabbed="true"` draws a ring), the arrows move it, and Space or Enter puts it down. Announce the new place in a live region ("מתכונים, מקום 3 מתוך 8").
- **Fixed cushions:** family tree, settings and tools. In grandparents and kids modes, the accessibility tiles are fixed too. A fixed cushion can move but cannot be removed.
- **The add sheet:** "הוסף כרית" opens `H.modal` with the tools that are not on the ring yet.
  ```html
  <h2>הוספת כרית</h2>
  <ul class="arr-pick">
    <li><button type="button"><img src="(pillow)" alt=""><span><b>לוח השנה</b><small>אירועים וימי הולדת</small>(tag-exp if experimental)</span>
      <span class="arr-plus">(plus icon)</span></button></li>
  </ul>
  <!-- nothing left: <p class="arr-pick-empty">כל הכלים כבר בבית.</p> -->
  ```
- **Removing** leaves the tool in the tools folder. Show a toast "מתכונים ירד מהבית" with "ביטול".

**The icons**, each with `fill="none" stroke="currentColor"`. The CSS sets the size and stroke.
- x `<path d="M6 6l12 12M18 6 6 18"/>`
- lock `<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>`
- plus `<path d="M12 5v14M5 12h14"/>`

## 2. The "ניסיוני" tag (`.tag-exp`, base.css)

**The token:** `--exp` is a warm amber, light and dark. Its text is 4.5:1 and more on its own wash.

```html
<span class="tag-exp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 3.5h5M10.5 3.5v5.2L5.4 17.6A2 2 0 0 0 7.1 20.5h9.8a2 2 0 0 0 1.7-2.9l-5.1-8.9V3.5"/><path d="M7.6 14.5h8.8"/></svg>ניסיוני</span>
```

**Where it goes.** The master adds `tag: 'ניסיוני'` to סידור המייל and סידור המחשב in `H.APPS`, and sorts them last. Then put the span:
- **The tools list:** as the last child of the `.app` link. It sits on the tile's top corner, in the same place as `.soon`; a tool never has both.
- **A cushion on the ring:** inside `.wheel-item .pillow`, after the img. It sits on the cushion's top corner and fades with the label on the back of the ring.
- **The arrange tray:** after `.arr-name`.
- **The add sheet:** inside the text span.

**Accessibility:** the word itself is the label. Screen readers read the tile as "סידור המייל ניסיוני", which is right.

## 3. "חיפוש בגוגל" (`.g-search`, base.css)

ai-features replaces the bare Google links in the cards with:

```html
<a class="g-search" href="https://www.google.com/search?q=(encodeURIComponent(query))" target="_blank" rel="noopener">(H.icon('lens'))חיפוש בגוגל</a>
<!-- when the query should be visible: -->
<a class="g-search" …>(lens)חיפוש בגוגל: <span class="g-q">שקשוקה ירוקה</span></a>
```

**The look:** a quiet outlined pill, 36 px high, in the hub's own ink, with no Google colours or logo. A long query is cut with an ellipsis at 18 characters.
