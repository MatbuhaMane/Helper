/* The hub's menus in one place: every part of the tent and every tool, with how it looks on the home page's ring (a
   cushion, and the colour its letters glow in when they swell) – and which of them each person pinned to the ring.
   The ring holds three fixed items – עץ המשפחה, כלים and הגדרות (the owner's decision) – and the ones the person pins from
   the tools page's arrange mode. The pins are a preference (H.prefs('home').pins), so they follow the person to every
   device. Until someone pins anything, the ring keeps the parts it always had.
     H.APPS                    the catalogue
     H.ringApps()              what the ring shows now, in order
     H.isPinned(href)          H.togglePin(href) → pinned or not (saved)
     H.appIcon(name)           the icon of a menu (H.icon)
     H.setRing(hrefs)          the home's arrange tray: the ring's cushions in this order (saved: pins + order)
     H.expTag(app)             the "ניסיוני" tag (design's .tag-exp) for an app with tag, else null
     H.PARTS                   the parts of the tent (the top menu), in order
   The owner's עץ מבנה (the back door, server/layout.ts) is a layer over this list: order, the tools under each part,
   hidden items, names, icons, cushions, colours and the ring's default (H.mergeLayout; H.layout() for the editor). */
(() => {
  if (!window.H || H.APPS) return;
  const APPS = [
    // fixed on the ring
    { href: '/family/', ic: 'family', name: 'עץ המשפחה', sub: 'המשפחה שלנו, הקשרים, המסמכים והתמונות', pillow: 'p15', c2: '#8a5a32', fixed: true },
    { href: '/tools/', ic: 'tools', name: 'כלים', sub: 'כל הכלים במקום אחד, ומה שמצמידים למדורה', pillow: 'p09', c2: '#c27c12', fixed: true },
    { href: '/settings/', ic: 'settings', name: 'הגדרות', sub: 'החשבון שלך, הנגישות והשירותים', pillow: 'p08', c2: '#c98a1c', fixed: true },
    // the parts of the tent
    { href: '/food/', ic: 'food', name: 'אוכל', sub: 'רשימת קניות, ספר מתכונים, דיאטה והמקרר', pillow: 'p13', c2: '#2f7d4a', tint: '#d4f2dc' },
    { href: '/news/', ic: 'news', name: 'חדשות', sub: 'כל האתרים, מישראל ומהעולם, במקום אחד', pillow: 'p11', c2: '#3557a8', tint: '#cfe7ff' },
    { href: '/fun/', ic: 'fun', name: 'בידור', sub: 'מה שווה לראות, לשמוע ולשחק – ואיפה', pillow: 'p05', c2: '#b8457a', tint: '#fff0b3' },
    { href: '/songs/', ic: 'music', name: 'שירון', sub: 'מילים, אקורדים לגיטרה ולפסנתר, וזמירות שבת', pillow: 'p03', c2: '#d2601a', tint: '#e3d9ff' },
    { href: '/parasha/', ic: 'torah', name: 'פרשת השבוע', sub: 'הפרשה, הקריאה וזמני השבת', pillow: 'p02', c2: '#8e2435', tint: '#f4d9c4' },
    // the tools
    // (the owner's order, batch 14, 2026-11-14; tag: a small label design styles, e.g. 'ניסיוני')
    { href: '/groceries/', ic: 'cart', name: 'רשימת קניות', sub: 'מה חסר בבית, ומי קונה', pillow: 'p12', c2: '#c4501e', tint: '#c6efc6' },
    { href: '/groceries/#book', ic: 'book', name: 'ספר מתכונים', sub: 'המתכונים שלנו, ומתכונים מכל העולם', pillow: 'p01', c2: '#8e2435', tint: '#ffe0b0' },
    { href: '/food/fridge/', ic: 'fridge', name: 'מקרר', sub: 'מה יש בבית, ומה לבשל ממנו', pillow: 'p06', c2: '#9c2a2a', tint: '#cfe0f7' },
    { href: '/messages/', ic: 'mail', name: 'הודעות', sub: 'שיחה עם בני הבית והמשפחה', pillow: 'p13', c2: '#3557a8' },
    { href: '/gather/', ic: 'family', name: 'מפגש משפחתי', sub: 'קישור אחד לווטסאפ, וכולם עונים', pillow: 'p14', c2: '#b8402a', tint: '#ffe6bf' },
    { href: '/tools/calendar/', ic: 'calendar', name: 'לוח שנה', sub: 'החגים, הצומות והימים של המשפחה', pillow: 'p07', c2: '#c0402a', tint: '#ffd6e0' },
    { href: '/tools/weather/', ic: 'weather', name: 'מזג אוויר', sub: 'מה בחוץ היום, ומה מחר', pillow: 'p14', c2: '#2a7fa8', tint: '#ffe0cc' },
    { href: '/tools/notes/', ic: 'note', name: 'פתקים', sub: 'מה ששמרתם מכל מקום באוהל', pillow: 'p10', c2: '#9c2a2a', tint: '#fff0b3' },
    { href: '/tools/calc/', ic: 'calc', name: 'מחשבון', sub: 'חשבון, ועוזר חכם למתמטיקה ולפיזיקה', pillow: 'p06', c2: '#9c2a2a', tint: '#d4f2dc' },
    { href: '/tools/tasks/', ic: 'tasks', name: 'ניהול מטרות', sub: 'מטרה, תהליכים, וצעד קטן כל יום', pillow: 'p09', c2: '#6c4fd6', tint: '#e3d9ff' },
    { href: '/food/diet/', ic: 'diet', name: 'תנועה ותזונה', sub: 'הקפדה, הדרך שבה אוכלים, ומה מתאים לה', pillow: 'p10', c2: '#9c2a2a', tint: '#ffcdd4' },
    { href: '/food/diet/hakpada/', ic: 'target', name: 'הקפדה', sub: 'מה שהחלטתם לשמור עליו, יום אחר יום', pillow: 'p12', c2: '#c4501e', tint: '#ffd9c2' },
    { href: '/food/diet/habits/', ic: 'habits', name: 'הרגלי אכילה', sub: 'קטו, אטקינס, פליאו ועוד – מתג לכל דרך אכילה', pillow: 'p13', c2: '#1f8f8a', tint: '#c8f0ea' },
    { href: '/food/restaurants/', ic: 'restaurant', name: 'אוכלים בחוץ', sub: 'המסעדות שלנו, ומה הזמנו בכל אחת', pillow: 'p05', c2: '#c4501e' },
    { href: '/tools/research/', ic: 'lens', name: 'עוזר מחקר', sub: 'פתקים, שאלות פתוחות, מקורות וכתיבה', pillow: 'p11', c2: '#3557a8', tint: '#d9ecff' },
    { href: '/tools/parnasa/', ic: 'parnasa', name: 'פרנסה', sub: 'הכסף של הבית: הכנסות, הוצאות וחיסכון', pillow: 'p16', c2: '#2b7a70' },
    { href: '/mail/', ic: 'mail', name: 'סידור המייל', sub: 'תיבת דואר מסודרת, באישור שלך', pillow: 'p04', c2: '#7b1d2c', tint: '#ffd1de', tag: 'ניסיוני', access: 'beta' },
    { href: '/pc/', ic: 'pc', name: 'סידור המחשב', sub: 'מחשב מסודר, צעד אחר צעד', pillow: 'p07', c2: '#c0402a', tint: '#cfe7ff', tag: 'ניסיוני', access: 'beta' },
  ];
  /* The toolbox's categories (the owner, 2026-11-14), in this order. Every app has one (cat); the toolbox shows them all and
     sorts by the person's choice: by hand, by name, or by category. access: 'beta' (in development, for the owner's testers)
     or 'secret' (not for everyone): shown only to whom the back door allowed it. 'soon:x' is a FUTURE item, drawn only. */
  const CATS = [
    { id: 'work', name: 'כלי עבודה', apps: ['/tools/calc/', '/tools/research/', '/parasha/', '/tools/notes/', '/tools/weather/'] },
    { id: 'arts', name: 'אומנות או נמות', apps: ['/songs/', '/fun/', '/news/'] },
    { id: 'health', name: 'שומרים על בריאות', apps: ['/tools/tasks/', '/food/diet/', '/food/diet/hakpada/', '/food/diet/habits/', 'soon:breath'] },
    { id: 'food', name: 'אוכל', apps: ['/food/', 'soon:kitchen', '/groceries/#book', '/food/restaurants/'] },
    { id: 'routine', name: 'שוטף', apps: ['/tools/calendar/', '/tools/parnasa/', '/food/fridge/', '/groceries/', '/pc/', '/mail/'] },
    { id: 'social', name: 'חברתי', apps: ['/family/', '/gather/', '/messages/'] },
  ];
  // still to come, shown inside their category (like SOON: a tap tells one sentence)
  const FUTURE = [
    { id: 'kitchen', name: 'עוזר מטבח', ic: 'food', note: 'בעתיד', line: 'עוזר שמבשל איתך, צעד אחר צעד.' },
    { id: 'breath', name: 'מדיטציה ונשימה', ic: 'habits', note: 'בעתיד', line: 'כמה דקות של שקט ונשימה, כל יום.' },
  ];
  for (const c of CATS) for (const h of c.apps) { const a = APPS.find((x) => x.href === h); if (a) a.cat = c.id; }
  /** may this person open the app? r is what H.me() resolves to; beta and secret apps need the back door's leave (r.apps: ['beta', '/x/']) */
  const mayOpen = (a, r) => !a?.access || !!r?.owner || !!r?.apps?.includes(a.access === 'beta' ? 'beta' : a.href);
  const DEFAULT_PINS = ['/food/', '/news/', '/fun/', '/songs/', '/parasha/'];   // the parts the ring always had
  const CODE = APPS.slice();                    // the code's own catalogue; APPS itself is what the layout makes of it

  /* ---------- עץ מבנה: the owner's layer (server/layout.ts), merged over the code ---------- */
  /** the code's tree: the fixed items and the parts on top, every tool under the part its address starts with
      (else under כלים) */
  function defaultTree(code, parts) {
    const top = code.filter((a) => a.fixed || parts.includes(a.href)).map((a) => ({ href: a.href, kids: [] }));
    for (const a of code) {
      if (top.some((t) => t.href === a.href)) continue;
      const home = top.filter((t) => a.href.split('#')[0].startsWith(t.href) && t.href !== '/').sort((x, y) => y.href.length - x.href.length)[0]
        || top.find((t) => t.href === '/tools/') || top[0];
      home?.kids.push(a.href);
    }
    return top;
  }
  /** the code + the owner's layout → { apps (flat, in the tree's order, without the hidden), tree, parts, pins }.
      Anything the layout names that is gone from the code is skipped; anything new in the code that the layout does
      not know goes where the code's tree puts it; a fixed item stays on top and visible; a layout that is not a
      layout is the code's own. Pure: tested by server/test-layout.mjs. */
  function mergeLayout(code, dflt, layout) {
    const by = new Map(code.map((a) => [a.href, a]));
    const L = layout && typeof layout === 'object' && !Array.isArray(layout) ? layout : {};
    const list = (v) => (Array.isArray(v) ? v : []);
    const hidden = new Set(list(L.hidden).filter((h) => by.has(h) && !by.get(h).fixed));
    const edits = L.edits && typeof L.edits === 'object' ? L.edits : {};
    const look = (a, part) => {
      const o = { ...a, part }, e = edits[a.href];
      if (e && typeof e === 'object') for (const k of ['name', 'sub', 'ic', 'pillow', 'c2']) if (typeof e[k] === 'string' && e[k]) o[k] = e[k];
      return o;
    };
    const used = new Set(), tree = [];
    for (const p of list(L.parts)) {
      if (!p || !by.has(p.href) || used.has(p.href)) continue;
      used.add(p.href);
      const t = { href: p.href, kids: [] };
      for (const k of list(p.kids)) if (by.has(k) && !used.has(k) && !by.get(k).fixed) { used.add(k); t.kids.push(k); }
      tree.push(t);
    }
    // a fixed item that was put under a part comes back on top (it was skipped there)
    const base = defaultTree(code, dflt.parts);
    for (const t of base) if (!used.has(t.href)) { used.add(t.href); tree.push({ href: t.href, kids: [] }); }
    for (const t of base) for (const k of t.kids) {
      if (used.has(k)) continue;
      used.add(k);
      (tree.find((x) => x.href === t.href) || tree.find((x) => x.href === '/tools/') || tree[0]).kids.push(k);
    }
    const apps = [];
    for (const t of tree) {
      if (!hidden.has(t.href)) apps.push(look(by.get(t.href), null));
      for (const k of t.kids) if (!hidden.has(k)) apps.push(look(by.get(k), t.href));
    }
    const shown = (h) => by.has(h) && !by.get(h).fixed && !hidden.has(h);
    const ring = [...new Set(list(L.ring))].filter(shown);
    return { apps, tree, hidden: [...hidden], parts: tree.map((t) => t.href).filter(shown),
      pins: ring.length ? ring : dflt.pins.filter(shown) };
  }

  /* the layout in use: the owner's preview on this tab (sessionStorage), else the last one this device got, refreshed
     from the server every few minutes; a change is applied in place (H.APPS keeps its identity) and announced */
  const PARTS = [], PINS = [];
  let TREE = [], HIDDEN = [];
  function use(layout) {
    const m = mergeLayout(CODE, { parts: DEFAULT_PINS, pins: DEFAULT_PINS }, layout);
    APPS.splice(0, APPS.length, ...m.apps);
    PARTS.splice(0, PARTS.length, ...m.parts);
    PINS.splice(0, PINS.length, ...m.pins);
    TREE = m.tree; HIDDEN = m.hidden;
  }
  const store = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* no storage */ } };
  const read = (s, k) => { try { return JSON.parse(s.getItem(k) || 'null'); } catch (_) { return null; } };
  const preview = (() => { try { return read(sessionStorage, 'helper.layoutPreview'); } catch (_) { return null; } })();
  const cached = read(localStorage, 'helper.layout');
  use(preview || cached?.layout);
  if (!preview && (!cached || Date.now() - (cached.at || 0) > 5 * 60e3)) {
    fetch('/api/layout', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return;
      store('helper.layout', { v: d.v, at: Date.now(), layout: d.layout });
      if ((d.v || 0) !== (cached?.v || 0)) { use(d.layout); dispatchEvent(new CustomEvent('h:layout')); }
    }).catch(() => {});
  }

  const byHref = (href) => APPS.find((a) => a.href === href) || CODE.find((a) => a.fixed && a.href === href);
  const prefs = () => H.prefs('home', { pins: PINS.slice() });
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
    const p = prefs();
    const pinned = p.pins.map(byHref).filter((a) => a && !a.fixed);
    const all = [byHref('/family/'), ...pinned, byHref('/tools/'), byHref('/settings/')];
    if (!Array.isArray(p.order)) return all;
    // the order set in the home's arrange tray (batch 14); anything pinned since then goes at the end
    const set = p.order.map(byHref).filter((a, i, arr) => a && all.includes(a) && arr.indexOf(a) === i);
    return [...set, ...all.filter((a) => !set.includes(a))];
  }
  function setRing(hrefs) {
    const p = prefs();
    const order = [...new Set(hrefs)].filter(byHref);
    for (const a of APPS) if (a.fixed && !order.includes(a.href)) order.push(a.href);   // a fixed cushion is never removed
    p.order = order;
    p.pins = order.filter((h) => !byHref(h).fixed);
    H.savePrefs('home');
  }
  const FLASK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 3.5h5M10.5 3.5v5.2L5.4 17.6A2 2 0 0 0 7.1 20.5h9.8a2 2 0 0 0 1.7-2.9l-5.1-8.9V3.5"/><path d="M7.6 14.5h8.8"/></svg>';
  const expTag = (a) => (a?.tag ? H.el('span', { class: 'tag-exp', html: FLASK + a.tag }) : null);
  // (the shared icons have the gear for הגדרות now; appIcon stays as the one name the ring and the tools page use)
  const appIcon = (name, cls) => H.icon(name, cls);
  /* Big ideas shown on purpose as "בקרוב" (batch 15, 2026-11-14): no work on them, not even a spec. Not in APPS, so nothing links
     to a page that doesn't exist. Design draws each one and its note; a tap opens only the one sentence in `line`. */
  const SOON = [
    { id: 'hill', name: 'גבעה ביער', note: 'בקרוב', line: 'מקום משותף לחברים, ליד האוהל של המשפחה.' },
    { id: 'garage', name: 'המוסך', note: 'בקרוב', line: 'הבית החכם במסך אחד: האורות, המזגן והמכשירים, ליד האוהל.' },
  ];
  Object.assign(H, { APPS, PARTS, SOON, CATS, FUTURE, mayOpen, ringApps, isPinned, togglePin, setRing, expTag, appIcon, mergeLayout,
    layout: () => ({ code: CODE, tree: TREE, hidden: HIDDEN, pins: PINS.slice(), defaultPins: DEFAULT_PINS.slice() }) });
})();
