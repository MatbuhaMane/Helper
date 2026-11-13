# "סיכום היום" every day: the card of the day (design → master)

Vision batch 16 (2026-11-14). This adds to `docs/design/seasons.md` §3, which keeps what it says about the messages ("היום" and "מאז").
- **New:** the card shows on every first open of the day, also on a day with no messages. Then it is a short card of the day: the Hebrew date, the weather, birthdays and what is on the calendar.
- **Where things are:** the look is in `public/assets/seasons.css`. The sample is `docs/design/prototype/daily.html`; copy it to `public/` to view it.
  - `?mode=quiet` (the default): no messages, but birthdays and the calendar.
  - `?mode=bare`: nothing at all today.
  - `?mode=full`: with messages.
  - `&fri=1`: the candles in place of the sunset.
  - `&theme=dark`: dark mode.
- **Checked:** at 375 and at desktop width, light and dark, with no sideways overflow. Text contrast is 5.6:1 and more, icons 4.1:1 and more.

## The markup
```html
<section class="dsum" aria-labelledby="dsum-h">
  <header class="dsum-head">
    <span class="dsum-leaf" aria-hidden="true"><b>כ״ג</b><small>חשון</small></span>        <!-- new -->
    <div><h2 id="dsum-h">סיכום היום</h2><p>יום שלישי, כ״ג בחשון · 14 בנובמבר</p></div>
    <button class="dsum-close" type="button" aria-label="סגירת הסיכום">(x)</button></header>
  <div class="dsum-body">
    <ul class="dsum-facts" aria-label="היום בקצרה">                                          <!-- new, always first -->
      <li class="dsum-fact-wx" data-sky="part"><a href="/weather/">(icon)<span><b>22°</b><small>מעונן חלקית · בלילה 14°</small></span></a></li>
      <li class="dsum-fact-sun">(sunset icon)<span><b>16:43</b><small>שקיעה</small></span></li>
    </ul>
    <section aria-labelledby="dsum-today">…"היום", as in seasons.md, now with the calendar…</section>
    <section aria-labelledby="dsum-since">…"מאז הסיכום הקודם", only when there are messages…</section>
    <p class="dsum-calm">(leaf icon)אין הודעות חדשות מאז אתמול.</p>                          <!-- only with no messages -->
  </div>
</section>
```

## The leaf
- The leaf is the Hebrew day in letters, with the month under it. Build the letters with the same gematria as `server/hebdate.ts` (כ״ג, ט״ו, ט״ז).
- The month is `Intl.DateTimeFormat('he-u-ca-hebrew', { month: 'long' })`.
- The leaf is decorative (`aria-hidden`), since the line under the title says it in full. That line is the Hebrew date, then " · ", then the Gregorian day and month.

## The facts row (`.dsum-facts`)
- **The weather** (`li.dsum-fact-wx`, a link to `/weather/`):
  - `b`: the temperature now.
  - `small`: the sky's words from `sky()` in `server/weather-logic.ts`, then " · בלילה {min}°".
  - The place is the user's own, as on the weather page. If there is no weather (offline, no place), leave the `li` out.
- **`data-sky` and the icon,** by the emoji `sky()` returns:

  | emoji | data-sky | icon (`viewBox="0 0 24 24"`, stroke 1.6) |
  |---|---|---|
  | ☀️ | sun | `<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>` |
  | 🌙 | moon | `<path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z"/>` |
  | 🌤️ ⛅ | part | `<circle cx="9" cy="9" r="3.5"/><path d="M9 2.5v1.5M2.5 9H4M4.4 4.4l1 1M13.6 4.4l-1 1"/><path d="M8 20h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.3 1.2A3 3 0 0 0 8 20z"/>` |
  | ☁️ | cloud | `<path d="M7 19h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 19z"/>` |
  | 🌫️ | fog | `<path d="M7 13h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 13z"/><path d="M4 17h16M6 20.5h12"/>` |
  | 🌦️ 🌧️ | rain | `<path d="M7 15h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 15z"/><path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>` |
  | ⛈️ | storm | the rain cloud (its first path) and `<path d="M12.5 16.5l-2 3h3l-2 3"/>` |
  | 🌨️ ❄️ | snow | the rain cloud (its first path) and `<path d="M8 18v2M7 19h2M12 19.5v2M11 20.5h2M16 18v2M15 19h2"/>` |

  - Each icon carries `class="icon" fill="none" stroke="currentColor"`.
  - The colour comes from `data-sky`: amber for sun and part, grey for cloud and fog, blue for rain, storm and snow, dusk for moon.
- **The sunset** (`li.dsum-fact-sun`):
  - `b` is `H.sunNow().set` as HH:MM, and `small` is "שקיעה".
  - The icon: `<path d="M3 17.5h18M6.5 17.5a5.5 5.5 0 0 1 11 0"/><path d="M12 4.5v4M9.5 7 12 9.5 14.5 7M4.2 12.2l1.3.8M19.8 12.2l-1.3.8M7 20.5h10"/>`.
- **Friday and holiday eves:** in place of the sunset, `li.dsum-fact-candles`, with `b` the candle lighting time and `small` "הדלקת נרות". Use the candles icon from seasons.md. The candles row in "היום" then stays out, so the time is not shown twice.
- **Widths:** the weather takes the room, and a time keeps to its own size. On a phone the two sit side by side.

## "היום" on a day of the card
- It has the same rows as seasons.md, and now the calendar too:
  - a family birthday: `--c:#b8457a`, cake, "יום הולדת לסבתא רבקה", with "בת 82 היום · לשלוח ברכה";
  - each calendar item of today: `--c:#2a7fa8`, with this calendar icon:
    `<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>`.
    - `.dsum-when` holds its time; an all-day item has no time.
    - A personal reminder keeps `#3b6634`.
- Still at most three rows, with the rest behind `.dsum-more`.
- Birthdays come first, then the calendar by its time.

## A quiet day
- **No messages, but things today:**
  - the facts, then "היום", then `p.dsum-calm`: "אין הודעות חדשות מאז אתמול.";
  - "מאז" is left out;
  - on a desktop, the lone section takes the whole width.
- **Nothing today and no messages:**
  - the facts, then `p.dsum-calm`: "יום שקט: אין היום שום דבר בלוח, ולא חיכה לך כלום.";
  - the card is still shown. It is the card of the day, and it is short.
- **The calm line's icon** (a leaf):
  `<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19 13 11"/>`.
- **Today's line in index.html:** it ends with the sunset ("השקיעה היום ב־…"). Drop that sentence, since the sunset now has its own fact.

## What does not change
- The close button and `.leaving`, the focus after closing, and the once-a-day rule (per user on the server).
- The motion: the card comes in with opacity and transform only.
