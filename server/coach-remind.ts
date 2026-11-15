// The coach's pushes (rules: coach-remind-rules.ts). Called by the minute cron (src/worker.ts); acts only at its two moments a day.
// Goes through the gate with tool 'coach' and the kind as the item: the person's level decides (quiet by default: the daily summary).
// Reads only prefs 'hakpada' (.plan present, .done) and 'me'/'goals' for the rest day; sends only the coach's short words.
import type { Env } from './core';
import { hhmmOf } from './goals-remind-rules';
import { kindAt, words } from './coach-remind-rules';
import { restDayFor } from './goals-logic';
import { pushTo } from './push';

export async function tick(env: Env, now = Date.now()): Promise<number> {
  const kind = kindAt(hhmmOf(now));
  if (!kind) return 0;
  const { results } = await env.DB.prepare("SELECT email, data FROM user_prefs WHERE ns = 'hakpada'").all<{ email: string; data: string }>();
  let sent = 0;
  for (const r of results) {
    let h: any; try { h = JSON.parse(r.data); } catch { continue; }
    if (!h?.plan || !Array.isArray(h.done) || !h.done.length) continue;
    const { results: pr } = await env.DB.prepare("SELECT ns, data FROM user_prefs WHERE email = ? AND ns IN ('me', 'goals')").bind(r.email).all<{ ns: string; data: string }>();
    const p: Record<string, any> = {};
    for (const x of pr) { try { p[x.ns] = JSON.parse(x.data); } catch { /* ignore */ } }
    const m = words(kind, h.done, now, restDayFor(p.me?.religion, p.goals && 'rest' in p.goals ? p.goals.rest : undefined));
    if (!m) continue;
    sent += await pushTo(env, [r.email], { ...m, url: '/food/diet/hakpada/', tag: 'coach-' + kind, kind: 'reminder', tool: 'coach', item: kind }).catch(() => 0);
  }
  return sent;
}
