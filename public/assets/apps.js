/* The hub's menus in one place: every part of the tent and every tool, with how it looks on the home page's ring (a
   cushion, and the colour its letters glow in when they swell) – and which of them each person pinned to the ring.
   The ring holds three fixed items – עץ המשפחה, כלים and הגדרות (the owner's decision) – and the ones the person pins from
   the tools page's arrange mode. The pins are a preference (H.prefs('home').pins), so they follow the person to every
   device. Until someone pins anything, the ring keeps the parts it always had.
     H.APPS                    the catalogue
     H.ringApps()              what the ring shows now, in order
     H.isPinned(href)          H.togglePin(href) → pinned or not (saved)
     H.appIcon(name)           H.icon, with a gear for הגדרות until the shared icons have one */
(() => {
  if (!window.H || H.APPS) return;
  const APPS = [
    // fixed on the ring
    { href: '/family/', ic: 'family', name: 'עץ המשפחה', sub: 'המשפחה שלנו, הקשרים, המסמכים והתמונות', pillow: 'p15', c2: '#8a5a32', fixed: true },
    { href: '/tools/', ic: 'tools', name: 'כלים', sub: 'כל הכלים במקום אחד, ומה שמצמידים למדורה', pillow: 'p09', c2: '#c27c12', fixed: true },
    { href: '/settings/', ic: 'settings', name: 'הגדרות', sub: 'החשבון שלך, הנגישות והשירותים', pillow: 'p08', c2: '#c98a1c', fixed: true },
    // the parts of the tent
    { href: '/food/', ic: 'food', name: 'אוכל', sub: 'רשימת קניות, ספר מתכונים, דיאטה והמקרר', pillow: 'p13', c2: '#2f7d4a' },
    { href: '/news/', ic: 'news', name: 'חדשות', sub: 'כל האתרים, מישראל ומהעולם, במקום אחד', pillow: 'p11', c2: '#3557a8' },
    { href: '/fun/', ic: 'fun', name: 'בידור', sub: 'מה שווה לראות, לשמוע ולשחק – ואיפה', pillow: 'p05', c2: '#b8457a' },
    { href: '/songs/', ic: 'music', name: 'שירון', sub: 'מילים, אקורדים לגיטרה ולפסנתר, וזמירות שבת', pillow: 'p03', c2: '#d2601a' },
    { href: '/parasha/', ic: 'torah', name: 'פרשת השבוע', sub: 'הפרשה, הקריאה וזמני השבת', pillow: 'p02', c2: '#8e2435' },
    // the tools
    { href: '/tools/calendar/', ic: 'calendar', name: 'לוח שנה', sub: 'החגים, הצומות והימים של המשפחה', pillow: 'p07', c2: '#c0402a' },
    { href: '/gather/', ic: 'family', name: 'מפגש משפחתי', sub: 'קישור אחד לווטסאפ, וכולם עונים', pillow: 'p14', c2: '#b8402a' },
    { href: '/groceries/', ic: 'cart', name: 'רשימת קניות', sub: 'מה חסר בבית, ומי קונה', pillow: 'p12', c2: '#c4501e' },
    { href: '/groceries/#book', ic: 'book', name: 'ספר מתכונים', sub: 'המתכונים שלנו, ומתכונים מכל העולם', pillow: 'p01', c2: '#8e2435' },
    { href: '/tools/notes/', ic: 'note', name: 'פתקים', sub: 'מה ששמרתם מכל מקום באוהל', pillow: 'p10', c2: '#9c2a2a' },
    { href: '/tools/calc/', ic: 'calc', name: 'מחשבון', sub: 'חשבון, ועוזר חכם למתמטיקה ולפיזיקה', pillow: 'p06', c2: '#9c2a2a' },
    { href: '/mail/', ic: 'mail', name: 'סידור המייל', sub: 'תיבת דואר מסודרת, באישור שלך', pillow: 'p04', c2: '#7b1d2c' },
    { href: '/pc/', ic: 'pc', name: 'סידור המחשב', sub: 'מחשב מסודר, צעד אחר צעד', pillow: 'p07', c2: '#c0402a' },
    { href: '/food/diet/', ic: 'diet', name: 'דיאטה', sub: 'קטוזיס, הקפדה, ומה מתאים', pillow: 'p10', c2: '#9c2a2a' },
    { href: '/food/fridge/', ic: 'fridge', name: 'מקרר', sub: 'מה יש בבית, ומה לבשל ממנו', pillow: 'p06', c2: '#9c2a2a' },
  ];
  const DEFAULT_PINS = ['/food/', '/news/', '/fun/', '/songs/', '/parasha/'];   // the parts the ring always had
  const byHref = (href) => APPS.find((a) => a.href === href);
  const prefs = () => H.prefs('home', { pins: DEFAULT_PINS.slice() });
  const isPinned = (href) => prefs().pins.includes(href);
  function togglePin(href) {
    const p = prefs(), a = byHref(href);
    if (!a || a.fixed) return true;
    p.pins = p.pins.includes(href) ? p.pins.filter((h) => h !== href) : [...p.pins, href];
    H.savePrefs('home');
    return p.pins.includes(href);
  }
  /** the ring: the family tree first, the person's pins, then the tools and the settings */
  function ringApps() {
    const pinned = prefs().pins.map(byHref).filter((a) => a && !a.fixed);
    return [byHref('/family/'), ...pinned, byHref('/tools/'), byHref('/settings/')];
  }
  // a gear (Feather, MIT) for הגדרות, until the shared icons have their own
  const GEAR = '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>';
  function appIcon(name, cls) {
    const s = H.icon(name, cls);
    if (name === 'settings' && s && !s.innerHTML.trim()) s.innerHTML = GEAR;
    return s;
  }
  Object.assign(H, { APPS, ringApps, isPinned, togglePin, appIcon });
})();
