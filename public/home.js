// / – this page's script, moved out of the HTML so the site can forbid inline scripts (CSP script-src 'self', security review 2026-11-15 M2).

(async () => {
  const { el } = H;
  const root = document.getElementById('root');
  const qs = new URLSearchParams(location.search);
  const r = await H.me();
  H.header('');

  // the first-run setup wizard is the only onboarding (the owner, 2026-11-13): a person who has not finished it goes there once
  if (r.user && !H.prefs('me').welcomed) { location.replace('/welcome/'); return; }

  // not a member and not invited: ask the owner for access (server/access.ts); the ticket says who, the page never does
  function accessForm(t, email) {
    const name = el('input', { type: 'text', maxlength: '60', autocomplete: 'name', required: true });
    const note = el('textarea', { rows: '3', maxlength: '600', placeholder: 'למשל: חבר של המשפחה, ראיתי את האוהל אצל…' });
    const send = el('button', { type: 'submit', class: 'btn primary' }, 'שליחת בקשה');
    const box = el('form', { class: 'access-ask' },
      el('p', { class: 'notice warn' }, `החשבון ${email} עוד לא הוזמן לאוהל.`),
      el('p', {}, 'האוהל פתוח בהזמנה בלבד. אפשר לבקש הרשאה, והבקשה תגיע לבעלים.'),
      el('label', { class: 'field' }, el('span', {}, 'השם שלך'), name),
      el('label', { class: 'field' }, el('span', {}, 'מי את/ה, ולמה תרצו להצטרף? (לא חובה)'), note),
      send);
    box.addEventListener('submit', async (e) => {
      e.preventDefault();
      send.disabled = true;
      try {
        await H.api('/api/access/request', { method: 'POST', body: { t, name: name.value, note: note.value } });
        box.replaceChildren(el('p', { class: 'notice' }, 'הבקשה נשלחה. כשהבעלים יאשר, תגיע אליך הזמנה ואפשר יהיה להיכנס עם אותו חשבון.'));
      } catch (er) {
        const m = String(er?.code || er?.message || '');
        send.disabled = false;
        H.toast(m.includes('expired') ? 'עבר זמן רב מדי. התחברו שוב עם Google ונסו שוב.' : m.includes('too_many') ? 'יש היום הרבה בקשות. נסו שוב מחר.' : 'השליחה לא הצליחה. נסו שוב.');
      }
    });
    return box;
  }

  if (!r.user) {
    const next = qs.get('next') || '/';
    const err = qs.get('error');
    root.append(el('div', { class: 'card login' },
      el('h1', {}, 'הָאֹ֔הֶל'),
      el('p', {}, 'רשימת קניות משותפת, מתכונים, חדשות וסידור המייל – לכל המשפחה.'),
      err === 'not_invited' ? (qs.get('req') ? accessForm(qs.get('req'), qs.get('email') || '') : el('p', { class: 'notice warn' }, `החשבון ${qs.get('email') || ''} עוד לא הוזמן. בקשו ממנהל המשפחה להוסיף אתכם.`)) : null,
      el('a', { class: 'gbtn', href: '/api/auth/login?next=' + encodeURIComponent(next) },
        el('span', { html: '<svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.8l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.6 42.6 14.6 48 24 48z"/></svg>' }),
        'התחברות עם Google'),
      // a passkey a member already made (fingerprint, face, Windows Hello) signs in without Google (server/lock.ts)
      window.PublicKeyCredential ? el('button', { type: 'button', class: 'btn ghost', onclick: () => H.loadOnce('/assets/lock-screen.js').then(() => H.passkeySignIn(next)).catch(() => H.toast('הכניסה בטביעת אצבע לא הצליחה')) }, 'כניסה בטביעת אצבע') : null,
      r.dev ? el('p', {}, el('a', { href: '/api/auth/dev?email=' + encodeURIComponent(r.devEmail) + '&name=Mishael&next=/' }, 'כניסת תצוגה מקדימה (פיתוח)')) : null));
    return;
  }

  const u = r.user;
  const isOwner = u?.role === 'owner';
  // greeted by the Hebrew name (Google gives English names): the one set in the helper, or a Google name already in Hebrew
  const heFirst = (s) => (s && /[\u0590-\u05FF]/.test(s) ? s.trim().split(/\s+/)[0] : '');
  const first = u.he_name?.trim() || heFirst(u.name);

  /* The moon's drawings, one for each of the eight phases (tools/moon-art.py cuts them from the artwork). */
  const MOON_ART = '/assets/moon/';
  function moonArt(m) {
    const a = m.age;
    return a < 0.034 || a > 0.966 ? 'new' : a < 0.22 ? 'waxing-crescent' : a < 0.28 ? 'first-quarter' : a < 0.47 ? 'waxing-gibbous'
      : a < 0.53 ? 'full' : a < 0.72 ? 'waning-gibbous' : a < 0.78 ? 'third-quarter' : 'waning-crescent';
  }
  /* The eclipses seen from Jerusalem (timeanddate.com, local time with its offset): from the first contact to the last.
     Penumbral lunar eclipses are left out – the eye hardly sees them. */
  const ECLIPSES = [
    ['solar', '2027-08-02T11:40+03:00', '2027-08-02T14:18+03:00', 'ליקוי חמה חלקי'],
    ['lunar', '2028-01-12T04:07+02:00', '2028-01-12T06:48+02:00', 'ליקוי ירח חלקי'],
    ['lunar', '2028-07-06T19:44+03:00', '2028-07-06T23:55+03:00', 'ליקוי ירח חלקי'],
    ['lunar', '2028-12-31T16:35+02:00', '2028-12-31T21:40+02:00', 'ליקוי ירח מלא'],
    ['lunar', '2029-06-26T03:34+03:00', '2029-06-26T05:37+03:00', 'ליקוי ירח מלא'],
    ['lunar', '2029-12-20T21:42+02:00', '2029-12-21T03:41+02:00', 'ליקוי ירח מלא'],
    ['solar', '2030-06-01T06:42+03:00', '2030-06-01T09:10+03:00', 'ליקוי חמה חלקי'],
    ['lunar', '2030-06-15T19:35+03:00', '2030-06-15T23:52+03:00', 'ליקוי ירח חלקי'],
    ['lunar', '2032-04-25T19:14+03:00', '2032-04-25T21:04+03:00', 'ליקוי ירח חלקי'],
    ['lunar', '2032-10-18T19:24+03:00', '2032-10-19T00:40+03:00', 'ליקוי ירח מלא'],
    ['lunar', '2033-04-14T19:12+03:00', '2033-04-15T01:13+03:00', 'ליקוי ירח מלא'],
    ['solar', '2034-03-20T11:41+02:00', '2034-03-20T14:23+02:00', 'ליקוי חמה חלקי'],
    ['lunar', '2034-09-28T03:42+03:00', '2034-09-28T06:35+03:00', 'ליקוי ירח חלקי'],
    ['lunar', '2035-08-19T01:46+03:00', '2035-08-19T06:15+03:00', 'ליקוי ירח חלקי'],
  ].map(([kind, from, to, name]) => ({ kind, from: Date.parse(from), to: Date.parse(to), name }));
  const eclipseAt = (now = Date.now()) => ECLIPSES.find((e) => now >= e.from && now <= e.to) || null;
  const nextEclipse = (kind, now = Date.now()) => ECLIPSES.find((e) => e.kind === kind && e.to > now) || null;
  /** "שלום מישאל": the Hebrew name the family's owner set for each member (just "שלום" until there is one) */
  /** the greeting of the hour: בוקר טוב, צהריים טובים, ערב טוב – and שבת שלום from Friday noon to the end of Shabbat, שבוע טוב on Saturday night */
  function hello(now = new Date()) {
    const h = now.getHours(), day = now.getDay(), set = H.sunTimes(now).set;
    if ((day === 5 && h >= 12) || (day === 6 && now < set)) return 'שבת שלום';
    if (day === 6 && now >= set) return 'שבוע טוב';
    return h >= 5 && h < 12 ? 'בוקר טוב' : h >= 12 && h < 17 ? 'צהריים טובים' : h >= 17 && h < 23 ? 'ערב טוב' : 'שלום';
  }
  const greeting = () => el('div', { class: 'greet' }, el('h1', {}, swell(first ? `${hello()} ${first}` : hello())));
  const dock = el('span', { class: 'dock', 'aria-hidden': 'true' });
  // the ring round the fire: עץ המשפחה, כלים and הגדרות always, and what this person pinned from the tools page (apps.js;
  // read here, after the sign-in, when the person's preferences have arrived)
  // serious mode (docs/vision/serious-mode.md): a plain list of the tools, no tent, no fire, no companion; chosen from the
  // preference before anything is drawn, so the screen never flashes the other mode first
  if (r.user) dailyDigest();
  /* the daily summary (batch 13): at the first open of the day, whatever the notification gate held (server/push.ts → /api/digest).
     A plain window for now; design's card replaces it. The day is per device; the server marks what was shown, so another device shows only what is new. */
  async function dailyDigest() {
    const today = new Date().toLocaleDateString('en-CA');
    try { if (localStorage.getItem('digestDay') === today) return; localStorage.setItem('digestDay', today); } catch (_) { /* no storage: ask every time */ }
    // the day itself (batch 16, docs/design/daily.md: the card shows every day): the weather, today's calendar and, on a Friday or a
    // holiday eve, the candles; each allowed 2.5 s so a slow service never holds the card back
    const soon = (p) => Promise.race([p.catch(() => null), new Promise((r) => setTimeout(() => r(null), 2500))]);
    const geo = [H.prefs('calendar').city, H.prefs('parasha').city].map(String).find((c) => /^\d{3,9}$/.test(c)) || '281184';
    const [dg, wx, cal, hc] = await Promise.all([H.api('/api/digest').catch(() => ({})), soon(H.api('/api/weather')), soon(H.api('/api/calendar/events')),
      soon(fetch(`https://www.hebcal.com/shabbat?cfg=json&geonameid=${geo}&M=on&lg=he`).then((r) => (r.ok ? r.json() : null)))]);
    const items = dg?.items || [];
    const svg = (d) => { const t = document.createElement('template'); t.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`; return t.content.firstChild; };
    const IC = {
      familyday: ['#b8457a', '<path d="M4.5 20.5h15v-6.5a2 2 0 0 0-2-2h-11a2 2 0 0 0-2 2z"/><path d="M4.5 16c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 1.5-1.2 1.5-1.2"/><path d="M12 12V8.5"/><path d="M12 4c1 1.2 1 2.4 0 3-1-.6-1-1.8 0-3z"/>'],
      gather: ['#2a7fa8', '<circle cx="8" cy="9" r="2.6"/><circle cx="16" cy="9" r="2.6"/><path d="M3.5 19c.6-3 2.4-4.6 4.5-4.6s3.9 1.6 4.5 4.6M11.5 19c.6-3 2.4-4.6 4.5-4.6s3.9 1.6 4.5 4.6"/>'],
      reminder: ['#3b6634', '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'],
      family: ['#3b6634', '<path d="M5 18.5V7a2.5 2.5 0 0 1 2.5-2.5h9A2.5 2.5 0 0 1 19 7v6a2.5 2.5 0 0 1-2.5 2.5H9z"/>'],
      other: ['#6b6a75', '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'],
    };
    const when = (ms) => new Date(ms).toLocaleString('he-IL', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    const row = (i) => { const [c, d] = IC[i.kind] || IC.other;
      return el('li', {}, el(i.url ? 'a' : 'div', i.url ? { href: i.url } : {}, el('span', { class: 'dsum-ic', style: `--c:${c}` }, svg(d)),
        el('span', { class: 'dsum-txt' }, el('b', {}, i.title), el('small', {}, i.body)), el('span', { class: 'dsum-when' }, when(i.created_at)))); };
    // every morning (the owner, 2026-11-14): the facts of the day, today's days, and what waited
    const sun = H.sunNow?.(), hhmm = (ms) => new Date(ms).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    const list = el('ul', { class: 'dsum-list' }, items.slice(0, 3).map(row));
    const more = items.length > 3 ? el('button', { class: 'dsum-more', type: 'button', onclick: () => { list.append(...items.slice(3).map(row)); more.remove(); } },
      items.length === 4 ? 'ועוד דבר אחד' : `ועוד ${items.length - 3}`) : null;
    // the leaf and the date line: the Hebrew day in letters (the gematria of server/hebdate.ts), the month, then the Gregorian day
    const now = new Date(), iso = today, noon = (d) => new Date(d + 'T12:00:00');
    const hpart = (d, t) => new Intl.DateTimeFormat('en-u-ca-hebrew', { month: 'long', day: 'numeric', year: 'numeric' }).formatToParts(d).find((x) => x.type === t)?.value;
    const gem = (n) => { const u = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'], t = ['', 'י', 'כ', 'ל'];
      const s = n === 15 ? 'טו' : n === 16 ? 'טז' : t[Math.floor(n / 10)] + u[n % 10];
      return s.length > 1 ? s.slice(0, -1) + '״' + s.slice(-1) : s + '׳'; };
    const hDay = gem(+hpart(now, 'day')), hMonth = new Intl.DateTimeFormat('he-u-ca-hebrew', { month: 'long' }).format(now);
    const dateLine = `${now.toLocaleDateString('he-IL', { weekday: 'long' })}, ${hDay} ב${hMonth} · ${now.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}`;
    // the facts row: the weather now (a link to the weather page), and the sunset, or the candles on a Friday or a holiday eve
    const SKY = {
      sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>',
      moon: '<path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z"/>',
      part: '<circle cx="9" cy="9" r="3.5"/><path d="M9 2.5v1.5M2.5 9H4M4.4 4.4l1 1M13.6 4.4l-1 1"/><path d="M8 20h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.3 1.2A3 3 0 0 0 8 20z"/>',
      cloud: '<path d="M7 19h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 19z"/>',
      fog: '<path d="M7 13h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 13z"/><path d="M4 17h16M6 20.5h12"/>',
      rain: '<path d="M7 15h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 15z"/><path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>',
      storm: '<path d="M7 15h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 15z"/><path d="M12.5 16.5l-2 3h3l-2 3"/>',
      snow: '<path d="M7 15h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 15z"/><path d="M8 18v2M7 19h2M12 19.5v2M11 20.5h2M16 18v2M15 19h2"/>',
    };
    const skyOf = (e = '') => (/☀/.test(e) ? 'sun' : /🌙/.test(e) ? 'moon' : /🌤|⛅/.test(e) ? 'part' : /🌫/.test(e) ? 'fog' : /⛈/.test(e) ? 'storm' : /🌨|❄/.test(e) ? 'snow' : /🌦|🌧/.test(e) ? 'rain' : 'cloud');
    const icon = (d, w = '1.6') => { const s = svg(d); s.setAttribute('class', 'icon'); s.setAttribute('stroke-width', w); return s; };
    const facts = el('ul', { class: 'dsum-facts', 'aria-label': 'היום בקצרה' });
    const wn = wx?.forecast?.now, w0 = wx?.forecast?.days?.[0];
    if (wn) { const k = skyOf(wn.sky?.icon);
      facts.append(el('li', { class: 'dsum-fact-wx', 'data-sky': k }, el('a', { href: '/tools/weather/' }, icon(SKY[k]),
        el('span', {}, el('b', {}, `${wn.temp}°`), el('small', {}, (wn.sky?.text || '') + (w0 ? ` · בלילה ${w0.min}°` : '')))))); }
    const CANDLES = '<path d="M8 21V11M16 21V11"/><path d="M8 4.5c1.2 1.3 1.2 2.8 0 3.5-1.2-.7-1.2-2.2 0-3.5zM16 4.5c1.2 1.3 1.2 2.8 0 3.5-1.2-.7-1.2-2.2 0-3.5z"/><path d="M5 21h14"/>';
    const candles = (hc?.items || []).find((i) => i.category === 'candles' && String(i.date).startsWith(iso) && i.date.length > 10);
    if (candles) facts.append(el('li', { class: 'dsum-fact-candles' }, icon(CANDLES), el('span', {}, el('b', {}, hhmm(Date.parse(candles.date))), el('small', {}, 'הדלקת נרות'))));
    else if (sun?.set) facts.append(el('li', { class: 'dsum-fact-sun' }, icon('<path d="M3 17.5h18M6.5 17.5a5.5 5.5 0 0 1 11 0"/><path d="M12 4.5v4M9.5 7 12 9.5 14.5 7M4.2 12.2l1.3.8M19.8 12.2l-1.3.8M7 20.5h10"/>'),
      el('span', {}, el('b', {}, hhmm(sun.set)), el('small', {}, 'שקיעה'))));
    // "היום": today's days from the calendar and the tree, birthdays first. One-off on the date, yearly by the Gregorian date or by the
    // Hebrew one (after sunset = the next Hebrew day)
    const hd = (d) => hpart(d, 'month') + ' ' + hpart(d, 'day');
    const hToday = hd(now);
    const isToday = (e) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) return false;
      if (e.recur === 'none') return e.date === iso;
      if (e.recur === 'gregorian') return e.date.slice(5) === iso.slice(5);
      const d = noon(e.date); if (e.after_sunset) d.setDate(d.getDate() + 1);
      return hd(d) === hToday;
    };
    const KIND = { yahrzeit: 'יום השנה', anniversary: 'יום נישואין' };
    const CAL = '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>';
    const dayRow = (c, d, b, small) => el('li', {}, el('div', {}, el('span', { class: 'dsum-ic', style: `--c:${c}` }, svg(d)), el('span', { class: 'dsum-txt' }, el('b', {}, b), small ? el('small', {}, small) : null)));
    const days = (cal?.events || []).filter(isToday).sort((a, b) => (b.kind === 'birthday') - (a.kind === 'birthday'));
    const todayRows = days.map((e) => {
      if (e.kind === 'birthday') {
        const age = now.getFullYear() - +e.date.slice(0, 4);
        return dayRow(IC.familyday[0], IC.familyday[1], e.from === 'tree' ? `יום הולדת ל${e.title}` : e.title, (age > 0 && age < 120 ? `${age} היום · ` : '') + 'לשלוח ברכה');
      }
      return e.kind === 'reminder' ? dayRow(IC.reminder[0], IC.reminder[1], e.title, e.note || '') : dayRow('#2a7fa8', CAL, e.title, KIND[e.kind] || e.note || '');
    });
    const todayList = el('ul', { class: 'dsum-list' }, todayRows.slice(0, 3));
    const todayMore = todayRows.length > 3 ? el('button', { class: 'dsum-more', type: 'button', onclick: () => { todayList.append(...todayRows.slice(3)); todayMore.remove(); } },
      todayRows.length === 4 ? 'ועוד דבר אחד' : `ועוד ${todayRows.length - 3}`) : null;
    const todaySec = todayRows.length ? el('section', { 'aria-labelledby': 'dsum-today' }, el('h3', { class: 'dsum-sub', id: 'dsum-today' }, 'היום'), todayList, todayMore) : null;
    const LEAF = '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19 13 11"/>';
    const calm = items.length ? null : el('p', { class: 'dsum-calm' }, icon(LEAF), todayRows.length ? 'אין הודעות חדשות מאז אתמול.' : 'יום שקט: אין היום שום דבר בלוח, ולא חיכה לך כלום.');
    const close = el('button', { class: 'dsum-close', type: 'button', 'aria-label': 'סגירת הסיכום' }, svg('<path d="M6 6l12 12M18 6 6 18"/>'));
    const card = el('section', { class: 'dsum', 'aria-labelledby': 'dsum-h' },
      el('header', { class: 'dsum-head' }, el('span', { class: 'dsum-leaf', 'aria-hidden': 'true' }, el('b', {}, hDay), el('small', {}, hMonth)),
        el('div', {}, el('h2', { id: 'dsum-h' }, 'סיכום היום'), el('p', {}, dateLine)), close),
      el('div', { class: 'dsum-body' }, facts.children.length ? facts : null, todaySec,
        items.length ? el('section', { 'aria-labelledby': 'dsum-since' }, el('h3', { class: 'dsum-sub', id: 'dsum-since' }, 'מאז הסיכום הקודם'), list, more) : null, calm));
    close.onclick = () => {
      const done = () => { card.remove(); document.querySelector('.greet h1, .sr-head h1')?.focus?.(); };
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return done();
      card.classList.add('leaving'); card.addEventListener('animationend', done, { once: true }); setTimeout(done, 900);
    };
    (document.querySelector('.home > .greet, .sr-home .sr-head') || root.firstElementChild)?.after(card);
  }
  /* ---------- "בקרוב" (batch 15, docs/design/soon.md): the big ideas, drawn only; a tap opens one sentence ---------- */
  const SPROUT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5v-8"/><path d="M12 12.5C12 8.6 9.2 6.5 5 6.5c0 3.9 2.8 6 7 6Z"/><path d="M12 14.5c0-3.2 2.4-5.2 6.5-5.2 0 3.2-2.4 5.2-6.5 5.2Z"/></svg>';
  const soonTag = (x) => el('span', { class: 'tag-soon', html: SPROUT + x.note });
  const soonPic = (x) => el('img', { src: `/assets/soon/${x.id}.svg`, alt: '', loading: 'lazy', decoding: 'async' });
  const soonSheet = (x) => H.modal(el('div', { class: 'soon-sheet' }, soonPic(x), el('h2', {}, x.name), soonTag(x), el('p', {}, x.line)));
  /* the side pages (the owner, 2026-11-14): each big idea has a page of its own beside the tent, reached by a sideways swipe (or the
     dots, on a PC). The tent is always the middle page. look.sides is the order: the first goes to the right of the tent, the second to
     its left (and so on, alternately). The switch "הצג כלים בפיתוח" in the settings (look.devTools === false) hides them. */
  const sidePage = (x) => {
    const pic = x.id === 'garage'
      ? el('img', { src: '/assets/soon/garage-scene.svg', width: 320, height: 240, alt: 'סככה עם כלי עבודה, עמוד טעינה לרכב חשמלי ושולחן עבודה', decoding: 'async',
          onerror: (e) => { e.target.onerror = null; e.target.src = '/assets/soon/garage.svg'; e.target.alt = ''; } })
      : el('img', { src: `/assets/soon/${x.id}.svg`, width: 320, height: 240, alt: '', decoding: 'async' });
    const kids = [el('div', { class: 'side-pic' }, pic), el('h2', { id: `side-${x.id}-h` }, x.name), soonTag(x), el('p', { class: 'side-line' }, x.line)];
    kids.forEach((k, i) => k.style.setProperty('--i', i));
    return el('div', { class: 'pager-page', 'data-name': x.name }, el('section', { class: `side side-${x.id}`, 'data-side': x.id, 'aria-labelledby': `side-${x.id}-h` }, ...kids));
  };
  const withSides = (home) => {
    const ids = Array.isArray(H.prefs('look').sides) && H.prefs('look').sides.length ? H.prefs('look').sides : ['garage', 'hill'];
    const ideas = H.prefs('look').devTools === false ? [] : ids.map((id) => H.SOON?.find((x) => x.id === id)).filter(Boolean);
    if (!ideas.length) return [home];
    const mid = el('div', { class: 'pager-page', 'data-name': 'האוהל' }, home);
    const right = ideas.filter((_, i) => i % 2 === 0).map(sidePage).reverse(), left = ideas.filter((_, i) => i % 2).map(sidePage);
    const pages = [...right, mid, ...left];                            // right to left: the document is RTL
    const pager = el('div', { class: 'pager' }, ...pages);
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dots = pages.map((p) => el('button', { type: 'button', 'aria-label': p.dataset.name, 'aria-current': String(p === mid),
      onclick: () => p.scrollIntoView({ behavior: still ? 'auto' : 'smooth', inline: 'start', block: 'nearest' }) }));
    // the page in view gets .is-here (design staggers its parts by --i) and its dot
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      e.target.classList.toggle('is-here', e.isIntersecting);
      if (e.isIntersecting) dots.forEach((d, i) => d.setAttribute('aria-current', String(pages[i] === e.target)));
    }), { root: pager, threshold: 0.6 });
    pages.forEach((p) => io.observe(p));
    queueMicrotask(() => mid.scrollIntoView({ behavior: 'instant', inline: 'start', block: 'nearest' }));
    return [el('nav', { class: 'pager-dots', 'aria-label': 'המסכים' }, ...dots), pager];
  };
  if (H.prefs('look').style === 'serious') { document.documentElement.dataset.style = 'serious'; if (H.prefs('look').pillows === 'keep') document.documentElement.dataset.pillows = 'keep'; seriousHome(); return; }
  function seriousHome() {
    const look = H.prefs('look'), pillows = document.documentElement.dataset.pillows === 'keep';
    let view = look.srView === 'list' ? 'list' : 'grid';
    const tool = (a) => el('li', { 'data-q': a.name + ' ' + a.sub }, el('a', { class: 'sr-tool', href: a.href },
      el('span', { class: 'sr-ic' }, pillows ? el('img', { src: '/assets/pillows/' + a.pillow + '.webp', alt: '', loading: 'lazy' }) : H.appIcon(a.ic)),
      el('span', { class: 'sr-txt' }, el('b', {}, a.name, H.expTag(a)), el('small', {}, a.sub))));
    const isTool = (a) => a.href.startsWith('/tools/') || /^\/(mail|pc|gather|messages|groceries|food\/)/.test(a.href);
    const lists = [['המקומות', H.APPS.filter((a) => !isTool(a))], ['הכלים', H.APPS.filter(isTool)]].map(([t, apps]) => {
      const ul = el('ul', { class: 'sr-tools', 'data-view': view }, ...apps.map(tool));
      return [el('section', { class: 'sr-group' }, el('h2', {}, t), ul), ul];
    });
    if (H.SOON?.length && H.prefs('look').devTools !== false) {
      const ul = el('ul', { class: 'sr-tools', 'data-view': view }, ...H.SOON.map((x) => el('li', { 'data-q': x.name + ' ' + x.line },
        el('button', { class: 'sr-tool', type: 'button', 'data-id': x.id, onclick: () => soonSheet(x) }, el('span', { class: 'sr-ic' }, soonPic(x)),
          el('span', { class: 'sr-txt' }, el('b', {}, x.name, soonTag(x)), el('small', {}, x.line))))));
      lists.push([el('section', { class: 'sr-group sr-soon' }, el('h2', {}, 'בקרוב'), ul), ul]);
    }
    const none = el('p', { class: 'sr-none', hidden: '' }, 'לא נמצא כלי בשם הזה');
    const input = el('input', { type: 'search', placeholder: 'חיפוש כלי', 'aria-label': 'חיפוש כלי' });
    input.addEventListener('input', () => {
      const w = input.value.trim(); let any = false;
      lists.forEach(([sec, ul]) => { let n = 0; ul.querySelectorAll('li').forEach((li) => { const on = !w || li.dataset.q.includes(w); /* the Hebrew, even with the ancient letters */ li.hidden = !on; n += on; }); sec.hidden = !n; any ||= n > 0; });
      none.hidden = any;
    });
    const btn = (v, t) => el('button', { type: 'button', 'aria-pressed': String(v === view), 'data-view': v }, t);
    const views = el('div', { class: 'sr-view', role: 'group', 'aria-label': 'תצוגה' }, btn('grid', 'רשת'), btn('list', 'רשימה'));
    views.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      view = b.dataset.view; look.srView = view; H.savePrefs('look');
      views.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      lists.forEach(([, ul]) => { ul.dataset.view = view; });
    });
    root.append(el('main', { class: 'sr-home' },
      el('header', { class: 'sr-head' }, el('h1', {}, ...(first ? [hello() + ' ', el('span', { 'data-content': '' }, first)] : [hello()])), el('p', {}, 'כל הכלים במקום אחד')),
      el('label', { class: 'sr-search' }, H.icon('lens'), input), ...lists.map(([sec]) => sec), none, views,
      el('p', { class: 'out' }, el('button', { class: 'btn ghost small', onclick: async () => { await H.api('/api/auth/logout', { method: 'POST' }); location.reload(); } }, 'התנתקות'))));
  }
  let wheel = appWheel(H.ringApps());
  root.append(...withSides(el('div', { class: 'home' },
    greeting(),
    el('div', { class: 'camp' }, el('img', { sizes: '(max-width: 599px) 92vw, 640px', srcset: '/assets/tent-700.webp 700w, /assets/tent-1000.webp 1000w, /assets/tent.webp 1400w', src: '/assets/tent-1000.webp', alt: 'האוהל של רַאבַּ"ע', width: 1400, height: 794, fetchpriority: 'high' }), dock, musicCorner()),
    wheel.root, wheel.caption,
    el('p', { class: 'out' }, el('button', { class: 'btn ghost small', onclick: async () => { await H.api('/api/auth/logout', { method: 'POST' }); location.reload(); } }, 'התנתקות')))));
  wheel.start();
  sky();
  swellPointer();
  // Ibn Ezra lives here: he stands on the rug at his tent's entrance (unless he was asked to come along with the person).
  // (the owner's switchboard can turn him off for everyone: H.switches.daemon)
  const meetHim = () => (H.swOn?.('daemon') === false ? null : H.loadDaemon().then((d) => d.mount(null, { dock })));
  const camp = dock.parentElement;
  /* closed completely (daemon.closed, per user): a 5-second press on the tent opens a small transparent panel that asks whether to bring him back */
  {
    const dp = H.prefs('daemon', H.DAEMON_DEFAULTS, 'helper.daemon.prefs');
    let timer = 0, x0 = 0, y0 = 0;
    const stop = () => { clearTimeout(timer); timer = 0; };
    // the floating tabs that can be closed by dragging them to the bottom, each with its own per-user pref (the back door's tab cannot)
    const mp = H.prefs('music', { source: 'spotify', mode: 'menu', folded: false, recent: [] });
    const closedTabs = () => [dp.closed && { key: 'daemon', label: 'העוזר', p: dp }, mp.closed && { key: 'music', label: 'נגן המוזיקה', p: mp }].filter(Boolean);
    const ask = () => {
      if (document.querySelector('.back-panel')) return;
      const list = closedTabs();
      if (!list.length) return;
      const close = () => { p.classList.remove('on'); setTimeout(() => p.remove(), 250); };
      const back = (items) => { for (const i of items) { i.p.closed = false; H.savePrefs(i.key); } close(); setTimeout(() => location.reload(), 150); };
      const p = el('div', { class: 'back-panel', role: 'dialog', 'aria-label': 'להחזיר את מה שנסגר' },
        el('p', {}, list.length === 1 ? `להחזיר את ${list[0].label}?` : 'מה להחזיר?'),
        el('div', { class: 'row' },
          ...(list.length === 1
            ? [el('button', { class: 'btn primary small', onclick: () => back(list) }, 'כן')]
            : [...list.map((i) => el('button', { class: 'btn primary small', onclick: () => back([i]) }, i.label)), el('button', { class: 'btn primary small', onclick: () => back(list) }, 'הכול')]),
          el('button', { class: 'btn ghost small', onclick: close }, list.length === 1 ? 'לא' : 'סגירה')));
      document.body.append(p); requestAnimationFrame(() => p.classList.add('on'));
    };
    // .camp takes no pointer events (the pager and the wheel lie over it), so the press is caught on the document and hit-tested against the tent
    const onTent = (e) => { const r = (camp.querySelector('img') || camp).getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
    document.addEventListener('pointerdown', (e) => { if (e.button > 0 || !closedTabs().length || !onTent(e)) return; x0 = e.clientX; y0 = e.clientY; stop(); timer = setTimeout(() => { timer = 0; ask(); }, 5000); });
    document.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > 12) stop(); });
    for (const t of ['pointerup', 'pointercancel']) document.addEventListener(t, stop);
  }
  if (navigator.connection?.saveData) {
    const hint = el('button', { class: 'btn ghost small wake', onclick: () => { hint.remove(); meetHim(); } }, 'להעיר את רַאבַּ"ע');
    camp.append(hint);
  } else {
    // after the page and its pictures have loaded, when the browser is idle
    const later = () => ('requestIdleCallback' in window ? requestIdleCallback(meetHim, { timeout: 1500 }) : setTimeout(meetHim, 300));
    if (document.readyState === 'complete') later(); else addEventListener('load', later, { once: true });
  }

  /* ---------- letters that swell ---------- */
  function swell(text) {
    const parts = window.Intl?.Segmenter ? [...new Intl.Segmenter('he', { granularity: 'grapheme' }).segment(text)].map((s) => s.segment) : [...text];
    // letters are grouped into words, each in its own direction (separate letter boxes would otherwise lose a Latin name's order in RTL)
    const out = el('span', { class: 'swell', role: 'text', 'aria-label': text });
    let word = null;
    parts.forEach((c, i) => {
      if (/\s/.test(c)) { word = null; out.append(el('span', { class: 'ch sp', 'aria-hidden': 'true', style: `--i:${i}` }, c)); return; }
      if (!word) { word = el('span', { class: 'word', dir: /[A-Za-z0-9]/.test(c) ? 'ltr' : 'rtl', 'aria-hidden': 'true' }); out.append(word); }
      word.append(el('span', { class: 'ch', style: `--i:${i}` }, c));
    });
    return out;
  }
  /** Every letter grows by how close the pointer is (a magnifier that follows the mouse); a long press sends a wave through them. */
  function swellPointer() {
    let live = null;
    const reset = (w) => { w.classList.remove('live'); w.querySelectorAll('.ch').forEach((c) => c.style.removeProperty('--k')); };
    const apply = (w, x, y) => {
      const chars = w.querySelectorAll('.ch');
      const box = w.getBoundingClientRect();
      const ky = Math.exp(-(((y - (box.top + box.height / 2)) / Math.max(40, box.height * 1.6)) ** 2));
      const em = parseFloat(getComputedStyle(w).fontSize) || 20;
      // letter centres from the layout (offsets ignore the swell's own transforms, so the magnifier doesn't chase itself),
      // scaled by whatever the ring's scale does to the label
      const k = box.width / Math.max(1, w.offsetWidth);
      for (const c of chars) {
        const cx = box.left + (c.offsetLeft - w.offsetLeft + c.offsetWidth / 2) * k;
        const d = (x - cx) / (em * 1.15 * k);
        c.style.setProperty('--k', (Math.exp(-d * d) * ky).toFixed(3));
      }
    };
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' && !e.buttons) return;
      const host = e.target.closest?.('.wheel-item, .greet h1');
      const w = host?.querySelector('.swell') || null;
      if (live && live !== w) { reset(live); live = null; }
      if (!w || host.closest('.wheel.dragging')) { if (live) { reset(live); live = null; } return; }
      live = w; w.classList.add('live');
      apply(w, e.clientX, e.clientY);
    }, { passive: true });
    document.addEventListener('pointerleave', () => { if (live) { reset(live); live = null; } });
    // a long press (a finger that stays put): a wave through the letters
    let lp = null;
    document.addEventListener('pointerdown', (e) => {
      const host = e.target.closest?.('.wheel-item, .greet h1');
      if (!host) return;
      const w = host.querySelector('.swell');
      const at = { x: e.clientX, y: e.clientY };
      clearTimeout(lp?.t);
      lp = { at, t: setTimeout(() => {
        lp.fired = true; navigator.vibrate?.(12);
        if (host.classList.contains('wheel-item') && !host.closest('.wheel.dragging')) arrange(host.getAttribute('href')); else wave(w);
      }, 380) };
    });
    document.addEventListener('pointermove', (e) => { if (lp && Math.hypot(e.clientX - lp.at.x, e.clientY - lp.at.y) > 8) clearTimeout(lp.t); }, { passive: true });
    // (the click that follows the lift is swallowed below; if none comes, e.g. the cushion was swapped for the tray, the next tap is not)
    document.addEventListener('pointerup', () => { if (lp) { clearTimeout(lp.t); if (lp.fired) { const was = lp; setTimeout(() => { if (lp === was) lp = null; }, 0); } } });
    // after a long press the finger lifts: that is not a tap on the app
    document.addEventListener('click', (e) => { if (lp?.fired) { lp = null; e.preventDefault(); e.stopPropagation(); } }, true);
    document.addEventListener('contextmenu', (e) => { if (e.target.closest?.('.wheel-item')) e.preventDefault(); });
    const greetSwell = document.querySelector('.greet .swell');
    if (greetSwell && !matchMedia('(prefers-reduced-motion: reduce)').matches) setTimeout(() => wave(greetSwell), 500);
  }
  function wave(w) {
    if (!w) return;
    w.classList.remove('wave'); void w.offsetWidth; w.classList.add('wave');
    clearTimeout(w._wave); w._wave = setTimeout(() => w.classList.remove('wave'), 1100 + w.querySelectorAll('.ch').length * 55);
  }

  /* ---------- the sky: one orbit round the tent, the sun and the moon on opposite ends of it ----------
     The orbit is an ellipse round the tent; its lower half runs under the ground, so when one is up the other is down.
     Both come up on the right and go down behind the tent, between its back-left peg and its wall. The real clock turns
     it; the person can turn it too – drag the sun or the moon along it – and that is the app's day/night switch: let go
     with the moon up and it is night, with the sun up and it is day (until the next real sunrise or sunset). */
  function sky() {
    const sunImg = el('img', { class: 'ball', src: '/assets/sun-disc.webp', alt: '', fetchpriority: 'low' });
    const sun = el('button', { class: 'sun', type: 'button', 'aria-label': 'השמש – לחיצה: זמני היום; גרירה: מעבר ללילה' },
      el('span', { class: 'halo' }), sunImg);
    const moonImg = el('img', { src: MOON_ART + moonArt(moonPhase()) + '.webp', alt: '', fetchpriority: 'low' });
    moonImg.addEventListener('error', () => { if (!moonImg.src.endsWith('/assets/moon.webp')) moonImg.src = '/assets/moon.webp'; });
    const moon = el('button', { class: 'moon', type: 'button', 'aria-label': 'הירח – לחיצה: המופע; גרירה: מעבר ליום' },
      el('span', { class: 'halo' }), moonImg);
    // the path itself, shown faintly only while it is being turned
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    path.setAttribute('class', 'orbit-path'); path.setAttribute('aria-hidden', 'true');
    // a tick gauge (design, 2026-11-15): two ellipses on pathLength 360, a short tick every 5 units and a long one every 30; the dashes are the ticks
    path.innerHTML = '<circle fill="none" pathLength="360" stroke-width="13" stroke-dasharray="0.35 4.65" stroke-dashoffset="0.3"/><circle fill="none" pathLength="360" stroke-width="24" stroke-dasharray="0.6 29.4" stroke-dashoffset="0.5"/>';
    // a quiet night sky: a few stars, each twinkling at its own pace
    const stars = el('div', { class: 'stars', 'aria-hidden': 'true' });
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 46; i++) {
      const big = rnd() < 0.18;
      stars.append(el('i', { class: big ? 'big' : '', style: `left:${(rnd() * 100).toFixed(2)}%;top:${(rnd() * 88).toFixed(2)}%;--tw:${(3 + rnd() * 5).toFixed(1)}s;--d:${(-rnd() * 6).toFixed(1)}s;--o:${(0.35 + rnd() * 0.55).toFixed(2)}` }));
    }
    const box = el('div', { class: 'sky' }, stars, path, moon, sun);
    const homePage = document.querySelector('.home')?.closest('.pager-page');
    (homePage || document.body).prepend(box);
    const camp = document.querySelector('.camp');
    // the light of the sky on the tent: a halo behind its outline for each source, and the light on the canvas over it
    const tentImg = camp.querySelector(':scope > img');
    tentImg.before(el('span', { class: 'tent-light tent-glow glow-sun', 'aria-hidden': 'true' }, el('i')), el('span', { class: 'tent-light tent-glow glow-moon', 'aria-hidden': 'true' }, el('i')));
    tentImg.after(el('span', { class: 'tent-light tent-shine', 'aria-hidden': 'true' }));
    /* the tent's outline in the picture (fractions of its width and height, measured from its alpha): the roof's peak, its
       slopes, the eaves, the walls and the ground line */
    const TENT = [[0.46, 0.03], [0.535, 0.03], [0.83, 0.3], [0.91, 0.465], [0.955, 0.6], [0.93, 0.86], [0.03, 0.86], [0.03, 0.6], [0.085, 0.465], [0.145, 0.3]];
    /** how far a point (page px) is from the tent's outline: 0 inside it */
    function tentDistance(x, y, t) {
      const P = TENT.map(([u, v]) => [t.left + u * t.width, t.top + v * t.height]);
      let inside = false, d = Infinity;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const [xi, yi] = P[i], [xj, yj] = P[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        const ex = xi - xj, ey = yi - yj, k = Math.max(0, Math.min(1, ((x - xj) * ex + (y - yj) * ey) / (ex * ex + ey * ey || 1)));
        d = Math.min(d, Math.hypot(x - (xj + k * ex), y - (yj + k * ey)));
      }
      return inside ? 0 : d;
    }
    const clamp01 = (n) => Math.max(0, Math.min(1, n));
    /** the light one source casts on the tent: strong when it is low and near (or behind) the tent, none high in the sky
        or a little after it has set */
    function tentLight(who, P, up, r) {
      const t = geo.tent; if (!t) return;
      const near = clamp01(1 - Math.max(0, tentDistance(P.x, P.y, t) - r) / (r * 3)) ** 2;
      const low = clamp01((1 - up) * 1.3) * clamp01(1 + up / 0.22);
      const lit = near * low;
      const u = (P.x - t.left) / t.width, v = (P.y - t.top) / t.height;
      const dx = u - 0.5, dy = v - 0.55, n = Math.hypot(dx, dy) || 1;
      const cs = camp.style;
      cs.setProperty(`--${who}-lit`, lit.toFixed(3));
      cs.setProperty(`--${who}-u`, (u * 100).toFixed(1) + '%'); cs.setProperty(`--${who}-v`, (v * 100).toFixed(1) + '%');
      cs.setProperty(`--${who}-dx`, ((dx / n) * 7).toFixed(1) + 'px'); cs.setProperty(`--${who}-dy`, ((dy / n) * 7).toFixed(1) + 'px');
    }

    let geo = null;
    const geometry = () => orbitGeometry();
    /** The orbit: centred on the tent, its ends a little beyond the tent's sides; its top under the greeting (in the sky's own
        room above the tent), and the horizon across the tent – where the sky ends, and the sun and the moon set. */
    function orbitGeometry() {
      const cr = camp.getBoundingClientRect(), campTop = cr.top + scrollY;
      // in the pager: the sky's box is moved so that its corner is the page's (0, 0) while the tent's page is in view, and the
      // tent is measured as if it were (the person may be on a side page when the window changes)
      let sx = 0;
      if (homePage) {
        const pr = homePage.parentElement.getBoundingClientRect(), hp = homePage.getBoundingClientRect();
        sx = hp.left - pr.left;
        box.style.translate = `${(-pr.left).toFixed(1)}px ${(-(hp.top + scrollY)).toFixed(1)}px`;
      }
      const r = { top: cr.top, height: cr.height, width: cr.width, left: cr.left - sx, right: cr.right - sx };
      const size = Math.round((innerWidth < 600 ? 74 : innerWidth < 1000 ? 100 : 124) * 1.3);   // the sun's ball without its rays, about twice as big (the owner, 2026-11-15)
      const appbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--appbar-h')) || 56;
      const cy = campTop + r.height * 0.465;   // the horizon: across the tent, at the height of its eaves
      const edge = size / 2 + 8;
      const left = Math.max(edge, r.left - r.width * 0.12), right = Math.min(innerWidth - edge, r.right + r.width * 0.12);
      const g = document.querySelector('.home > .greet')?.getBoundingClientRect();
      const top = (g && g.height ? g.bottom + scrollY : appbar) + size * 0.5 + 6;   // the highest point: just under the greeting
      const cx = (left + right) / 2, rx = (right - left) / 2;
      const tent = { left: r.left + scrollX, top: campTop, width: r.width, height: r.width * (794 / 1400) };   // (the camp's box: the picture itself may still be settling in)
      const rr = Math.max(60, cy - top);   // the tick wheel's own round track (the old height of the orbit)
      return { size, cx, cy, rx, ry: Math.max(46, rr * 0.7), rr, campTop, height: cy + 2, tent };
    }
    const at = (th) => ({ x: geo.cx + geo.rx * Math.cos(th), y: geo.cy - geo.ry * Math.sin(th) });

    /* the angle of the sun on the orbit: 0 rising (right), π setting (left); the moon is always half an orbit away */
    let A = 0, tween = null, held = null, sink = 0;
    /* the ring of ticks follows the turn late, like a compass needle: ringA chases A */
    let ringA = 0, ringRaf = 0;
    const ringStill = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function ringPaint() { const o = (ringA * 180) / Math.PI; path.querySelectorAll('circle').forEach((c, i) => c.setAttribute('stroke-dashoffset', ((i ? 0.5 : 0.3) + o).toFixed(2))); }
    function ringStep() {
      ringRaf = 0;
      ringA += (A - ringA) * 0.07;
      if (Math.abs(A - ringA) < 0.002 || ringStill) ringA = A; else ringRaf = requestAnimationFrame(ringStep);
      ringPaint();
    }
    const ringKick = () => { if (!ringRaf) ringRaf = requestAnimationFrame(ringStep); };

    /* The back door (the owner's way to the members' admin): a 7-second press on the sun or on the moon, or 7 taps in a row
       on one of them. The sky answers with 3 beats; then both sink, the eclipse rises, a celebration plays (fireworks, confetti,
       a soft sound; once ever an egg too) and the room asks for the owner's biometric. Anyone else just turns the sky.
       The room itself (/admin/) opens only with the owner's passkey, on the server. */
    const PRESS_MS = 7000, TAP_GAP = 2000, TAPS = 7;
    const egg = { finale: false, tapBody: null, taps: 0, tapAt: 0 };
    function beat(n) {
      for (let i = 0; i < n; i++) setTimeout(() => {
        for (const b of [sun, moon]) { b.classList.remove('egg-beat'); void b.offsetWidth; b.classList.add('egg-beat'); }
        navigator.vibrate?.(40);
      }, i * 380);
    }
    function openDoor() {
      if (!isOwner || egg.finale) return;
      egg.finale = true; document.querySelector('.sun-card')?.remove(); beat(3);
      setTimeout(finale, 2 * 380 + 260 + 500);
    }
    function finale() {
      // both stand still at the two ends of the horizon, sink slowly behind the tent, and the eclipse rises in their place
      held = null; box.classList.remove('turning'); moon.classList.remove('held');
      cancelAnimationFrame(tween?.raf); tween = null;
      A = Math.round(A / Math.PI) * Math.PI;
      const t0 = performance.now(), sinkMs = 1800;
      const down = (t) => {
        const k = Math.min(1, (t - t0) / sinkMs);
        sink = geo.size * 1.3 * (k * k * (3 - 2 * k));
        sun.style.opacity = moon.style.opacity = String(1 - k);
        paint();
        if (k < 1) requestAnimationFrame(down);
      };
      requestAnimationFrame(down);
      const ec = el('img', { class: 'egg-eclipse', src: '/assets/eclipse.webp', alt: '', loading: 'lazy' });
      ec.style.setProperty('--x', geo.cx + 'px'); ec.style.setProperty('--y', (geo.cy - geo.ry * 0.92) + 'px'); ec.style.setProperty('--s', Math.round(geo.size * 1.9) + 'px');   // at the top of the orbit, in open sky
      box.append(ec);
      setTimeout(() => ec.classList.add('up'), sinkMs - 300);
      // the celebration (door-party.js), then the room; if it can't load, the room follows anyway
      setTimeout(() => {
        const go = () => { location.href = '/admin/'; };
        H.loadOnce('/assets/door-party.js').then(() => window.DoorParty.play()).then(go, go);
      }, sinkMs + 900);
    }
    const dark = () => document.documentElement.dataset.theme === 'dark';
    function nightQ(s, now) {
      const y1 = H.sunTimes(new Date(now - 864e5)), t1 = H.sunTimes(new Date(now + 864e5));
      const dusk = now < s.rise ? y1.set : s.set, dawn = now < s.rise ? s.rise : t1.rise;
      return (now - dusk) / (dawn - dusk);
    }
    /** Where the orbit should stand now: the real sky, or – when the person chose the other half of the day – the
        other body in this one's place (so a day chosen as night shows the moon where the sun would be). */
    function targetA() {
      const s = H.sunNow(), now = Date.now();
      const real = dark() === !s.day;
      let f = s.day ? s.progress : nightQ(s, now);
      if (!real) f = Math.max(0.14, Math.min(0.86, f));
      return Math.PI * f + (dark() ? Math.PI : 0);
    }
    function paint() {
      const g = geo, size = g.size, ms = Math.round(size * 1.04);
      const S = at(A), M = at(A + Math.PI);
      sun.style.transform = `translate(${S.x.toFixed(1)}px, ${(S.y + sink).toFixed(1)}px)`;
      moon.style.transform = `translate(${M.x.toFixed(1)}px, ${(M.y + sink).toFixed(1)}px)`;
      const sinS = Math.sin(A);
      tentLight('sun', { x: S.x, y: S.y + sink }, sinS, size / 2);
      tentLight('moon', { x: M.x, y: M.y + sink }, -sinS, ms / 2);
      sun.classList.toggle('under', sinS < -0.12);
      moon.classList.toggle('under', -sinS < -0.12);
      // a halo only round a body that is up: it fades as the body nears the horizon (no glow left over the tent)
      const lift = (h) => Math.max(0, Math.min(1, (h - 0.02) / 0.22)).toFixed(3);
      sun.style.setProperty('--up', lift(sinS)); moon.style.setProperty('--up', lift(-sinS));
      // the light in the sky follows whichever is up
      const up = sinS >= 0 ? S : M;
      box.style.setProperty('--sun-x', ((up.x / innerWidth) * 100).toFixed(1) + '%');
      box.style.setProperty('--sun-y', ((up.y / g.height) * 100).toFixed(1) + '%');
      ringKick();
    }
    function place() {
      geo = geometry();
      const g = geo;
      box.style.blockSize = g.height + 'px';
      box.style.setProperty('--sun-size', g.size + 'px');
      box.style.setProperty('--moon-size', Math.round(g.size * 1.04) + 'px');
      path.setAttribute('width', innerWidth); path.setAttribute('height', g.height);
      path.querySelectorAll('circle').forEach((e) => { e.setAttribute('cx', g.cx); e.setAttribute('cy', g.cy); e.setAttribute('r', g.rr); });   // round, on its own track: not the flatter ellipse the sun and the moon walk
      ringA = A; ringPaint();
      const s = H.sunNow(), now = Date.now(), night = dark();
      const real = night === !s.day;
      const tw = real && !night ? Math.max(0, 1 - Math.min(Math.abs(now - s.rise), Math.abs(now - s.set)) / (50 * 60e3)) : 0;
      sun.style.setProperty('--sun-tint', tw > 0 ? `saturate(${1 + tw * 0.35}) hue-rotate(${-14 * tw}deg)` : 'none');
      box.classList.toggle('night', night);
      box.style.setProperty('--sky-glow', night ? 'rgba(150, 182, 255, .15)' : tw > 0 ? `rgba(255, 128, 72, ${(0.22 * tw).toFixed(3)})` : 'rgba(255, 214, 140, .10)');
      box.style.setProperty('--sky-top', night ? 'rgba(4, 8, 22, .45)' : `rgba(130, 178, 222, ${(0.14 * (1 - tw)).toFixed(3)})`);
      paintPhase(moonPhase(now), now);
      if (!held && !egg.finale) turnTo(targetA(), tween ? 900 : 0);
      else paint();
    }
    /** Turn the orbit to an angle (the nearest way round), easing out. */
    function turnTo(goal, ms) {
      while (goal - A > Math.PI) goal -= 2 * Math.PI;
      while (A - goal > Math.PI) goal += 2 * Math.PI;
      if (!ms) { A = goal; paint(); return; }
      const from = A, t0 = performance.now();
      cancelAnimationFrame(tween?.raf);
      // each turn has its own record, so a frame of an older turn that still fires can neither move the orbit nor touch the new one
      const mine = { raf: 0 };
      tween = mine;
      const step = (t) => {
        if (tween !== mine) return;
        const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
        A = from + (goal - from) * e; paint();
        if (k < 1) mine.raf = requestAnimationFrame(step); else tween = null;
      };
      mine.raf = requestAnimationFrame(step);
    }
    function paintPhase(m, now = Date.now()) {
      // tonight's moon is the drawing of its phase; in a real eclipse the sun becomes the eclipse, and the moon turns copper
      const src = MOON_ART + moonArt(m) + '.webp';
      if (!moonImg.src.endsWith(src)) moonImg.src = src;
      const ec = eclipseAt(now);
      const sunSrc = ec?.kind === 'solar' ? '/assets/eclipse.webp' : '/assets/sun-disc.webp';
      if (!sunImg.src.endsWith(sunSrc)) sunImg.src = sunSrc;
      sun.classList.toggle('eclipse', ec?.kind === 'solar');
      moon.classList.toggle('eclipse', ec?.kind === 'lunar');
      moon.title = ec?.kind === 'lunar' ? 'ליקוי ירח' : m.name;
      if (ec?.kind === 'solar') sun.title = 'ליקוי חמה';
      else sun.removeAttribute('title');
    }

    /* turning it by hand: the body under the finger follows along the orbit; let go and it settles into day or night */
    for (const body of [sun, moon]) {
      body.addEventListener('pointerdown', (e) => {
        if (e.button > 0) return;
        document.querySelector('.sun-card')?.remove();
        const x0 = e.clientX, y0 = e.clientY;
        const ang = (ev) => Math.atan2((geo.cy - (ev.clientY + scrollY)) / geo.ry, (ev.clientX - geo.cx) / geo.rx);
        let moved = false, last = ang(e), unwrapped = last;
        const own = body === sun ? 0 : Math.PI;
        const off = (A + own) - last;
        let press = 0;
        if (isOwner && !egg.finale) press = setTimeout(() => { if (!moved) { body.justTurned = true; setTimeout(() => { body.justTurned = false; }, 600); openDoor(); } }, PRESS_MS);   // a 7-second press
        const mv = (ev) => {
          if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
          if (egg.finale) return;
          if (!moved) {
            moved = true; clearTimeout(press); held = body; cancelAnimationFrame(tween?.raf); tween = null; box.classList.add('turning'); body.classList.add('held'); try { body.setPointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
          }
          const a2 = ang(ev);
          let d = a2 - last; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
          last = a2; unwrapped += d;
          A = unwrapped + off - own;
          paint();
        };
        const up = () => {
          removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
          clearTimeout(press);
          if (!moved && !egg.finale && isOwner) {            // a tap: seven in a row on the same body open the door
            const now = performance.now();
            egg.taps = egg.tapBody === body && now - egg.tapAt < TAP_GAP ? egg.taps + 1 : 1;
            egg.tapBody = body; egg.tapAt = now;
            if (egg.taps >= TAPS) { egg.taps = 0; body.justTurned = true; setTimeout(() => { body.justTurned = false; }, 400); openDoor(); }
          }
          if (!moved || egg.finale) return;
          held = null; body.classList.remove('held'); box.classList.remove('turning');
          body.justTurned = true; setTimeout(() => { body.justTurned = false; }, 60);
          const wantNight = Math.sin(A) < 0;     // the moon is the one up
          if (wantNight !== dark()) H.chooseTheme(wantNight);   // the observer below turns it into place
          else turnTo(targetA(), 700);
        };
        addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
      });
    }

    /* a tap: the details, a switch to the other half of the day, and (when it isn't the real one) a way back */
    function addControls(card) {
      const s = H.sunNow(), night = dark(), real = night === !s.day;
      const row = el('div', { class: 'sky-acts' },
        el('button', { class: 'btn small', type: 'button', onclick: () => { card.remove(); H.chooseTheme(!night); } }, night ? 'מעבר ליום' : 'מעבר ללילה'),
        real ? null : el('button', { class: 'btn small primary', type: 'button', title: 'בחזרה ליום או ללילה של השעה הזאת', onclick: () => { card.remove(); H.chooseTheme(!s.day); } },
          el('img', { src: s.day ? '/assets/sun-disc.webp' : '/assets/moon.webp', alt: '', width: 18, height: 18, loading: 'lazy' }), 'חזרה למצב האמיתי'));
      card.append(row);
    }
    sun.addEventListener('click', () => { if (sun.justTurned) return; sun.classList.remove('flash'); void sun.offsetWidth; sun.classList.add('flash'); if (H.weather?.open) return H.weather.open(sun); sunCard(sun); addControls(document.querySelector('.sun-card')); });
    moon.addEventListener('click', () => { if (moon.justTurned) return; moonCard(moon); addControls(document.querySelector('.sun-card')); });

    place();
    setInterval(() => { tween = tween || { raf: 0 }; place(); }, 60e3);
    addEventListener('resize', () => { tween = null; place(); });
    document.fonts?.ready.then(() => place());   // the greeting's size is known only once Rubik has loaded
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') place(); });
    // day ↔ night (by the person, or by the real sun at sunrise and sunset): the orbit turns into its new place
    new MutationObserver(() => { tween = tween || { raf: 0 }; place(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    camp.querySelector('img').addEventListener('load', () => { tween = null; place(); });
  }
  /** The moon's age in the month (0 new, .5 full), how much of it is lit, and the phase's Hebrew name. */
  function moonPhase(now = Date.now()) {
    const SYN = 29.530588853, NEW = Date.UTC(2000, 0, 6, 18, 14);
    const age = ((((now - NEW) / 864e5) % SYN) + SYN) % SYN / SYN;
    const lit = (1 - Math.cos(2 * Math.PI * age)) / 2;
    const name = age < 0.034 || age > 0.966 ? 'מולד' : age < 0.22 ? 'סהר מתמלא' : age < 0.28 ? 'רבע ראשון' : age < 0.47 ? 'ירח מתמלא'
      : age < 0.53 ? 'ירח מלא' : age < 0.72 ? 'ירח מתמעט' : age < 0.78 ? 'רבע אחרון' : 'סהר מתמעט';
    const toFull = ((0.5 - age + 1) % 1) * SYN, toNew = ((1 - age) % 1) * SYN;
    return { age, lit, name, toFull, toNew };
  }
  function moonCard(moon) {
    document.querySelector('.sun-card')?.remove();
    const m = moonPhase();
    const day = (n) => (n < 1 ? 'היום' : n < 1.5 ? 'מחר' : `בעוד ${Math.round(n)} ימים`);
    const heb = new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long' }).format(new Date());
    const card = el('div', { class: 'sun-card', role: 'dialog', 'aria-label': 'הירח הלילה' },
      el('button', { class: 'btn ghost small x', type: 'button', 'aria-label': 'סגירה', onclick: () => card.remove() }, '✕'),
      el('h3', {}, m.name),
      el('div', { class: 'times' }, el('span', {}, el('small', {}, 'מואר'), el('b', {}, Math.round(m.lit * 100) + '%')), el('span', {}, el('small', {}, 'היום בלוח העברי'), el('b', {}, heb))),
      el('p', {}, m.age < 0.5 ? `ירח מלא ${day(m.toFull)}.` : `מולד ${day(m.toNew)}.`),
      eclipseLine('lunar'));
    document.body.append(card);
    const r = moon.getBoundingClientRect();
    card.style.left = Math.max(12, Math.min(innerWidth - card.offsetWidth - 12, r.left + r.width / 2 - card.offsetWidth / 2)) + 'px';
    card.style.top = Math.min(innerHeight - card.offsetHeight - 12, r.bottom + 8) + 'px';
    const off = (e) => { if (!card.contains(e.target) && !moon.contains(e.target)) { card.remove(); document.removeEventListener('pointerdown', off); } };
    setTimeout(() => document.addEventListener('pointerdown', off), 0);
  }
  /** "ליקוי חמה חלקי עכשיו, עד 14:18" or "ליקוי הירח הבא: 12 בינואר 2028" */
  function eclipseLine(kind) {
    const now = eclipseAt(), t = (ms) => new Date(ms).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    if (now?.kind === kind) return el('p', { class: 'eclipse-now' }, `${now.name} עכשיו, עד ${t(now.to)}.`);
    const e = nextEclipse(kind);
    return e ? el('p', { class: 'muted' }, `${kind === 'solar' ? 'ליקוי החמה' : 'ליקוי הירח'} הבא בירושלים: ${new Date(e.from).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}.`) : null;
  }
  function sunCard(sun) {
    document.querySelector('.sun-card')?.remove();
    const s = H.sunNow();
    const t = (ms) => new Date(ms).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    const left = Math.max(0, s.set - Date.now()), mins = Math.round(left / 60e3);
    const card = el('div', { class: 'sun-card', role: 'dialog', 'aria-label': 'השמש היום' },
      el('button', { class: 'mu-btn x btn ghost small', type: 'button', 'aria-label': 'סגירה', onclick: () => card.remove() }, '✕'),
      el('h3', {}, s.day ? 'יום' : 'לילה'),
      el('div', { class: 'times' }, el('span', {}, el('small', {}, 'זריחה'), el('b', {}, t(s.rise))), el('span', {}, el('small', {}, 'צהריים'), el('b', {}, t(s.noon))), el('span', {}, el('small', {}, 'שקיעה'), el('b', {}, t(s.set)))),
      el('p', {}, s.day && left ? `עוד ${mins >= 60 ? Math.floor(mins / 60) + ' שעות ו־' : ''}${mins % 60} דקות עד השקיעה.` : 'השמש תזרח שוב ב־' + t(s.next) + '.'),
      eclipseLine('solar'),
      el('p', {}, el('a', { href: '/tools/weather/' }, 'תחזית מזג האוויר'), '.'));
    document.body.append(card);
    const r = sun.getBoundingClientRect();
    card.style.left = Math.max(12, Math.min(innerWidth - card.offsetWidth - 12, r.left + r.width / 2 - card.offsetWidth / 2)) + 'px';
    card.style.top = Math.min(innerHeight - card.offsetHeight - 12, r.bottom + 8) + 'px';
    const off = (e) => { if (!card.contains(e.target) && !sun.contains(e.target)) { card.remove(); document.removeEventListener('pointerdown', off); } };
    setTimeout(() => document.addEventListener('pointerdown', off), 0);
    card.addEventListener('keydown', (e) => { if (e.key === 'Escape') card.remove(); });
  }

  /* ---------- the music corner ---------- */
  function musicCorner() {
    // one record: an empty slot brings the player's record back to the stump (music.js H.music.dock); without it, as before
    const rec = el('button', { class: 'rec', type: 'button', title: 'נגן המוזיקה', 'aria-label': 'לפתוח את נגן המוזיקה', onclick: () => (H.music?.dock ? H.music.dock() : H.music?.float()) },
      el('span', { class: 'record' }), el('span', { class: 'tip' }, 'נגן'));
    const song = el('button', { class: 'song', type: 'button', title: 'השירון', 'aria-label': 'לפתוח את השירון בחלון צף', onclick: () => songWindow() },
      el('img', { src: '/assets/pillows/p05.webp', alt: '', draggable: 'false', loading: 'lazy' }), el('span', { class: 'badge' }, H.icon('music')));
    // the record shows what's playing (the player loads a moment after the page)
    const watch = () => {
      if (!H.music) return setTimeout(watch, 400);
      H.music.engine.on((st) => {
        rec.classList.toggle('playing', !!st.playing);
        rec.firstChild.style.setProperty('--art', st.art ? `url("${st.art}")` : '');
        rec.title = st.title ? `${st.title} – ${st.artist}` : 'נגן המוזיקה';
      });
    };
    watch();
    const corner = el('div', { class: 'corner' });
    // a mouse clicks the guitar; a finger strums it: a swipe across the strings (a tap does nothing), down or up
    const play = (up) => {
      strum(up);
      try { navigator.vibrate?.([12, 30, 10, 30, 8, 30, 14]); } catch { /* no vibration here */ }
      corner.classList.remove('strum'); void corner.offsetWidth; corner.classList.add('strum');
    };
    let swipe = null, touched = 0;
    const guitar = el('button', { class: 'guitar', type: 'button', title: 'גיטרה', 'aria-label': 'לפרוט על הגיטרה', onclick: (e) => {
      if (Date.now() - touched < 800 && e.detail) return;   // a finger: only the swipe plays (the keyboard's Enter still does)
      play(false);
    } });
    guitar.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; touched = Date.now(); swipe = { x: e.clientX, y: e.clientY, done: false }; try { guitar.setPointerCapture(e.pointerId); } catch (_) { /* fine */ } });   // captured: a sideways swipe soon leaves the narrow guitar
    guitar.addEventListener('pointermove', (e) => {
      if (!swipe || swipe.done) return;
      const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      if (Math.hypot(dx, dy) < 18) return;
      swipe.done = true; touched = Date.now();
      play(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ltr' : 'rtl') : dy < 0);   // up: from the high string; sideways: a picked chord of its own each way
    });
    const endSwipe = () => { swipe = null; };
    guitar.addEventListener('pointerup', endSwipe); guitar.addEventListener('pointercancel', endSwipe);
    corner.addEventListener('animationend', () => corner.classList.remove('strum'));
    corner.append(el('img', { class: 'stump', src: '/assets/stump.webp', alt: '', width: 700, height: 698, draggable: 'false', loading: 'lazy' }), el('img', { class: 'guitar-img', src: '/assets/guitar.webp', alt: '', width: 700, height: 698, draggable: 'false', loading: 'lazy' }), guitar, song, rec);
    return corner;
  }

  /** A gentle strum, made on the spot (plucked strings, Karplus-Strong): no sound file to load. All of them soft, as loud
      as each other, with a short release (the owner, batch 14):
      - down (false) / up (true): an open G, from the low string / from the high one;
      - sideways, left to right ('ltr'): an open A minor picked low to high;
      - sideways, right to left ('rtl'): an open C picked high to low. */
  let strumCtx = null;
  const strumBufs = {};
  const CHORDS = { g: [98, 123.47, 146.83, 196, 246.94, 392], am: [110, 164.81, 220, 261.63, 329.63, 440], c: [130.81, 164.81, 196, 261.63, 329.63, 392] };
  function strum(up = false) {
    try {
      strumCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      const ac = strumCtx;
      if (ac.state === 'suspended') ac.resume();
      const pluck = (f) => {
        const sr = ac.sampleRate, n = Math.floor(sr * 2.2), buf = ac.createBuffer(1, n, sr), d = buf.getChannelData(0);
        const p = Math.round(sr / f), line = new Float32Array(p);
        for (let i = 0; i < p; i++) line[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / p);   // a soft pick (a thumb, not a plectrum)
        for (let k = 0; k < 3; k++) for (let i = 1; i < p; i++) line[i] = 0.5 * (line[i] + line[i - 1]);   // rounder: fewer high overtones
        for (let i = 0, j = 0; i < n; i++, j = (j + 1) % p) { const next = line[(j + 1) % p]; d[i] = line[j]; line[j] = 0.4985 * (line[j] + next); }
        return buf;
      };
      const side = up === 'ltr' || up === 'rtl';
      const name = up === 'ltr' ? 'am' : up === 'rtl' ? 'c' : 'g';
      const bufs = (strumBufs[name] ||= CHORDS[name].map(pluck));
      const order = up === true || up === 'rtl' ? [...bufs].reverse() : bufs;   // up and right-to-left: from the high string
      const out = ac.createBiquadFilter(); out.type = 'lowpass'; out.frequency.value = 1300; out.Q.value = 0.5;   // soft: no bright edge
      const vol = ac.createGain(), t = ac.currentTime;
      vol.gain.setValueAtTime(0.0001, t); vol.gain.exponentialRampToValueAtTime(0.06, t + 0.03); vol.gain.setTargetAtTime(0.0001, t + (side ? 1 : 0.8), 0.3);   // a short release
      out.connect(vol).connect(ac.destination);
      const t0 = ac.currentTime + 0.01, gap = side ? 0.1 : 0.05;   // sideways: picked one by one, slower
      order.forEach((b, i) => { const s = ac.createBufferSource(); s.buffer = b; s.connect(out); s.start(t0 + i * gap); });
    } catch { /* no sound here */ }
  }

  /** The songbook in a window over the home page (the player's songbook window; it loads a moment after the page). */
  function songWindow() { if (H.music?.songbook) H.music.songbook('/songs/?embed=1', 'שירון'); else location.href = '/songs/'; }

  /* ---------- the campfire in the middle of the ring ---------- */
  function campfire() {
    const box = el('div', { class: 'fire', 'aria-hidden': 'true' }, el('span', { class: 'ground' }));
    // fire ג (the owner's choice): the stones and logs, and four curling tongues whose tips flick (docs/design/campfire.md)
    window.Campfire?.mount(box, { base: '/assets/campfire/base.webp', anchor: 54, flames: [
      { src: '/assets/campfire/flame-1.webp', x: -4, h: 55, z: 0.1 }, { src: '/assets/campfire/flame-2.webp', x: 13, h: 42, z: 0.4 },
      { src: '/assets/campfire/flame-3.webp', x: -15, h: 34, z: 0.6 }, { src: '/assets/campfire/flame-4.webp', x: 3, h: 27, z: 0.9 }] });
    return box;
  }

  /* ---------- arranging the cushions (batch 14, docs/design/arrange.md): a long press on a cushion swaps the ring for a tray ---------- */
  function arrange(pressed) {
    if (document.querySelector('.arr')) return;
    const svg = (d) => el('span', { html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">${d}</svg>` }).firstChild;
    const X = '<path d="M6 6l12 12M18 6 6 18"/>', LOCK = '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>', PLUS = '<path d="M12 5v14M5 12h14"/>';
    const app = (h) => H.APPS.find((a) => a.href === h);
    let list = H.ringApps().map((a) => a.href);
    const tray = el('ul', { class: 'arr-tray' });
    const live = el('p', { 'aria-live': 'polite', style: 'position:absolute;inline-size:1px;block-size:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap' });
    const sec = el('section', { class: 'arr', 'aria-labelledby': 'arr-h' },
      el('header', { class: 'arr-bar' },
        el('div', {}, el('h2', { id: 'arr-h' }, 'סידור הכריות'), el('p', {}, 'גוררים כרית כדי להזיז אותה, ✕ כדי להוריד. כריות עם מנעול נשארות תמיד.')),
        el('button', { class: 'btn primary arr-done', type: 'button', onclick: done }, 'סיום')),
      tray, live);
    const say = (h) => { live.textContent = `${app(h).name}, מקום ${list.indexOf(h) + 1} מתוך ${list.length}`; };
    function item(h, n) {
      const a = app(h);
      return el('li', { class: 'arr-item', 'data-href': h, 'data-fixed': !!a.fixed, style: `--n:${n}`, tabindex: '0', 'aria-roledescription': 'כרית שאפשר להזיז', 'aria-label': a.name },
        el('span', { class: 'arr-pillow' }, el('img', { src: `/assets/pillows/${a.pillow}.webp`, alt: '', draggable: 'false' }), el('span', { class: 'badge' }, H.appIcon(a.ic))),
        el('b', { class: 'arr-name' }, a.name), H.expTag(a),
        a.fixed ? el('span', { class: 'arr-fixed', role: 'img', 'aria-label': 'כרית קבועה', title: 'כרית קבועה: אפשר להזיז, לא להוריד' }, svg(LOCK))
          : el('button', { class: 'arr-x', type: 'button', 'aria-label': `הורדת ${a.name} מהבית`, onclick: () => remove(h) }, svg(X)));
    }
    function draw(focus) {
      tray.replaceChildren(...list.map(item), el('li', {}, el('button', { class: 'arr-add', type: 'button', onclick: add }, el('span', { class: 'arr-slot' }, svg(PLUS)), el('b', {}, 'הוסף כרית'))));
      if (focus) tray.querySelector(`[data-href="${focus}"]`)?.focus({ preventScroll: true });
    }
    const fromDom = () => { list = [...tray.querySelectorAll('.arr-item:not(.ghost)')].map((li) => li.dataset.href); };
    function remove(h) {
      const i = list.indexOf(h);
      if (i < 0 || app(h).fixed) return;
      list.splice(i, 1); draw();
      H.toast(`${app(h).name} ירד מהבית`, 'ביטול', () => { if (!list.includes(h)) { list.splice(Math.min(i, list.length), 0, h); draw(h); } });
    }
    function add() {
      const left = H.APPS.filter((a) => !list.includes(a.href));
      H.modal(el('h2', {}, 'הוספת כרית'), left.length
        ? el('ul', { class: 'arr-pick' }, ...left.map((a) => el('li', {}, el('button', { type: 'button', onclick: () => { list.push(a.href); H.closeModal(); draw(a.href); say(a.href); } },
            el('img', { src: `/assets/pillows/${a.pillow}.webp`, alt: '' }), el('span', {}, el('b', {}, a.name), el('small', {}, a.sub), H.expTag(a)), el('span', { class: 'arr-plus' }, svg(PLUS))))))
        : el('p', { class: 'arr-pick-empty' }, 'כל הכלים כבר בבית.'));
    }
    // dragging with a finger or the mouse: the cushion follows the pointer, a dashed ghost keeps its place in the tray
    let dr = null;
    tray.addEventListener('pointerdown', (e) => {
      const it = e.target.closest('.arr-item');
      if (!it || e.button > 0 || e.target.closest('.arr-x')) return;
      dr = { it, x: e.clientX, y: e.clientY, id: e.pointerId, on: false };
    });
    tray.addEventListener('pointermove', (e) => {
      if (!dr || e.pointerId !== dr.id) return;
      const dx = e.clientX - dr.x, dy = e.clientY - dr.y;
      if (!dr.on) {
        if (Math.hypot(dx, dy) < 6) return;
        const r = dr.it.getBoundingClientRect();
        dr.on = true; dr.r = r;
        dr.ghost = el('li', { class: 'arr-item ghost', 'aria-hidden': 'true' }, el('span', { class: 'arr-pillow' }));
        dr.it.after(dr.ghost);
        try { dr.it.setPointerCapture(dr.id); } catch {}
        dr.it.classList.add('dragging');
        Object.assign(dr.it.style, { position: 'fixed', top: '0', left: '0', inlineSize: r.width + 'px', pointerEvents: 'none', margin: '0' });
      }
      dr.it.style.translate = `${dr.r.left + dx}px ${dr.r.top + dy}px`;
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('.arr-item');
      if (under && under !== dr.ghost && under !== dr.it && tray.contains(under)) {
        const kids = [...tray.children];
        if (kids.indexOf(under) < kids.indexOf(dr.ghost)) under.before(dr.ghost); else under.after(dr.ghost);
      }
    });
    const drop = () => {
      if (!dr) return;
      const d = dr; dr = null;
      if (!d.on) return;
      d.ghost.replaceWith(d.it);
      d.it.classList.remove('dragging');
      ['position', 'top', 'left', 'inline-size', 'pointer-events', 'margin', 'translate'].forEach((p) => d.it.style.removeProperty(p));
      fromDom(); say(d.it.dataset.href);
      tray.dataset.justDragged = '1'; setTimeout(() => delete tray.dataset.justDragged, 50);
    };
    tray.addEventListener('pointerup', drop);
    tray.addEventListener('pointercancel', drop);
    tray.addEventListener('click', (e) => { if (tray.dataset.justDragged) { e.preventDefault(); e.stopPropagation(); } }, true);
    // the keyboard: Space picks up, the arrows move, Space or Enter puts down
    tray.addEventListener('keydown', (e) => {
      const it = e.target.closest?.('.arr-item');
      if (!it || e.target !== it) return;
      const h = it.dataset.href, held = it.getAttribute('aria-grabbed') === 'true';
      if (e.key === ' ' || (held && (e.key === 'Enter' || e.key === 'Escape'))) {
        e.preventDefault();
        if (held) { it.removeAttribute('aria-grabbed'); say(h); } else { it.setAttribute('aria-grabbed', 'true'); live.textContent = `${app(h).name} הורם. החצים מזיזים, רווח מניח.`; }
        return;
      }
      if (!held) return;
      const cols = getComputedStyle(tray).gridTemplateColumns.split(' ').length || 1;
      const by = { ArrowLeft: 1, ArrowRight: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];   // right to left: the next one is on the left
      if (!by) return;
      e.preventDefault();
      const i = list.indexOf(h), j = Math.max(0, Math.min(list.length - 1, i + by));
      if (i === j) return;
      list.splice(i, 1); list.splice(j, 0, h);
      draw(h);
      tray.querySelector(`[data-href="${h}"]`)?.setAttribute('aria-grabbed', 'true');
      say(h);
    });
    function done() {
      H.setRing(list);
      const ring = H.ringApps(), nw = appWheel(ring);
      wheel.root.replaceWith(nw.root); wheel.caption.replaceWith(nw.caption);
      sec.remove(); wheel = nw;
      nw.start(Math.max(0, ring.findIndex((a) => a.href === pressed)));
    }
    draw();
    wheel.root.hidden = true; wheel.root.style.display = 'none'; wheel.caption.hidden = true;
    wheel.root.after(sec);
    if (sec.getBoundingClientRect().top > innerHeight * 0.55) sec.scrollIntoView({ block: 'start' });
    tray.querySelector(`[data-href="${pressed}"]`)?.focus({ preventScroll: true });
  }

  /* ---------- the apps ring: spin it with a finger, the mouse, the arrows; it never ends ---------- */
  function appWheel(list) {
    const N = list.length, step = (Math.PI * 2) / N;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const caption = el('p', { class: 'wheel-caption', 'aria-live': 'polite' });
    const orbit = el('div', { class: 'orbit', 'aria-hidden': 'true' });
    const arrow = (d) => el('span', { html: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>` }).firstChild;
    const prev = el('button', { class: 'spin prev', type: 'button', 'aria-label': 'האפליקציה הקודמת' }, arrow('M9 5l7 7-7 7'));
    const next = el('button', { class: 'spin next', type: 'button', 'aria-label': 'האפליקציה הבאה' }, arrow('M15 5l-7 7 7 7'));
    const items = list.map((a, i) => el('a', { class: 'wheel-item', href: a.href, 'data-guide': 'app-' + a.ic, 'data-guide-label': a.name, style: `--c2:${a.c2}`, draggable: 'false' },
      el('span', { class: 'pillow' }, el('img', { src: `/assets/pillows/${a.pillow}.webp`, alt: '', draggable: 'false', decoding: 'async', loading: 'lazy' }), el('span', { class: 'badge' }, H.appIcon(a.ic)), H.expTag(a)),
      el('b', { class: 'label' }, swell(a.name))));
    // the compass on the floor (the owner, 2026-11-15): white and faint, turns with the cushions and a beat behind them, like a needle
    const NS = 'http://www.w3.org/2000/svg', compass = document.createElementNS(NS, 'svg');
    compass.setAttribute('class', 'compass'); compass.setAttribute('viewBox', '0 0 200 200'); compass.setAttribute('preserveAspectRatio', 'none');
    compass.innerHTML = (() => {
      const mk = (a, r1, r2, w) => { const rd = (a * Math.PI) / 180, x = (r) => (100 - r * Math.sin(rd)).toFixed(1), y = (r) => (100 + r * Math.cos(rd)).toFixed(1); return `<line x1="${x(r1)}" y1="${y(r1)}" x2="${x(r2)}" y2="${y(r2)}" stroke-width="${w}" vector-effect="non-scaling-stroke"/>`; };
      // a compass rose, no letters: two rings, a scale of ticks (every 5°, longer at 10° and 30°), the four main points and the four between
      const ring = (r, w, d) => `<circle cx="100" cy="100" r="${r}" fill="none" stroke-width="${w}"${d ? ` stroke-dasharray="${d}"` : ''} vector-effect="non-scaling-stroke"/>`;
      const star = (a, r1, r2, hw) => { const p = (ang, r) => { const rd = (ang * Math.PI) / 180; return (100 - r * Math.sin(rd)).toFixed(1) + ',' + (100 + r * Math.cos(rd)).toFixed(1); }; return `<polygon points="${p(a, r2)} ${p(a + hw, r1)} ${p(a, 0)} ${p(a - hw, r1)}" fill="currentColor" fill-opacity=".16" stroke-width=".8" vector-effect="non-scaling-stroke"/>`; };
      let s = ring(78, .7) + ring(40, .7, '3 5');   // (no frame round the outside: the ticks alone mark the edge)
      for (let a = 0; a < 360; a += 5) s += a % 90 === 0 ? mk(a, 70, 98.5, 1.6) : a % 30 === 0 ? mk(a, 75, 98.5, 1.2) : a % 10 === 0 ? mk(a, 81, 98.5, 1) : mk(a, 87, 98.5, .7);
      for (let a = 0; a < 360; a += 90) s += star(a, 34, 128, 20);
      for (let a = 45; a < 360; a += 90) s += star(a, 22, 108, 14);
      return `<g class="cmp" fill="none" stroke="currentColor" stroke-linecap="round">${s}</g>`;
    })();
    const cmp = compass.firstChild;
    const turnCompass = () => cmp.setAttribute('transform', `rotate(${(-cr * step * 180 / Math.PI).toFixed(2)} 100 100)`);
    orbit.append(compass);
    const root = el('nav', { class: 'wheel', 'aria-label': 'האפליקציות', 'aria-roledescription': 'גלגל' }, orbit, campfire(), ...items, prev, next);
    // off: how far the cushion's centre sits above the item box's centre (the ring passes through the cushions' centres)
    let rot = reduced ? 0 : -1.6, cr = rot, vel = 0, goal = 0, rx = 300, ry = 60, cy = 0, off = 0, raf = 0, last = 0, drag = null, front = -1;
    const mod = (n) => ((n % N) + N) % N;

    function measure() {
      const w = root.clientWidth;
      const small = w < 600;
      rx = Math.max(110, Math.min(small ? w / 2 - 50 : w / 2 - 120, 360));
      // a flat ellipse round the fire (depth), the front cushions 10-13 px clear of the logs and flames, the back one partly behind
      // the flames; tuned on the real images' outlines over a whole turn (the owner, 2026-11-14)
      ry = small ? 78 : 102;
      cy = parseFloat(getComputedStyle(root).getPropertyValue('--cy')) || 0;
      const pil = items[0].querySelector('.pillow');
      const ph = parseFloat(getComputedStyle(pil).height) || 100;   // (an SVG has no offsetHeight)
      off = items[0].offsetHeight / 2 - ph / 2;
      items.forEach((it) => { it.style.transformOrigin = `50% ${ph / 2}px`; });
      root.style.setProperty('--rx', rx); root.style.setProperty('--ry', ry);
    }
    function layout() {
      items.forEach((it, i) => {
        const th = (i - rot) * step, c = Math.cos(th), s = Math.sin(th);
        const depth = (c + 1) / 2;   // 1 in front, 0 at the back
        const sc = 0.5 + 0.5 * depth;
        it.style.transform = `translate(${(-s * rx).toFixed(1)}px, ${(c * ry + cy + off).toFixed(1)}px) scale(${sc.toFixed(3)})`;
        it.style.opacity = (0.28 + 0.72 * depth ** 1.4).toFixed(3);
        it.style.zIndex = String(Math.round(depth * 100));
        it.classList.toggle('back', depth < 0.4);
      });
      const f = mod(Math.round(rot));
      if (f !== front) {
        front = f;
        items.forEach((it, i) => { it.classList.toggle('front', i === f); it.tabIndex = i === f ? 0 : -1; it.setAttribute('aria-current', i === f ? 'true' : 'false'); });
        caption.textContent = list[f].sub;
      }
    }
    function tick(now) {
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      if (!drag) {
        if (Math.abs(vel) > 0.5) { rot += vel * dt; vel *= Math.exp(-dt * 2.4); goal = Math.round(rot + vel * 0.3); }
        else { vel = 0; rot += (goal - rot) * Math.min(1, dt * (reduced ? 60 : 8)); }
      }
      layout();
      cr = reduced ? rot : cr + (rot - cr) * Math.min(1, dt * 3.2); turnCompass();   // a beat behind the cushions
      if (drag || Math.abs(vel) > 0.5 || Math.abs(goal - rot) > 0.0015 || Math.abs(rot - cr) > 0.002) raf = requestAnimationFrame(tick);
      else { rot = goal; cr = rot; layout(); turnCompass(); raf = 0; last = 0; }
    }
    const run = () => { if (!raf) raf = requestAnimationFrame(tick); };
    /** Spin to an app the shortest way round. */
    function spinTo(i) { if (roll) return; const d = mod(i - Math.round(rot) + Math.floor(N / 2)) - Math.floor(N / 2); vel = 0; goal = Math.round(rot) + d; run(); }

    // a finger or the mouse: the ring follows the hand, then keeps spinning by its momentum and settles on an app
    root.addEventListener('pointerdown', (e) => {
      if (roll || e.button > 0 || e.target.closest('.spin')) return;
      root.classList.add('touching');   // design 2026-11-15: the compass on the floor shows while the ring is touched (index.html .wheel .orbit::before)
      drag = { x: e.clientX, rot0: rot, moved: false, t: performance.now(), lx: e.clientX, v: 0, id: e.pointerId };
      vel = 0; run();
      if (onFire(e)) press = { id: e.pointerId, x: e.clientX, y: e.clientY, t: setTimeout(() => { press = null; drag = null; root.classList.remove('dragging'); roulette(); }, 600) };
    });
    root.addEventListener('pointermove', (e) => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) unpress();
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 7) { drag.moved = true; root.classList.add('dragging'); try { root.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } }
      if (!drag.moved) return;
      const per = rx * step;   // pixels per app at the front
      rot = drag.rot0 + dx / per;
      const now = performance.now(), dt = Math.max(1, now - drag.t) / 1000;
      drag.v = drag.v * 0.6 + (((e.clientX - drag.lx) / per) / dt) * 0.4;
      drag.t = now; drag.lx = e.clientX;
    });
    const end = (e) => {
      unpress();
      if (!drag || (e.pointerId != null && e.pointerId !== drag.id)) return;
      const moved = drag.moved;
      vel = moved && performance.now() - drag.t < 90 ? Math.max(-14, Math.min(14, drag.v)) : 0;
      goal = Math.round(rot + vel * 0.3);
      drag = moved ? { done: true } : null;
      root.classList.remove('dragging');
      if (moved) setTimeout(() => { if (drag?.done) drag = null; run(); }, 0);
      run();
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    root.addEventListener('pointerup', () => root.classList.remove('touching'));
    root.addEventListener('pointercancel', () => root.classList.remove('touching'));
    // a tap on an app in front opens it; a tap on another one spins it to the front
    root.addEventListener('click', (e) => {
      const it = e.target.closest('.wheel-item');
      if (!it) return;
      if (roll) { e.preventDefault(); return; }
      const i = items.indexOf(it);
      if (root.dataset.justDragged) { e.preventDefault(); return; }
      if (i !== front) { e.preventDefault(); spinTo(i); }
    });
    root.addEventListener('pointerup', () => { if (root.classList.contains('dragging') || drag?.done) { root.dataset.justDragged = '1'; setTimeout(() => delete root.dataset.justDragged, 60); } }, true);
    // a trackpad's sideways swipe (or shift + wheel)
    let wheelEnd;
    root.addEventListener('wheel', (e) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (!d) return;
      e.preventDefault();
      if (roll) return;
      rot -= d / (rx * step); vel = 0; goal = rot; run();
      clearTimeout(wheelEnd); wheelEnd = setTimeout(() => { goal = Math.round(rot); run(); }, 120);
    }, { passive: false });
    // keys: right-to-left, so ← is the next app
    root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        spinTo(front + (e.key === 'ArrowLeft' ? 1 : -1));
        setTimeout(() => items[front]?.focus({ preventScroll: true }), 30);
      }
    });

    /* the roulette (the owner, 2026-11-13): a long press on the fire spins the ring like a roulette wheel, fast and then
       slowing, and it stops on a cushion drawn beforehand by a true random draw – so the ring can settle a question among friends */
    const fire = root.querySelector('.fire');
    let press = null, roll = null, chosenT = 0;
    function onFire(e) {
      if (!fire || e.target.closest('.wheel-item')) return false;
      const r = fire.getBoundingClientRect();
      return e.clientX > r.left - 12 && e.clientX < r.right + 12 && e.clientY > r.top - 16 && e.clientY < r.bottom + 8;
    }
    function unpress() { if (press) { clearTimeout(press.t); press = null; } }
    // a finger held on the fire must not open the phone's menu or select anything
    root.addEventListener('contextmenu', (e) => { if (press || roll) e.preventDefault(); });
    function roulette() {
      const r = new Uint32Array(2); crypto.getRandomValues(r);
      const win = r[0] % N;   // the winner, chosen before the spin (N is a handful, so the modulo bias is nil)
      cancelAnimationFrame(raf); raf = 0; last = 0; vel = 0;
      clearTimeout(chosenT); items.forEach((it) => it.classList.remove('chosen'));
      navigator.vibrate?.(14);
      const from = rot, base = Math.round(rot);
      // three or four whole turns, then on to the winner; the ease-out lands on it exactly
      const to = base + mod(win - base) + (reduced ? 0 : N * (3 + (r[1] & 1)));
      if (reduced) { rot = goal = to; layout(); return chosen(win); }
      const t0 = performance.now(), dur = 4200 + (r[1] >>> 1) % 900;
      fire.classList.add('cf-roll');
      roll = {};
      const frame = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        rot = from + (to - from) * (1 - (1 - t) ** 4);
        layout();
        if (t < 1) { roll.raf = requestAnimationFrame(frame); return; }
        rot = goal = to; layout(); roll = null; fire.classList.remove('cf-roll'); chosen(win);
      };
      roll.raf = requestAnimationFrame(frame);
    }
    /** The cushion the roulette stopped on glows warm for a while, and a few sparks leap from the fire. */
    function chosen(win) {
      const it = items[win];
      it.classList.add('chosen');
      caption.textContent = `הגורל נפל על: ${list[win].name}`;
      navigator.vibrate?.([20, 70, 36]);
      if (!reduced) { fire.classList.remove('cf-win'); void fire.offsetWidth; fire.classList.add('cf-win'); setTimeout(() => fire.classList.remove('cf-win'), 1400); }
      chosenT = setTimeout(() => it.classList.remove('chosen'), 4500);
    }

    next.addEventListener('click', () => spinTo(front + 1));
    prev.addEventListener('click', () => spinTo(front - 1));
    window.addEventListener('resize', () => { measure(); layout(); });

    return { root, caption, start(at = 0) { measure(); layout(); goal = at; setTimeout(run, reduced ? 0 : 250); } };
  }
})();
