// Kashrut and keto check of a recipe's ingredients: which ones are a problem, why, and a few substitutes for each.
// One AI call per set of ingredients, cached. This is a helpful guess from the ingredient names, not a hechsher.

import { z } from 'zod';
import { aiJson } from './ai';
import { Ctx, HttpError, body, json, requireUser, sha1Hex } from './core';

const Check = z.object({
  kosher: z.array(z.object({
    index: z.number(),
    kind: z.enum(['forbidden', 'shrimp', 'meat_dairy']),
    reason_he: z.string(),
    subs: z.array(z.string()),
  })),
  keto: z.array(z.object({
    index: z.number(),
    reason_he: z.string(),
    subs: z.array(z.string()),
  })),
});

const SYSTEM = `You check a recipe's ingredients for an Israeli family that keeps kosher and sometimes eats keto. Ingredients are numbered from 0.

kosher: list the ingredients that make the recipe not kosher, each with:
- kind "forbidden": a non-kosher animal or product of one: pork in any form (bacon, ham, pancetta, guanciale, prosciutto, lard, chorizo, most salami unless stated kosher), rabbit, horse, shellfish other than shrimp (crab, lobster, mussels, clams, oysters, scallops, squid, octopus), fish without fins and scales (catfish, eel, shark, monkfish), blood, non-kosher gelatin.
- kind "shrimp": shrimp or prawns.
- kind "meat_dairy": meat or poultry cooked or served together with dairy (butter, cream, milk, cheese, yogurt). Flag the ingredient that is easiest to replace (usually the dairy one), not both.
For each, reason_he is a very short Hebrew reason ("חזיר", "בשר וחלב יחד", "פירות ים") and subs are 2-4 kosher substitutes in Hebrew that work in THIS dish
(pancetta -> "פסטרמה מעושנת", "חזה אווז מעושן"; butter with meat -> "שמן זית", "מרגרינה פרווה"; cream with chicken -> "קרם קוקוס", "שמנת צמחית פרווה";
shrimp -> "דג לבן בקוביות", "חזה עוף בקוביות"). Kosher fish, beef, lamb, chicken, eggs and all plants are fine. Do not flag wine, cheese or other products only for needing a kosher certificate.

keto: list the ingredients high in net carbs that do not suit a ketogenic diet (sugar, honey, syrup, flour, bread, breadcrumbs, pasta, noodles, rice, potatoes, sweet potatoes, corn, beans and lentils in large amounts, most fruit, sweet sauces).
Each with reason_he (short Hebrew, e.g. "עשיר בפחמימות") and 2-4 keto substitutes in Hebrew that work in this dish (pasta -> "אטריות קישוא", "אטריות שיראטאקי"; sugar -> "אריתריטול", "סטיביה";
flour -> "קמח שקדים", "קמח קוקוס"; potatoes -> "כרובית", "סלק לבן"; rice -> "אורז כרובית"). Small amounts of onion, garlic, tomato, lemon and spices are fine on keto.

Use the exact index of each ingredient. Empty lists when nothing is a problem.`;

/** POST /api/recipes/check {title, ingredients:[{name, measure}]} -> {kosher:[...], keto:[...]} */
export async function checkRecipe(ctx: Ctx) {
  requireUser(ctx);
  const b = await body<{ title?: string; ingredients: { name: string; measure?: string }[] }>(ctx.req);
  const ingredients = (Array.isArray(b.ingredients) ? b.ingredients : []).map((i) => ({ name: String(i.name || '').trim().slice(0, 160), measure: String(i.measure || '').trim().slice(0, 60) })).slice(0, 60);
  if (!ingredients.some((i) => i.name)) throw new HttpError(400, 'No ingredients');
  const key = 'v1:' + await sha1Hex(JSON.stringify(ingredients.map((i) => i.name)));
  const hit = await ctx.env.DB.prepare('SELECT data FROM recipe_checks WHERE key = ?').bind(key).first<{ data: string }>();
  if (hit) return json(JSON.parse(hit.data));

  const res = await aiJson(ctx.env, {
    prefer: 'gemini',
    effort: 'low',
    system: SYSTEM,
    prompt: `Recipe: ${String(b.title || '').slice(0, 200)}\nIngredients:\n${ingredients.map((i, n) => `${n}. ${i.measure ? i.measure + ' ' : ''}${i.name}`).join('\n')}`,
    schema: Check,
  });
  const valid = (i: number) => Number.isInteger(i) && i >= 0 && i < ingredients.length && !!ingredients[i].name;
  const clean = (subs: string[]) => [...new Set(subs.map((s) => s.trim()).filter(Boolean))].slice(0, 4);
  const seen = new Set<number>();
  const data = {
    kosher: res.kosher.filter((x) => valid(x.index) && !seen.has(x.index) && seen.add(x.index)).map((x) => ({ ...x, subs: clean(x.subs) })).filter((x) => x.subs.length),
    keto: res.keto.filter((x) => valid(x.index)).map((x) => ({ ...x, subs: clean(x.subs) })).filter((x) => x.subs.length),
  };
  await ctx.env.DB.prepare('INSERT INTO recipe_checks (key, data, created_at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING').bind(key, JSON.stringify(data), Date.now()).run();
  return json(data);
}
