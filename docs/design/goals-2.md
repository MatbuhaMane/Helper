# Goals part 2: advice, sharing, phone notifications, storage (the look, batch 28)

_Design, 2026-11-14. The logic is ai-features'. Where the CSS is:_
- _`public/tools/tasks/goals.css`, section "part 2": the advice window, conclusions, "עזור לי להגדיר", sharing;_
- _`public/family/family.css`, section "shared goals on a person's profile";_
- _`public/settings/settings.css`, sections "notifications" and "connect your storage"._

Every control is at least 44 px on touch. Motion is `transform` and `opacity` only. The audit is clean at 375 and 1280 px, in light and dark mode.

## 1. A goal's page: the advice window and the pinned conclusions

```html
<div class="gl-split">                       <!-- from 1000 px: the content, plus a sticky advice column at the inline end -->
  <div>
    …the hero, the processes…
    <section class="card gl-pins"><h2>מה החלטנו</h2><ul>
      <li class="gl-pin"><p>the conclusion</p><small>אתמול</small><button type="button" aria-label="הסר מסקנה"></button></li>
    </ul></section>
  </div>
  <section class="card gl-ask">
    <div class="gl-ask-head"><h2>התייעצות</h2><span class="gl-quota">נשארו 8 היום</span></div>   <!-- .gl-quota.low near the end -->
    <div class="gl-ask-log">
      <p class="gl-ask-empty">…shown before the first question…</p>
      <p class="gl-say me">question</p>
      <div class="gl-say ai">answer<button class="gl-keep" type="button" aria-pressed="false">שמור מסקנה</button></div>
      <p class="gl-say ai typing" aria-label="חושב"><i></i><i></i><i></i></p>
    </div>
    <div class="gl-ask-chips"><button type="button">מה הצעד הבא?</button>…</div>
    <form class="gl-ask-form"><textarea aria-label="שאלה"></textarea><button class="gl-ask-send" aria-label="שליחה"></button></form>
    <p class="gl-ask-note">חינם עד מכסה יומית.</p>
  </section>
</div>
```

- **On a phone** the advice sits under the processes. Opening it in `H.modal` is fine too.
- **"שמור מסקנה":** once pressed, set `aria-pressed="true"` and the text "נשמר במטרה". The conclusion is added to `.gl-pins`.
- **The send button's chevron** is drawn in CSS. Leave it empty and keep `aria-label`.

## 2. "עזור לי להגדיר" (a new goal, step 1)

- **The button:** `<button class="gl-helpdef">✨ עזור לי להגדיר</button>`, under the goal's field.
- **The chat:** the same `.gl-ask` opens inside `.gl-new`, flat, with no card.
- **The AI's wording** comes back as a draft:

```html
<div class="gl-draft"><small>הצעה לנוסח</small><b>the goal</b><p>the why</p>
  <div class="gl-draft-acts"><button class="btn primary">השתמש בנוסח</button><button class="btn">נמשיך לדבר</button></div></div>
```

## 3. A shared goal

- **On the goal's page:** `<div class="gl-share"><span>פרטית כברירת מחדל</span><button class="priv-chip" data-level="me">…</button></div>`. The chip opens `.priv-pick` (see `friends.md`).
- **On the person's profile in the tree** (a "מטרות" tab, showing only the levels the viewer may see):

```html
<ul class="fv-goals"><li><a class="fv-goal" href="…"><span class="fv-goal-ring" style="--p:62" aria-hidden="true"></span>
  <b>name</b><small>השבוע 4 מתוך 7</small><span class="priv-tag" data-level="family"><span class="priv-ic"></span>משפחה</span></a></li></ul>
```

## 4. Settings: "גם כהודעה לטלפון" per kind

```html
<ul class="st-ntfs">
  <li class="st-ntf"><div><b>תזכורת למטרות</b><small>when and what</small></div>
    <label class="st-switch"><input type="checkbox" aria-label="תזכורת למטרות גם כהודעה לטלפון"><span>גם כהודעה לטלפון</span></label></li>
  <li class="st-ntf fixed">…a kind on the default list: the input checked and disabled, the reason in small…</li>
</ul>
<p class="st-quiet">שעות השקט והשבת חלות על כל ההודעות.</p>
```

- **The switch** is the existing `.st-switch`, with a small phone mark before it.
- **Under 480 px** its text is hidden; the `aria-label` keeps its name.

## 5. Connect your storage (later: it waits for the CEO's review of the Drive permission)

```html
<section class="st-store"><h2>האחסון שלך</h2><p class="muted">…</p>
  <div class="card st-service" data-store="drive"><h3>Google Drive</h3>
    <span class="st-store-state" data-s="wait|sync|error">ממתין לאישור</span>
    <ul class="st-store-what"><li>תמונות המשפחה</li>…</ul>
    <div class="st-meter" style="--p:38">נוצלו 5.7 מתוך 15 GB<i></i></div>     <!-- .st-meter.full when full -->
    <button class="btn primary">חיבור</button></div>
  <div class="card st-service" data-store="nas"><h3>NAS בבית</h3>
    <form class="st-nas-form"><input type="url" aria-label="כתובת ה־NAS"><button class="btn">חיבור</button></form></div>
</section>
```

- **The cards** are the existing `.st-service`, so a connected card gets the same green line as the services.
