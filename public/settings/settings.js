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
  const keep = (ns) => {
    H.savePrefs(ns);
    dispatchEvent(new CustomEvent('helper:prefs', { detail: ns }));
    // sent now, and so that it arrives even if the page is left at once (common.js batches its saves a moment later)
    fetch('/api/prefs/' + ns, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: H.prefs(ns), at: Date.now() }), keepalive: true }).catch(() => {});
  };

  /* ---------- small controls ---------- */
  let uid = 0;
  /** a row of choices (a radio group drawn as buttons) */
  function choices(label, options, value, onPick) {
    const name = 'st-' + ++uid;
    const group = el('div', { class: 'st-choices', role: 'radiogroup', 'aria-label': label });
    const draw = (v) => group.replaceChildren(...options.map(([val, text, opts = {}]) => el('button', {
      type: 'button', role: 'radio', class: 'chip', name, 'aria-checked': String(val === v), disabled: !!opts.soon, 'data-swatch': opts.swatch ?? null, 'data-font-sample': opts.font ?? null,
      title: opts.title || null, onclick: () => { onPick(val); draw(val); },
    }, text, opts.soon ? el('small', { class: 'st-soon' }, ' · ' + (typeof opts.soon === 'string' ? opts.soon : 'בקרוב')) : null)));   // (soon: true, or the reason it is off)
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
    // (credit is offered only while the shop is open – the owner's switch; closed, only one's own AI)
    let shopOpen = false; try { shopOpen = !!(await H.me()).shop; } catch (_) { /* not known: closed */ }
    const orCredit = shopOpen ? ', או הוסיפו קרדיט' : '';
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
        ? 'אפשר לחבר את שירות ה־AI שלך, ואז העוזר החכם משתמש בו – בלי הגבלה ובלי קרדיטים.' + (shopOpen ? ' או להוסיף קרדיט.' : '')
        : 'ה־AI של האוהל פתוח לך בלי הגבלה. אם תרצה, אפשר לחבר גם שירות משלך, והבקשות שלך ילכו דרכו.'),
      // amounts only for whoever bought credit or got a gift (the owner's decision); on the trial, only when it ran out
      ai.left_ils !== null ? el('p', { class: 'small' }, ai.left_ils > 0 ? `נשאר לך קרדיט בשווי כ־₪${ai.left_ils}.` : `הקרדיט נגמר. חברו שירות משלכם${orCredit}.`)
        : ai.out ? el('p', { class: 'small' }, `כדי להמשיך עם העוזר החכם, חברו שירות משלכם${orCredit}.`) : null,
      el('div', { class: 'st-services-grid' },
        ...PROVIDERS.map(row),
        // (no ChatGPT card until the app talks to it – the readiness bar: nothing "soon" on show)
        // (the credit card only while the shop is open – the owner's switch)
        !shopOpen ? null : el('div', { class: 'card st-service' }, el('h3', {}, 'קרדיט'), el('p', { class: 'muted small' }, 'בקרוב: קניית קרדיט לשימוש ב־AI של האוהל. בינתיים אפשר לחבר שירות משלכם.'),
          el('button', { class: 'btn small', type: 'button', disabled: true }, 'קניית קרדיט'))),
      el('h3', {}, 'שירותים אחרים'),
      el('div', { class: 'st-services-grid' },
        spotify ? link('Spotify', spotify.connected ? (spotify.stream ? 'מחובר, ומנגן באוהל' : 'מחובר') : spotify.configured ? 'לא מחובר' : 'לא זמין כרגע', spotify.connected,
          spotify.configured ? (spotify.connected ? '/' : '/api/music/spotify/login?next=/settings/%23services') : null, spotify.connected ? 'לנגן' : 'חיבור') : null,
        mail ? link('Gmail', mail.connected ? 'מחובר לסידור המייל' : 'לא מחובר', mail.connected, '/mail/', mail.connected ? 'לסידור המייל' : 'חיבור') : null,
        link('לוח השנה בגוגל', feed ? 'יש קישור מנוי פעיל' : 'אין קישור מנוי', !!feed, '/tools/calendar/', feed ? 'ניהול' : 'יצירת קישור'),
        drive ? link('Google Drive', drive.connected ? 'מחובר: פתקים נשמרים ב־Drive שלך' : 'לא מחובר. מתחברים בפעם הראשונה ששומרים פתק ב־Drive.', drive.connected, '/tools/notes/', 'לפתקים') : null)].filter(Boolean));
    if (location.hash === '#services') servicesBox.scrollIntoView({ block: 'start' });
  }

  /* ---------- 4. the personal assistant (vision batch 5): his voice, his figure, how he shows in the chat ---------- */
  const assistantBox = section('assistant', 'העוזר האישי');
  const KINDS = [['simple', 'פשוטות וחמודות'], ['generic', 'דמויות'], ['historic', 'דמויות מההיסטוריה ומהסיפורים'], ['person', 'דמויות מההיסטוריה ומהסיפורים'], ['special', 'מיוחדות'], ['badge', 'נפתחות עם badges'], ['holiday', 'לחגים ולאירועים']];
  /* vision batch 6: a figure is free, or paid (catalogue `paid: true`); one that conflicts with the person's religion
     setting is not shown (catalogue `hideFor: ['jewish', …]`). The full entry is read from Figure2D.FIGURES. */
  // (paid: design's tier 'paid', or paid: true; tags: ['horror'] is offered only on request – prefs daemon.showHorror)
  const figureMeta = (f) => { const c = window.Figure2D?.FIGURES?.[f.id] || {}, m = { ...c, ...f };
    return { ...m, paid: !!m.paid || m.tier === 'paid', hideFor: m.hideFor || [], tags: m.tags || [] }; };
  async function drawAssistant() {
    const dp = H.prefs('daemon', H.DAEMON_DEFAULTS, 'helper.daemon.prefs');
    const set = (k, v) => { dp[k] = v; keep('daemon'); };
    let d = null, earned = new Set(), figures = [], allFigures = [], shop = { owned: [], paid: [], priceIls: 10 }, child = false;
    try { d = await api('/api/daemon'); } catch (_) { /* no companion yet */ }
    // what this person owns, which figures are paid, and their price (server/figures.ts); whether they are a child (/api/me)
    try { shop = await api('/api/daemon/figures'); } catch (_) { /* no shop: nothing paid is theirs */ }
    try { child = !!(await H.me()).child; } catch (_) { /* not known: not a child */ }
    try {
      await H.loadOnce('/assets/figure2d.js');
      allFigures = (window.Figure2D ? Figure2D.list() : []).map(figureMeta).filter((f) => !f.hideFor.includes(me.religion || 'jewish'));
      // a paid figure by the server's list too; horror figures never for a child, for an adult on request
      allFigures.forEach((f) => { if ((shop.paid || []).includes(f.id)) f.paid = true; });
      figures = allFigures.filter((f) => !f.tags.includes('horror') || (!child && dp.showHorror));
    } catch (_) { /* the 2D figures are not here yet */ }
    if (figures.some((f) => f.unlock || f.id === 'doll')) { try { earned = new Set(((await api('/api/goals')).badges?.earned || []).map((e) => e.id || e.badge || e)); } catch (_) { /* no goals yet */ } }
    const family = !!d?.ibnEzra;
    // the figure now: the person's choice, if it is theirs to have; else Ibn Ezra for the family, the first figure for others
    // (paid: chosen once it is the person's; until then its card buys it)
    const owned = new Set(shop.owned || []);
    const allowed = (f) => (!f.unlock || earned.has(f.unlock)) && (!f.paid || owned.has(f.id));
    const mine = dp.figure && (dp.figure === 'ibn_ezra' ? family : figures.some((f) => f.id === dp.figure && allowed(f))) ? dp.figure : family ? 'ibn_ezra' : (figures.some((f) => f.id === window.Figure2D?.DEFAULT) ? Figure2D.DEFAULT : figures[0]?.id) || 'ibn_ezra';   // (the owner chose the fennec as the default)
    const voice = dp.voice || (dp.speak === false ? 'silent' : 'always');
    const pick = (id) => { set('figure', id); toast('הדמות תתחלף בפעם הבאה שהעוזר מופיע (רענון של הדף)'); drawAssistant(); };
    /** a paid figure: the price first, then the purchase (credits; the family's for nothing, the server decides), then it is chosen */
    // each paid figure has its own price (the special ones cost more); the server charges the same
    const priceOf = (f) => Number(shop.prices?.[f.id] ?? shop.priceIls) || 10;
    // the family (no limit) gets it for nothing: they see that, not a price (the server decides either way)
    // the owner's switch (shop) and the family (no limit: every paid figure theirs to take, in any state of the switch)
    const shopOpen = !!shop.shop, takes = !!shop.family;
    const buy = async (f) => { const price = priceOf(f), free = takes;
      H.modal(el('h2', {}, `${f.name}`), preview2d(f),
      el('p', {}, free ? 'בחינם, במשפחה.' : `דמות בתשלום: ₪${price}, מהקרדיט שלך.`),
      el('p', { class: 'muted small' }, free ? 'היא שלך בכל מכשיר.' : 'קונים פעם אחת, והיא שלך בכל מכשיר.'),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', type: 'button', onclick: async (e) => {
          e.target.disabled = true;
          try {
            const r = await api(`/api/daemon/figures/${encodeURIComponent(f.id)}/buy`, { body: { confirm: true } });
            H.closeModal(); toast(r.how === 'credits' ? `${f.name} שלך` : `${f.name} שלך, על חשבון המשפחה`); pick(f.id);
          } catch (err) {
            e.target.disabled = false;
            if (err.status === 403 && err.code === 'shop_closed') { H.closeModal(); toast('הקנייה סגורה כרגע'); drawAssistant(); }
            else if (err.status === 402) { H.closeModal(); H.modal(el('h2', {}, 'אין מספיק קרדיט'), el('p', {}, shopOpen ? `צריך ₪${price} בקרדיט. אפשר להוסיף קרדיט או לחבר שירות משלך.` : 'כרגע אין מספיק קרדיט.'),
              el('div', { class: 'row' }, el('a', { class: 'btn primary', href: '#services', onclick: () => H.closeModal() }, 'לחיבור לשירותים'))); }
            else toast('הקנייה לא הצליחה – נסו שוב');
          }
        } }, free ? 'לקחת אותה' : `לקנות ב־₪${price}`),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => H.closeModal() }, 'לא עכשיו'))); };
    const card = (id, name, sub, preview, ok = true, onBuy = null) => el('button', {
      type: 'button', class: 'card st-skin' + (id === mine ? ' on' : '') + (onBuy ? ' buy' : ''), 'aria-pressed': String(id === mine), disabled: !ok && !onBuy,
      title: ok ? name : sub, onclick: () => (onBuy ? onBuy() : pick(id)),
    }, preview, el('b', {}, name), sub ? el('small', { class: 'muted' }, sub) : null);
    // each figure keeps its own colours (palettes are never sold – the owner, 2026-11-14): prefs daemon.palettes[id]
    const paletteOf = (id) => +(dp.palettes?.[id] ?? (id === dp.figure ? dp.palette : 0)) || 0;
    const previews = {};   // the preview figures by id (a prankster's preview plays a trick from its own card)
    const preview2d = (f) => { const span = el('span', { class: 'st-skin-pic', 'aria-hidden': 'true' }); previews[f.id] = Figure2D.mount(span, f.id, { size: 64, still: true, ...(f.id === 'doll' ? { patches: [...earned].slice(0, 8) } : {}), ...(f.hair ? { hair: dp.hair || f.hairDefault } : {}), ...(f.palettes?.length ? { palette: paletteOf(f.id) } : {}) }).catch(() => {}); return span; };   // (the patchwork doll wears the person's badges)
    /** her hair colour (a figure with a hair layer, e.g. the astronomer): saved per person, prefs daemon.hair */
    /** a figure with clothing palettes (the night wizard, the forest witch): saved per person, prefs daemon.palette; the
        first is as drawn */
    const paletteRow = () => {
      const f = figures.find((x) => x.id === mine && x.palettes?.length);
      if (!f) return null;
      const now = paletteOf(f.id);
      return el('div', { class: 'st-field' }, el('span', { class: 'st-label' }, `הצבעים של ${f.name}`),
        el('div', { class: 'st-choices st-palette', role: 'radiogroup', 'aria-label': 'הצבעים', style: 'display:flex;flex-wrap:wrap;gap:6px' }, f.palettes.map((p) => el('button', {
          type: 'button', role: 'radio', class: 'chip', 'aria-checked': String(p.index === now), title: p.name,
          onclick: () => { dp.palettes = { ...(dp.palettes || {}), [f.id]: p.index }; keep('daemon'); drawAssistant(); },
        }, el('span', { 'aria-hidden': 'true', style: `display:inline-block;inline-size:14px;block-size:14px;border-radius:50%;background:${p.swatch};border:1px solid var(--line-strong);margin-inline-end:6px;vertical-align:-2px` }), p.name))));
    };
    /** the little wizard and witch play small tricks on the page (design's pranks.js): on by default, the person's switch,
        with a preview of one */
    const pranksRow = () => {
      if (!['littlewizard', 'littlewitch'].includes(mine)) return null;
      return el('div', {}, toggle('תעלולים', dp.pranks !== false, (v) => set('pranks', v), 'מדי פעם תעלול קטן בדף – רק מראה, לא משנה כלום. לא בזמן הקלדה או גלילה.'),
        el('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
          try {
            await H.loadOnce('/assets/pranks.js');
            const p = Pranks.start(await previews[mine], { id: mine });
            p.play('sprinkle'); setTimeout(() => p.stop(), 4000);
          } catch (_) { toast('התעלול לא הצליח כרגע'); }
        } }, '✨ להראות תעלול'));
    };
    const hairRow = () => {
      const f = figures.find((x) => x.id === mine && x.hair);
      if (!f) return null;
      const now = dp.hair || f.hairDefault;
      return el('div', { class: 'st-field' }, el('span', { class: 'st-label' }, `צבע השיער של ${f.name}`),
        el('div', { class: 'st-choices st-hair', role: 'radiogroup', 'aria-label': 'צבע השיער', style: 'display:flex;flex-wrap:wrap;gap:6px' }, f.hair.map((h) => el('button', {
          type: 'button', role: 'radio', class: 'chip', 'aria-checked': String(h.color === now), title: h.name,
          onclick: () => { set('hair', h.color); drawAssistant(); },
        }, el('span', { 'aria-hidden': 'true', style: `display:inline-block;inline-size:14px;block-size:14px;border-radius:50%;background:${h.color};border:1px solid var(--line-strong);margin-inline-end:6px;vertical-align:-2px` }), h.name))));
    };
    const groups = KINDS.map(([kind, title]) => [title, figures.filter((f) => (f.kind || 'generic') === kind)]).filter(([, list]) => list.length);
    // (native replaceChildren would print a null as text)
    assistantBox.replaceChildren(...[
      el('h2', { id: 'assistant-h' }, 'העוזר האישי'),
      // the voice: always, the way he is addressed (aloud to a spoken question, in writing to a written one), or silent
      choices('הקול', [['always', 'מדבר בקול'], ['mirror', 'עונה כמו שפונים אליו', { title: 'בקול כשמדברים אליו, בכתב כשכותבים' }], ['silent', 'שותק']], voice,
        (v) => { dp.voice = v; dp.speak = v !== 'silent'; keep('daemon'); }),
      choices('מהירות הדיבור', [[0.9, 'איטי'], [1.05, 'רגיל'], [1.2, 'מהיר'], [1.4, 'מהיר מאוד']], [0.9, 1.05, 1.2, 1.4].reduce((a, b) => (Math.abs(b - dp.rate) < Math.abs(a - dp.rate) ? b : a), 1.2), (v) => set('rate', v)),
      toggle('העוזר מלווה אותי בכל עמוד', !!dp.follow, (v) => set('follow', v), 'כשכבוי, הוא מחכה בדף הבית.'),
      choices('בראש השיחה', [['icon', 'הדמות כאייקון'], ['animated', 'הדמות חיה']], dp.header || 'icon', (v) => set('header', v)),
      el('h3', {}, 'הדמות'),
      el('p', { class: 'muted small' }, takes ? 'כל הדמויות לבחירה, גם דמויות 💎 – במשפחה.' : shopOpen ? 'רוב הדמויות חינם. דמויות 💎 קונים פעם אחת.' : 'רוב הדמויות חינם.'),
      family ? el('div', { class: 'st-skins' }, card('ibn_ezra', 'ראב"ע', 'של המשפחה שלנו', el('img', { class: 'st-skin-pic', src: '/assets/ibn-ezra-face.webp', alt: '', width: 64, height: 64 }))) : null,
      ...groups.flatMap(([title, list]) => [el('h4', {}, title), el('div', { class: 'st-skins' }, list.map((f) => {
        const ok = allowed(f);
        // the family takes it (no price); an open shop sells it; a closed one: locked, no price, no button
        const offered = f.paid && !owned.has(f.id) && (!f.unlock || earned.has(f.unlock));
        const forSale = offered && (takes || shopOpen);
        const sub = forSale ? (takes ? '💎 שלך לקחת' : `💎 ₪${priceOf(f)} · לקנייה`) : offered ? '💎 בתשלום' : f.unlock && !earned.has(f.unlock) ? 'נפתחת עם badge' : f.paid ? '💎 שלך' : f.season || 'חינם';
        return card(f.id, f.name, sub, preview2d(f), ok, forSale ? () => buy(f) : null);
      }))]),
      hairRow(), paletteRow(), pranksRow(),
      // horror figures (tags: ['horror'] – none today) only when asked for, and never for a child (under 12, by the birth year the owner set)
      !child && allFigures.some((f) => f.tags.includes('horror')) ? toggle('להציג גם דמויות אימה', !!dp.showHorror, (v) => { set('showHorror', v); drawAssistant(); }, 'דמויות מפחידות. לא לילדים.') : null,
      figures.length ? null : el('p', { class: 'muted small' }, 'דמויות נוספות, פשוטות וחמודות, בדרך.')].filter(Boolean));
  }

  /* ---------- 5. colour themes (design's palettes), a theme of one's own, and the font (vision batch 5) ---------- */
  const PALETTES = [['', 'אבן ובזלת'], ['sea', 'ים התיכון'], ['desert', 'מדבר'], ['vineyard', 'כרם'], ['dusk', 'בין הערביים'],
    ['sand', 'חול'], ['sage', 'מרווה'], ['mist', 'ערפל'], ['custom', 'ערכה משלי']];
  const FONTS = [['', 'רוביק'], ['heebo', 'Heebo'], ['round', 'עגול'], ['serif', 'פרנק רוהל']];
  const apply = () => { H.applySettings?.(); };
  function palettes() {
    const own = el('div', { class: 'st-own' });
    /** a theme of one's own: three colours; design's palette.js keeps it readable by day and at night */
    const drawOwn = () => {
      if (look.palette !== 'custom') return own.replaceChildren();
      const cs = getComputedStyle(document.documentElement), now = (v, d) => { const c = cs.getPropertyValue(v).trim(); return /^#[0-9a-f]{6}$/i.test(c) ? c : d; };
      const c = look.custom || (look.custom = { primary: now('--primary', '#4f6b2a'), field: now('--olive', '#c5c27a'), ground: '#efeee6' });
      let t = 0;
      const pick = (key, label) => el('label', { class: 'st-color' }, el('input', { type: 'color', value: c[key], 'aria-label': label, oninput: (e) => {
        c[key] = e.target.value; apply(); clearTimeout(t); t = setTimeout(() => keep('look'), 500);   // seen at once, kept a moment later
      } }), el('span', {}, label));
      own.replaceChildren(el('div', { class: 'st-colors', style: 'display:flex;flex-wrap:wrap;gap:12px;align-items:center' },
        pick('primary', 'הצבע הפעיל'), pick('field', 'צבע השדה'), pick('ground', 'הרקע')),
        el('p', { class: 'muted small' }, 'הצבעים מותאמים לבד, כדי שהטקסט יישאר קריא ביום ובלילה.'));
    };
    drawOwn();
    return section('palette', 'ערכות צבעים',
      choices('ערכת הצבעים', PALETTES.map(([id, name]) => [id, name, { swatch: id }]), look.palette || '', (v) => { look.palette = v; keep('look'); apply(); drawOwn(); }),
      own,
      choices('הגופן', FONTS.map(([id, name]) => [id, name, { font: id || null }]), look.font || '', (v) => { look.font = v; keep('look'); apply(); }),
      el('p', { class: 'muted small' }, 'התאמת הצבעים והגופן חינמית לכולם. גופן קריא במיוחד נמצא בנגישות.'));
  }

  /* ---------- 6. religion and language ---------- */
  const faith = () => section('faith', 'דת ושפה',
    // (vision batch 5: "התווחיד", in the Arabic version التوحيد; the stored value stays 'druze', so earlier choices hold)
    choices('הדת', [['jewish', 'יהדות'], ['muslim', 'אסלאם'], ['christian', 'נצרות'], ['druze', 'התווחיד', { title: 'التوحيد' }], ['none', 'בלי']], me.religion || 'jewish',
      (v) => { me.religion = v; keep('me'); toast('נשמר. החגים והזמנים יותאמו בהדרגה בכל האוהל.'); }),
    choices('השפה', [['he', 'עברית'], ['ar', 'العربية', { soon: true }], ['en', 'English', { soon: true }]], me.lang || 'he', (v) => { me.lang = v; keep('me'); }),
    el('p', { class: 'muted small' }, 'האוהל מדבר עכשיו עברית. ערבית ואנגלית בדרך.'));

  /* ---------- my place: the city (the weather, restaurants nearby) ---------- */
  const CITIES = ['ירושלים', 'תל אביב', 'חיפה', 'באר שבע', 'בני ברק', 'פתח תקווה', 'ראשון לציון', 'אשדוד', 'נתניה', 'חולון', 'רמת גן', 'רחובות',
    'בית שמש', 'מודיעין', 'כפר סבא', 'הרצליה', 'רעננה', 'אשקלון', 'בת ים', 'טבריה', 'צפת', 'עכו', 'נצרת', 'אילת', 'אריאל', 'מעלה אדומים', 'ביתר עילית', 'אלעד'];
  function myPlace() {
    const city = el('input', { type: 'text', value: me.city || '', list: 'st-cities', dir: 'auto', maxlength: 60, placeholder: 'למשל: ירושלים', 'aria-label': 'העיר שלי',
    });
    let t = 0;
    city.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { me.city = city.value.trim(); keep('me'); }, 600); });
    city.addEventListener('change', () => { clearTimeout(t); me.city = city.value.trim(); keep('me'); toast(me.city ? 'נשמר: ' + me.city : 'העיר נמחקה'); });
    return section('place', 'המקום שלי',
      el('datalist', { id: 'st-cities' }, CITIES.map((c) => el('option', { value: c }))),
      el('div', { class: 'st-field' }, el('label', {}, el('span', { class: 'st-label' }, 'העיר שלי'), city)),
      el('p', { class: 'muted small' }, 'משמשת למזג האוויר ולחיפוש מסעדות בסביבה. המיקום המדויק של המכשיר לא נשמר: הוא נשאל רק כשמבקשים "לידי עכשיו".'));
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

  /* ---------- privacy and security (docs/decisions.md, "Locks and privacy"): the app lock and its timer, the tree lock,
     the 4-digit code, and the low level. The server keeps and enforces all of it (/api/lock, server/lock.ts); a change
     to a lock asks for a proof – an unlock with the code or a passkey – unless there was one in the last 5 minutes; a code that
     exists changes with the current one. Modes: off | pin | bio. Nothing locked at all is the "low" level. */
  const privacyBox = section('privacy', 'פרטיות ואבטחה');
  const digits4 = (label) => el('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: '4', pattern: '[0-9]{4}', 'aria-label': label,
    style: 'inline-size:7em;letter-spacing:.6em;text-align:center;font:inherit;font-size:1.3rem;padding:8px 10px;border-radius:12px;border:1px solid var(--line-strong);background:var(--bg);color:var(--text)',
    oninput: (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); } });
  /** the current code, or a passkey, for a change that needs a proof; resolves to { current } or { passkey: true }, or null */
  const askProof = (lock) => new Promise((resolve) => {
    const cur = digits4('הקוד הנוכחי');
    const ok = async () => {
      if (cur.value.length !== 4) return cur.focus();
      try { await api('/api/lock/unlock', { body: { pin: cur.value } }); H.closeModal(); resolve({ current: cur.value }); }
      catch (e) { say(e); cur.value = ''; cur.focus(); }
    };
    cur.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    if (!lock.hasPin && lock.hasPasskey) { H.loadOnce('/assets/lock-screen.js').then(passkeyProof).then(resolve, () => resolve(null)); return; }
    H.modal(el('h2', {}, 'אישור שזה את/ה'), el('p', {}, 'כדי לשנות את הנעילה צריך את הקוד הנוכחי' + (lock.hasPasskey ? ', או טביעת אצבע.' : '.')),
      el('div', { class: 'row' }, cur, el('button', { class: 'btn primary', type: 'button', onclick: ok }, 'אישור')),
      lock.hasPasskey && H.passkeysWork?.() ? el('button', { class: 'btn ghost', type: 'button', onclick: async () => {
        try { await H.loadOnce('/assets/lock-screen.js'); H.closeModal(); resolve(await passkeyProof()); } catch (_) { resolve(null); }
      } }, '👆 בטביעת אצבע') : null,
      el('button', { class: 'linklike', type: 'button', onclick: () => { H.closeModal(); resolve(null); } }, 'ביטול'));
    setTimeout(() => cur.focus(), 30);
  });
  /** a passkey as the proof (the lock's own passkey route marks the session) */
  async function passkeyProof() {
    const toBuf = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)).buffer;
    const toB64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const o = await api('/api/lock/passkey/options', { method: 'POST' });
    const pk = o.publicKey;
    const a = await navigator.credentials.get({ publicKey: { ...pk, challenge: toBuf(pk.challenge), allowCredentials: (pk.allowCredentials || []).map((c) => ({ ...c, id: toBuf(c.id) })) } });
    await api('/api/lock/passkey', { body: { challengeId: o.challengeId, id: toB64(a.rawId), response: { clientDataJSON: toB64(a.response.clientDataJSON), authenticatorData: toB64(a.response.authenticatorData), signature: toB64(a.response.signature) } } });
    return { passkey: true };
  }
  /** a lock change: tried as is, and again after a proof when the server asks for one */
  async function lockChange(path, method, body, lock) {
    try { return await api(path, { method, body }); }
    catch (e) {
      if (e.code !== 'proof_needed') throw e;
      const proof = await askProof(lock);
      if (!proof) return null;
      return api(path, { method, body: { ...body, ...(proof.current && path === '/api/lock/pin' ? { current: proof.current } : {}) } });
    }
  }
  /** set or change the code: twice the new one (and a proof when needed) */
  const setPin = (lock) => new Promise((resolve) => {
    const a = digits4('קוד חדש'), b = digits4('שוב, לאישור'), cur = lock.hasPin && !lock.proof ? digits4('הקוד הנוכחי') : null;
    const save = async () => {
      if (a.value.length !== 4) return a.focus();
      if (a.value !== b.value) { toast('שני הקודים לא זהים'); b.value = ''; return b.focus(); }
      if (cur && cur.value.length !== 4) return cur.focus();
      try { await api('/api/lock/pin', { method: 'PUT', body: { pin: a.value, ...(cur ? { current: cur.value } : {}) } }); H.closeModal(); toast('הקוד נשמר'); resolve(true); }
      catch (e) { say(e); }
    };
    H.modal(el('h2', {}, lock.hasPin ? 'קוד חדש' : 'קוד לנעילה'),
      el('p', { class: 'muted' }, '4 ספרות. כדאי לא להשתמש בתאריך לידה.'),
      el('div', { style: 'display:grid;gap:10px;justify-items:start' }, cur ? el('label', {}, 'הנוכחי ', cur) : null, el('label', {}, 'החדש ', a), el('label', {}, 'שוב ', b)),
      el('div', { class: 'row' }, el('button', { class: 'btn primary', type: 'button', onclick: save }, 'שמירה'),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => { H.closeModal(); resolve(false); } }, 'ביטול')));
    setTimeout(() => (cur || a).focus(), 30);
  });
  async function drawPrivacy() {
    let lock;
    try { lock = await api('/api/lock'); } catch (e) { privacyBox.replaceChildren(el('h2', { id: 'privacy-h' }, 'פרטיות ואבטחה'), el('p', { class: 'muted' }, 'הנעילות עוד לא זמינות כאן.')); return; }
    try { await H.loadOnce('/assets/lock-screen.js'); await H.loadOnce('/assets/lock.js'); } catch (_) { /* the passkey buttons stay hidden; no padlock */ }
    const bio = !!H.passkeysWork?.();
    const modes = [['off', 'כבוי'], ['pin', 'קוד'], ['bio', 'טביעת אצבע', { soon: bio ? false : 'לא במכשיר הזה', title: bio ? 'טביעת אצבע, פנים או Windows Hello' : 'המכשיר הזה לא תומך' }]];
    /** a lock's mode: a code needs one set first; a passkey needs one made on this device (the vault's passkeys) */
    const setMode = async (which, v) => {
      try {
        if (v === 'pin' && !lock.hasPin && !(await setPin(lock))) return drawPrivacy();
        if (v === 'bio' && !lock.hasPasskey) { toast('קודם צריך מפתח במכשיר הזה: בעץ המשפחה ← אבטחה ← הוספת מכשיר'); return drawPrivacy(); }
        const r = await lockChange('/api/lock', 'PUT', { [which]: v }, lock);
        if (r) toast(v === 'off' ? 'הנעילה כבויה' : 'הנעילה פעילה');
      } catch (e) { say(e); }
      drawPrivacy();
    };
    const low = lock.app === 'off' && lock.tree === 'off';   // nothing locked: the "low" level
    privacyBox.replaceChildren(...[
      el('h2', { id: 'privacy-h' }, 'פרטיות ואבטחה'),
      low ? el('p', { class: 'st-warn', role: 'note' }, '⚠ הכל פתוח: אין נעילה לאוהל ולא לעץ המשפחה. לא מומלץ – מי שמחזיק את המכשיר רואה הכל, חוץ ממסמכים ופרטים אישיים.') : null,
      el('h3', {}, 'נעילת האוהל'),
      el('p', { class: 'muted small' }, 'כמו בטלגרם: האוהל ננעל לבד אחרי זמן שלא משתמשים בו, ונפתח בקוד או בטביעת אצבע.'),
      choices('נעילת האוהל', modes, lock.app, (v) => setMode('app', v)),
      lock.app !== 'off' ? choices('ננעל אחרי', [[1, 'דקה'], [5, '5 דקות'], [15, 'רבע שעה'], [60, 'שעה']], lock.autolock, async (v) => { try { await lockChange('/api/lock', 'PUT', { autolock: v }, lock); } catch (e) { say(e); } drawPrivacy(); }) : null,
      el('h3', {}, 'נעילת עץ המשפחה'),
      el('p', { class: 'muted small' }, 'העץ פתוח לבני הבית שמחוברים. אפשר לנעול אותו בקוד או בטביעת אצבע.'),
      choices('נעילת העץ', modes, lock.tree, (v) => setMode('tree', v)),
      el('h3', {}, 'הקוד'),
      // the code row (design's .st-code: the padlock, the state, the buttons)
      el('div', { class: 'st-code' },
        window.Lock?.padlock ? Lock.padlock(lock.hasPin ? 'closed' : 'open') : null,
        el('b', {}, 'קוד בן 4 ספרות'), el('span', {}, lock.closed ? 'נסגר' : lock.hasPin ? 'נקבע' : 'עוד לא נקבע'),
        el('button', { class: 'btn small', type: 'button', onclick: async () => { await setPin(lock); drawPrivacy(); } }, lock.hasPin ? 'לשנות את הקוד' : 'לקבוע קוד'),
        lock.hasPin ? el('button', { class: 'lk-forgot', type: 'button', style: 'background:none;border:0;color:var(--muted);cursor:pointer;font:inherit;text-decoration:underline', onclick: async () => {
          if (!confirm('כדי לקבוע קוד חדש צריך להיכנס שוב עם חשבון Google שלך. לצאת עכשיו?')) return;
          try { await api('/api/auth/logout', { method: 'POST' }); } catch (_) { /* out anyway */ }
          location.href = '/api/auth/login?next=' + encodeURIComponent('/settings/#privacy');
        } }, 'שכחתי את הקוד') : null),
      lock.closed ? el('p', { class: 'small', role: 'note' }, 'הקוד נסגר אחרי הרבה ניסיונות. היכנסו שוב עם Google, וקבעו קוד חדש.') : null,
      el('p', { class: 'st-safe muted small' }, 'מסמכים, פרטי כניסה ופרטים אישיים מוגנים בטביעת אצבע בכל מקרה.'),
    ].filter(Boolean));
  }

  /* ---------- the page: a row of shortcuts to each part, then the parts in order ---------- */
  const PARTS = [['daynight', 'יום ולילה'], ['access', 'נגישות'], ['privacy', 'פרטיות'], ['services', 'שירותים'], ['assistant', 'העוזר'], ['palette', 'צבעים'], ['faith', 'דת ושפה'], ['place', 'המקום שלי'], ['menu', 'התפריט'], ['devices', 'מכשירים'], ['account', 'החשבון']];
  root.replaceChildren(el('section', { class: 'st' },
    el('h1', {}, 'הגדרות'),
    el('nav', { class: 'st-jump', 'aria-label': 'חלקי ההגדרות' }, PARTS.map(([id, name]) => el('a', { class: 'chip', href: '#' + id }, name))),
    dayNight(), accessibility(), privacyBox, servicesBox, assistantBox, palettes(), faith(), myPlace(), menuBox(), devicesBox,
    section('account', 'החשבון',
      el('div', { class: 'card st-account' },
        el('p', {}, user.he_name || user.name || ''), el('p', { class: 'muted small', dir: 'ltr' }, user.email),
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => H.logout() }, 'התנתקות')))));
  drawServices(); drawAssistant(); drawDevices(); drawPrivacy();
  const want = location.hash.slice(1);
  if (want && want !== 'services') setTimeout(() => document.getElementById(want)?.scrollIntoView({ block: 'start' }), 50);
})();
