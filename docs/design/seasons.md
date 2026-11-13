# The Shabbat screen, the holiday tent and "סיכום היום": the markup contract (design → ai-features, master)

**Sources**
- The look is in `public/assets/seasons.css`. Load it after base.css, and after care.css: the Shabbat screen reuses the emergency button.
- The tent's dressings are `public/assets/holidays/<id>.svg`.
  - They are drawn in the tent picture's own coordinates (1400 × 794, not mirrored) and in its style: dark ink outlines and flat colours.
  - They come from `docs/design/holidays/holidays.py`. Change the generator, not the SVGs.
- The sample is `docs/design/prototype/seasons.html`. To view it, copy it to `public/` and open one of:
  - `?view=home&holiday=hanukkah&night=3`, or any `<id>` from the list below;
  - `&sum=0` to hide the card, or `&sum=calm` for a quiet day;
  - `?view=shabbat`, with `&holiday=pesach` for a festival;
  - `&theme=dark` on any of them.
- The decision is in vision's `docs/vision/shabbat-notifications.md` (batch 13, 2026-11-13).

**What was checked**
- 375 and 1280, light and dark.
- No sideways scroll.
- Text contrast is 4.5:1 and more everywhere.

## 1. The holiday tent (the home, `index.html`, the master's file)

### The markup
One picture over the tent, after the tent's `<img>` and its light layers, and before Ibn Ezra (`.wake`):
```html
<div class="camp">
  <img srcset="/assets/tent-700.webp …" …>          <!-- as today -->
  …tent-light layers…
  <img class="holiday" src="/assets/holidays/hanukkah.svg#n3" alt="" aria-hidden="true">
  ….wake, .dock…
</div>
```
- The CSS places it over the tent at exactly the same size, without catching the mouse, and fades it in.
- The tent picture is not mirrored, and neither is the dressing.
- When there is no holiday, leave out the `<img>`.

### Hanukkah
- `#n1` … `#n8` light that night's candles, plus the shamash.
- The candles are added from the right, as the Shulchan Arukh says (OC 676:5).
- With no fragment, all eight are lit.
- The night runs from sunset: the 25th of Kislev in the evening is `#n1`.

### The line under the tent (optional, on a holiday)
```html
<div class="hol-band"><b>חנוכה שמח</b><small>נר שלישי, הערב</small>
  <a class="hol-gather" href="(opens a family gathering for the holiday)">(gather icon) נתכנס לחג</a></div>
```
- "נתכנס לחג" opens a new gathering with the holiday's name and date already filled in.
- On Shabbat there is no line; the candles are enough.

### Which dressing, when
The dates come from `server/hebdate.ts`, which belongs to ai-features. Each dressing shows from the eve, at sunset, to the end of the holiday.

| id | Name | When it shows | What is drawn | Source |
|---|---|---|---|---|
| `shabbat` | שבת | Friday at candle lighting until havdalah (in the home, for those who don't keep Shabbat mode) | two candlesticks and a challah under a cloth on the mat | candle lighting: SA OC 263; covering the bread: SA OC 271:9 |
| `rosh-hashanah` | ראש השנה | 1–2 Tishrei | honey, apples, a pomegranate on a tray; a shofar on the crates | the "סימנים": Keritot 6a, SA OC 583:1 |
| `sukkot` | סוכות | 15–22 Tishrei (Simchat Torah included) | schach (palm fronds) on the roof and the front edge, fruit hanging between the poles | schach: Mishnah Sukkah 1; hanging fruit and decorations: Sukkah 10a |
| `hanukkah` | חנוכה | 25 Kislev – 2/3 Tevet | a brass hanukkiah on the mat, with the night's candles | SA OC 671, 676:5 |
| `tu-bishvat` | ט"ו בשבט | 15 Shevat | almond blossom on the front poles | the almond blooms first (Jeremiah 1:11) |
| `purim` | פורים | 14 Adar (15 in Jerusalem) | bunting of colourful pennants between the poles | "ימי משתה ושמחה" (Esther 9:22) |
| `pesach` | פסח | 15–21 Nisan (22 outside Israel) | matzot, a seder plate, Elijah's cup | Mishnah Pesachim 10 |
| `yom-haatzmaut` | יום העצמאות | 5 Iyar (as moved by the calendar) | a string of flags between the poles, a flag on the middle pole | — |
| `shavuot` | שבועות | 6 Sivan (7 outside Israel) | a garland of green and flowers, sheaves of wheat | greens: Rema OC 494:3; "ביכורי קציר חטים" (Exodus 34:22) |

**Lag BaOmer** needs no dressing: the bonfire is already in the home.

**Not dressed, on purpose**
- Fast days and Tisha B'Av get no dressing.
- Yom Kippur gets the Shabbat screen, with "גמר חתימה טובה" in place of "שבת שלום".
- Yom HaZikaron and Yom HaShoah get no dressing and no bunting. A memorial candle could be added later, with the owner's approval.

### The other traditions (the mechanism is ready; the drawing waits)
The same `<img class="holiday">` and the same way of choosing serve the user's chosen tradition. The suggestions below are **not final and not drawn**:
- Ramadan: a crescent and lanterns.
- Eid al-Fitr: bunting and sweets.
- Christmas: a star and branches.
- Easter: spring flowers.

Vision decided that the names, the dates and the look are set with a source or partner from each tradition. Until then, nothing is drawn.

## 2. The calm Shabbat screen

### When it shows
- Shabbat mode is on in settings.
- It shows from candle lighting to havdalah, by the city in settings.
- It shows instead of the app, over everything.
- During it there are no notifications and nothing is sent, except an emergency.

### The switch
- Put `.shb` as a direct child of `<body>` and set `data-shabbat` on `<html>`.
- The CSS then hides everything else on the page (visibility, so screen readers skip it too), toasts included, and stops the page behind from scrolling.
- The emergency sent screen (`.sos-screen`, also a direct child of `<body>`) still comes over it.
- At havdalah, remove the attribute and the screen.

### The markup
```html
<div class="shb" role="dialog" aria-modal="true" aria-labelledby="shb-h"><div class="shb-in">
  <figure class="shb-tent"><img srcset="(the tent, as in the home)" alt='האוהל של רַאבַּ"ע'>
    <img class="holiday" src="/assets/holidays/shabbat.svg" alt="" aria-hidden="true"></figure>
  <h1 class="shb-h" id="shb-h">שבת שלום</h1>
  <p class="shb-par">פרשת וַיִּשְׁלַח</p>
  <dl class="shb-times"><div><dt>הדלקת נרות</dt><dd>16:21</dd></div><div><dt>צאת השבת</dt><dd>17:35</dd></div></dl>
  <p class="shb-city">לפי ירושלים</p>
  <p class="shb-note">האוהל נח בשבת. אין התראות, ושום דבר לא נשלח בשמך. נתראה במוצאי שבת.</p>
  <section class="sos" aria-label="קריאה לעזרה">…as in care.md, with the text "חירום? לחצו והחזיקו 3 שניות" / "גם בשבת, כל המשפחה תקבל הודעה מיד."</section>
  <a class="shb-anyway" href="…">כניסה לאוהל בכל זאת</a>   <!-- optional: the owner's or vision's call -->
</div></div>
```

**The emergency button**
- It is exactly the one in `care.md`: the same hold for 3 seconds, the same sent screen, the same red.
- Here it is smaller (92 px) and has no red field around it.
- It works whether or not grandparents mode is on.

**On a festival**
- "חג שמח" in place of "שבת שלום".
- The holiday's name in place of the parasha.
- "צאת החג" in place of "צאת השבת".
- The holiday's dressing in place of the candles. On a festival that falls on Shabbat, use the holiday's dressing.

**The light**
- The candles' light breathes slowly on the mat.
- It stays still when less motion is asked for.
- At night the tent is a little darker.

**The pre-Shabbat reminder (Friday morning, the notification)**
- Title: "שבת שלום מהאוהל".
- Body: "הדלקת נרות ב־16:21 · ברשימת הקניות 4 דברים · מגיעים: סבתא, דנה ויוסי".
- Use the maqaf `ב־` before the time.

## 3. "סיכום היום" (the top of the home)

### When it shows
- On the first open of the day, after the greeting and before the tent.
- Once closed, it doesn't come back until tomorrow. Remember this per user on the server, not in `localStorage`, so it follows the person between devices.

### The markup
```html
<section class="dsum" aria-labelledby="dsum-h">
  <header class="dsum-head"><div><h2 id="dsum-h">סיכום היום</h2><p>יום שישי, י"ב בכסלו</p></div>
    <button class="dsum-close" type="button" aria-label="סגירת הסיכום">(x)</button></header>
  <div class="dsum-body">
    <section aria-labelledby="dsum-today"><h3 class="dsum-sub" id="dsum-today">היום</h3>
      <ul class="dsum-list">
        <li><a href="…"><span class="dsum-ic" style="--c:#b8457a">(cake)</span>
          <span class="dsum-txt"><b>יום הולדת לנועה</b><small>בת 9 היום · לשלוח ברכה</small></span></a></li>
        <li><a href="…"><span class="dsum-ic" style="--c:#2a7fa8">(gather)</span>
          <span class="dsum-txt"><b>ארוחת שישי אצל סבתא</b><small>8 מגיעים · דנה מביאה סלטים</small></span><span class="dsum-when">19:00</span></a></li>
      </ul>
      <a class="dsum-more" href="…">ועוד תזכורת אחת להיום</a></section>
    <section aria-labelledby="dsum-since"><h3 class="dsum-sub" id="dsum-since">מאז הסיכום הקודם</h3>
      <ul class="dsum-quiet"><li><a href="…">(book)<span><b>2</b> מתכונים חדשים</span></a></li> …</ul></section>
  </div>
</section>
```

### From `GET /api/digest` (`{items:[{kind,title,body,url,created_at}]}`)
This card replaces the `H.modal` with `ul.digest`; it sits in the page and does not cover it. Sort each item by its `kind`:
- **A row in "היום"**, for something happening today. The row is `<li><a href="{url}"><span class="dsum-ic" style="--c:…">(icon)</span><span class="dsum-txt"><b>{title}</b><small>{body}</small></span><span class="dsum-when">{HH:MM}</span></a></li>`.
  - `.dsum-when` only when the item has a time of day, as `16:21`. Leave out `<small>` when there is no body.
  - Kinds, with colour and icon:

    | kind | colour | icon |
    |---|---|---|
    | birthday | `#b8457a` | cake |
    | gathering | `#2a7fa8` | gather |
    | candles | `#b07a1e` | candles |
    | memorial | `#6b6a75` | candles |
    | reminder, and any unknown kind | `#3b6634` | bell |
- **A chip in "מאז הסיכום הקודם"**, for new content (recipe, photo, message, song, note).
  - Count the items of each kind into one chip: `<li><a href="(the tool)">(icon)<span><b>{n}</b> {words}</span></a></li>`.
  - The kinds and words: recipe "מתכונים חדשים" (book), photo "תמונות באלבום" (photo), message "הודעות בקבוצה" (chat), song "שירים בשירון" (music), note "פתקים" (H.icon('note')).
  - With one item, use the singular: "מתכון חדש", "תמונה", "הודעה", "שיר", "פתק".
- Leave out a section that has nothing. With neither, use the quiet day below, or no card at all.
- The date line under the title is the Hebrew date, as the greeting writes it.

**"היום"**
- At most three rows; the rest go behind `.dsum-more`.
- In order: an emergency or something unresolved, a family birthday or memorial day, a gathering, candle lighting (Friday and holiday eves), and the user's own reminders.
- Each row has an icon colour (`--c`):
  - birthday `#b8457a`;
  - gathering `#2a7fa8`;
  - candles `#b07a1e`;
  - reminder `#3b6634`;
  - memorial day `#6b6a75`.

**"מאז הסיכום הקודם"**
- Counts only, one chip per kind: recipes, photos, messages, songs, notes.
- On a phone the chips run in one row that scrolls sideways, so the card stays short and the tent still shows.

**A quiet day**
- In place of both sections: `<div class="dsum-body"><p class="dsum-calm">יום שקט. אין היום שום דבר מיוחד, ומאז אתמול לא נוסף כלום.</p></div>`.
- If there is nothing at all, there's no need to show the card.

**Closing**
- Add `.leaving`, and remove the card on `animationend`. With less motion there is no animation, so remove it at once.
- Then move the focus to the greeting.

**The layout**
- From 760 px, "היום" and "מאז" sit side by side.

### The icons (the page's own; the master may move them into ICONS)
- x `<path d="M6 6l12 12M18 6 6 18"/>`
- cake `<path d="M4.5 20.5h15v-6.5a2 2 0 0 0-2-2h-11a2 2 0 0 0-2 2z"/><path d="M4.5 16c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 1.5-1.2 1.5-1.2"/><path d="M12 12V8.5"/><path d="M12 4c1 1.2 1 2.4 0 3-1-.6-1-1.8 0-3z"/>`
- candles `<path d="M8 21V11M16 21V11"/><path d="M8 4.5c1.2 1.3 1.2 2.8 0 3.5-1.2-.7-1.2-2.2 0-3.5zM16 4.5c1.2 1.3 1.2 2.8 0 3.5-1.2-.7-1.2-2.2 0-3.5z"/><path d="M5 21h14"/>`
- photo `<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4.5 17.5 5-4.5 3.5 3 2.5-2 4 3.5"/>`
- chat `<path d="M5 18.5V7a2.5 2.5 0 0 1 2.5-2.5h9A2.5 2.5 0 0 1 19 7v6a2.5 2.5 0 0 1-2.5 2.5H9z"/>`
- gather `<circle cx="8" cy="9" r="2.6"/><circle cx="16" cy="9" r="2.6"/><path d="M3.5 19c.6-3 2.4-4.6 4.5-4.6s3.9 1.6 4.5 4.6M11.5 19c.6-3 2.4-4.6 4.5-4.6s3.9 1.6 4.5 4.6"/>`
- bell: as in care.md.
- book and music come from `H.icon`.
