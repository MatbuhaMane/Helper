# The recipe book: a menu in the tab, "שלי" and "ששותפו איתי" (design → ai-features)

Vision batch 16 (2026-11-14).
- **The look:** the menu is in `public/assets/base.css` (`.tabs-wrap`, `.tab-caret`, `.tab-dot`, `.tab-menu`), so any tab can have one. The book's own parts are in `public/groceries/style.css` (`.book-which`, `.book-empty`, `.book-card .from`).
- **The sample:** `docs/design/prototype/recipe-book-menu.html`; copy it to `public/` to view it.
  - `?menu=1` opens the menu.
  - `?book=shared` shows the shared book.
  - `&empty=1` shows an empty book.
  - `&theme=dark` works on any of them.
- **Checked:** at 375 and at desktop width, light and dark, with no sideways overflow. Text contrast is 8:1 and more.

## The markup (`public/groceries/index.html`)
- Wrap `.tabs` in `.tabs-wrap`, and put the menu right after `.tabs`, never inside it. On a phone `.tabs` scrolls sideways, and that would clip the menu.
- The book tab gets the popup attributes and a caret.
```html
<div class="tabs-wrap">
  <div class="tabs" role="tablist">
    <button role="tab" id="tabList" aria-selected="true">רשימת קניות</button>
    <button role="tab" id="tabBook" aria-selected="false" aria-haspopup="menu" aria-expanded="false" aria-controls="bookMenu" …>ספר מתכונים
      <!-- only when a recipe was shared since the shared book was last opened: -->
      <span class="tab-dot" title="מתכון חדש ששותף איתך"></span>
      <svg class="tab-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6"/></svg></button>
    …
  </div>
  <div id="bookMenu" class="tab-menu" role="menu" aria-label="ספר מתכונים" hidden>
    <button role="menuitemradio" aria-checked="true" data-book="mine">
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/></svg>
      <span><b>ספר המתכונים שלי</b><small>המתכונים שסימנת בלב</small></span><b class="tab-menu-n">24</b></button>
    <button role="menuitemradio" aria-checked="false" data-book="shared">
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4.5"/><path d="M12 3.5v11M8 10.5l4 4 4-4"/></svg>
      <span><b>מתכונים ששותפו איתי</b><small>מה שהמשפחה שלחה לך</small></span><b class="tab-menu-n">3</b></button>
  </div>
</div>
```
- At the top of `#viewBook`, before `.book-tools`: `<h2 class="book-which">ספר המתכונים שלי<small>24 מתכונים</small></h2>`. For the shared book it is "מתכונים ששותפו איתי". With one recipe, write "מתכון אחד".

## The behaviour (groceries/app.js)
- **A tap on the book tab:**
  - If another tab is showing, it switches to the book, shows the last chosen one (kept in `H.prefs('groceries', { book: 'mine' })`) and opens the menu.
  - If the book is already showing, it opens or closes the menu.
- **Choosing an item:** it sets `aria-checked`, draws that book, updates `.book-which`, closes the menu and returns the focus to the tab.
- **Closing without a choice:** Escape, a tap outside `.tabs-wrap`, or Tab out of the menu. The book stays as it was.
- **The keyboard:**
  - on open, the focus goes to the checked item;
  - the up and down arrows move between the two items;
  - Enter or Space chooses.
- **The place:** set `--x` on the menu on every open, so it stays under its tab after the fonts load or the page width changes:
  ```js
  const w = wrap.getBoundingClientRect(), t = tab.getBoundingClientRect();
  menu.style.setProperty('--x', (getComputedStyle(wrap).direction === 'rtl' ? w.right - t.right : t.left - w.left) + 'px');
  ```
  The CSS keeps the menu inside the wrap (300 px, or the whole width when that is narrower).
- **The dot:** show `.tab-dot` while there is a shared recipe newer than the last time the shared book was opened. Keep that time in the prefs, so it follows the person between devices.

## The two books
- **"ספר המתכונים שלי":** the recipes marked with a heart (a like), as the grid is today.
- **"מתכונים ששותפו איתי":** the same `.book-card`, with `<span class="from">נשלח מ{name}</span>` in place of the `small` line. A face before the name is optional: `<img src alt="">` inside `.from`.
- **The search** looks only in the book that is showing. Its placeholder is "חיפוש בספר המתכונים…".
- **An empty book:** one item in `#bookGrid`, `<div class="book-empty">(icon)<b>…</b><span>…</span></div>`:
  - mine: the heart, "הספר עוד ריק", "מסמנים לב על מתכון, והוא נכנס לספר.";
  - shared: the shared icon, "עוד לא שלחו לך מתכונים", "מתכון שמישהו מהמשפחה ישלח לך יופיע כאן.".

## The motion
- **The menu:** it comes in with opacity and a 4 px drop only, in 200 ms. It closes at once.
- **The caret:** it turns over with `transform`.
- **Less motion:** both are still.
