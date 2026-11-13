/* הרגלי אכילה (the owner, 2026-11-14): every way of eating in one place, each with a big switch like ketosis's.
 * A switch that is on shows that diet everywhere (its tab in groceries, its pie beside each item, its stamp on recipes);
 * off, none of it shows. All are off at first. The choice is the person's and follows them: ketosis in its own settings
 * (/api/keto), the others in H.prefs('diets') (groceries/diets.js).
 * The old addresses (/groceries/#atkins and the like) lead here while their diet is off; #<id> marks its card.
 */
(async () => {
  'use strict';
  const { el, toast, api, icon } = H;
  await H.requireLogin();
  H.header('הרגלי אכילה');
  const main = document.querySelector('main');

  // the look of each way of eating (the icons are placeholders from the set, as in the folder)
  const LOOK = {
    keto: { ic: 'keto', tint: '#c8f0ea', c2: '#1f8f8a' },
    atkins: { ic: 'food', tint: '#ffe9b8', c2: '#c98a00' },
    paleo: { ic: 'diet', tint: '#d9efc6', c2: '#4f8a2b' },
    lowcarb: { ic: 'calc', tint: '#f3dcc4', c2: '#a8652a' },
    glycemic: { ic: 'lens', tint: '#d6e6fb', c2: '#2f6cb8' },
    fasting: { ic: 'calendar', tint: '#e6dcf5', c2: '#6a48a8' },
  };
  const KETO = {
    id: 'keto', name: 'קטוזיס', sub: 'קטו',
    about: 'מעט מאוד פחמימות והרבה שומן, כדי שהגוף ישרוף שומן במקום סוכר.',
    rules: ['עד 20 עד 30 גרם פחמימות נטו ביום', 'שומן טוב, חלבון במידה, ירקות עליים', 'בלי סוכר, לחם, אורז ופסטה'],
  };
  // what turning it on shows, in one line
  const shows = (d) => (d.id === 'keto' ? 'לשונית קטוזיס בקניות, וליד כל מצרך הערכים שלו ופאי קטן'
    : d.time ? 'לשונית בקניות עם שעון חלון האכילה' : 'לשונית בקניות, פאי קטן ליד כל מצרך וחותמת על מתכונים');

  let keto = null;   // ketosis's settings from the server
  try { keto = (await api('/api/keto')).settings; } catch (e) { toast(e.message); }
  const isOn = (id) => (id === 'keto' ? !!keto?.enabled : Diets.isOn(id));

  async function setOn(d, on) {
    if (d.id === 'keto') {
      if (!keto) return;
      const was = keto;
      keto = { ...keto, enabled: on };
      try { await api('/api/keto/settings', { method: 'PUT', body: keto }); }
      catch (e) { keto = was; toast(e.message); draw(); return; }
    } else Diets.setOn(d.id, on);
    toast(on ? `${d.name}: פעיל` : `${d.name}: כבוי`);
    draw();
  }

  function card(d) {
    const look = LOOK[d.id] || {};
    const on = isOn(d.id);
    const hint = 'hint-' + d.id;
    const sw = el('input', { type: 'checkbox', role: 'switch', checked: on, disabled: d.id === 'keto' && !keto, 'aria-describedby': hint,
      onchange: () => setOn(d, sw.checked) });
    return el('section', { class: 'card habit' + (on ? ' on' : ''), id: d.id, style: `--tint:${look.tint};--c2:${look.c2}` },
      el('div', { class: 'habit-head' },
        el('span', { class: 'habit-ic', 'aria-hidden': 'true' }, icon(look.ic || 'diet')),
        el('h2', {}, d.name, d.sub ? el('small', { class: 'muted' }, ` · ${d.sub}`) : null)),
      el('label', { class: 'switch habit-switch' }, sw, el('span', { class: 'slider', 'aria-hidden': 'true' }),
        el('b', {}, on ? `${d.name}: פעיל` : `להפעיל ${d.name}`)),
      el('p', { class: 'muted small', id: hint }, 'כשהמתג פעיל: ', shows(d), '.'),
      el('p', {}, d.about),
      el('details', {}, el('summary', {}, 'בקצרה, מה אוכלים'), el('ul', { class: 'diet-rules' }, d.rules.map((r) => el('li', {}, r)))),
      d.note ? el('p', { class: 'diet-note muted small' }, d.note) : null,
      on ? el('a', { class: 'habit-open', href: '/groceries/#' + d.id }, d.id === 'keto' ? 'ללוח הקטוזיס ›' : `ללשונית ${d.name} ›`) : null);
  }

  function draw() {
    const list = [KETO, ...Diets.all];
    const count = list.filter((d) => isOn(d.id)).length;
    const focus = document.activeElement?.closest?.('.habit')?.id;
    main.replaceChildren(
      el('a', { class: 'folder-back', href: '/food/diet/' }, '‹ תנועה ותזונה'),
      el('h1', {}, 'הרגלי אכילה'),
      el('p', { class: 'muted' }, count ? `פעילים: ${count}. אפשר להפעיל כמה יחד.` : 'הכול כבוי. הפעילו את הדרך שבה אתם אוכלים, והיא תופיע בקניות ובמתכונים.'),
      el('div', { class: 'habits' }, list.map(card)));
    if (focus) document.querySelector(`#${focus} input[role=switch]`)?.focus();   // the switch just pressed keeps the focus
    mark(false);
  }

  // #atkins and the like: that card stands out (and, when the page opens, comes into view)
  function mark(scroll = true) {
    const id = decodeURIComponent(location.hash.slice(1));
    document.querySelectorAll('.habit.marked').forEach((c) => c.classList.remove('marked'));
    const c = id ? document.getElementById(id) : null;
    if (c?.classList.contains('habit')) { c.classList.add('marked'); if (scroll) c.scrollIntoView({ block: 'center' }); }
  }

  addEventListener('hashchange', () => mark());
  addEventListener('diets:changed', (e) => { if (e.detail === 'prefs') draw(); });   // changed on another device
  draw();
  mark();
})();
