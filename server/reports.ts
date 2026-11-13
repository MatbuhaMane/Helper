// The reports inbox (תיבת פניות): a member reports a problem from any page (a shake of the phone or the menu); the team
// (the owner, in the back door) reads every report as a thread, marks it חדשה / בטיפול / טופלה and answers it privately.
// Only the person who sent a report ever sees it or the answer; to anyone else it does not exist (404).
// The pure rules are in server/reports-rules.ts (tests: server/test-reports.mjs). A screenshot is kept only when the
// person chose to attach one: in MEDIA at reports/<id>, or in the row when there is no bucket.
// The older feedback (the settings button, the companion's send_feedback) lands here too (admin.addFeedback).

import { Ctx, HttpError, Member, body, json, requireUser, uid } from './core';
import { rateLimit } from './vault';
import { requireAdmin } from './admin';
import * as R from './reports-rules';

interface Row {
  id: string; email: string; name: string | null; kind: string | null; text: string; path: string; title: string | null; device: string | null;
  theme: string | null; width: number | null; has_shot: number; via: string; state: R.State; created_at: number;
  updated_at: number; read_at: number | null; seen_at: number | null; last_team_at: number | null;
}
const LIST_COLS = 'id, email, name, kind, text, path, title, device, theme, width, has_shot, via, state, created_at, updated_at, read_at, seen_at, last_team_at';

/** keep one report (any member); also what the older feedback paths call */
export async function addReport(ctx: Ctx, u: Member, input: R.ReportIn, via: 'shake' | 'menu' | 'button' | 'companion') {
  await rateLimit(ctx, 'report:' + u.email, R.RATE.max, R.RATE.windowMs);
  const id = uid() + uid(), now = Date.now();
  const device = R.deviceOf(ctx.req.headers.get('user-agent') || '', input.width || 0);
  let inRow: string | null = null;
  if (input.shot) {
    if (ctx.env.MEDIA) {
      const [head, b64] = input.shot.split(',');
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      await ctx.env.MEDIA.put('reports/' + id, bytes, { httpMetadata: { contentType: head.slice(5, head.indexOf(';')) } });
    } else inRow = input.shot;
  }
  await ctx.env.DB.prepare(`INSERT INTO reports (id, email, name, kind, text, path, title, device, theme, width, has_shot, shot_data, via, state, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`)
    .bind(id, u.email, u.he_name || u.name || null, input.kind || 'bug', input.text, input.path, input.title || null, device, input.theme, input.width, input.shot ? 1 : 0, inRow, via, now, now).run();
  return id;
}

/* ---------------- the member ---------------- */

/** POST /api/reports {kind: bug | idea, text, path, title, theme, width, shot?, via?} */
export async function send(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = await body<Record<string, unknown>>(ctx.req);
  const id = await addReport(ctx, u, R.cleanReport(b), b.via === 'shake' ? 'shake' : 'menu');
  return json({ id });
}

/** GET /api/reports/mine → the person's own reports, the newest first, and how many have an answer they have not read */
export async function mine(ctx: Ctx) {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare(`SELECT ${LIST_COLS} FROM reports WHERE email = ? ORDER BY COALESCE(last_team_at, created_at) DESC LIMIT 50`).bind(u.email).all<Row>();
  const reports = results.map((r) => ({ ...R.publicReport(r), unread: R.unreadForMember(r), last_team_at: r.last_team_at }));
  return json({ reports, unread: reports.filter((r) => r.unread).length });
}

async function rowOf(ctx: Ctx, id: string) {
  return ctx.env.DB.prepare(`SELECT ${LIST_COLS} FROM reports WHERE id = ?`).bind(id).first<Row>();
}
async function msgsOf(ctx: Ctx, id: string) {
  const { results } = await ctx.env.DB.prepare('SELECT id, report, by_team, text, at FROM report_messages WHERE report = ? ORDER BY at').bind(id).all<R.Msg>();
  return results;
}

/** GET /api/reports/:id → the person's own thread (and it is now read); anyone else: 404 */
export async function thread(ctx: Ctx) {
  const u = requireUser(ctx);
  const r = await rowOf(ctx, ctx.params.id);
  const t = R.memberThread(r, r ? await msgsOf(ctx, r.id) : [], u.email);
  if (!t) throw new HttpError(404, 'not_found');
  await ctx.env.DB.prepare('UPDATE reports SET seen_at = ? WHERE id = ?').bind(Date.now(), r!.id).run();
  return json(t);
}

async function shotResponse(ctx: Ctx, id: string) {
  const row = await ctx.env.DB.prepare('SELECT has_shot, shot_data FROM reports WHERE id = ?').bind(id).first<{ has_shot: number; shot_data: string | null }>();
  if (!row?.has_shot) throw new HttpError(404, 'not_found');
  const head = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
  if (row.shot_data) {
    const [h, b64] = row.shot_data.split(',');
    return new Response(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), { headers: { ...head, 'content-type': h.slice(5, h.indexOf(';')) } });
  }
  const obj = await ctx.env.MEDIA?.get('reports/' + id);
  if (!obj) throw new HttpError(404, 'not_found');
  return new Response(obj.body, { headers: { ...head, 'content-type': obj.httpMetadata?.contentType || 'image/jpeg' } });
}
/** GET /api/reports/:id/shot – the person's own screenshot; anyone else: 404 */
export async function shot(ctx: Ctx) {
  const u = requireUser(ctx);
  if (!R.memberMaySee(await rowOf(ctx, ctx.params.id), u.email)) throw new HttpError(404, 'not_found');
  return shotResponse(ctx, ctx.params.id);
}

/* ---------------- the team, in the back door (the owner's own account only) ---------------- */

/** the older feedback rows, once, into the inbox (the same id, so a second run adds nothing) */
async function takeOldFeedback(ctx: Ctx) {
  await ctx.env.DB.prepare(`INSERT OR IGNORE INTO reports (id, email, name, text, path, title, via, state, created_at, updated_at, read_at)
    SELECT id, email, name, text, CASE WHEN page LIKE '/%' THEN page ELSE '/' END, NULL, via, CASE WHEN done = 1 THEN 'done' ELSE 'new' END, at, at, read_at FROM feedback`).run()
    .catch(() => {});   // no feedback table yet on a fresh database
}

/** GET /api/admin/reports → every report, the newest first, with the counts per state */
export async function adminList(ctx: Ctx) {
  await requireAdmin(ctx, 'own');
  await takeOldFeedback(ctx);
  const { results } = await ctx.env.DB.prepare(`SELECT ${LIST_COLS}, (SELECT COUNT(*) FROM report_messages m WHERE m.report = r.id) AS replies FROM reports r ORDER BY created_at DESC LIMIT 300`).all<Row & { replies: number }>();
  const reports = results.map((r) => ({ ...R.publicReport(r), name: r.name || r.email.split('@')[0], face: R.initials(r.name, r.email), via: r.via, replies: r.replies, unread: R.unreadForTeam(r) }));
  const count = { all: reports.length, new: 0, working: 0, done: 0, unread: 0, idea: 0 };
  for (const r of reports) { count[r.state as R.State]++; if (r.unread) count.unread++; if (r.kind === 'idea') count.idea++; }
  return json({ reports, count });
}
/** GET /api/admin/reports/:id → the thread (and the team has now read it) */
export async function adminThread(ctx: Ctx) {
  await requireAdmin(ctx, 'own');
  const r = await rowOf(ctx, ctx.params.id);
  if (!r) throw new HttpError(404, 'not_found');
  await ctx.env.DB.prepare('UPDATE reports SET read_at = ? WHERE id = ?').bind(Date.now(), r.id).run();
  const msgs = await msgsOf(ctx, r.id);
  return json({
    report: { ...R.publicReport(r), name: r.name || r.email.split('@')[0], face: R.initials(r.name, r.email), via: r.via },
    messages: msgs.map((m) => ({ id: m.id, team: !!m.by_team, text: m.text, at: m.at })),
  });
}
/** PUT /api/admin/reports/:id {state} */
export async function adminState(ctx: Ctx) {
  await requireAdmin(ctx, 'own');
  const b = await body<{ state?: string }>(ctx.req);
  if (!R.isState(b.state)) throw new HttpError(400, 'bad_value');
  const res = await ctx.env.DB.prepare('UPDATE reports SET state = ?, updated_at = ? WHERE id = ?').bind(b.state, Date.now(), ctx.params.id).run();
  if (!res.meta.changes) throw new HttpError(404, 'not_found');
  return json({ ok: true, state: b.state });
}
/** POST /api/admin/reports/:id/reply {text} – a private answer, seen only by the person who sent the report */
export async function adminReply(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'own');
  const b = await body<{ text?: string }>(ctx.req);
  const text = R.cleanReply(b.text);
  const r = await rowOf(ctx, ctx.params.id);
  if (!r) throw new HttpError(404, 'not_found');
  const id = uid(), now = Date.now(), state = R.stateAfterReply(r.state);
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT INTO report_messages (id, report, by_team, by_email, text, at) VALUES (?, ?, 1, ?, ?, ?)').bind(id, r.id, a.by, text, now),
    ctx.env.DB.prepare('UPDATE reports SET last_team_at = ?, read_at = ?, updated_at = ?, state = ? WHERE id = ?').bind(now, now, now, state, r.id),
  ]);
  return json({ id, at: now, state });
}
/** GET /api/admin/reports/:id/shot */
export async function adminShot(ctx: Ctx) {
  await requireAdmin(ctx, 'own');
  return shotResponse(ctx, ctx.params.id);
}
