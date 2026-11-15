// /food/ – this page's script, moved out of the HTML so the site can forbid inline scripts (CSP script-src 'self', security review 2026-11-15 M2).

// Food: the shopping list and the recipe book live in the groceries app (each opens its own section); diets (הקפדה, ketosis) have a folder, תנועה ותזונה; the fridges are shared by the whole family.
// the window on top (the owner's choice, א2 · השולחן הערוך; all six versions are kept in figures/art/library/food/)
H.folder({ title: 'אוכל', sub: 'קניות, מתכונים, תנועה ותזונה – והמקרר', look: 'flat',
  hero: { src: '/assets/food/portal.webp', small: '/assets/food/portal-800.webp', alt: 'שולחן ערוך מול האוהל: חומוס, סלטים, פיתות, זיתים ורימונים' },
  // under the head: what is about to go off, what to cook from it, and the restaurants (slider.js, server/food.ts)
  under: H.strip({ title: 'עכשיו במטבח', items: H.foodSlides() }), apps: [
  { href: '/groceries/', ic: 'cart', name: 'רשימת קניות', tint: '#c6efc6', c1: '#7fd37f', c2: '#2f8f4e' },
  { href: '/groceries/#book', ic: 'book', name: 'ספר מתכונים', tint: '#ffe0b0', c1: '#ffc062', c2: '#e0662a' },
  { href: '/food/diet/', ic: 'diet', name: 'תנועה ותזונה', tint: '#ffcdd4', c1: '#ff9aa8', c2: '#d6405a' },
  { href: '/food/fridge/', ic: 'fridge', name: 'מקרר', tint: '#cfe0f7', c1: '#b5c8e6', c2: '#5a74a8' },
  { href: '/food/restaurants/', ic: 'restaurant', name: 'מסעדות שלנו', tint: '#ffe3d1', c1: '#ffb98c', c2: '#c9632a' },
] });
