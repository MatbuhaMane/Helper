# Grandparents mode, the emergency button, kids mode: the markup contract (design → ai-features)

**Sources**
- The look is `public/assets/care.css`. It is loaded after base.css by the home (`index.html`, the master's file) and by the alert page.
- The sample with every state is `docs/design/prototype/care.html`. To view it, copy it to `public/` and use:
  - `?view=gp`;
  - `?view=hold&p=0.6`;
  - `?view=sent`, with `&left=7` or `&coming=1`;
  - `?view=alert`, with `&taken=1`, `&mine=1` or `&noloc=1`;
  - `?view=kids`;
  - `&theme=dark` on any of them.
- The decision is in vision's `docs/vision/grandparents-kids.md` (2026-11-13).

**What was checked**
- 375 and 1280, light and dark.
- Text contrast is 4.5:1 and more. The large text on the red button and on the alert's red head is 5.2:1 and more.

**The emergency red**
- It is a token of its own, `--sos`, and is used for nothing else in the hub. It should never look like an ordinary delete.
- Someone being on the way is `--care-ok`, a calm green.

## The read-aloud button (`.gp-speak`)
```html
<button class="gp-speak" type="button" aria-label="הקראה בקול: בוקר טוב, סבתא רחל" aria-pressed="false">(speaker icon)</button>
```
- It is a round 48 px button with the speaker icon. The two wave strokes carry `class="gp-wave"`.
- It reads only when tapped; nothing reads by itself. While it reads, set `aria-pressed="true"`: the button fills in and the waves pulse.
- Tapping it again stops the reading.
- Use `speechSynthesis` with `lang = 'he-IL'`, or the hub's own voice if there is one.
- Put one beside each text: `<div class="gp-say"><h1>…</h1>(button)</div>`. On a tile it sits in the corner as a sibling of the link, never inside it.

## The grandparents' home (`.gp-home`)
```html
<main class="gp-home">
  <header class="gp-head">
    <div class="gp-say"><h1>בוקר טוב, סבתא רחל</h1>(speak)</div>
    <div class="gp-say"><p>יום שישי, י"ב בכסלו</p>(speak)</div>
  </header>
  <ul class="gp-tiles">
    <li class="gp-tile" style="--c2:#8a5a32"><a href="/family/"><img src="/assets/pillows/p15.webp" alt=""><b>המשפחה</b></a>(speak)</li>
    <li class="gp-tile" style="--c2:var(--primary)"><a href="…"><span class="gp-tile-ic">(H.icon('mic'))</span><b>לשאול בקול</b></a>(speak)</li>
    … four tiles in all …
  </ul>
  <section class="sos" aria-label="קריאה לעזרה">…the emergency button…</section>
  <a class="gp-more" href="/tools/">(grid icon) עוד</a>
</main>
```
**The tiles**
- Exactly four: 2×2 on a phone, four in a row from 760 px.
- Each tile is its app's cushion with its `c2` from `H.APPS`.
- Asking the helper by voice is the one tile with an icon in a primary circle instead of a cushion.
- The family chooses the fourth tile.

**The text**
- The text is large: `font-size: 1.25rem` on the root of the mode.
- It still follows the text-size, high-contrast and less-motion settings, since everything is in rem and in the tokens.

**The order**
- The emergency button comes right after the tiles, so it is in view without scrolling.
- "עוד" comes last.

## The emergency button (`.sos`)
```html
<section class="sos" aria-label="קריאה לעזרה">
  <button class="sos-btn" type="button" style="--p:0" aria-describedby="sos-how"><span class="sos-core">(bell icon)<b>עזרה</b></span></button>
  <p class="sos-how" id="sos-how" aria-live="polite"><b>לחצו והחזיקו 3 שניות</b><span>כל המשפחה תקבל הודעה מיד.</span></p>
</section>
```
**Holding it**
- **Start:** on `pointerdown`, or on `keydown` of Enter or Space without repeat, add `.holding`.
- **The ring:** run `requestAnimationFrame` that sets `--p` from 0 to 1 over 3000 ms; the ring fills as a conic gradient.
- **Vibration:** call `navigator.vibrate(…)` when the hold starts and a short pulse each second. Wrap it in a check, since iPhone has no vibration.
- **The text while holding:** `<b>ממשיכים להחזיק…</b><span>עוד <span class="sos-left">2</span> שניות</span>`, updated each second.
- **Releasing early:** on `pointerup`, `pointercancel`, `pointerleave` or `keyup` before 3 s, remove `.holding`, set `--p:0`, and restore the text. Nothing is sent.
- **At 3 s:** send the alert, give one long vibration, and open the sent screen.

**The pointer**
- `touch-action: none` and no text selection are already in the CSS, so a long press does not open the phone's menu.
- Call `preventDefault` on `contextmenu`.

**The size**
- 128 px, with the instruction beside it.
- Under 340 px the instruction moves underneath.

## The sent screen (the person who pressed)
```html
<div class="sos-screen" role="alertdialog" aria-modal="true" aria-labelledby="ss-h" aria-describedby="ss-d"><div class="sos-screen-in">
  <header class="sos-top"><span class="sos-top-ic">(bell)</span><h2 id="ss-h">ההודעה נשלחה למשפחה</h2><p id="ss-d">כל בני הבית קיבלו התראה. המיקום שלך צורף.</p></header>
  <div class="sos-cancel"><button class="sos-undo" type="button">לחצתי בטעות, לבטל <span class="sos-left" aria-hidden="true">7</span></button>
    <span class="sos-timer" aria-hidden="true"><i style="--t:.7"></i></span></div>
  <!-- once someone presses "אני מטפל", in place of the cancel: -->
  <div class="sos-coming" role="status">(check)<div><b>דנה בדרך אלייך</b><span>היא לחצה "אני מטפלת" ב־10:43</span></div></div>
  <section class="sos-who">…</section>
  <section class="sos-call">…</section>
</div></div>
```
**Cancelling**
- `.sos-undo` counts down from 10. `--t` goes from 1 to 0, one step a second; the bar has a 1 s linear transition.
- At 0 the cancel block is removed.
- A cancel tells the family "בוטל, הכל בסדר".

**When someone is on it**
- When someone presses "אני מטפל", `.sos-coming` replaces the cancel block (or appears first, if the cancel is already gone).
- Say who, and the time.

**Wording**
- Without consent to share location, the second sentence is "המיקום לא צורף." Never ask for the location at this moment.
- Write the time as `ב־10:43`, with a maqaf (U+05BE) and not a hyphen, so the time does not jump to the other side.

### Who got it (shared by both screens)
```html
<section class="sos-who" aria-labelledby="who-h"><h3 id="who-h">מי קיבל</h3><ul>
  <li data-state="on-it"><i class="sos-face">ד</i><b>דנה</b><span class="sos-state">מטפלת</span></li>
  <li data-state="seen">… ראה</li> <li data-state="sent">… נשלח</li>
</ul></section>
```
- `.sos-face` holds an initial or `<img alt="">`.
- Put the person who is on it first.
- More than one person can be on it.

### The three numbers (shared)
```html
<section class="sos-call" aria-labelledby="call-h"><h3 id="call-h">צריך עזרה מיד? חיוג לחירום</h3>
  <ul class="sos-dial">
    <li><a href="tel:101">(phone)<b>101</b><span>מגן דוד אדום</span></a></li>
    <li><a href="tel:100">(phone)<b>100</b><span>משטרה</span></a></li>
    <li><a href="tel:102">(phone)<b>102</b><span>כבאות</span></a></li>
  </ul><p class="sos-note">הלחיצה פותחת את החייגן עם המספר, ועוד לחיצה מתקשרת.</p></section>
```

## The alert the household gets
**The notification**
- Title: "סבתא רחל ביקשה עזרה".
- Body: "לחצו כדי לראות איפה היא ולהגיד שאתם מטפלים".
- Settings: `requireInteraction: true`, `renotify: true`, a `tag` per alert, and `vibrate: [400,150,400,150,400]`.
- Tapping it opens the page below.

**The page**
```html
<main class="sos-alert">
  <header class="sos-alert-top" role="alert"><span class="sos-bell">(bell)</span><div><h1>סבתא רחל ביקשה עזרה</h1><p>לפני 2 דקות · 10:42</p></div></header>
  <section class="sos-where">(pin)<div><b>רחוב הגפן 12, רעננה</b><small>מדויק עד 20 מטר · נשלח ב־10:42</small></div><a class="btn" href="(maps link)">פתיחה במפה</a></section>
  <!-- no location: <section class="sos-where" data-none>(pin)<div><b>אין מיקום</b><small>סבתא רחל לא אישרה שליחת מיקום.</small></div></section> -->
  <div class="sos-coming" role="status">…דנה מטפלת בזה…</div>      <!-- when someone else is on it -->
  <button class="sos-take" type="button" aria-pressed="false">(check) אני מטפל</button>
  <a class="btn sos-callback" href="tel:…">(phone) התקשרות לסבתא רחל</a>
  <section class="sos-who">…</section>
  <section class="sos-call">…</section>
</main>
```
**Pressing "אני מטפל"**
- Set `aria-pressed="true"` and change the text to "אני מטפל · כולם רואים".
- The others see "X מטפל בזה" in `.sos-coming`.
- The button stays available to them: more than one may help.

**The bell**
- It pulses, except when there is less motion.

## The kids' home (`.kd-home`)
```html
<main class="kd-home">
  <header class="kd-head"><img class="kd-buddy" src="(the companion's picture)" alt=""><div><h1>היי, נועם!</h1><p>מה עושים היום?</p></div></header>
  <form class="kd-ask"><input type="text" placeholder="מה תרצה לשאול את העוזר?" aria-label="שאלה לעוזר"><button type="button" aria-label="לשאול בקול">(mic)</button></form>
  <ul class="kd-tiles"><li><a href="/family/" style="--c2:#8a5a32"><img src="/assets/pillows/p15.webp" alt=""><b>עץ המשפחה</b><small>מי זה מי אצלנו</small></a></li> …</ul>
</main>
```
**The tiles**
- They come from the household's list for this child; the default is family tree, songbook, notes, recipes and figures.
- Each takes its cushion and `c2` from `H.APPS`, with a short subtitle written for kids.
- They are two columns on a phone and fill the row on a computer.

**The helper**
- The question goes to the helper in kids mode.
- `.kd-buddy` is optional: the companion figure's picture when there is one.

**What is not there**
- No "עוד".
- No search.
- Nothing for money, mail or the vault.

## The icons (the page's own; the master may move them into ICONS)
- speak `<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path class="gp-wave" d="M15.5 9a4 4 0 0 1 0 6"/><path class="gp-wave" d="M18 6.5a7.5 7.5 0 0 1 0 11"/>`
- more `<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>`
- bell `<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 21h4"/>`
- phone `<path d="M6.5 3.5h3l1.5 4.5-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/>`
- pin `<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>`
- check `<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16.5 9.5"/>`

## Texts for settings (beside the emergency switch)
- "הכפתור מודיע לבני הבית. הוא לא מחליף מוקד חירום או שעון מצוקה."
- "באייפון, ההתראה מגיעה רק כשהאוהל מותקן במסך הבית."
- "התראה לא עוקפת מצב שקט. כדאי לבקש מבני הבית לאפשר את ההתראות של האוהל."
