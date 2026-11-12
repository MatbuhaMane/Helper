/* The food portal's slider (vision batch 4, item 11), under the header: what is about to go off in the family's fridges,
   and the family's own recipes that use it first, then the ones cooked lately (server/food.ts – no AI, no cost).
   Then the family's own restaurants (מסעדות שלנו): favourites not visited for a while, and new ones. The look of .food-slider is design's; the few inline rules
   here only keep it a row that scrolls sideways until then. */
(async () => {
  const { el, api } = H;
  await H.requireLogin();
  let slides = [];
  try { slides = (await api('/api/food/highlights')).slides || []; } catch (_) { return; }
  if (!slides.length) return;

  const when = (d) => (d < 0 ? (d === -1 ? 'פג אתמול' : `פג לפני ${-d} ימים`) : d === 0 ? 'פג היום' : d === 1 ? 'פג מחר' : `פג בעוד ${d} ימים`);
  const letter = (t) => el('span', { class: 'fs-letter', 'aria-hidden': 'true', style: 'display:grid;place-items:center;block-size:96px;font-size:2.2rem;border-radius:12px;background:color-mix(in srgb, var(--olive, #7a8a45) 22%, var(--card))' }, (t.replace(/[^א-תa-z]/gi, '')[0] || '🍲'));
  const ITEM = 'flex:0 0 auto;inline-size:min(220px, 62vw);scroll-snap-align:start;display:grid;gap:6px;align-content:start;padding:12px;border-radius:16px;text-decoration:none;color:inherit';
  const item = (s) => s.kind === 'restaurant'
    ? el('a', { class: 'fs-item fs-restaurant card', href: '/food/restaurants/?open=' + encodeURIComponent(s.id), role: 'listitem', style: ITEM },
      el('small', { class: 'fs-kind muted' }, s.why === 'new' ? '🍽 חדש ברשימה' : '🍽 מזמן לא הייתם'),
      el('b', { dir: 'auto' }, s.name),
      el('span', { class: 'fs-when small' }, [s.place, s.why === 'missed' ? (s.days === null ? 'מהאהובות, עוד לא הייתם' : `הייתם לפני ${s.days} ימים`) : ''].filter(Boolean).join(' · ')))
    : s.kind === 'fridge'
    ? el('a', { class: 'fs-item fs-fridge card' + (s.days < 0 ? ' gone' : s.days <= 1 ? ' soon' : ''), href: '/food/fridge/', role: 'listitem', style: ITEM },
      el('small', { class: 'fs-kind muted' }, '🧊 מהמקרר · ' + s.fridgeName),
      el('b', { dir: 'auto' }, s.name),
      el('span', { class: 'fs-when' }, when(s.days)))
    : el('a', { class: 'fs-item fs-recipe card', href: '/groceries/#book', role: 'listitem', style: ITEM },
      s.image ? el('img', { src: s.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', style: 'inline-size:100%;block-size:96px;object-fit:cover;border-radius:12px', onerror: (e) => e.target.replaceWith(letter(s.title)) }) : letter(s.title),
      el('small', { class: 'fs-kind muted' }, s.uses.length ? '🍳 כדאי לבשל עכשיו' : '📖 מהספר שלנו'),
      el('b', { dir: 'auto' }, s.title),
      s.uses.length ? el('span', { class: 'fs-uses small' }, 'משתמש ב' + s.uses.join(', ')) : null);

  const slider = el('section', { class: 'food-slider', 'aria-label': 'עכשיו במטבח', style: 'display:grid;gap:8px;margin-block:4px 14px' },
    el('h2', { style: 'margin:0;font-size:1.1rem' }, 'עכשיו במטבח'),
    el('div', { class: 'fs-track', role: 'list', style: 'display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding-block-end:6px;overscroll-behavior-x:contain' }, slides.map(item)));
  // under the header (the folder's picture), above the apps
  const place = () => {
    const hero = document.querySelector('.folder-hero');
    if (hero) { hero.after(slider); return true; }
    const folder = document.querySelector('.folder');
    if (folder) { folder.prepend(slider); return true; }
    return false;
  };
  if (!place()) new MutationObserver((_, o) => { if (place()) o.disconnect(); }).observe(document.querySelector('main') || document.body, { childList: true, subtree: true });
})();
