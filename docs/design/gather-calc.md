# The food calculator in the gathering (the look)

_Design, 2026-11-14. The logic is ai-features' (`public/gather/gather.js`, `public/gather/invite/invite.js`); the CSS is in
`public/gather/gather.css`, sections "The food calculator" and "Diet ticks"._

The host opens it from the "מי מביא מה" card with a button: `btn small ghost ga-calc-open`, text "מחשבון אוכל". The icon is drawn by the CSS.

The calculator opens with `H.modal(form)`:
- on a phone it is a bottom sheet;
- on a PC it is a window.

Every control is at least 44 px on a touch screen. Motion is `transform` and `opacity` only.

## The sheet

```html
<form class="ga-form ga-calc">
  <h2>מחשבון אוכל</h2>
  <p class="muted">כמה מגיעים ומה אוכלים, ונציע רשימה. אפשר לשנות הכול.</p>

  <!-- who comes: two steppers, the same .ga-count as the invitation's -->
  <div class="ga-calc-people">
    <div class="ga-count"><span>מבוגרים</span><button class="btn" type="button" aria-label="פחות">−</button><output>12</output><button class="btn" type="button" aria-label="עוד">+</button></div>
    <div class="ga-count"><span>ילדים</span> …same… </div>
  </div>

  <!-- one choice: pills (radio). The same .ga-seg for the kosher kind -->
  <fieldset class="ga-seg">
    <legend>הארוחה</legend>
    <label><input type="radio" name="meal" value="breakfast"><span>בוקר</span></label>
    <label><input type="radio" name="meal" value="lunch" checked><span>צהריים</span></label>
    <label><input type="radio" name="meal" value="dinner"><span>ערב</span></label>
    <label><input type="radio" name="meal" value="snacks"><span>כיבוד</span></label>
  </fieldset>

  <!-- of them: small steppers, how many eat what -->
  <fieldset class="ga-calc-diets">
    <legend>מתוכם</legend>
    <div class="ga-count small"><span>צמחונים</span> −  <output>2</output> + </div>
    <div class="ga-count small"><span>טבעונים</span> … </div>
    <div class="ga-count small"><span>ללא גלוטן</span> … </div>
  </fieldset>

  <fieldset class="ga-seg">
    <legend>כשרות</legend>
    <label><input type="radio" name="kosher" value="" checked><span>לא משנה</span></label>
    <label><input type="radio" name="kosher" value="meat"><span>בשרי</span></label>
    <label><input type="radio" name="kosher" value="dairy"><span>חלבי</span></label>
    <label><input type="radio" name="kosher" value="parve"><span>פרווה</span></label>
  </fieldset>

  <!-- the proposal -->
  <section class="ga-calc-list" aria-live="polite">
    <h3 class="ga-calc-head">ההצעה <small class="muted">9 מתוך 10 מסומנים</small></h3>
    <ul class="ga-calc-items">               <!-- aria-busy="true" while the proposal is being made: skeleton rows -->
      <li class="ga-calc-item">
        <input type="checkbox" checked id="ci-1" aria-label="לחם">
        <label for="ci-1">לחם</label>
        <input class="ga-qty" type="text" value="3 כיכרות" aria-label="כמות לחם">
        <button class="ga-calc-x" type="button" aria-label="הסרת לחם"></button>
      </li>
      <li class="ga-calc-item off">…</li>      <!-- unchecked: .off fades the name and the quantity -->
    </ul>
    <div class="ga-inline ga-calc-add">
      <input type="text" placeholder="פריט נוסף" aria-label="פריט נוסף">
      <button class="btn" type="button">הוספה</button>
    </div>
  </section>

  <div class="ga-calc-foot">
    <button class="btn primary" type="submit">הוספה למי מביא מה (9)</button>
  </div>
</form>
```

- **Skeleton:** while the list is being made, set `aria-busy="true"` on `.ga-calc-items` and put in 4 or 5 empty `<li class="ga-calc-item">`. Each one pulses gently.
- **Diet tag:** a row may carry a small tag for whom it is: `<small class="ga-kind">טבעוני</small>`, after the label. It uses the existing `.ga-kind`.
- **New row:** a row the person just added gets `.new` for one second. It arrives with a short slide.
- **The foot** sticks to the bottom of the sheet while the list scrolls. The button shows the number of checked rows.

## Diet ticks in the invitation (optional)

The ticks go in the RSVP card, after the count:

```html
<fieldset class="ga-diets">
  <legend>מישהו מכם…</legend>
  <label class="ga-tick"><input type="checkbox" value="veg"><span>צמחוני</span></label>
  <label class="ga-tick"><input type="checkbox" value="vegan"><span>טבעוני</span></label>
  <label class="ga-tick"><input type="checkbox" value="gf"><span>ללא גלוטן</span></label>
</fieldset>
```

- Each tick is a 44 px pill.
- When it is ticked, it fills with a light vine colour and shows a check mark.

## Class list

| Class | On | Note |
|---|---|---|
| `ga-calc-open` | the opening button | in "מי מביא מה" |
| `ga-calc` | the form (with `ga-form`) | the H.modal body |
| `ga-calc-people` | the two steppers | uses `.ga-count` |
| `ga-seg` | fieldset of radios | the meal and the kosher kind |
| `ga-calc-diets` | fieldset of small steppers | `.ga-count.small` |
| `ga-calc-list`, `ga-calc-head` | the proposal | |
| `ga-calc-items` (`aria-busy`) | the list | skeleton while busy |
| `ga-calc-item` (`off`, `new`) | a row | checkbox, label, `.ga-qty`, `.ga-calc-x` |
| `ga-calc-add` | the add-one field | with `.ga-inline` |
| `ga-calc-foot` | the primary button's place | sticky |
| `ga-diets`, `ga-tick` | the RSVP's diet ticks | optional |
