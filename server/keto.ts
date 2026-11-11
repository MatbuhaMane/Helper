// Ketosis: each person's diet settings, meal log (eaten and planned), weight, and the nutrition values
// (per 100 g) that the calculator and the shopping list use. Unknown foods are estimated by AI once and cached;
// a family's own corrections override the shared estimate.

import { z } from 'zod';
import { aiJson } from './ai';
import { Ctx, HttpError, body, json, requireUser, sha1Hex, uid } from './core';
import { normalizeName } from './kitchen';

const Settings = z.object({
  enabled: z.boolean(),
  preset: z.string().max(30),
  netCarbLimit: z.number().min(0).max(500),
  kcalTarget: z.number().min(0).max(10000),
  fatPct: z.number().min(0).max(100),
  proteinPct: z.number().min(0).max(100),
  carbPct: z.number().min(0).max(100),
});
const DEFAULT_SETTINGS: z.infer<typeof Settings> = { enabled: false, preset: 'standard', netCarbLimit: 20, kcalTarget: 1800, fatPct: 70, proteinPct: 25, carbPct: 5 };

const num = z.number().min(0).max(100000);
const MealItem = z.object({ name: z.string().min(1).max(200), grams: num, fat: num, protein: num, carbs: num, fiber: num });
const MealInput = z.object({
  at: z.number().int(),
  name: z.string().min(1).max(200),
  items: z.array(MealItem).max(100),
  status: z.enum(['eaten', 'planned']),
});

function round1(n: number) { return Math.round(n * 10) / 10; }

function rowToMeal(r: any) {
  return { id: r.id, at: r.at, name: r.name, items: JSON.parse(r.items), fat: r.fat, protein: r.protein, carbs: r.carbs, fiber: r.fiber, status: r.status };
}

export async function getState(ctx: Ctx) {
  const u = requireUser(ctx);
  const db = ctx.env.DB;
  const from = Date.now() - 90 * 24 * 3600 * 1000;
  const [s, meals, weights] = await Promise.all([
    db.prepare('SELECT data FROM keto_settings WHERE email = ?').bind(u.email).first<{ data: string }>(),
    db.prepare('SELECT * FROM keto_meals WHERE email = ? AND (at >= ? OR status = ?) ORDER BY at DESC LIMIT 1000').bind(u.email, from, 'planned').all(),
    db.prepare('SELECT day, kg FROM keto_weights WHERE email = ? ORDER BY day DESC LIMIT 400').bind(u.email).all(),
  ]);
  let settings = DEFAULT_SETTINGS;
  try { if (s) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(s.data) }; } catch { /* keep defaults */ }
  return json({ settings, meals: meals.results.map(rowToMeal), weights: weights.results });
}

export async function putSettings(ctx: Ctx) {
  const u = requireUser(ctx);
  const parsed = Settings.safeParse(await body(ctx.req));
  if (!parsed.success) throw new HttpError(400, 'Invalid settings');
  await ctx.env.DB.prepare('INSERT INTO keto_settings (email, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
    .bind(u.email, JSON.stringify(parsed.data), Date.now()).run();
  return json({ settings: parsed.data });
}

export async function saveMeal(ctx: Ctx) {
  const u = requireUser(ctx);
  const parsed = MealInput.safeParse(await body(ctx.req));
  if (!parsed.success) throw new HttpError(400, 'Invalid meal');
  const m = parsed.data;
  const t = m.items.reduce((s, i) => ({ fat: s.fat + i.fat, protein: s.protein + i.protein, carbs: s.carbs + i.carbs, fiber: s.fiber + i.fiber }), { fat: 0, protein: 0, carbs: 0, fiber: 0 });
  const id = ctx.params.id || uid();
  await ctx.env.DB.prepare(
    `INSERT INTO keto_meals (email, id, at, name, items, fat, protein, carbs, fiber, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(email, id) DO UPDATE SET at = excluded.at, name = excluded.name, items = excluded.items, fat = excluded.fat, protein = excluded.protein,
       carbs = excluded.carbs, fiber = excluded.fiber, status = excluded.status`,
  ).bind(u.email, id, m.at, m.name, JSON.stringify(m.items), round1(t.fat), round1(t.protein), round1(t.carbs), round1(t.fiber), m.status, Date.now()).run();
  return json({ meal: { id, ...m, fat: round1(t.fat), protein: round1(t.protein), carbs: round1(t.carbs), fiber: round1(t.fiber) } });
}

export async function deleteMeal(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('DELETE FROM keto_meals WHERE email = ? AND id = ?').bind(u.email, ctx.params.id).run();
  return json({ ok: true });
}

export async function putWeight(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = await body<{ day: string; kg: number }>(ctx.req);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.day || '') || !(b.kg > 20 && b.kg < 400)) throw new HttpError(400, 'Invalid weight');
  await ctx.env.DB.prepare('INSERT INTO keto_weights (email, day, kg) VALUES (?, ?, ?) ON CONFLICT(email, day) DO UPDATE SET kg = excluded.kg')
    .bind(u.email, b.day, round1(b.kg)).run();
  return json({ ok: true });
}

export async function deleteWeight(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('DELETE FROM keto_weights WHERE email = ? AND day = ?').bind(u.email, ctx.params.day).run();
  return json({ ok: true });
}

/* ---------------- nutrition values ---------------- */

interface FoodRow { household: string; key: string; name: string; fat: number; protein: number; carbs: number; fiber: number; unit_g: number | null; is_food: number; source: string }
const toFood = (r: FoodRow) => ({ key: r.key, name: r.name, fat: r.fat, protein: r.protein, carbs: r.carbs, fiber: r.fiber, unit_g: r.unit_g, is_food: !!r.is_food, source: r.source });

/** The family's own corrections win over the shared estimates. */
async function foodsFor(ctx: Ctx, household: string, keys?: string[]) {
  const db = ctx.env.DB;
  let rows: FoodRow[];
  if (keys) {
    if (!keys.length) return new Map<string, ReturnType<typeof toFood>>();
    const marks = keys.map(() => '?').join(',');
    rows = (await db.prepare(`SELECT * FROM foods WHERE household IN ('', ?) AND key IN (${marks})`).bind(household, ...keys).all<FoodRow>()).results;
  } else {
    rows = (await db.prepare(`SELECT * FROM foods WHERE household IN ('', ?) ORDER BY updated_at DESC LIMIT 3000`).bind(household).all<FoodRow>()).results;
  }
  const out = new Map<string, ReturnType<typeof toFood>>();
  for (const r of rows.sort((a, b) => (a.household ? 1 : 0) - (b.household ? 1 : 0))) out.set(r.key, toFood(r));
  return out;
}

export async function listFoods(ctx: Ctx) {
  const u = requireUser(ctx);
  return json({ foods: [...(await foodsFor(ctx, u.household)).values()] });
}

const Estimate = z.object({
  foods: z.array(z.object({
    name: z.string(), is_food: z.boolean(),
    fat: z.number(), protein: z.number(), carbs: z.number(), fiber: z.number(), unit_g: z.number(),
  })),
});

const ESTIMATE_SYSTEM = `You give typical nutrition values for foods named the way an Israeli family writes them on a shopping list (Hebrew or English, sometimes with a brand).
For each name return values per 100 g (per 100 ml for drinks) of the product as usually bought and eaten:
fat, protein, carbs (TOTAL carbohydrates including fiber, as on an Israeli label), fiber (g), and unit_g: the weight in grams of one typical unit (one egg 55, one slice of bread 30, one tomato 120), or 0 when it is sold by weight.
Use reliable references (Israeli labels / Tzameret, USDA). For a brand, use that product's label values when you know them.
Plain coffee/tea leaves as brewed. Herbs and spices as the fresh/dry product per 100 g.
Set is_food=false (and all values 0) for anything that is not eaten: cleaning products, shampoo, soap, paper goods.
Keep each "name" exactly as given, in the same order.`;

export async function estimateFoods(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = await body<{ names: string[] }>(ctx.req);
  const names = [...new Set((Array.isArray(b.names) ? b.names : []).map((n) => String(n).trim().slice(0, 120)).filter(Boolean))].slice(0, 60);
  const byKey = new Map(names.map((n) => [normalizeName(n) || n.toLowerCase(), n]));
  const known = await foodsFor(ctx, u.household, [...byKey.keys()]);
  const missing = [...byKey].filter(([k]) => !known.has(k));
  if (missing.length) {
    const est = await aiJson(ctx.env, {
      prefer: 'gemini',
      system: ESTIMATE_SYSTEM,
      prompt: `Foods:\n${missing.map(([, n], i) => `${i + 1}. ${n}`).join('\n')}`,
      schema: Estimate,
    });
    const now = Date.now();
    const stmts = [];
    for (let i = 0; i < missing.length; i++) {
      const [key, name] = missing[i];
      const f = est.foods.find((x) => x.name.trim() === name) || est.foods[i];
      if (!f) continue;
      const clamp = (n: number) => Math.max(0, Math.min(100, round1(Number(n) || 0)));
      const row: FoodRow = {
        household: '', key, name, fat: clamp(f.fat), protein: clamp(f.protein), carbs: clamp(f.carbs), fiber: Math.min(clamp(f.fiber), clamp(f.carbs) || clamp(f.fiber)),
        unit_g: f.unit_g > 0 ? round1(f.unit_g) : null, is_food: f.is_food ? 1 : 0, source: 'ai',
      };
      known.set(key, toFood(row));
      stmts.push(ctx.env.DB.prepare(
        `INSERT INTO foods (household, key, name, fat, protein, carbs, fiber, unit_g, is_food, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(household, key) DO NOTHING`,
      ).bind('', key, name, row.fat, row.protein, row.carbs, row.fiber, row.unit_g, row.is_food, 'ai', now));
    }
    if (stmts.length) await ctx.env.DB.batch(stmts);
  }
  return json({ foods: [...byKey].map(([k, n]) => ({ ...(known.get(k) || { key: k, name: n, fat: 0, protein: 0, carbs: 0, fiber: 0, unit_g: null, is_food: false, source: 'none' }), asked: n })) });
}

/* ---------------- a whole recipe ---------------- */

const RecipeEstimate = z.object({
  servings: z.number(),
  items: z.array(z.object({ name: z.string(), grams: z.number(), fat: z.number(), protein: z.number(), carbs: z.number(), fiber: z.number() })),
});

const RECIPE_SYSTEM = `You estimate the nutrition of a recipe for someone on a ketogenic diet.
For every ingredient, work out how many grams the recipe uses (convert cups, spoons, units: one egg 55 g, one onion 110 g, a clove of garlic 4 g, a tablespoon of oil 13 g)
and give fat, protein, carbs (TOTAL carbohydrates including fiber) and fiber in grams FOR THAT AMOUNT (not per 100 g), as usually bought and eaten.
Ingredients "to taste" (salt, pepper) or water count as 0. Pasta, rice and grains: use the dry weight given.
servings: how many servings the recipe makes (from the text given, or your best estimate from the amounts; at least 1).
Keep each "name" as given, in the same order.`;

/** Values per serving for a recipe (cached by its ingredients), for the ketosis pie at the top of a recipe. */
export async function recipeNutrition(ctx: Ctx) {
  requireUser(ctx);
  const b = await body<{ title?: string; servings?: string; ingredients: { name: string; measure: string }[] }>(ctx.req);
  const ingredients = (Array.isArray(b.ingredients) ? b.ingredients : []).map((i) => ({ name: String(i.name || '').trim().slice(0, 160), measure: String(i.measure || '').trim().slice(0, 60) })).filter((i) => i.name).slice(0, 60);
  if (!ingredients.length) throw new HttpError(400, 'No ingredients');
  const key = await sha1Hex(JSON.stringify({ s: (b.servings || '').trim(), i: ingredients }));
  const hit = await ctx.env.DB.prepare('SELECT data FROM recipe_nutrition WHERE key = ?').bind(key).first<{ data: string }>();
  if (hit) return json(JSON.parse(hit.data));

  const est = await aiJson(ctx.env, {
    prefer: 'gemini',
    system: RECIPE_SYSTEM,
    prompt: `Recipe: ${(b.title || '').slice(0, 200)}\nServings stated: ${(b.servings || 'not stated').slice(0, 60)}\nIngredients:\n${ingredients.map((i, n) => `${n + 1}. ${i.measure ? i.measure + ' ' : ''}${i.name}`).join('\n')}`,
    schema: RecipeEstimate,
  });
  const clamp = (n: number) => Math.max(0, Math.min(5000, round1(Number(n) || 0)));
  const items = est.items.slice(0, ingredients.length).map((x, n) => ({
    name: ingredients[n]?.name || x.name, grams: clamp(x.grams), fat: clamp(x.fat), protein: clamp(x.protein), carbs: clamp(x.carbs), fiber: Math.min(clamp(x.fiber), clamp(x.carbs)),
  }));
  const total = items.reduce((s, x) => ({ fat: s.fat + x.fat, protein: s.protein + x.protein, carbs: s.carbs + x.carbs, fiber: s.fiber + x.fiber }), { fat: 0, protein: 0, carbs: 0, fiber: 0 });
  const servings = Math.max(1, Math.min(50, Math.round(est.servings) || 1));
  const per = (v: number) => round1(v / servings);
  const data = {
    servings, items,
    total: { fat: round1(total.fat), protein: round1(total.protein), carbs: round1(total.carbs), fiber: round1(total.fiber) },
    per_serving: { fat: per(total.fat), protein: per(total.protein), carbs: per(total.carbs), fiber: per(total.fiber) },
  };
  await ctx.env.DB.prepare('INSERT INTO recipe_nutrition (key, data, created_at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING').bind(key, JSON.stringify(data), Date.now()).run();
  return json(data);
}

const FoodInput = z.object({
  name: z.string().min(1).max(120), fat: num, protein: num, carbs: num, fiber: num, unit_g: z.number().min(0).max(5000).nullable().optional(),
});

/** A family's own values for a food (e.g. from the package label). */
export async function putFood(ctx: Ctx) {
  const u = requireUser(ctx);
  const parsed = FoodInput.safeParse(await body(ctx.req));
  if (!parsed.success) throw new HttpError(400, 'Invalid food');
  const f = parsed.data;
  const key = normalizeName(f.name) || f.name.toLowerCase();
  await ctx.env.DB.prepare(
    `INSERT INTO foods (household, key, name, fat, protein, carbs, fiber, unit_g, is_food, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'user', ?)
     ON CONFLICT(household, key) DO UPDATE SET name = excluded.name, fat = excluded.fat, protein = excluded.protein, carbs = excluded.carbs,
       fiber = excluded.fiber, unit_g = excluded.unit_g, is_food = 1, source = 'user', updated_at = excluded.updated_at`,
  ).bind(u.household, key, f.name, round1(f.fat), round1(f.protein), round1(f.carbs), round1(Math.min(f.fiber, f.carbs)), f.unit_g || null, Date.now()).run();
  return json({ food: { key, name: f.name, fat: f.fat, protein: f.protein, carbs: f.carbs, fiber: Math.min(f.fiber, f.carbs), unit_g: f.unit_g || null, is_food: true, source: 'user' } });
}
