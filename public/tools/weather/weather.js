/* מזג אוויר (docs/ai/ready-soon.md, item 1): the weather for the city in the settings, from /api/weather (Open-Meteo,
   through the server). Now, a line of advice for the day, the next 24 hours, and the week. Another city can be looked up
   without changing the settings. The last forecast is kept on this device, so the page opens at once (and offline).
   The look is design's weather.css (.wx-*; docs/design/prototype/weather.html): the pin, the drop and the bulb are drawn
   there, so the text holds no emoji of its own (the sky's icons stay). */
(async () => {
  const { el, api } = H;
  await H.requireLogin();
  H.header('מזג אוויר');
  const root = document.querySelector('main');
  const KEEP = 'helper.weather';
  let other = '';   // another city looked up here (not saved)
  const SP = H.prefs('weather', { beach: '' });   // the beach for the sea card (per person; '' = the place itself)

  const read = () => { try { return JSON.parse(localStorage.getItem(KEEP) || 'null'); } catch (_) { return null; } };
  const keep = (w) => { try { localStorage.setItem(KEEP, JSON.stringify(w)); } catch (_) { /* private mode */ } };

  const dayName = (d, i) => (i === 0 ? 'היום' : i === 1 ? 'מחר' : new Date(d + 'T12:00').toLocaleDateString('he-IL', { weekday: 'long' }).replace(/^יום /, ''));
  const WHY = { weather_unavailable: 'שירות מזג האוויר לא ענה. נסו שוב בעוד רגע.', city_not_found: 'לא מצאתי עיר בשם הזה. נסו לכתוב אותה אחרת.' };
  const rain = (p) => el('small', { class: 'wx-rain' }, p >= 20 ? p + '%' : '');   // (the drop is drawn; empty under 20%)

  /** the city line: where, and looking up another one */
  function where(w) {
    const input = el('input', { id: 'wx-city', type: 'search', dir: 'auto', maxlength: 60, placeholder: 'עיר אחרת', 'aria-label': 'חיפוש עיר אחרת', value: other });
    const go = () => { other = input.value.trim(); load(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    const place = w ? [w.place.name, w.place.region && w.place.region !== w.place.name ? w.place.region : ''].filter(Boolean).join(', ') : '…';
    return el('div', { class: 'wx-where' },
      el('div', { class: 'wx-place' }, el('b', {}, place),
        w?.from === 'default' ? el('small', { class: 'muted' }, 'לא נקבעה עיר, אז מוצגת ירושלים. ', el('a', { href: '/settings/' }, 'לקבוע עיר בהגדרות')) : null),
      el('div', { class: 'wx-find' }, input,
        el('button', { class: 'btn small', type: 'button', onclick: go }, 'הצגה'),
        other ? el('button', { class: 'btn ghost small', type: 'button', onclick: () => { other = ''; load(); } }, 'העיר שלי') : null));
  }

  function now(f) {
    const n = f.now;
    return el('section', { class: 'wx-card wx-now', 'aria-label': 'עכשיו' },
      el('div', { class: 'wx-ico', 'aria-hidden': 'true' }, n.sky.icon),
      el('div', { class: 'wx-temp' }, el('b', {}, n.temp + '°'), el('span', {}, n.sky.text)),
      el('div', { class: 'wx-meta' }, `מרגיש כמו ${n.feels}° · רוח ${n.wind} קמ״ש · לחות ${n.humidity}%` + (n.rain ? ` · ${n.rain} מ״מ גשם` : '')),
      f.advice.length ? el('div', { class: 'wx-advice', role: 'note' }, f.advice.map((a) => el('p', {}, a))) : null);
  }

  function hours(f) {
    return el('section', { class: 'wx-card', 'aria-labelledby': 'wx-h' },
      el('h2', { id: 'wx-h' }, 'השעות הקרובות'),
      el('ol', { class: 'wx-strip', tabindex: '0', 'aria-label': '24 השעות הקרובות' },
        f.hours.map((h, i) => el('li', { class: 'wx-hour' + (i === 0 ? ' now' : ''), 'aria-label': `${i === 0 ? 'עכשיו' : h.time}: ${h.temp} מעלות, ${h.sky.text}${h.rain >= 20 ? `, ${h.rain}% סיכוי לגשם` : ''}` },
          el('small', {}, i === 0 ? 'עכשיו' : h.time),
          el('span', { class: 'wx-ico', 'aria-hidden': 'true' }, h.sky.icon),
          el('b', {}, h.temp + '°'),
          rain(h.rain)))));
  }

  function days(f) {
    const lo = Math.min(...f.days.map((d) => d.min)), hi = Math.max(...f.days.map((d) => d.max)), span = Math.max(1, hi - lo);
    const today = f.days[0];
    return el('section', { class: 'wx-card', 'aria-labelledby': 'wx-d' },
      el('h2', { id: 'wx-d' }, 'השבוע'),
      el('ul', { class: 'wx-days' }, f.days.map((d, i) => el('li', { class: 'wx-day',
        'aria-label': `${dayName(d.date, i)}: ${d.sky.text}, ${d.min} עד ${d.max} מעלות${d.rain >= 20 ? `, ${d.rain}% סיכוי לגשם` : ''}` },
        el('b', {}, dayName(d.date, i)),
        el('span', { class: 'wx-ico', 'aria-hidden': 'true', title: d.sky.text }, d.sky.icon),
        // the day's range on the week's scale (--a where it starts, --w how wide: % of the week's span, without the %)
        el('div', { class: 'wx-range', 'aria-hidden': 'true' },
          el('small', {}, d.min + '°'),
          el('div', { class: 'wx-track' }, el('i', { style: `--a:${Math.round(((d.min - lo) / span) * 1000) / 10};--w:${Math.round(((d.max - d.min) / span) * 1000) / 10}` })),
          el('small', {}, d.max + '°')),
        rain(d.rain)))),
      today ? el('p', { class: 'wx-sun' }, `זריחה ${today.sunrise} · שקיעה ${today.sunset}` + (today.uv != null ? ` · קרינת UV ${today.uv}` : '')) : null);
  }

  /** the sea: per day, diving, surfing and a beach day – good, fair or not – with the reason (server/sea-logic.ts) */
  const ACTS = [['dive', 'צלילה'], ['surf', 'גלישה'], ['beach', 'יום חוף']];
  const LEVEL = { good: 'טוב', fair: 'בינוני', poor: 'לא מתאים' };
  function sea(w) {
    const s = w.sea;
    const pick = el('select', { id: 'wx-beach', 'aria-label': 'החוף לתחזית הים', onchange: (e) => {
      SP.beach = e.target.value; H.savePrefs('weather', { beach: SP.beach }); load();
    } }, el('option', { value: '', selected: !SP.beach }, 'המקום שלי'),
      (w.beaches || []).map((b) => el('option', { value: b.id, selected: b.id === SP.beach }, b.name)));
    return el('section', { class: 'wx-card wx-sea', 'aria-labelledby': 'wx-s' },
      el('div', { class: 'wx-sea-head' }, el('h2', { id: 'wx-s' }, s ? 'ים · ' + s.spot.name : 'ים'), pick),
      !s ? el('p', { class: 'muted' }, SP.beach ? 'אין כרגע תחזית ים לחוף הזה.' : 'המקום הזה לא על החוף. אפשר לבחור חוף ולראות אם כדאי לצלול, לגלוש או לרדת לים.')
        : el('ul', { class: 'wx-sea-days' }, s.days.map((d, i) => el('li', { class: 'wx-sea-day' },
          el('details', { open: i === 0 },
            el('summary', { 'aria-label': `${dayName(d.date, i)}: ` + ACTS.map(([k, n]) => `${n} ${LEVEL[d[k].level]}`).join(', ') },
              el('b', {}, dayName(d.date, i)),
              el('span', { class: 'wx-acts', 'aria-hidden': 'true' }, ACTS.map(([k, n]) => el('span', { class: 'wx-act', 'data-act': k, 'data-level': d[k].level }, n)))),
            el('dl', { class: 'wx-why' }, ACTS.flatMap(([k, n]) => [
              el('dt', { 'data-act': k, 'data-level': d[k].level }, `${n}: ${LEVEL[d[k].level]}`),
              el('dd', {}, d[k].why)])),
            d.water != null || d.waves != null ? el('p', { class: 'wx-sea-meta' },
              [d.waves != null ? `גלים עד ${d.waves} מ׳` : '', d.period != null ? `מחזור ${Math.round(d.period)} שנ׳` : '', d.water != null ? `מים ${Math.round(d.water)}°` : ''].filter(Boolean).join(' · ')) : null)))),
      s ? el('p', { class: 'wx-fine' }, 'הערכה לפי תחזית הים, לא תחליף לדגל ולמציל.') : null);
  }

  function draw(w, note) {
    root.replaceChildren(el('div', { class: 'wx' },
      where(w),
      note ? el('p', { class: 'notice', role: 'status' }, note) : null,
      !w && !note ? el('section', { class: 'wx-card' }, el('p', { class: 'wx-wait', role: 'status' }, 'מביא את התחזית…')) : null,
      ...(w ? [now(w.forecast), hours(w.forecast), days(w.forecast), w.beaches ? sea(w) : null,
        el('p', { class: 'wx-credit' }, 'התחזית מ־', el('a', { href: 'https://open-meteo.com/', target: '_blank', rel: 'noopener' }, 'Open-Meteo'))] : [])));
  }

  async function load() {
    const cached = !other && read();
    if (cached) draw(cached); else draw(null);
    try {
      const q = new URLSearchParams();
      if (other) q.set('city', other);
      q.set('beach', SP.beach || 'home');   // the choice just made counts before the prefs reach the server
      const w = await api('/api/weather?' + q);
      if (!other) keep(w);
      draw(w);
    } catch (e) {
      const msg = WHY[e.code] || (e.offline ? 'אין חיבור לאינטרנט' + (cached ? ', אז מוצגת התחזית האחרונה.' : '.') : 'לא הצלחתי להביא את התחזית.');
      draw(cached || null, msg);
    }
  }
  load();
})();
