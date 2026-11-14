// The switchboard (/admin/, under "מצב האוהל"): every app-wide on/off, by category. The rules and the list are in
// switches-rules.ts; the values in app_switches. The board also shows the app's bool settings (server/settings.ts), so
// all the on/offs are in one place; those keep their own table. Members read the state through /api/me (switches).
//   GET /api/admin/switches  – the board (owner and supers, from their own account)
//   PUT /api/admin/switches  { key, value } – the owner only

import { Ctx, Env, HttpError, body, json } from './core';
import { log, requireAdmin } from './admin';
import { saveSetting, settingsNow } from './settings';
import { windowsFor } from './push';
import { inShabbat } from './push-gate';
import * as R from './switches-rules';

const JERUSALEM = '281184';
let cache: { at: number; state: R.State } | null = null;
/** the stored switches (kept for half a minute in the isolate, like the settings) */
export async function switchesNow(env: Env): Promise<R.State> {
  if (cache && Date.now() - cache.at < 30e3) return cache.state;
  const stored: Record<string, unknown> = {};
  try {
    const { results } = await env.DB.prepare('SELECT key, value FROM app_switches').all<{ key: string; value: string }>();
    for (const r of results) { try { stored[r.key] = JSON.parse(r.value); } catch { /* a broken row: the default */ } }
  } catch { /* no table yet: the defaults */ }
  const state = R.stateOf(stored);
  cache = { at: Date.now(), state };
  return state;
}
/** what every member gets (in /api/me): kodesh already worked out from the auto switch and the time */
export async function publicSwitches(env: Env): Promise<R.State> {
  const s = await switchesNow(env);
  const win = s.kodesh_auto === true && s.kodesh !== true ? inShabbat(Date.now(), await windowsFor(JERUSALEM)) : false;
  return R.publicState(s, win);
}

export async function board(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'own');
  const s = await switchesNow(ctx.env);
  const settings = (await settingsNow(ctx.env)).filter((x) => x.type === 'bool' && R.SETTING_CATS[x.key]);
  const now = await publicSwitches(ctx.env);
  return json({
    cats: R.CATS, may: R.mayChange(a), kodeshNow: now.kodesh,
    switches: [
      ...R.SWITCHES.map((x) => ({ key: x.key, cat: x.cat, label: x.label, help: x.help, kind: x.kind, options: x.options, def: x.def, value: s[x.key], store: 'switch' })),
      ...settings.map((x) => ({ key: x.key, cat: R.SETTING_CATS[x.key], label: x.label, help: x.help, kind: 'bool', def: x.def, value: x.value, store: 'setting' })),
    ],
  });
}
export async function save(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'own');
  if (!R.mayChange(a)) throw new HttpError(403, 'owner_only');
  const b = await body<{ key?: string; value?: unknown }>(ctx.req);
  const key = String(b.key || '');
  if (R.SETTING_CATS[key]) {
    const err = await saveSetting(ctx.env, key, b.value, a.by);
    if (err) throw new HttpError(400, err);
  } else {
    const v = R.switchValue(key, b.value);
    if (v === null) throw new HttpError(400, R.SWITCHES.some((x) => x.key === key) ? 'bad_value' : 'unknown_switch');
    await ctx.env.DB.prepare('INSERT INTO app_switches (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at')
      .bind(key, JSON.stringify(v), a.by, Date.now()).run();
    cache = null;
  }
  await log(ctx, a, 'switch', `${key} = ${JSON.stringify(b.value)}`);
  return json({ ok: true, now: await publicSwitches(ctx.env) });
}
