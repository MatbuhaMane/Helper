# פרנסה – the markup contract (design → ai-features)

The look is `public/tools/parnasa/parnasa.css`; the sample with every state is `docs/design/prototype/parnasa.html`
(copy it to `public/` to view: `?view=import&step=1|2|3`, `?entry=1`, `?scope=kupa`, `?empty=1`, `?theme=dark`, `?style=serious`).
The decision is in `docs/decisions.md` (2026-11-13, פרנסה). Checked at 375 and 1280, light and dark; text 4.5:1 and more,
the category colours 3:1 and more against the card in both themes.

## Principles the code keeps
- **One number first:** what is left this month. Everything else is below it.
- **An expense is not red.** It is ink with a minus sign; only bars carry the colour. Money coming in is the vine.
- **Colour is never the only sign.** A category always has its name written next to it, and a change always has ▲/▼ and a number.
- **Every amount** goes in `<span class="pr-num">`, written as `−342.5 ₪` or `+11,800 ₪` (U+2212 for minus, `+` only where
  the sign matters, a space before ₪). The class keeps the sign next to the number inside the Hebrew line.
- **Categories** get a number 1–8, `data-c="N"`, on the element or an ancestor. The colours are `--pr-c1..8`:
  - 1 vine;
  - 2 terracotta;
  - 3 blue;
  - 4 gold;
  - 5 plum;
  - 6 teal;
  - 7 soil;
  - 8 slate, for שונות/אחר.
  Keep a category's number stable per person (save it with the category), so its colour does not move between months.
- The page root is `<main class="pr">`. The entry sheet's `<form class="pr-entry">` carries the same tokens, since H.modal puts it outside `.pr`.

## The page
```html
<main class="pr">
  <a class="pr-link" href="/tools/">→ כלים</a>
  <header class="pr-head">
    <div><h1>(H.icon('parnasa')) פרנסה</h1><p>הכסף של הבית, בנחת</p></div>
    <div class="pr-head-tools">
      <div class="pr-scope" role="group" aria-label="של מי">            <!-- only when the person has a shared קופה -->
        <button type="button" aria-pressed="true">שלי</button>
        <button type="button" aria-pressed="false"><span class="pr-kupa">(faces)<span class="pr-kupa-name">קופת הבית</span></span></button>
      </div>
      <div class="pr-month"><button aria-label="החודש הקודם">(chevron →)</button><b>נובמבר 2026</b><button aria-label="החודש הבא" disabled>(chevron ←)</button></div>
    </div>
  </header>
  <div class="pr-grid"> …the cards below, in any order (grid areas place them)… </div>
  <button class="pr-fab" type="button" aria-label="רישום הוצאה">(plus)</button>
</main>
```
**The order.**
- On a phone it is one column: balance, quick entry, split, recurring, tips, recent, investments.
- From 900px it is two columns: balance and quick entry, then split and recurring, then recent beside tips and investments.

**The floating button.** `.pr-fab` shows on phones only. Give it `hidden` while the quick card is in view (an IntersectionObserver), so the two never sit together.

### The shared קופה badge
```html
<span class="pr-kupa"><span class="pr-faces"><i>נ</i><i>ד</i></span><span class="pr-kupa-name">קופת הבית</span></span>
```
- The faces are each member's initial, or `<img alt="">` with their picture, in a gold ring.
- `.pr-kupa.mini` sits on a single payment or charge that is in the קופה. It shows the faces only; the name stays for screen readers, so write it as "בקופת הבית".

### The balance
```html
<section class="card pr-balance" aria-labelledby="bal-h">
  <div class="pr-card-head"><h2 id="bal-h">נשאר החודש</h2><span class="pr-delta"><b class="pr-num">+320 ₪</b> לעומת אוקטובר</span></div>
  <p class="pr-big" data-sign="plus|minus"><span class="pr-num">4,360 ₪</span></p>
  <dl class="pr-flow">
    <div data-kind="in"><dt>נכנס</dt><dd><span class="pr-num">14,200 ₪</span></dd><span class="pr-meter" aria-hidden="true"><i style="--w:100%"></i></span></div>
    <div data-kind="out"><dt>יצא</dt><dd><span class="pr-num">9,840 ₪</span></dd><span class="pr-meter" aria-hidden="true"><i style="--w:69%"></i></span></div>
  </dl>
  <p class="pr-pace">עברו 13 ימים מהחודש, ויצאו 69% מההכנסה.</p>
</section>
```
- `--w` is set against the larger of the two amounts.
- `data-sign="minus"` (spent more than came in) turns the big number to `--danger`. It is the only red on the page.

### Quick entry
```html
<section class="card pr-quick" aria-labelledby="q-h">
  <h2 id="q-h">רישום מהיר</h2>
  <div class="pr-quick-btns"><button class="btn primary">(out) הוצאה</button><button class="btn">(in) הכנסה</button></div>
  <div class="pr-again" aria-label="שוב, בנגיעה אחת">
    <button class="chip" data-c="1"><i class="pr-dot"></i>סופר <span class="pr-num">~380 ₪</span></button> …
  </div>
  <a class="pr-link" href="#import">(file) ייבוא קובץ מהבנק או מחברת האשראי</a>
</section>
```
**`.pr-again`** holds the 4–6 most frequent entries.
- One tap enters the entry as it is, dated today; for "~380" it opens the sheet with 380 filled in.
- After the tap, add `.done` to the chip for about a second, and show `H.toast('נרשם: קפה 14 ₪')` with a "בטל" button.

### The entry sheet (inside `H.modal`)
```html
<h3 id="e-h">רישום הוצאה</h3>
<form class="pr-entry">
  <div class="pr-kind" role="radiogroup" aria-label="סוג"><button role="radio" aria-checked="true">הוצאה</button><button role="radio" aria-checked="false">הכנסה</button></div>
  <label class="pr-amount"><input inputmode="decimal" placeholder="0" aria-label="סכום" autofocus><b>₪</b></label>
  <label class="field"><span>על מה</span><input type="text"></label>
  <div class="pr-guess" aria-live="polite"><span>קטגוריה:</span>
    <button class="chip" data-c="1" aria-pressed="true"><i class="pr-dot"></i>מכולת וסופר</button> … <button class="chip" data-c="8" aria-pressed="false"><i class="pr-dot"></i>אחר…</button></div>
  <div class="pr-entry-more"><input type="date" aria-label="תאריך">
    <label class="toggle"><input type="checkbox">חוזר כל חודש</label>
    <label class="toggle"><input type="checkbox"><span class="pr-kupa">(faces)<span class="pr-kupa-name">בקופת הבית</span></span></label></div>
  <button class="btn primary" type="submit">שמירה</button>
</form>
```
- The focus goes straight to the amount.
- The category guess updates as "על מה" is typed: the best guess is pressed, with two more beside it and "אחר…".
- The date defaults to today.
- Enter saves.

### Where the money went
```html
<section class="card pr-split" aria-labelledby="s-h">
  <div class="pr-card-head"><h2 id="s-h">לאן הלך הכסף</h2><span class="pr-muted"><span class="pr-num">9,840 ₪</span> ב-7 קטגוריות</span></div>
  <div class="pr-stack" aria-hidden="true"><i data-c="1" style="--w:34.8%"></i> …</div>
  <ol class="pr-cats">
    <li class="pr-cat" data-c="1"><i class="pr-dot"></i><span class="pr-cat-name">מכולת וסופר</span><span class="pr-num">3,420 ₪</span><span class="pr-cat-pct">35%</span>
      <span class="pr-meter" aria-hidden="true"><i style="--w:100%"></i></span><span class="pr-cat-up">+12% מאוקטובר</span></li>
  </ol>
</section>
```
- The stacked bar is only a picture. The list is the chart people read.
- In the list, `--w` is set against the largest category. `.pr-cat-up` is optional, for a notable change.
- To make a row open that category's payments, put the row's content in a `<button>` inside the `li`, or make the `li` a `<button class="pr-cat">`.

### Recurring charges, recent payments, holdings (one row pattern)
```html
<ul class="pr-recur-list">                                   <!-- .pr-tx-list for recent payments, .pr-holds for holdings -->
  <li data-c="6"><span class="pr-ic">(repeat icon, or <b>ש</b>, the first letter)</span>
    <span class="pr-line"><b>חשמל</b><small>כל חודשיים · הבא ב-3 בדצמבר (.pr-kupa.mini)</small></span>
    <span class="pr-amt"><span class="pr-num">−412 ₪</span></span>
    <span class="pr-flag">עלה ב-8%</span>                      <!-- optional; data-kind="new": "חדש החודש" -->
  </li>
</ul>
<p class="pr-recur-sum"><span>בכל חודש</span><b class="pr-num">−4,842 ₪</b></p>
```
- **Income** gets `<span class="pr-amt" data-kind="in">` and `<span class="pr-ic" style="--pr-c:var(--pr-in)">`.
- **A holding** is `<span class="pr-ic" data-c="3"><b class="pr-sym">VOO</b></span>`, then its name and the number of units in `.pr-line`, its value in `.pr-amt`, and `<span class="pr-chg" data-dir="up|down">▲ 3.1%</span>`.
- **The investments card** opens with `<p class="pr-big">` (the total) and a `.pr-delta`.
- **When there are no holdings:** `<div class="pr-empty">(trend icon)<span>אין עדיין החזקות. אפשר להוסיף מניה או קרן, רק כדי לעקוב.</span><button class="btn small">הוספת החזקה</button></div>`.
- The investments card always ends with `<p class="pr-note">מעקב בלבד: המחירים מתעדכנים באיחור, ואין כאן קנייה, מכירה או המלצה.</p>`.

### Tips
```html
<section class="card pr-tips" aria-labelledby="t-h"><h2 id="t-h">כדאי לשים לב</h2>
  <ul class="pr-tip-list"><li class="pr-tip"><span class="pr-tip-ic">(bulb)</span><p>…</p><small>מהרישומים שלך | ✨ העוזר החכם</small></li></ul>
  <p class="pr-note">הכוונה כללית בלבד, לא ייעוץ פיננסי או ייעוץ השקעות.</p>
</section>
```
- The plain, rule-based tips come first.
- The ones from Claude say "✨ העוזר החכם". At most three tips.

## Importing a bank file
```html
<section class="card" aria-labelledby="im-h"><h2 id="im-h">ייבוא מהבנק או מחברת האשראי</h2>
  <ol class="pr-steps"><li class="done">הקובץ</li><li aria-current="step">בדיקה</li><li>נשמר</li></ol>
  <!-- step 1 -->
  <label class="pr-drop">(file icon)<b>בחירת קובץ, או גרירה לכאן</b><small>Excel או CSV, כמו שהורדת מאתר הבנק</small><input type="file" accept=".csv,.xls,.xlsx"></label>
  <p class="pr-banks">…which banks and card companies are known…</p>
  <!-- step 2 -->
  <div class="pr-review-sum"><span class="pr-pill">4 חדשות</span><span class="pr-pill" data-state="unsure">1 לבדיקה</span><span class="pr-pill" data-state="dup">1 כבר רשומה</span></div>
  <ul class="pr-rows">
    <li class="pr-row pr-row-head" aria-hidden="true"><span></span><span>תאריך</span><span>מה</span><span>קטגוריה</span><span>סכום</span></li>
    <li class="pr-row" data-state="new|unsure|dup" data-c="1">
      <label class="pr-pick"><input type="checkbox" checked aria-label="לשמור: שופרסל דיל"></label>
      <span class="pr-row-date">12.11</span><span class="pr-row-what">שופרסל דיל רעננה</span>
      <select class="pr-row-cat" aria-label="קטגוריה: שופרסל דיל">…</select>
      <span class="pr-amt"><span class="pr-num">−342.5 ₪</span></span>
      <span class="pr-row-why">לא בטוח: העברה לאדם. לאיזו קטגוריה?</span>   <!-- unsure / dup only -->
    </li>
  </ul>
  <div class="pr-review-bar"><span><b>5 שורות</b> יישמרו · <span class="pr-num">+10,836.7 ₪</span></span><span><button class="btn ghost">ביטול</button><button class="btn primary">שמירה</button></span></div>
  <!-- step 3 -->
  <div class="pr-done">(check icon)<b>5 תנועות נשמרו</b><span class="pr-muted">הקטגוריות שתיקנת ייזכרו לפעם הבאה.</span><a class="btn" href="#">לסקירה</a></div>
</section>
```
**The rows**
- A `dup` row comes unticked and struck through.
- An `unsure` row has a gold edge and its question in `.pr-row-why`.
- When the category changes, update the row's `data-c` so the select's edge takes the colour.

**The drop zone**
- `.pr-drop.over` while a file is dragged over it.

**Layout**
- Under 700px each row becomes a small card.
- The bar stays at the bottom above the tab bar.

## The icons (for `ICONS` in common.js: the master's file)
```js
parnasa: '<path d="M4 8h15a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 20H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M4 8V7a2 2 0 0 1 1.6-2L15 3.2a1 1 0 0 1 1.2 1V8"/><path d="M20.5 12H17a2 2 0 0 0 0 4h3.5"/><circle cx="17.2" cy="14" r=".9" fill="currentColor"/>',
```
The page's own icons can live in parnasa.js:
- plus `<path d="M12 5v14M5 12h14"/>`
- out `<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>`
- in `<circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/>`
- file `<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5M12 17v-6M9.5 13.5 12 11l2.5 2.5"/>`
- bulb `<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>`
- check `<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16.5 9.5"/>`
- repeat `<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11.5V10a4 4 0 0 1 4-4h13"/><path d="M7 21.5 3.5 18 7 14.5"/><path d="M20.5 12.5V14a4 4 0 0 1-4 4h-13"/>`
- trend `<path d="M3.5 17 9.5 11l4 4 7-8"/><path d="M15 7h5.5v5.5"/>`
- chevrons: previous month (points to the right in RTL) `<path d="m9 6 6 6-6 6"/>`, next month `<path d="m15 6-6 6 6 6"/>`

## The cushion and the apps entry
The new cushion is `p16`: teal tatreez with a gold eight-point star, `public/assets/pillows/p16.webp`, glow `#2b7a70`. The entry for `H.APPS`:
```js
{ href: '/tools/parnasa/', ic: 'parnasa', name: 'פרנסה', sub: 'הכסף של הבית: הכנסות, הוצאות וחיסכון', pillow: 'p16', c2: '#2b7a70' },
```
