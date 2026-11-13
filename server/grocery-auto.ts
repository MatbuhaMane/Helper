// GET /api/groceries/auto – the automatic list (grocery-auto-logic.ts): suggestions only. The groceries page shows them
// as the fixed list "אוטומטית" and adds an item to the shopping list only when a person taps it.
// Which fridge: the person's own ("המקרר שלי", their fridge preferences); without one, all the household's fridges.

import { Ctx, json, requireUser } from './core';
import { normalizeName } from './kitchen';
import { FridgeRow, pruneSkip, suggest } from './grocery-auto-logic';

export async function autoList(ctx: Ctx) {
  const u = requireUser(ctx);
  const db = ctx.env.DB;
  const today = new Date().toISOString().slice(0, 10);
  const prefs = await db.prepare("SELECT ns, data FROM user_prefs WHERE email = ? AND ns IN ('fridge', 'groceries')").bind(u.email).all<{ ns: string; data: string }>();
  const pref = (ns: string): any => { try { return JSON.parse(prefs.results.find((p) => p.ns === ns)?.data || '{}'); } catch { return {}; } };
  const fridges = (await db.prepare("SELECT id, name FROM fridges WHERE deleted = 0 AND COALESCE(household, 'family') = ? ORDER BY sort, created_at").bind(u.household).all<{ id: string; name: string }>()).results;
  const mine = fridges.find((f) => f.id === pref('fridge').mine);
  const ids = mine ? [mine.id] : fridges.map((f) => f.id);
  if (!ids.length) return json({ fridge: null, items: [] });
  const rows = (await db.prepare(`SELECT name, cat, qty, deleted, expires, updated_at FROM fridge_items WHERE fridge IN (${ids.map(() => '?').join(',')}) ORDER BY updated_at DESC LIMIT 5000`)
    .bind(...ids).all<FridgeRow>()).results;
  // what already waits on the main shopping list (unchecked) is not suggested again
  const listed = (await db.prepare('SELECT name FROM grocery_items WHERE household = ? AND deleted = 0 AND checked = 0 AND list IS NULL').bind(u.household).all<{ name: string }>()).results;
  const onList = new Set(listed.map((r) => normalizeName(r.name)));
  const items = suggest(rows, normalizeName, onList, pruneSkip(pref('groceries').autoSkip, today), today);
  return json({ fridge: mine ? mine.name : null, items });
}
