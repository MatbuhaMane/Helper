// Groceries (shared per household, synced by per-item timestamps) and the household recipe book.

import { z } from 'zod';
import { aiJson } from './ai';
import { Ctx, Env, HttpError, body, json, requireUser, uid } from './core';
import { fetchPage, readable } from './web';

/* ---------------- groceries ---------------- */

const INITIAL: [string, string][] = [
  ['חומר ניקוי לשואב רובוטי', 'clean'], ['שמפו', 'care'], ['סבון קשה נקה 7', 'clean'], ['מכסה לחור במקלחת', 'clean'],
  ['גבינת טל העמק', 'dairy'], ['שמנת מתוקה', 'dairy'], ['שמנת חמוצה בטעם של פעם', 'dairy'], ['חמאה', 'dairy'],
  ['נקניק', 'meat'], ['בשר טחון', 'meat'], ['חזה עוף', 'meat'], ['כנפיים', 'meat'],
  ['ארל גריי', 'drinks'], ['סוכר חום', 'dry'], ['קפה שחור', 'drinks'],
  ['טבסקו', 'pantry'], ['אנשובי', 'pantry'], ['תירס פחית', 'pantry'], ['ציר עוף/ירקות/בקר', 'pantry'], ['מיונז', 'pantry'],
  ['מלפפון', 'veg'], ['עגבניה', 'veg'], ['לימון', 'veg'], ['חסה', 'veg'], ['רוזמרין', 'herbs'], ['מרווה', 'herbs'],
  ['נענע', 'herbs'], ['גזר', 'veg'], ['פלפל חריף', 'veg'], ['סלרי', 'veg'], ['חסה', 'veg'], ['בצל', 'veg'],
];

interface ItemRow {
  id: string; name: string; cat: string; checked: number; qty: number; src: string | null; updated_at: number; deleted: number;
}

function toItem(r: ItemRow) {
  return { id: r.id, name: r.name, cat: r.cat, checked: !!r.checked, qty: r.qty, from: r.src || undefined, updatedAt: r.updated_at, deleted: !!r.deleted };
}

async function seedIfNew(env: Env, household: string) {
  const db = env.DB;
  const h = await db.prepare('SELECT seeded FROM households WHERE id = ?').bind(household).first<{ seeded: number }>();
  if (h) return;
  await db.prepare('INSERT OR IGNORE INTO households (id, seeded) VALUES (?, 1)').bind(household).run();
  const now = Date.now();
  await db.batch(INITIAL.map(([name, cat], i) =>
    db.prepare('INSERT INTO grocery_items (household, id, name, cat, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(household, uid(), name, cat, now + i, 'seed')));
}

export async function listGroceries(ctx: Ctx) {
  const u = requireUser(ctx);
  await seedIfNew(ctx.env, u.household);
  const since = Number(ctx.url.searchParams.get('since') || 0);
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, name, cat, checked, qty, src, updated_at, deleted FROM grocery_items WHERE household = ? AND updated_at > ? ORDER BY updated_at',
  ).bind(u.household, since).all<ItemRow>();
  return json({ items: results.map(toItem), now: Date.now() });
}

const OpSchema = z.object({
  ops: z.array(z.union([
    z.object({
      op: z.literal('upsert'),
      item: z.object({
        id: z.string().min(1).max(40), name: z.string().min(1).max(200), cat: z.string().max(20),
        checked: z.boolean(), qty: z.number().int().min(1).max(999), from: z.string().max(200).optional(),
      }),
    }),
    z.object({ op: z.literal('delete'), id: z.string().min(1).max(40) }),
  ])).max(500),
});

export async function applyGroceryOps(ctx: Ctx) {
  const u = requireUser(ctx);
  const parsed = OpSchema.safeParse(await body(ctx.req));
  if (!parsed.success) throw new HttpError(400, 'Invalid ops');
  const db = ctx.env.DB;
  let t = Date.now();
  const stmts = parsed.data.ops.map((o) => {
    const at = t++; // strictly increasing so "since" polling never misses an op
    if (o.op === 'delete') {
      return db.prepare('UPDATE grocery_items SET deleted = 1, updated_at = ?, updated_by = ? WHERE household = ? AND id = ?')
        .bind(at, u.email, u.household, o.id);
    }
    const i = o.item;
    return db.prepare(
      `INSERT INTO grocery_items (household, id, name, cat, checked, qty, src, updated_at, updated_by, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(household, id) DO UPDATE SET name = excluded.name, cat = excluded.cat, checked = excluded.checked,
         qty = excluded.qty, src = excluded.src, updated_at = excluded.updated_at, updated_by = excluded.updated_by, deleted = 0`,
    ).bind(u.household, i.id, i.name, i.cat, i.checked ? 1 : 0, i.qty, i.from || null, at, u.email);
  });
  if (stmts.length) await db.batch(stmts);
  return json({ ok: true, now: t });
}

/* ---------------- recipe book ---------------- */

const Ingredient = z.object({ name: z.string(), measure: z.string() });
const RecipeInput = z.object({
  title: z.string().min(1).max(200),
  image: z.string().max(1000).optional().nullable(),
  source_url: z.string().max(1000).optional().nullable(),
  ingredients: z.array(Ingredient).max(100),
  steps: z.array(z.string().max(4000)).max(100),
  notes: z.string().max(4000).optional().nullable(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});
type Recipe = z.infer<typeof RecipeInput>;

function rowToRecipe(r: any) {
  return {
    id: r.id, title: r.title, image: r.image, source_url: r.source_url, notes: r.notes,
    ingredients: JSON.parse(r.ingredients), steps: JSON.parse(r.steps), tags: JSON.parse(r.tags || '[]'),
    created_by: r.created_by, created_at: r.created_at,
  };
}

export async function listRecipes(ctx: Ctx) {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare('SELECT * FROM recipes WHERE household = ? ORDER BY updated_at DESC')
    .bind(u.household).all();
  return json({ recipes: results.map(rowToRecipe) });
}

export async function saveRecipe(ctx: Ctx) {
  const u = requireUser(ctx);
  const parsed = RecipeInput.safeParse(await body(ctx.req));
  if (!parsed.success) throw new HttpError(400, 'Invalid recipe');
  const r = parsed.data;
  const id = ctx.params.id || uid();
  const now = Date.now();
  await ctx.env.DB.prepare(
    `INSERT INTO recipes (household, id, title, image, source_url, ingredients, steps, notes, tags, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(household, id) DO UPDATE SET title = excluded.title, image = excluded.image, source_url = excluded.source_url,
       ingredients = excluded.ingredients, steps = excluded.steps, notes = excluded.notes, tags = excluded.tags, updated_at = excluded.updated_at`,
  ).bind(u.household, id, r.title, r.image || null, r.source_url || null, JSON.stringify(r.ingredients), JSON.stringify(r.steps),
    r.notes || null, JSON.stringify(r.tags || []), u.email, now, now).run();
  return json({ id });
}

export async function deleteRecipe(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('DELETE FROM recipes WHERE household = ? AND id = ?').bind(u.household, ctx.params.id).run();
  return json({ ok: true });
}

/** Import a recipe from any web page: schema.org JSON-LD first (most recipe sites have it), AI extraction as fallback. */
export async function importRecipe(ctx: Ctx) {
  requireUser(ctx);
  const { url } = await body<{ url: string }>(ctx.req);
  if (!/^https?:\/\//.test(url || '')) throw new HttpError(400, 'Invalid URL');
  const page = await fetchPage(url);
  const fromLd = recipeFromJsonLd(page.html, url);
  if (fromLd) return json({ recipe: fromLd, method: 'json-ld' });

  const art = readable(page.html, url);
  const text = (art?.textContent || '').replace(/\s+\n/g, '\n').slice(0, 30000);
  if (text.length < 200) throw new HttpError(422, 'no_recipe_found');
  const extracted = await aiJson(ctx.env, {
    prefer: 'gemini',
    system: 'You extract recipes from web page text. Keep the original language of the page (usually Hebrew). If the page has no recipe, return an empty title.',
    prompt: `Page URL: ${url}\nPage title: ${art?.title || ''}\n\nPage text:\n${text}`,
    schema: z.object({
      title: z.string(),
      ingredients: z.array(Ingredient),
      steps: z.array(z.string()),
      notes: z.string(),
    }),
  });
  if (!extracted.title || !extracted.ingredients.length) throw new HttpError(422, 'no_recipe_found');
  const recipe: Recipe = { ...extracted, image: page.image || null, source_url: url, tags: [] };
  return json({ recipe, method: 'ai' });
}

function recipeFromJsonLd(html: string, url: string): Recipe | null {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let data: any;
    try { data = JSON.parse(b[1].trim()); } catch { continue; }
    const nodes: any[] = [];
    const walk = (n: any) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach(walk);
      nodes.push(n);
      if (n['@graph']) walk(n['@graph']);
    };
    walk(data);
    const r = nodes.find((n) => [].concat(n['@type'] || []).some((t: string) => /recipe/i.test(t)));
    if (!r) continue;
    const ingredients = [].concat(r.recipeIngredient || r.ingredients || []).map((s: string) => splitIngredient(clean(s)));
    const steps: string[] = [];
    const addStep = (s: any) => {
      if (!s) return;
      if (typeof s === 'string') steps.push(...clean(s).split(/\n+/).filter(Boolean));
      else if (Array.isArray(s)) s.forEach(addStep);
      else if (s.itemListElement) addStep(s.itemListElement);
      else if (s.text) steps.push(clean(s.text));
    };
    addStep(r.recipeInstructions);
    const img = Array.isArray(r.image) ? r.image[0] : r.image;
    return {
      title: clean(r.name || 'מתכון'),
      image: typeof img === 'string' ? img : img?.url || null,
      source_url: url,
      ingredients,
      steps,
      notes: r.description ? clean(r.description) : null,
      tags: [],
    };
  }
  return null;
}

function clean(s: string): string {
  return String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/[ \t]+/g, ' ').trim();
}

/** "2 כוסות קמח" -> { measure: "2 כוסות", name: "קמח" }; best-effort, keeps the whole text when unsure. */
function splitIngredient(s: string) {
  const m = s.match(/^([\d½¼¾⅓⅔.,/\s-]+(?:כוסות|כוס|כפות|כף|כפיות|כפית|גרם|ג'|ק"ג|קילו|מ"ל|ליטר|יחידות|יחידה|חבילה|חבילות|שיני|שן|קורט|קופסה|קופסת|פחית|cups?|tbsp|tsp|g|kg|ml|l|oz|lb)?\.?)\s+(.+)$/i);
  return m ? { measure: m[1].trim(), name: m[2].trim() } : { measure: '', name: s };
}

/* ---------------- helpers for the daemon ---------------- */

export const GROCERY_CATEGORIES = ['veg', 'herbs', 'dairy', 'meat', 'pantry', 'dry', 'drinks', 'bakery', 'frozen', 'clean', 'care', 'other'] as const;

/** Same normalization as the app's duplicate detection (spelling variants, plurals, final letters). */
export function normalizeName(str: string): string {
  return str.toLowerCase()
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/["'`׳״.,;:!?()\[\]{}\-_/\\+*]/g, ' ')
    .replace(/יי/g, 'י').replace(/וו/g, 'ו')
    .replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ').replace(/ף/g, 'פ').replace(/ץ/g, 'צ')
    .split(/\s+/).filter(Boolean)
    .map((w) => {
      if (w.length > 3) w = w.replace(/(ימ|ות)$/, '');
      if (w.length > 3) w = w.replace(/ה$/, '');
      if (/^[a-z]+$/.test(w) && w.length > 3) w = w.replace(/(es|s)$/, '');
      return w;
    }).join(' ').trim();
}

export async function currentGroceries(env: Env, household: string) {
  await seedIfNew(env, household);
  const { results } = await env.DB.prepare(
    'SELECT id, name, cat, checked, qty, src, updated_at, deleted FROM grocery_items WHERE household = ? AND deleted = 0',
  ).bind(household).all<ItemRow>();
  return results.map(toItem);
}

/** Add items (or bump/uncheck an existing one, like the app does). Returns what happened to each. */
export async function addGroceries(env: Env, household: string, email: string, items: { name: string; category: string }[], from?: string) {
  const existing = await currentGroceries(env, household);
  const byKey = new Map(existing.map((i) => [normalizeName(i.name), i]));
  const out: { name: string; result: 'added' | 'already_on_list' | 'back_on_list' }[] = [];
  let t = Date.now();
  const stmts = [];
  for (const it of items.slice(0, 60)) {
    const name = it.name.trim().slice(0, 200);
    if (!name) continue;
    const key = normalizeName(name);
    const dup = byKey.get(key);
    if (dup) {
      if (dup.checked) {
        stmts.push(env.DB.prepare('UPDATE grocery_items SET checked = 0, updated_at = ?, updated_by = ? WHERE household = ? AND id = ?').bind(t++, email, household, dup.id));
        dup.checked = false;
        out.push({ name: dup.name, result: 'back_on_list' });
      } else out.push({ name: dup.name, result: 'already_on_list' });
      continue;
    }
    const cat = (GROCERY_CATEGORIES as readonly string[]).includes(it.category) ? it.category : 'other';
    const id = uid();
    stmts.push(env.DB.prepare('INSERT INTO grocery_items (household, id, name, cat, checked, qty, src, updated_at, updated_by, deleted) VALUES (?, ?, ?, ?, 0, 1, ?, ?, ?, 0)')
      .bind(household, id, name, cat, from || null, t++, email));
    byKey.set(key, { id, name, cat, checked: false, qty: 1, from, updatedAt: t, deleted: false } as any);
    out.push({ name, result: 'added' });
  }
  if (stmts.length) await env.DB.batch(stmts);
  return out;
}

export async function checkGroceries(env: Env, household: string, email: string, names: string[], checked: boolean) {
  const existing = await currentGroceries(env, household);
  const keys = new Set(names.map(normalizeName));
  const hit = existing.filter((i) => keys.has(normalizeName(i.name)));
  let t = Date.now();
  if (hit.length) {
    await env.DB.batch(hit.map((i) => env.DB.prepare('UPDATE grocery_items SET checked = ?, updated_at = ?, updated_by = ? WHERE household = ? AND id = ?')
      .bind(checked ? 1 : 0, t++, email, household, i.id)));
  }
  const found = new Set(hit.map((i) => normalizeName(i.name)));
  return { changed: hit.map((i) => i.name), not_found: names.filter((n) => !found.has(normalizeName(n))) };
}

export async function findRecipes(env: Env, household: string, query: string) {
  const { results } = await env.DB.prepare('SELECT * FROM recipes WHERE household = ? ORDER BY updated_at DESC LIMIT 300').bind(household).all();
  const q = query.trim().toLowerCase();
  return results.map(rowToRecipe).filter((r) => !q || [r.title, r.notes, ...(r.tags || []), ...r.ingredients.map((i: any) => i.name)].join(' ').toLowerCase().includes(q));
}

export async function insertRecipe(env: Env, household: string, email: string, r: Recipe) {
  const id = uid();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO recipes (household, id, title, image, source_url, ingredients, steps, notes, tags, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(household, id, r.title, r.image || null, r.source_url || null, JSON.stringify(r.ingredients), JSON.stringify(r.steps),
    r.notes || null, JSON.stringify(r.tags || []), email, now, now).run();
  return id;
}
