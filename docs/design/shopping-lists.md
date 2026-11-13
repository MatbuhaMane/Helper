# The shopping list: the lists panel, choosing many, a category's icon (design → ai-features)

Vision batch 17 (2026-11-14). The owner: the list bubbles move to a panel of their own at the top, above the search, and all the
lists are managed from there. Choosing many lets you pick everything or a whole category. A category of one's own gets an icon from
a few emoji. **No button may sit on another button, anywhere: from now on that is a defect.**

- **The look:** `public/groceries/style.css`, the "vision batch 17" block. The menu reuses `.tab-menu` from base.css.
- **The sample:** `docs/design/prototype/shopping-lists.html`; copy it to `public/` to view it.
  - `?sel=1` choosing mode;
  - `?menu=1` the lists menu;
  - `?pick=1` the icon picker;
  - `&theme=dark`.
- **Checked:**
  - at 375 and at desktop width, light and dark;
  - nothing overflows, and no button overlaps another (including the FAB and the tab bar at the bottom of every view);
  - text 6:1 and more; the empty choosing ring 8:1 in dark.
- **Until app.js changes:** the current flat chips in `.lists-bar` still wrap as before, so nothing breaks.

## 1. The lists panel (`renderLists`)
```html
<nav class="lists-bar card" aria-label="הרשימות">             <!-- before #addForm, as now -->
  <div class="lists-track">                                  <!-- one line that scrolls sideways -->
    <button class="chip list-chip" aria-pressed="true">🛒 הרשימה</button>
    <button class="chip list-chip" aria-pressed="false">שבת</button> …
    <button class="chip list-auto" aria-pressed="false">🤖 אוטומטית<span class="list-auto-n">4</span></button>
  </div>
  <button class="lists-btn list-new" aria-label="רשימה חדשה" title="רשימה חדשה">(plus)</button>
  <button class="lists-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="listsMenu" aria-label="ניהול הרשימות">(dots)</button>
  <div id="listsMenu" class="tab-menu lists-menu" role="menu" aria-label="ניהול הרשימות" hidden>
    <button role="menuitem">(saved)<span><b>רשימות שמורות</b><small>תבניות וארכיון</small></span></button>
    <button role="menuitem">(pen)<span><b>שינוי שם</b><small>הרשימה "שבת"</small></span></button>          <!-- when canDelete -->
    <button role="menuitem" class="danger">(trash)<span><b>מחיקת הרשימה</b><small>אפשר לבטל לכמה שניות</small></span></button>  <!-- when canDelete -->
  </div>
</nav>
```
- **The icons** (`class="icon" viewBox="0 0 24 24"`):
  - plus: `<path d="M12 5v14M5 12h14"/>`;
  - dots: three `circle r="1.3"` at x 5.5, 12 and 18.5, y 12;
  - saved: `<path d="M6.5 4h11a1 1 0 0 1 1 1v15l-6.5-4-6.5 4V5a1 1 0 0 1 1-1z"/>`;
  - pen: `<path d="M4 20h4L19 9l-4-4L4 16z"/>`;
  - trash: `<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>`.
- **The current list's chip** scrolls into view (`scrollIntoView({ inline: 'nearest', block: 'nearest' })`) after each render.
- **The menu** behaves like the recipe book's menu:
  - Escape, a tap outside `.lists-bar` or Tab out of it closes it;
  - focus goes to the first item;
  - the arrows move between the items.

## 2. Choosing many
- **The toolbar:** "מחק מסומנים" stays (it deletes the bought ones). A new `<button id="selOn" class="btn ghost">בחירה</button>`
  turns choosing on.
- **Choosing on:** `#list` gets the class `selecting`.
  - Each `li.item` starts with `<button class="sel-box" type="button" role="checkbox" aria-checked="false" aria-label="בחירת {name}">`.
    It is always in the row and hidden by the CSS until choosing.
  - The row's other controls step aside by CSS. A tap anywhere on the row toggles its box.
  - Each category's `h2` ends with `<button class="sel-cat" type="button" aria-pressed="false">בחירת הקטגוריה</button>`. It chooses or
    clears all its items. It is pressed when all of them are chosen.
- **The bar,** right after `#list`, sticky above the tab bar:
  ```html
  <div class="sel-bar" role="toolbar" aria-label="בחירה מרובה">
    <b class="sel-n" aria-live="polite">3 פריטים נבחרו</b>      <!-- "לא נבחר כלום" · "פריט אחד נבחר" -->
    <button class="btn ghost small" id="selAll">בחירת הכל</button>  <!-- "ביטול הבחירה" when all are chosen -->
    <button class="btn danger small" id="selDel" disabled>מחיקה</button>  <!-- disabled while nothing is chosen -->
    <button class="sel-x" aria-label="סיום הבחירה">(x)</button>
  </div>
  ```
- **A delete** shows one toast, "3 פריטים נמחקו", with "בטל". After it, choosing ends.
- **Escape** ends choosing.

### 2b. "למקרר" (move the chosen to the fridge)
- In the bar, the two actions sit in one `<span class="sel-acts">`, before `.sel-x`:
  ```html
  <span class="sel-acts">
    <button class="btn ghost small sel-fridge" id="selFridge" disabled>(fridge)למקרר</button>
    <button class="btn danger small" id="selDel" disabled>(trash)מחיקה</button>
  </span>
  ```
  - fridge: `<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M6 10h12M9 6.5v1.5M9 13v3"/>`; trash as in §1.
  - On a phone the bar takes two lines (the count, "בחירת הכל" and ✕ on top; the two actions half and half under them). On a wide screen, one line.
- **What it does:** the chosen items go into the person's fridge (`/food/fridge/`, their own fridge) with today's date, and leave the list.
  One toast: "3 פריטים עברו למקרר" with "בטל". Choosing ends.
- Both actions are disabled while nothing is chosen.

### 2c. Moving rows by a drag (only while choosing)
- Each `li.item` ends with a grip, hidden by the CSS until choosing:
  ```html
  <button class="drag-h" type="button" aria-label="הזזת {name}" title="לגרור, או חצים למעלה ולמטה">(grip)</button>
  ```
  grip: six `circle r="1.6"` at x 9 and 15, y 6, 12 and 18 (`class="icon"`, filled).
- **A tap on the grip does not choose the row** (the row's click handler skips `.drag-h`).
- **The drag** (pointer events on the grip, `setPointerCapture`):
  - `#list` gets `.dragging`, the row gets `.lifted` and follows the finger by its inline `translate` (block axis only);
  - the rows it passes step aside by their own `translate` (± the row's height); never by height or margin;
  - over another category's area, that `.category` gets `.drop-into`; over a list chip in the panel, the chip gets `.drop-into`;
  - on release: the row moves there in the data (its place, its category, or another list), the list renders again, every
    `translate` is cleared, and a polite live line says where it went ("עגבניות עברו לפירות וירקות").
- **Without a pointer:** ArrowUp / ArrowDown on the focused grip move the row one place (past a category's edge into the next one).
  The focus stays on the grip.
- The reference is the "the drag" part of the sample's script.

## 3. A category of one's own: its icon
In the new category form, after the name:
```html
<div class="icon-pick" role="radiogroup" aria-label="אייקון לקטגוריה">
  <button type="button" role="radio" aria-checked="true" aria-label="חיות" tabindex="0">🐶</button> …  <!-- the rest tabindex="-1" -->
</div>
```
- **The choices, 16,** in the look of the built-in categories:
  🧴 בקבוק · 🧹 ניקיון · 🐶 חיות · 🍼 תינוק · 💊 בית מרקחת · 🌿 תבלינים · 🍷 יין · 🎉 מסיבה · 🧊 קפואים · 🥫 שימורים · 🍫 מתוקים ·
  🧃 שתייה · 🥜 אגוזים · 🐟 דגים · 🕯️ שבת · 🎒 בית ספר.
  - Leave out any that a built-in category already uses.
- **The first one is chosen.** The arrows move the choice (a radio group).

## 4. No overlapping buttons
- The panel's round buttons sit outside the scrolling track, so a long list name can't reach them.
- The choosing bar is sticky in the flow, not fixed, so it never covers the last row.
- **For every new control:** at 375 px, scroll to the bottom of each view and check that nothing fixed (FAB, tab bar, a bar)
  covers a button.

## 5. "הוספת מתכון" in the book's top row (no floating button)
The floating ＋ in the book covered the recipe cards under it. It moves into `.book-tools`, after `#bookSearch`; the ids stay, so
app.js needs no change:
```html
<div class="card book-tools">
  <input id="bookSearch" …>
  <div class="book-add">
    <button id="bookFab" class="btn primary book-add-btn" aria-haspopup="menu" aria-expanded="false">(plus)מתכון</button>
    <div id="bookFabMenu" class="fab-menu" role="menu" hidden>…the two items as now…</div>
  </div>
</div>
```
- Remove the old `.fab-wrap`. The menu opens under the button, inside the screen.
- Checked at 375 (one line with the search, the menu inside the screen) in light and dark.
