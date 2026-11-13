/* What a person's settings change on every page, as soon as it loads (vision batch 4, item 6). The master calls
   H.applySettings() from common.js right after the prefs are read; until then the settings page loads this itself.
   It only marks the root element – the look of each mark is design's (base.css):
     font-size                 the text size (a percentage of the browser's own, so every rem grows with it)
     data-spacing="wide"       more space between lines, words and letters
     data-font="readable"      a plainer, more readable font
     data-contrast="high"      stronger ink and lines
     data-motion="reduce"      less motion than the device asks for (H.reducedMotion() answers either)
     data-palette="<id>"       one of design's colour themes (none: the default); "custom": a theme of one's own, its
                               tokens set on the root from H.palette.derive() (design's palette.js), by day or by night
     data-font="<id>"          the font chosen (heebo, round, serif), or "readable" from accessibility, which wins
     data-religion, lang       whose holidays and words the pages show; the language (Hebrew for now)
   The day and night stay with common.js (the sun, the switch, prefs 'ui'). */
(() => {
  if (!window.H || H.applySettings) return;
  const ACCESS = { text: 1, spacing: 'normal', font: 'default', contrast: 'normal', motion: 'device', vibrate: true, sounds: true };
  const LOOK = { palette: '', font: '', custom: null };   // custom: { primary, field, ground } (vision batch 5)
  const ME = { religion: 'jewish', lang: 'he', city: '' };   // (city: the restaurants nearby; Shabbat times and the weather later)
  const root = document.documentElement;
  const mark = (name, value) => { if (value) root.dataset[name] = value; else delete root.dataset[name]; };

  function applySettings() {
    const a = H.prefs('access', ACCESS), l = H.prefs('look', LOOK), m = H.prefs('me', ME);
    const text = Math.min(1.6, Math.max(0.85, Number(a.text) || 1));
    root.style.fontSize = text === 1 ? '' : `${Math.round(text * 100)}%`;
    mark('spacing', a.spacing === 'wide' ? 'wide' : '');
    mark('font', a.font === 'readable' ? 'readable' : ['heebo', 'round', 'serif'].includes(l.font) ? l.font : '');
    mark('contrast', a.contrast === 'high' ? 'high' : '');
    mark('motion', a.motion === 'reduce' ? 'reduce' : '');
    mark('palette', /^[a-z0-9-]{1,24}$/.test(l.palette || '') ? l.palette : '');
    customTheme(l);
    mark('religion', /^[a-z]{1,16}$/.test(m.religion || '') ? m.religion : '');
    root.lang = m.lang === 'ar' || m.lang === 'en' ? m.lang : 'he';
  }
  /* a theme of one's own: design's palette.js derives its tokens (keeping the contrast) for the day and for the night;
     they are set on the root, and set again when the day turns to night (the theme switch, the sun, the device) */
  const HEX = /^#[0-9a-f]{6}$/i;
  let customSet = [], watching = false;
  function customTheme(l) {
    customSet.forEach((k) => root.style.removeProperty(k)); customSet = [];
    const c = l.palette === 'custom' && l.custom && HEX.test(l.custom.primary || '') && HEX.test(l.custom.field || '') ? l.custom : null;
    if (!c) return;
    const set = () => {
      if (!H.palette || H.prefs('look', LOOK).palette !== 'custom') return;
      const t = H.palette.derive({ primary: c.primary, field: c.field, ground: HEX.test(c.ground || '') ? c.ground : undefined });
      customSet.forEach((k) => root.style.removeProperty(k));
      const night = H.isDark ? H.isDark() : root.dataset.theme === 'dark';
      customSet = Object.keys(t[night ? 'night' : 'day']);
      for (const [k, v] of Object.entries(t[night ? 'night' : 'day'])) root.style.setProperty(k, v);
    };
    (H.palette ? Promise.resolve() : H.loadOnce('/assets/palette.js')).then(set).catch(() => { /* no palette.js yet: the default stays */ });
    if (!watching) {
      watching = true;
      new MutationObserver(() => customSet.length && set()).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
      matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => customSet.length && set());
    }
  }
  /** less motion: the person's setting, or the device's */
  const reducedMotion = () => root.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** a short buzz (a long press, a heart), unless the person turned the interface's vibration off */
  const vibrate = (ms = 12) => { if (H.prefs('access', ACCESS).vibrate !== false) navigator.vibrate?.(ms); };
  /** may the interface make sounds (not the companion's voice: that is its own setting) */
  const soundsOn = () => H.prefs('access', ACCESS).sounds !== false;

  Object.assign(H, { applySettings, reducedMotion, vibrate, soundsOn, SETTINGS_DEFAULTS: { access: ACCESS, look: LOOK, me: ME } });
  applySettings();
  // the same settings changed on another device (the prefs arrive from the server) or on this page
  addEventListener('helper:prefs', (e) => { if (['access', 'look', 'me'].includes(e.detail)) applySettings(); });

  /* discovery (docs/ai/social-plan.md, slice A): this page's tool is noted on the server (which tool, never what is in
     it) – once a day for each page on this device. A tool found for the first time is told on the page, and raised as
     'helper:discovered' for whoever wants to celebrate it (design, the companion). */
  try {
    const page = location.pathname, day = new Date().toISOString().slice(0, 10), key = 'helper.visit.' + page;
    if (page !== '/' && localStorage.getItem(key) !== day) {
      fetch('/api/visits', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: page }) })
        .then((r) => (r.ok ? r.json() : null)).then((j) => {
          if (!j) return;
          try { localStorage.setItem(key, day); } catch (_) { /* once a load, then */ }
          if (!j.fresh) return;
          dispatchEvent(new CustomEvent('helper:discovered', { detail: j }));
          if (j.badge === 'scout') H.toast?.(`קיבלת badge חדש: סייר. גילית ${j.found} מתוך ${j.total} כלים`);
          else if (j.found) H.toast?.(`כלי חדש! גילית ${j.found} מתוך ${j.total} כלים`);
        }).catch(() => { /* offline: next time */ });
    }
  } catch (_) { /* no storage: nothing to note */ }
})();
