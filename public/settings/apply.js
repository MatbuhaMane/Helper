/* What a person's settings change on every page, as soon as it loads (vision batch 4, item 6). The master calls
   H.applySettings() from common.js right after the prefs are read; until then the settings page loads this itself.
   It only marks the root element – the look of each mark is design's (base.css):
     font-size                 the text size (a percentage of the browser's own, so every rem grows with it)
     data-spacing="wide"       more space between lines, words and letters
     data-font="readable"      a plainer, more readable font
     data-contrast="high"      stronger ink and lines
     data-motion="reduce"      less motion than the device asks for (H.reducedMotion() answers either)
     data-palette="<id>"       one of design's colour themes (none: the default)
     data-religion, lang       whose holidays and words the pages show; the language (Hebrew for now)
   The day and night stay with common.js (the sun, the switch, prefs 'ui'). */
(() => {
  if (!window.H || H.applySettings) return;
  const ACCESS = { text: 1, spacing: 'normal', font: 'default', contrast: 'normal', motion: 'device', vibrate: true, sounds: true };
  const LOOK = { palette: '' };
  const ME = { religion: 'jewish', lang: 'he' };
  const root = document.documentElement;
  const mark = (name, value) => { if (value) root.dataset[name] = value; else delete root.dataset[name]; };

  function applySettings() {
    const a = H.prefs('access', ACCESS), l = H.prefs('look', LOOK), m = H.prefs('me', ME);
    const text = Math.min(1.6, Math.max(0.85, Number(a.text) || 1));
    root.style.fontSize = text === 1 ? '' : `${Math.round(text * 100)}%`;
    mark('spacing', a.spacing === 'wide' ? 'wide' : '');
    mark('font', a.font === 'readable' ? 'readable' : '');
    mark('contrast', a.contrast === 'high' ? 'high' : '');
    mark('motion', a.motion === 'reduce' ? 'reduce' : '');
    mark('palette', /^[a-z0-9-]{1,24}$/.test(l.palette || '') ? l.palette : '');
    mark('religion', /^[a-z]{1,16}$/.test(m.religion || '') ? m.religion : '');
    root.lang = m.lang === 'ar' || m.lang === 'en' ? m.lang : 'he';
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
})();
