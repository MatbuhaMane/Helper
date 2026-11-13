// GET /api/groceries/auto – the automatic list (grocery-auto-logic.ts): suggestions only. The groceries page shows them
// as the fixed list "אוטומטית" and adds an item to the shopping list only when a person taps it.
// Which fridge: the person's own, and only it (one fridge per person, fridge.ts myFridge).

import { Ctx, json, requireUser } from './core';
import { normalizeName } from './kitchen';
import { FridgeRow, pruneSkip, suggest } from './grocery-auto-logic';
import { myFridge } from './fridge';

export async function autoList(ctx: Ctx) {
  const u = requireUser(ctx);
  const db = ctx.env.DB;
  const today = new Date().toISOString().slice(0, 10);
  const pref = await db.prepare("SELECT data FROM user_prefs WHERE email = ? AND ns = 'groceries'").bind(u.email).first<{ data: string }>();
  let skip: any = {};
  try { skip = JSON.parse(pref?.data || '{}').autoSkip; } catch { /* an old row */ }
  const mine = await myFridge(ctx, u);
  const rows = (await db.prepare('SELECT name, cat, qty, deleted, expires, updated_at FROM fridge_items WHERE fridge = ? ORDER BY updated_at DESC LIMIT 5000')
    .bind(mine.id).all<FridgeRow>()).results;
  // what already waits on the main shopping list (unchecked) is not suggested again
  const listed = (await db.prepare('SELECT name FROM grocery_items WHERE household = ? AND deleted = 0 AND checked = 0 AND list IS NULL').bind(u.household).all<{ name: string }>()).results;
  const onList = new Set(listed.map((r) => normalizeName(r.name)));
  const items = suggest(rows, normalizeName, onList, pruneSkip(skip, today), today);
  return json({ fridge: mine.name, items });
}
