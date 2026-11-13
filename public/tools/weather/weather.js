/* מזג אוויר (docs/ai/ready-soon.md, item 1): the weather for the city in the settings, from /api/weather (Open-Meteo,
   through the server). Now, a line of advice for the day, the next 24 hours, and the week. Another city can be looked up
   without changing the settings. The last forecast is kept on this device, so the page opens at once (and offline).
   The look is inline on the tokens for now; design may move it to weather.css (.wx-*). */
(async () => {
  const { el, api } = H;
  await H.requireLogin();
  H.header('מזג אוויר');
  const root = document.querySelector('main');
  const KEEP = 'helper.weather';
  let other = '';   // another city looked up here (not saved)

  const read = () => { try { return JSON.parse(localStorage.getItem(KEEP) || 'null'); } catch (_) { return null; } };
  const keep = (w) => { try { localStorage.setItem(KEEP, JSON.stringify(w)); } catch (_) { /* private mode */ } };

  const CARD = 'background:var(--card);border:1px solid var(--line);border-radius:20px;padding:16px';
  const dayName = (d, i) => (i === 0 ? 'היום' : i === 1 ? 'מחר' : new Date(d + 'T12:00').toLocaleDateString('he-IL', { weekday: 'long' }));
  const WHY = { weather_unavailable: 'שירות מזג האוויר לא ענה. נסו שוב בעוד רגע.', city_not_found: 'לא מצאתי עיר בשם הזה. נסו לכתוב אותה אחרת.' };

  /** the city line: where, and looking up another one */
  function where(w) {
    const input = el('input', { type: 'search', dir: 'auto', maxlength: 60, placeholder: 'עיר אחרת', 'aria-label': 'חיפוש עיר אחרת', value: other,
      style: 'font:inherit;padding:6px 12px;border-radius:999px;border:1px solid var(--line-strong);background:var(--bg);color:var(--text);inline-size:10em;max-inline-size:100%' });
    const go = () => { other = input.value.trim(); load(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    const place = w ? [w.place.name, w.place.region && w.place.region !== w.place.name ? w.place.region : ''].filter(Boolean).join(', ') : '';
    return el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-block-end:12px' },
      el('div', {}, el('b', { style: 'font-size:1.15rem' }, '📍 ' + (place || '…')),
        w?.from === 'default' ? el('small', { class: 'muted', style: 'display:block' }, 'לא נקבעה עיר, אז מוצגת ירושלים. ', el('a', { href: '/settings/' }, 'לקבוע עיר בהגדרות')) : null),
      el('div', { style: 'display:flex;gap:6px;align-items:center' }, input,
        el('button', { class: 'btn small', type: 'button', onclick: go }, 'הצגה'),
        other ? el('button', { class: 'btn ghost small', type: 'button', onclick: () => { other = ''; load(); } }, 'העיר שלי') : null));
  }

  function now(f) {
    const n = f.now;
    return el('section', { style: CARD + ';display:grid;grid-template-columns:auto 1fr;gap:4px 16px;align-items:center', 'aria-label': 'עכשיו' },
      el('div', { 'aria-hidden': 'true', style: 'font-size:3.6rem;line-height:1;grid-row:span 2' }, n.sky.icon),
      el('div', {}, el('b', { style: 'font-size:2.6rem;line-height:1' }, n.temp + '°'), el('span', { style: 'margin-inline-start:10px;font-size:1.15rem' }, n.sky.text)),
      el('div', { class: 'muted small' }, `מרגיש כמו ${n.feels}° · רוח ${n.wind} קמ״ש · לחות ${n.humidity}%` + (n.rain ? ` · ${n.rain} מ״מ גשם` : '')),
      f.advice.length ? el('div', { role: 'note', style: 'grid-column:1/-1;margin-block-start:10px;display:grid;gap:4px' }, f.advice.map((a) => el('p', { style: 'margin:0' }, '💡 ' + a))) : null);
  }

  function hours(f) {
    return el('section', { style: CARD, 'aria-labelledby': 'wx-h' },
      el('h2', { id: 'wx-h', style: 'margin:0 0 10px;font-size:1.05rem' }, 'השעות הקרובות'),
      el('ol', { style: 'list-style:none;margin:0;padding:0 0 6px;display:flex;gap:6px;overflow-x:auto;scroll-snap-type:x mandatory', tabindex: '0', 'aria-label': '24 השעות הקרובות' },
        f.hours.map((h, i) => el('li', { 'aria-label': `${i === 0 ? 'עכשיו' : h.time}: ${h.temp} מעלות, ${h.sky.text}${h.rain >= 20 ? `, ${h.rain}% סיכוי לגשם` : ''}`,
          style: 'flex:0 0 auto;display:grid;justify-items:center;gap:2px;min-inline-size:52px;padding:8px 4px;border-radius:14px;scroll-snap-align:start;' + (i === 0 ? 'background:color-mix(in srgb, var(--primary) 12%, transparent)' : '') },
          el('small', { class: 'muted' }, i === 0 ? 'עכשיו' : h.time),
          el('span', { 'aria-hidden': 'true', style: 'font-size:1.5rem' }, h.sky.icon),
          el('b', {}, h.temp + '°'),
          el('small', { style: 'color:var(--primary);min-block-size:1.2em' }, h.rain >= 20 ? '💧' + h.rain + '%' : '')))));
  }

  function days(f) {
    const lo = Math.min(...f.days.map((d) => d.min)), hi = Math.max(...f.days.map((d) => d.max)), span = Math.max(1, hi - lo);
    return el('section', { style: CARD, 'aria-labelledby': 'wx-d' },
      el('h2', { id: 'wx-d', style: 'margin:0 0 6px;font-size:1.05rem' }, 'השבוע'),
      el('ul', { style: 'list-style:none;margin:0;padding:0' }, f.days.map((d, i) => el('li', {
        style: 'display:grid;grid-template-columns:4.6em 2em minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px 0' + (i ? ';border-block-start:1px solid var(--line)' : ''),
        'aria-label': `${dayName(d.date, i)}: ${d.sky.text}, ${d.min} עד ${d.max} מעלות${d.rain >= 20 ? `, ${d.rain}% סיכוי לגשם` : ''}` },
        el('b', {}, dayName(d.date, i)),
        el('span', { 'aria-hidden': 'true', style: 'font-size:1.4rem', title: d.sky.text }, d.sky.icon),
        // the day's range on the week's scale
        el('div', { 'aria-hidden': 'true', style: 'display:flex;align-items:center;gap:8px' },
          el('small', { class: 'muted', style: 'inline-size:2.2em;text-align:end' }, d.min + '°'),
          el('div', { style: 'flex:1;block-size:6px;border-radius:3px;background:var(--line);position:relative' },
            el('i', { style: `position:absolute;inset-block:0;inset-inline-start:${((d.min - lo) / span) * 100}%;inline-size:${Math.max(4, ((d.max - d.min) / span) * 100)}%;border-radius:3px;background:linear-gradient(to left, #6aa7d8, #f08a1c)` })),
          el('small', { style: 'inline-size:2.2em' }, d.max + '°')),
        el('small', { style: 'color:var(--primary);min-inline-size:3.2em;text-align:end' }, d.rain >= 20 ? '💧' + d.rain + '%' : '')))),
      f.days[0] ? el('p', { class: 'muted small', style: 'margin:10px 0 0' }, `זריחה ${f.days[0].sunrise} · שקיעה ${f.days[0].sunset}` + (f.days[0].uv != null ? ` · קרינת UV ${f.days[0].uv}` : '')) : null);
  }

  function draw(w, note) {
    // (one column that may shrink: the hour strip scrolls inside its card instead of widening the page)
    root.replaceChildren(el('div', { style: 'display:grid;grid-template-columns:minmax(0,1fr);gap:14px;max-inline-size:760px;margin-inline:auto' },
      where(w),
      note ? el('p', { class: 'notice', role: 'status' }, note) : null,
      !w && !note ? el('p', { class: 'muted', role: 'status', style: CARD + ';text-align:center' }, '⛅ מביא את התחזית…') : null,
      ...(w ? [now(w.forecast), hours(w.forecast), days(w.forecast),
        el('p', { class: 'muted small', style: 'margin:0;text-align:center' }, 'התחזית מ־', el('a', { href: 'https://open-meteo.com/', target: '_blank', rel: 'noopener' }, 'Open-Meteo'))] : [])));
  }

  async function load() {
    const cached = !other && read();
    if (cached) draw(cached); else draw(null);
    try {
      const w = await api('/api/weather' + (other ? '?city=' + encodeURIComponent(other) : ''));
      if (!other) keep(w);
      draw(w);
    } catch (e) {
      const msg = WHY[e.code] || (e.offline ? 'אין חיבור לאינטרנט' + (cached ? ', אז מוצגת התחזית האחרונה.' : '.') : 'לא הצלחתי להביא את התחזית.');
      draw(cached || null, msg);
    }
  }
  load();
})();
