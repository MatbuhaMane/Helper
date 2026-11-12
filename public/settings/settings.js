/* הגדרות – a person's own settings, kept on the server per person (H.prefs) so they follow them from device to device.
   In the owner's order (vision batch 4, item 6): day and night · accessibility · connections · the personal assistant ·
   colour themes · religion and language; then the menu, the recognized devices and the account.
   What must change every page is applied by H.applySettings (settings/apply.js); the day and night by common.js.
   "חיבור לשירותים": connect their own AI (Claude or Gemini – the key is checked with the provider, kept sealed on the
   server, and from then on their AI requests go with it and need no credit), or get credits (not yet: no payment flow).
   For the owner's family the AI is on the owner, with no limit. (server/credits.ts) */
(async () => {
  const { el, api, toast } = H;
  H.header('הגדרות');
  const { user } = await H.requireLogin();
  if (!H.applySettings) await H.loadOnce('/settings/apply.js');
  const root = document.querySelector('main');
  const ERR = { bad_key: 'המפתח לא נראה נכון. בדקו שהעתקתם את כולו.', key_refused: 'הספק לא קיבל את המפתח. בדקו שהוא פעיל.' };
  const say = (e) => toast(ERR[e?.code] || e?.message || 'משהו השתבש');
  const PROVIDERS = [
    { id: 'claude', name: 'Claude (Anthropic)', where: 'console.anthropic.com → API Keys', placeholder: 'sk-ant-…' },
    { id: 'gemini', name: 'Gemini (Google)', where: 'aistudio.google.com → Get API key', placeholder: 'AIza…' },
  ];
  const D = H.SETTINGS_DEFAULTS;
  const access = H.prefs('access', D.access), look = H.prefs('look', D.look), me = H.prefs('me', D.me);
  /** save one namespace, and let every listener on this page (apply.js) know */
  const keep = (ns) => { H.savePrefs(ns); dispatchEvent(new CustomEvent('helper:prefs', { detail: ns })); };

  /* ---------- small controls ---------- */
  let uid = 0;
  const ROW = 'display:flex;flex-wrap:wrap;gap:6px;margin-block:6px';
  const GRID = 'display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));align-items:start';
  /** a row of choices (a radio group drawn as buttons) */
  function choices(label, options, value, onPick) {
    const name = 'st-' + ++uid;
    // (the layout of these rows, until design styles .st-choices, .st-jump and .st-services-grid in settings.css)
    const group = el('div', { class: 'st-choices', role: 'radiogroup', 'aria-label': label, style: ROW });
    const draw = (v) => group.replaceChildren(...options.map(([val, text, opts = {}]) => el('button', {
      type: 'button', role: 'radio', class: 'chip', name, 'aria-checked': String(val === v), disabled: !!opts.soon,
      style: 'white-space:nowrap' + (val === v ? ';background:var(--vine);border-color:var(--vine);color:var(--chalk-raised,#f7f6f0)' : ''),   // (the chosen one, as in the songbook)
      title: opts.title || null, onclick: () => { onPick(val); draw(val); },
    }, text, opts.soon ? el('small', { class: 'st-soon' }, ' · בקרוב') : null)));
    draw(value);
    return el('div', { class: 'st-field' }, el('span', { class: 'st-label' }, label), group);
  }
  /** a switch with its words */
  function toggle(label, on, onChange, hint) {
    const box = el('input', { type: 'checkbox', checked: !!on, onchange: (e) => onChange(e.target.checked) });
    return el('div', { class: 'st-field' }, el('label', { class: 'st-switch' }, box, ' ', label), hint ? el('p', { class: 'muted small' }, hint) : null);
  }
  const section = (id, title, ...kids) => el('section', { id, class: 'st-sec', 'aria-labelledby': id + '-h' }, el('h2', { id: id + '-h' }, title), ...kids);

  /* ---------- 1. day and night ---------- */
  function dayNight() {
    const ui = H.prefs('ui', { theme: 'auto' });
    const now = () => (ui.theme === 'auto' || !(Date.now() < (ui.until || 0)) ? 'auto' : ui.until > Date.now() + 3e10 ? ui.theme : 'auto');
    const pick = (v) => {
      // "always" is a choice with no end in sight; the switch on the home page still flips it until the next sunrise or sunset
      if (v === 'auto') { ui.theme = 'auto'; delete ui.until; } else { ui.theme = v; ui.until = Date.now() + 50 * 365 * 864e5; }
      keep('ui');
      toast(v === 'auto' ? 'היום והלילה ילכו לפי השמש' : v === 'dark' ? 'האוהל יישאר במצב לילה' : 'האוהל יישאר במצב יום');
    };
    return section('daynight', 'יום ולילה',
      choices('המראה', [['light', '☀ יום'], ['dark', '🌙 לילה'], ['auto', '🌗 לפי השמש']], now(), pick),
      el('p', { class: 'muted small' }, 'לפי השמש: יום מהזריחה ולילה מהשקיעה. השמש והירח בדף הבית מחליפים גם הם, עד הזריחה או השקיעה הבאה.'));
  }

  /* ---------- 2. accessibility ---------- */
  function accessibility() {
    const set = (k, v) => { access[k] = v; keep('access'); };
    const sample = el('p', { class: 'st-sample card' }, 'כך ייראה הטקסט: "בראשית ברא אלוהים את השמים ואת הארץ."');
    return section('access', 'נגישות',
      el('h3', {}, 'קריאה נוחה'),
      choices('גודל הטקסט', [[1, 'רגיל'], [1.15, 'גדול'], [1.3, 'גדול מאוד'], [1.5, 'ענק']], Number(access.text) || 1, (v) => set('text', v)),
      choices('ריווח', [['normal', 'רגיל'], ['wide', 'מרווח']], access.spacing, (v) => set('spacing', v)),
      choices('גופן', [['default', 'הגופן של האוהל'], ['readable', 'גופן קריא ופשוט']], access.font, (v) => set('font', v)),
      choices('ניגודיות', [['normal', 'רגילה'], ['high', 'גבוהה']], access.contrast, (v) => set('contrast', v)),
      sample,
      el('h3', {}, 'תנועה, רטט וצלילים'),
      choices('תנועה', [['device', 'לפי המכשיר'], ['reduce', 'פחות תנועה']], access.motion, (v) => set('motion', v)),
      toggle('רטט בלחיצות ארוכות ובפעולות', access.vibrate !== false, (v) => set('vibrate', v), 'בטלפונים שיש בהם רטט.'),
      toggle('צלילים של הממשק', access.sounds !== false, (v) => set('sounds', v), 'הקול של העוזר האישי נקבע בחלונית שלו, למטה.'));
  }

  /* ---------- 3. connections: every service in one place ---------- */
  const servicesBox = section('services', 'חיבור לשירותים');
  async function drawServices() {
    let ai, spotify = null, mail = null, feed = null, drive = null;
    try { ai = await api('/api/me/ai'); } catch (e) { return say(e); }
    await Promise.all([
      api('/api/music/status').then((r) => { spotify = r.spotify; }).catch(() => {}),
      api('/api/mail/status').then((r) => { mail = r; }).catch(() => {}),
      api('/api/calendar/feed').then((r) => { feed = r.feed; }).catch(() => {}),
      api('/api/notes/drive').then((r) => { drive = r; }).catch(() => {}),
    ]);
    const row = (p) => {
      const has = ai.keys[p.id];
      const key = el('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', dir: 'ltr', placeholder: p.placeholder, 'aria-label': 'המפתח של ' + p.name });
      return el('div', { class: 'card st-service' },
        el('h3', {}, p.name),
        has ? [el('p', {}, `מחובר (מפתח שמסתיים ב־${has.hint.replace('…', '')})`),
          el('button', { class: 'btn small ghost', type: 'button', onclick: async () => { if (!confirm('לנתק את ' + p.name + '?')) return; try { await api('/api/me/ai/keys/' + p.id, { method: 'DELETE' }); toast('נותק'); drawServices(); } catch (e) { say(e); } } }, 'ניתוק')]
          : el('form', { class: 'st-key', onsubmit: async (e) => {
            e.preventDefault();
            const b = e.target.querySelector('button'); b.disabled = true;
            try { await api('/api/me/ai/keys', { method: 'PUT', body: { provider: p.id, key: key.value } }); toast('מחובר'); drawServices(); } catch (err) { say(err); b.disabled = false; }
          } }, el('label', {}, 'מפתח API', key), el('button', { class: 'btn small primary' }, 'חיבור'),
            el('p', { class: 'muted small' }, 'את המפתח מקבלים ב־', el('bdi', { dir: 'ltr' }, p.where), '. הוא נשמר מוצפן, ומשמש רק לבקשות שלך.')));
    };
    /** a service connected elsewhere in the tent: its state here, and a link to where it is managed */
    // (connected: a plain line, which settings.css marks green with ✓; not connected: a muted one)
    const link = (name, state, on, href, action) => el('div', { class: 'card st-service' }, el('h3', {}, name), el('p', { class: on ? null : 'muted small' }, state),
      href ? el('a', { class: 'btn small ghost', href }, action) : null);
    servicesBox.replaceChildren(...[
      el('h2', { id: 'services-h' }, 'חיבור לשירותים'),
      el('h3', {}, 'העוזר החכם (AI)'),
      el('p', { class: 'muted' }, ai.limited
        ? 'אפשר לחבר את שירות ה־AI שלך, ואז העוזר החכם משתמש בו – בלי הגבלה ובלי קרדיטים. או להוסיף קרדיט.'
        : 'ה־AI של האוהל פתוח לך בלי הגבלה. אם תרצה, אפשר לחבר גם שירות משלך, והבקשות שלך ילכו דרכו.'),
      // amounts only for whoever bought credit or got a gift (the owner's decision); on the trial, only when it ran out
      ai.left_ils !== null ? el('p', { class: 'small' }, ai.left_ils > 0 ? `נשאר לך קרדיט בשווי כ־₪${ai.left_ils}.` : 'הקרדיט נגמר. חברו שירות משלכם, או הוסיפו קרדיט.')
        : ai.out ? el('p', { class: 'small' }, 'כדי להמשיך עם העוזר החכם, חברו שירות משלכם, או הוסיפו קרדיט.') : null,
      el('div', { class: 'st-services-grid', style: GRID },
        ...PROVIDERS.map(row),
        el('div', { class: 'card st-service' }, el('h3', {}, 'ChatGPT (OpenAI)'), el('p', { class: 'muted small' }, 'בקרוב: האוהל עוד לא מדבר עם ChatGPT.')),
        el('div', { class: 'card st-service' }, el('h3', {}, 'קרדיט'), el('p', { class: 'muted small' }, 'בקרוב: קניית קרדיט לשימוש ב־AI של האוהל. בינתיים אפשר לחבר שירות משלכם.'),
          el('button', { class: 'btn small', type: 'button', disabled: true }, 'קניית קרדיט'))),
      el('h3', {}, 'שירותים אחרים'),
      el('div', { class: 'st-services-grid', style: GRID },
        spotify ? link('Spotify', spotify.connected ? (spotify.stream ? 'מחובר, ומנגן באוהל' : 'מחובר') : spotify.configured ? 'לא מחובר' : 'לא זמין כרגע', spotify.connected,
          spotify.configured ? (spotify.connected ? '/' : '/api/music/spotify/login?next=/settings/%23services') : null, spotify.connected ? 'לנגן' : 'חיבור') : null,
        mail ? link('Gmail', mail.connected ? 'מחובר לסידור המייל' : 'לא מחובר', mail.connected, '/mail/', mail.connected ? 'לסידור המייל' : 'חיבור') : null,
        link('לוח השנה בגוגל', feed ? 'יש קישור מנוי פעיל' : 'אין קישור מנוי', !!feed, '/tools/calendar/', feed ? 'ניהול' : 'יצירת קישור'),
        drive ? link('Google Drive', drive.connected ? 'מחובר: פתקים נשמרים ב־Drive שלך' : 'לא מחובר. מתחברים בפעם הראשונה ששומרים פתק ב־Drive.', drive.connected, '/tools/notes/', 'לפתקים') : null)].filter(Boolean));
    if (location.hash === '#services') servicesBox.scrollIntoView({ block: 'start' });
  }

  /* ---------- 4. the personal assistant ---------- */
  const assistantBox = section('assistant', 'העוזר האישי');
  async function drawAssistant() {
    const dp = H.prefs('daemon', H.DAEMON_DEFAULTS, 'helper.daemon.prefs');
    const set = (k, v) => { dp[k] = v; keep('daemon'); };
    let d = null;
    try { d = (await api('/api/daemon')).daemon || null; } catch (_) { /* no companion yet */ }
    const who = d?.form?.he ? (d.name && d.name !== d.form.he ? `${d.name} · ${d.form.he}` : d.form.he) : 'אבן עזרא';
    assistantBox.replaceChildren(
      el('h2', { id: 'assistant-h' }, 'העוזר האישי'),
      toggle('העוזר מדבר בקול', dp.speak !== false, (v) => set('speak', v)),
      choices('מהירות הדיבור', [[0.9, 'איטי'], [1.05, 'רגיל'], [1.2, 'מהיר'], [1.4, 'מהיר מאוד']], [0.9, 1.05, 1.2, 1.4].reduce((a, b) => (Math.abs(b - dp.rate) < Math.abs(a - dp.rate) ? b : a), 1.2), (v) => set('rate', v)),
      toggle('העוזר מלווה אותי בכל עמוד', !!dp.follow, (v) => set('follow', v), 'כשכבוי, הוא מחכה בדף הבית.'),
      el('h3', {}, 'הדמות'),
      // companion packs are paid (decided 2026-11-12): here the figures this person has, and the way to the packs
      el('div', { class: 'st-skins' },
        el('div', { class: 'card st-skin', 'aria-current': 'true' }, el('b', {}, who), el('small', { class: 'muted' }, ' · הדמות שלך עכשיו'))),
      el('p', { class: 'muted small' }, 'העוזר יכול להתחלף לדמות אחרת בשיחה איתו. חבילות דמויות נוספות: ', el('span', { class: 'st-soon' }, 'בקרוב'), '.'));
  }

  /* ---------- 5. colour themes (design's palettes; the default until they arrive) ---------- */
  const PALETTES = [['', 'אבן ובזלת · ברירת המחדל']];
  const palettes = () => section('palette', 'ערכות צבעים',
    choices('ערכת הצבעים', [...PALETTES, ['soon', 'ערכות נוספות', { soon: true }]], look.palette || '', (v) => { look.palette = v; keep('look'); }),
    el('p', { class: 'muted small' }, 'התאמת הצבעים חינמית לכולם.'));

  /* ---------- 6. religion and language ---------- */
  const faith = () => section('faith', 'דת ושפה',
    choices('הדת', [['jewish', 'יהדות'], ['muslim', 'אסלאם'], ['christian', 'נצרות'], ['druze', 'דרוזים'], ['none', 'בלי']], me.religion || 'jewish',
      (v) => { me.religion = v; keep('me'); toast('נשמר. החגים והזמנים יותאמו בהדרגה בכל האוהל.'); }),
    choices('השפה', [['he', 'עברית'], ['ar', 'العربية', { soon: true }], ['en', 'English', { soon: true }]], me.lang || 'he', (v) => { me.lang = v; keep('me'); }),
    el('p', { class: 'muted small' }, 'האוהל מדבר עכשיו עברית. ערבית ואנגלית בדרך.'));

  /* ---------- my place: the city (restaurants nearby now; Shabbat times and the weather later) ---------- */
  const CITIES = ['ירושלים', 'תל אביב', 'חיפה', 'באר שבע', 'בני ברק', 'פתח תקווה', 'ראשון לציון', 'אשדוד', 'נתניה', 'חולון', 'רמת גן', 'רחובות',
    'בית שמש', 'מודיעין', 'כפר סבא', 'הרצליה', 'רעננה', 'אשקלון', 'בת ים', 'טבריה', 'צפת', 'עכו', 'נצרת', 'אילת', 'אריאל', 'מעלה אדומים', 'ביתר עילית', 'אלעד'];
  function myPlace() {
    const city = el('input', { type: 'text', value: me.city || '', list: 'st-cities', dir: 'auto', maxlength: 60, placeholder: 'למשל: ירושלים', 'aria-label': 'העיר שלי',
      style: 'font:inherit;padding:8px 12px;border-radius:12px;border:1px solid var(--line-strong);background:var(--bg);color:var(--text);max-inline-size:320px' });
    let t = 0;
    city.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { me.city = city.value.trim(); keep('me'); }, 600); });
    city.addEventListener('change', () => { clearTimeout(t); me.city = city.value.trim(); keep('me'); toast(me.city ? 'נשמר: ' + me.city : 'העיר נמחקה'); });
    return section('place', 'המקום שלי',
      el('datalist', { id: 'st-cities' }, CITIES.map((c) => el('option', { value: c }))),
      el('div', { class: 'st-field' }, el('label', { style: 'display:grid;gap:4px' }, el('span', { class: 'st-label' }, 'העיר שלי'), city)),
      el('p', { class: 'muted small' }, 'משמשת לחיפוש מסעדות בסביבה, ובהמשך לזמני שבת ולמזג האוויר. המיקום המדויק של המכשיר לא נשמר: הוא נשאל רק כשמבקשים "לידי עכשיו".'));
  }

  /* ---------- the tools menu: lock its arrangement (design's launcher.js obeys it live) ---------- */
  function menuBox() {
    const tools = H.prefs('tools', { order: [], locked: false });
    return section('menu', 'התפריט',
      toggle('נעילת סידור התפריט', !!tools.locked, (v) => { tools.locked = v; H.savePrefs('tools'); toast(v ? 'סידור התפריט נעול' : 'אפשר לסדר את התפריט'); },
        'כשנעול, לחיצה ארוכה (או קליק ימני במחשב) בתפריט הכלים לא מזיזה את האפליקציות.'));
  }

  /* ---------- recognized devices: where the family tree opens with no unlock (server/vault/index.ts devices) ---------- */
  const devicesBox = el('section', { id: 'devices', class: 'st-sec st-devices' });
  async function drawDevices() {
    let list = [];
    try { list = (await api('/api/vault/devices')).devices; } catch (e) { return devicesBox.replaceChildren(); }
    const day = (t) => (t ? new Date(t).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');
    const remove = async (d, signout) => {
      if (!confirm(signout ? `להסיר את ${d.label} ולהתנתק בו?` : `להסיר את ${d.label}? בפעם הבאה העץ יבקש שוב אישור שם.`)) return;
      try { await api('/api/vault/devices/' + encodeURIComponent(d.id) + (signout ? '?signout=1' : ''), { method: 'DELETE' }); toast('הוסר'); if (d.here && signout) return H.logout(); drawDevices(); } catch (e) { say(e); }
    };
    devicesBox.replaceChildren(
      el('h2', {}, 'מכשירים מוכרים'),
      el('p', { class: 'muted' }, 'במכשירים האלה עץ המשפחה נפתח בלי לבקש אישור, עד 30 יום מהשימוש האחרון. מסמכים, פרטיות, קישור עצים ומחיקה מבקשים אישור בכל פעם.'),
      list.length ? el('ul', { class: 'st-device-list' }, list.map((d) => el('li', { class: 'card st-device' },
        el('b', {}, d.label), d.here ? el('small', { class: 'st-here' }, ' · המכשיר הזה') : null,
        el('p', { class: 'muted small' }, `מוכר מ־${day(d.since)} · שימוש אחרון ${day(d.used)}`),
        el('div', { class: 'st-acts' },
          el('button', { class: 'btn small ghost', type: 'button', onclick: () => remove(d, false) }, 'הסרת ההכרה'),
          el('button', { class: 'btn small ghost', type: 'button', onclick: () => remove(d, true) }, 'הסרה והתנתקות')))))
        : el('p', { class: 'muted small' }, 'עוד אין. מכשיר נעשה מוכר כשפותחים בו את עץ המשפחה בפעם הראשונה.'));
  }

  /* ---------- the page: a row of shortcuts to each part, then the parts in order ---------- */
  const PARTS = [['daynight', 'יום ולילה'], ['access', 'נגישות'], ['services', 'שירותים'], ['assistant', 'העוזר'], ['palette', 'צבעים'], ['faith', 'דת ושפה'], ['place', 'המקום שלי'], ['menu', 'התפריט'], ['devices', 'מכשירים'], ['account', 'החשבון']];
  root.replaceChildren(el('section', { class: 'st', style: 'grid-template-columns:minmax(0,1fr)' },
    el('h1', {}, 'הגדרות'),
    el('nav', { class: 'st-jump', 'aria-label': 'חלקי ההגדרות', style: ROW }, PARTS.map(([id, name]) => el('a', { class: 'chip', href: '#' + id, style: 'white-space:nowrap' }, name))),
    dayNight(), accessibility(), servicesBox, assistantBox, palettes(), faith(), myPlace(), menuBox(), devicesBox,
    section('account', 'החשבון',
      el('div', { class: 'card st-account' },
        el('p', {}, user.he_name || user.name || ''), el('p', { class: 'muted small', dir: 'ltr' }, user.email),
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => H.logout() }, 'התנתקות')))));
  drawServices(); drawAssistant(); drawDevices();
  const want = location.hash.slice(1);
  if (want && want !== 'services') setTimeout(() => document.getElementById(want)?.scrollIntoView({ block: 'start' }), 50);
})();
