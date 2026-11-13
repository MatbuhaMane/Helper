/* The hub's menus in one place: every part of the tent and every tool, with how it looks on the home page's ring (a
   cushion, and the colour its letters glow in when they swell) – and which of them each person pinned to the ring.
   The ring holds three fixed items – עץ המשפחה, כלים and הגדרות (the owner's decision) – and the ones the person pins from
   the tools page's arrange mode. The pins are a preference (H.prefs('home').pins), so they follow the person to every
   device. Until someone pins anything, the ring keeps the parts it always had.
     H.APPS                    the catalogue
     H.ringApps()              what the ring shows now, in order
     H.isPinned(href)          H.togglePin(href) → pinned or not (saved)
     H.appIcon(name)           the icon of a menu (H.icon) */
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
    // (the owner's order, batch 14, 2026-11-14; tag: a small label design styles, e.g. 'ניסיוני')
    { href: '/groceries/', ic: 'cart', name: 'רשימת קניות', sub: 'מה חסר בבית, ומי קונה', pillow: 'p12', c2: '#c4501e' },
    { href: '/groceries/#book', ic: 'book', name: 'ספר מתכונים', sub: 'המתכונים שלנו, ומתכונים מכל העולם', pillow: 'p01', c2: '#8e2435' },
    { href: '/food/fridge/', ic: 'fridge', name: 'מקרר', sub: 'מה יש בבית, ומה לבשל ממנו', pillow: 'p06', c2: '#9c2a2a' },
    { href: '/messages/', ic: 'mail', name: 'הודעות', sub: 'שיחה עם בני הבית והמשפחה', pillow: 'p13', c2: '#3557a8' },
    { href: '/gather/', ic: 'family', name: 'מפגש משפחתי', sub: 'קישור אחד לווטסאפ, וכולם עונים', pillow: 'p14', c2: '#b8402a' },
    { href: '/tools/calendar/', ic: 'calendar', name: 'לוח שנה', sub: 'החגים, הצומות והימים של המשפחה', pillow: 'p07', c2: '#c0402a' },
    { href: '/tools/weather/', ic: 'weather', name: 'מזג אוויר', sub: 'מה בחוץ היום, ומה מחר', pillow: 'p14', c2: '#2a7fa8' },
    { href: '/tools/notes/', ic: 'note', name: 'פתקים', sub: 'מה ששמרתם מכל מקום באוהל', pillow: 'p10', c2: '#9c2a2a' },
    { href: '/tools/calc/', ic: 'calc', name: 'מחשבון', sub: 'חשבון, ועוזר חכם למתמטיקה ולפיזיקה', pillow: 'p06', c2: '#9c2a2a' },
    { href: '/tools/tasks/', ic: 'tasks', name: 'ניהול מטרות', sub: 'מטרה, תהליכים, וצעד קטן כל יום', pillow: 'p09', c2: '#6c4fd6' },
    { href: '/food/diet/', ic: 'diet', name: 'תנועה ותזונה', sub: 'הקפדה, הדרך שבה אוכלים, ומה מתאים לה', pillow: 'p10', c2: '#9c2a2a' },
    { href: '/food/diet/hakpada/', ic: 'target', name: 'הקפדה', sub: 'מה שהחלטתם לשמור עליו, יום אחר יום', pillow: 'p12', c2: '#c4501e' },
    { href: '/food/diet/habits/', ic: 'habits', name: 'הרגלי אכילה', sub: 'קטו, אטקינס, פליאו ועוד – מתג לכל דרך אכילה', pillow: 'p13', c2: '#1f8f8a' },
    { href: '/tools/research/', ic: 'lens', name: 'עוזר מחקר', sub: 'פתקים, שאלות פתוחות, מקורות וכתיבה', pillow: 'p11', c2: '#3557a8' },
    { href: '/mail/', ic: 'mail', name: 'סידור המייל', sub: 'תיבת דואר מסודרת, באישור שלך', pillow: 'p04', c2: '#7b1d2c', tag: 'ניסיוני' },
    { href: '/pc/', ic: 'pc', name: 'סידור המחשב', sub: 'מחשב מסודר, צעד אחר צעד', pillow: 'p07', c2: '#c0402a', tag: 'ניסיוני' },
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
  // (the shared icons have the gear for הגדרות now; appIcon stays as the one name the ring and the tools page use)
  const appIcon = (name, cls) => H.icon(name, cls);
  Object.assign(H, { APPS, ringApps, isPinned, togglePin, appIcon });
})();
