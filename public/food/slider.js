/* The food portal's slider (vision batch 4, item 11): what is about to go off in the family's fridges, the family's own
   recipes that use it first (then the ones cooked lately), and the family's restaurants missed or new (server/food.ts –
   no AI, no cost). H.foodSlides() gives them as design's H.strip cards (launcher.js); the page puts the strip under its head:
     H.folder({ …, under: H.strip({ title: 'עכשיו במטבח', items: H.foodSlides() }) }) */
(() => {
  const when = (d) => (d < 0 ? (d === -1 ? 'פג אתמול' : `פג לפני ${-d} ימים`) : d === 0 ? 'פג היום' : d === 1 ? 'פג מחר' : `פג בעוד ${d} ימים`);
  const card = (s) => s.kind === 'fridge'
    ? { kind: 'fridge', emoji: '🧊', kicker: 'מהמקרר שלך', title: s.name, sub: when(s.days), tone: s.days < 0 ? 'gone' : s.days <= 1 ? 'soon' : null, href: '/food/fridge/' }
    : s.kind === 'restaurant'
      ? { kind: 'place', emoji: '🍽️', kicker: s.why === 'new' ? 'חדש ברשימה' : 'מזמן לא הייתם', title: s.name,
        sub: [s.place, s.why === 'missed' ? (s.days === null ? 'מהאהובות, עוד לא הייתם' : `הייתם לפני ${s.days} ימים`) : ''].filter(Boolean).join(' · ') || null,
        href: '/food/restaurants/?open=' + encodeURIComponent(s.id) }
      : { kind: 'recipe', img: s.image || null, emoji: '🍲', kicker: s.uses.length ? 'כדאי לבשל עכשיו' : 'מהספר שלנו', title: s.title,
        sub: s.uses.length ? 'משתמש ב' + s.uses.join(', ') : null, href: '/groceries/#book' };
  /** the cards, or none (the strip hides itself when the list is empty or the request fails) */
  H.foodSlides = () => H.api('/api/food/highlights').then((r) => (r.slides || []).map(card));
})();
