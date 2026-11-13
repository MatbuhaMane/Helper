// The food portal's slider (vision batch 4, item 11): what is worth seeing now, without AI and at no cost –
// what in the household's fridges is about to go off (or has), and the household's own recipes that use it first,
// then the ones cooked lately; and from the family's own restaurants (מסעדות שלנו), the favourites not visited for a
// while and the new ones (docs/ai/restaurants.md).
// Tests: node server/test-food.mjs

import { Ctx, json, requireUser } from './core';
import { listRestaurants, restaurantSlides } from './restaurants';

export interface FridgeItem { id: string; name: string; fridge: string; fridgeName: string; expires: string | null; qty: number; unit: string | null }
export interface RecipeLite { id: string; title: string; image: string | null; ingredients: { name: string }[]; updated_at: number }
export type Slide =
  | { kind: 'fridge'; id: string; name: string; fridge: string; fridgeName: string; expires: string; days: number }
  | { kind: 'recipe'; id: string; title: string; image: string | null; uses: string[] };

const words = (s: string) => s.replace(/[֑-ׇ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
/** "עגבניות שרי" in the fridge and "4 עגבניות" in a recipe: the same thing (a word in common, or one inside the other) */
export function sameFood(a: string, b: string): boolean {
  const A = words(a), B = words(b);
  const stem = (w: string) => w.replace(/(ים|ות|ה|ת)$/, '');
  return A.some((x) => B.some((y) => x === y || (x.length >= 3 && y.length >= 3 && (stem(x) === stem(y) || x.includes(y) || y.includes(x)))));
}

/** the slides: fridge items going off within `within` days (soonest first, at most 6), then recipes that use them, then recent ones */
export function pickSlides(items: FridgeItem[], recipes: RecipeLite[], today: string, within = 3, max = 12): Slide[] {
  const day = (d: string) => Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 864e5);
  const soon = items.filter((i) => i.expires && day(i.expires) <= within)
    .sort((a, b) => day(a.expires!) - day(b.expires!)).slice(0, 6);
  const out: Slide[] = soon.map((i) => ({ kind: 'fridge', id: i.id, name: i.name, fridge: i.fridge, fridgeName: i.fridgeName, expires: i.expires!, days: day(i.expires!) }));
  const scored = recipes.map((r) => {
    const uses = soon.filter((i) => day(i.expires!) >= 0 && r.ingredients.some((g) => sameFood(g.name, i.name))).map((i) => i.name);
    return { r, uses };
  });
  const using = scored.filter((x) => x.uses.length).sort((a, b) => b.uses.length - a.uses.length || b.r.updated_at - a.r.updated_at);
  const recent = scored.filter((x) => !x.uses.length).sort((a, b) => b.r.updated_at - a.r.updated_at);
  for (const { r, uses } of [...using, ...recent]) {
    if (out.length >= max) break;
    out.push({ kind: 'recipe', id: r.id, title: r.title, image: r.image, uses: [...new Set(uses)] });
  }
  return out;
}

/** GET /api/food/highlights → { slides } (the household's own fridges and recipes only) */
export async function highlights(ctx: Ctx) {
  const u = requireUser(ctx);
  const db = ctx.env.DB;
  const [items, recipes, places] = await Promise.all([
    db.prepare(`SELECT i.id, i.name, i.fridge, f.name AS fridgeName, i.expires, i.qty, i.unit FROM fridge_items i JOIN fridges f ON f.id = i.fridge
      WHERE i.deleted = 0 AND f.deleted = 0 AND COALESCE(f.household, 'family') = ? AND i.expires IS NOT NULL`).bind(u.household).all<FridgeItem>(),
    db.prepare('SELECT id, title, image, ingredients, updated_at FROM recipes WHERE household = ? ORDER BY updated_at DESC LIMIT 200').bind(u.household)
      .all<{ id: string; title: string; image: string | null; ingredients: string; updated_at: number }>(),
    listRestaurants(ctx.env, u.household).catch(() => []),   // (before its table exists: none)
  ]);
  const list: RecipeLite[] = recipes.results.map((r) => {
    let ingredients: { name: string }[] = [];
    try { ingredients = JSON.parse(r.ingredients || '[]'); } catch { /* an old row */ }
    return { id: r.id, title: r.title, image: r.image, ingredients, updated_at: r.updated_at };
  });
  // "today" where the family is (Israel), so a thing that goes off today says so after midnight there too
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  // the fridge and the recipes first, then the restaurants (at most four), so a full fridge does not hide them all
  const food = pickSlides(items.results, list, today, 3, 10);
  return json({ slides: [...food, ...restaurantSlides(places, Date.now())], today });   // (never cached: what was just put in the fridge shows at once)
}
