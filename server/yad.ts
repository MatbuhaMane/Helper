// "יד ביד": the HTTP handlers. EVERY handler starts with requireYad(ctx): while the switch "yad" is off, everyone but the owner gets 404.
// The logic is in yad-core.ts (tested). A person's balance and history are read only for the person themself or the owner.

import { z } from 'zod';
import { Ctx, HttpError, body, json, requireOwner } from './core';
import { pushTo } from './push';
import { seal, unseal } from './vault/crypto';
import { ensureCatalog } from './yad-seed';
import * as K from './yad-core';
import { REGIONS } from './yad-regions';
import { balance, acct } from './yad-ledger';
import { requireYad, yadOn } from './yad-gate';
import { showHands } from './yad-rules';

async function read<T extends z.ZodTypeAny>(ctx: Ctx, schema: T): Promise<z.infer<T>> {
  const p = schema.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid request');
  return p.data;
}
/** a YadError becomes the matching HTTP error */
async function guard<T>(p: Promise<T>): Promise<T> {
  try { return await p; } catch (e) { if (e instanceof K.YadError) throw new HttpError(e.status, e.code); throw e; }
}
const isOwnerOf = (ctx: Ctx, email: string) => (ctx.env.OWNER_EMAIL || '').toLowerCase().split(',').map((s) => s.trim()).includes(email.toLowerCase());

/** a light limit on the filter queries: 40 a minute per person (per isolate, enough to stop a scraper walking the board) */
const hits = new Map<string, number[]>();
function limited(email: string, now = Date.now()) {
  const a = (hits.get(email) || []).filter((t) => now - t < 60_000);
  a.push(now); hits.set(email, a);
  if (hits.size > 5000) hits.clear();
  return a.length > 40;
}

async function ownersPush(ctx: Ctx, title: string, item: string) {
  const owners = (ctx.env.OWNER_EMAIL || '').split(',').map((s) => s.trim()).filter(Boolean);
  // an immediate push to the owner for every item, with the item id so the nag levels never repeat it
  await pushTo(ctx.env, owners, { title, body: 'יד ביד: ממתין לאישור שלך', url: '/pending/?f=yad', tool: 'yad', item, kind: 'other' }).catch(() => 0);
}
/** a matching need gives one simple notification to the people who ticked its type, up to 20 */
async function matchPush(ctx: Ctx, needId: string, typeId: string | null, asker: string, title: string) {
  if (!typeId) return;
  const { results } = await ctx.env.DB.prepare('SELECT o.email FROM yad_offers o JOIN yad_people p ON p.email = o.email WHERE o.type_id = ? AND o.email != ? AND p.removed_at IS NULL LIMIT 20').bind(typeId, asker).all<{ email: string }>();
  if (results.length) await pushTo(ctx.env, results.map((r) => r.email), { title: 'מישהו מחפש יד: ' + title, body: 'זה מתאים למה שסימנת שאתה יכול לתת', url: '/tools/yad/', tool: 'yad', item: needId, kind: 'other' }).catch(() => 0);
}

/** whether the app should show "יד ביד" at all (the tile, the links, the count): the same answer as the gate, never a 404 */
export async function status(ctx: Ctx) {
  const u = ctx.user; if (!u) return json({ on: false });
  return json({ on: await yadOn(ctx, u.email) });
}

export async function catalog(ctx: Ctx) {
  const u = await requireYad(ctx); await ensureCatalog(ctx.env.DB);
  const { results } = await ctx.env.DB.prepare('SELECT id, kind, name, difficulty, expertise, declaration, note FROM yad_types WHERE active = 1 ORDER BY sort').all();
  await K.ensurePerson(ctx.env.DB, u.email);
  const me = await ctx.env.DB.prepare('SELECT region FROM yad_people WHERE email = ?').bind(u.email).first<{ region: string | null }>();
  return json({ types: results, regions: REGIONS.map((r) => ({ id: r.id, name: r.name })), region: me?.region || null, offers: await K.offersOf(ctx.env.DB, u.email) });
}
export async function setRegion(ctx: Ctx) {
  const u = await requireYad(ctx); const b = await read(ctx, z.object({ region: z.string().max(40).nullable() }));
  await guard(K.setRegion(ctx.env.DB, u.email, b.region)); return json({ ok: true });
}
export async function setOffers(ctx: Ctx) {
  const u = await requireYad(ctx); const b = await read(ctx, z.object({ offers: z.array(z.object({ type_id: z.string().max(60), declared: z.boolean().optional() })).max(60) }));
  await guard(K.setOffers(ctx.env.DB, u.email, b.offers)); return json({ ok: true });
}

export async function board(ctx: Ctx) {
  const u = await requireYad(ctx);
  if (limited(u.email)) throw new HttpError(429, 'slow_down');
  const q = new URL(ctx.req.url).searchParams, mb = q.get('band');
  return json({ needs: await K.board(ctx.env.DB, u.email, { type_id: q.get('type') || undefined, maxBand: mb != null && /^[0-4]$/.test(mb) ? Number(mb) : undefined, sort: q.get('sort') === 'type' ? 'type' : 'distance' }) });
}
const NeedZ = z.object({ type_id: z.string().max(60).nullable().optional(), title: z.string().max(120).optional(), detail: z.string().max(1000).optional(), half_hours: z.number().int(),
  difficulty: z.number().int().optional(), expertise: z.number().int().optional(), pay: z.enum(['person', 'fund', 'public', 'ohel']).optional(), fund_reason: z.string().max(300).optional(), for_name: z.string().max(80).optional(), consent: z.boolean().optional() });
export async function createNeed(ctx: Ctx) {
  const u = await requireYad(ctx); const b = await read(ctx, NeedZ);
  const r = await guard(K.createNeed(ctx.env.DB, u.email, b, isOwnerOf(ctx, u.email)));
  if (r.waits_owner) await ownersPush(ctx, 'צורך חדש מחכה לאישור', r.id); else await matchPush(ctx, r.id, b.type_id || null, u.email, b.title || 'צורך חדש');
  return json(r);
}
export async function mine(ctx: Ctx) {
  const u = await requireYad(ctx);
  return json({ needs: await K.myNeeds(ctx.env.DB, u.email), helps: await K.myHelps(ctx.env.DB, u.email), deeds: await K.myDeeds(ctx.env.DB, u.email), recs: await K.recsOf(ctx.env.DB, u.email) });
}
export async function offerHelp(ctx: Ctx) {
  const u = await requireYad(ctx); const r = await guard(K.offerHelp(ctx.env.DB, ctx.params.id, u.email));
  await pushTo(ctx.env, [r.asker], { title: 'מישהו מציע לעזור', body: r.title, url: '/tools/yad/', tool: 'yad', item: ctx.params.id, kind: 'other' }).catch(() => 0);
  return json({ ok: true });
}
export async function answer(ctx: Ctx) {
  const u = await requireYad(ctx); const b = await read(ctx, z.object({ accept: z.boolean() }));
  const r = await guard(K.answerOffer(ctx.env.DB, ctx.params.id, u.email, b.accept));
  await pushTo(ctx.env, [r.helper], { title: b.accept ? 'ההצעה שלך התקבלה' : 'ההצעה לא התקבלה הפעם', body: 'יד ביד', url: '/tools/yad/', tool: 'yad', item: ctx.params.id, kind: 'other' }).catch(() => 0);
  return json({ ok: true });
}
/** the exact address: written by the asker after the agreement, sealed in the database, read by the two sides only */
export async function putAddress(ctx: Ctx) {
  const u = await requireYad(ctx); const b = await read(ctx, z.object({ address: z.string().trim().min(1).max(300) }));
  await guard(K.setAddress(ctx.env.DB, ctx.params.id, u.email, (await seal(ctx.env, b.address, 'yad_needs:' + ctx.params.id + ':address')) || ''));
  return json({ ok: true });
}
export async function getAddress(ctx: Ctx) {
  const u = await requireYad(ctx); const sealed = await guard(K.addressOf(ctx.env.DB, ctx.params.id, u.email));
  return json({ address: sealed ? await unseal(ctx.env, sealed, 'yad_needs:' + ctx.params.id + ':address') : '' });
}
export async function confirm(ctx: Ctx) {
  const u = await requireYad(ctx); const r = await guard(K.confirmDone(ctx.env.DB, ctx.params.id, u.email)); return json({ done: r.done });
}
export async function cancel(ctx: Ctx) { const u = await requireYad(ctx); await guard(K.cancelNeed(ctx.env.DB, ctx.params.id, u.email)); return json({ ok: true }); }
export async function recommend(ctx: Ctx) {
  const u = await requireYad(ctx); const b = await read(ctx, z.object({ text: z.string().max(300) })); await guard(K.recommend(ctx.env.DB, ctx.params.id, u.email, b.text)); return json({ ok: true });
}

export async function reportDeed(ctx: Ctx) {
  const u = await requireYad(ctx); const b = await read(ctx, z.object({ type_id: z.string().max(60).nullable().optional(), title: z.string().max(120).optional(), half_hours: z.number().int(), difficulty: z.number().int().optional(), expertise: z.number().int().optional() }));
  const r = await guard(K.reportDeed(ctx.env.DB, u.email, b)); await ownersPush(ctx, 'מעשה חדש מחכה לאישור', r.id); return json(r);
}
export async function report(ctx: Ctx) {
  const u = await requireYad(ctx); const b = await read(ctx, z.object({ kind: z.enum(['need', 'person', 'license']), target: z.string().max(120), reason: z.string().max(300) }));
  const r = await guard(K.report(ctx.env.DB, u.email, b.kind, b.target, b.reason)); await ownersPush(ctx, 'דיווח חדש ב"יד ביד"', r.id); return json(r);
}
export async function fund(ctx: Ctx) { await requireYad(ctx); return json(await K.fundPage(ctx.env.DB)); }

/** my own numbers; the owner may read another person's, nobody else may */
export async function dashboard(ctx: Ctx) {
  const u = await requireYad(ctx); const who = (new URL(ctx.req.url).searchParams.get('email') || u.email).toLowerCase();
  if (who !== u.email.toLowerCase() && !isOwnerOf(ctx, u.email)) throw new HttpError(403, 'forbidden');
  const d = await K.dashboard(ctx.env.DB, who);
  return json({ ...d, balance_text: showHands(d.balance), owner_view: who !== u.email.toLowerCase() });
}
/** closing my own account in "יד ביד" cancels my hands (they go to the fund) */
export async function closeMine(ctx: Ctx) { const u = await requireYad(ctx); await guard(K.closeAccount(ctx.env.DB, u.email)); return json({ ok: true }); }

/* ---- the owner ---- */
async function owner(ctx: Ctx) { await requireYad(ctx); return requireOwner(ctx); }
export async function queue(ctx: Ctx) { await owner(ctx); return json(await K.queue(ctx.env.DB)); }
const WhyZ = z.object({ approve: z.boolean(), reason: z.string().max(300).optional(), half_hours: z.number().int().optional(), difficulty: z.number().int().optional(), expertise: z.number().int().optional(), add_to_list: z.boolean().optional() });
export async function decideNeed(ctx: Ctx) {
  await owner(ctx); const b = await read(ctx, WhyZ); await guard(K.decideNeed(ctx.env.DB, ctx.params.id, b));
  const n = await ctx.env.DB.prepare('SELECT email, title, type_id, status FROM yad_needs WHERE id = ?').bind(ctx.params.id).first<any>();
  if (n) { await pushTo(ctx.env, [n.email], { title: b.approve ? 'הצורך שלך אושר' : 'הצורך שלך לא אושר', body: b.approve ? n.title : (b.reason || ''), url: '/tools/yad/', tool: 'yad', item: ctx.params.id, kind: 'other' }).catch(() => 0); if (b.approve) await matchPush(ctx, ctx.params.id, n.type_id, n.email, n.title); }
  return json({ ok: true });
}
export async function decideDeed(ctx: Ctx) {
  await owner(ctx); const b = await read(ctx, WhyZ); const r = await guard(K.decideDeed(ctx.env.DB, ctx.params.id, b));
  const d = await ctx.env.DB.prepare('SELECT email FROM yad_deeds WHERE id = ?').bind(ctx.params.id).first<{ email: string }>();
  if (d) await pushTo(ctx.env, [d.email], { title: b.approve ? 'המעשה שלך אושר' : 'המעשה שלך לא אושר', body: b.approve ? 'הידיים נוספו' : (b.reason || ''), url: '/tools/yad/', tool: 'yad', item: ctx.params.id, kind: 'other' }).catch(() => 0);
  return json(r);
}
export async function resolve(ctx: Ctx) {
  const o = await owner(ctx); const b = await read(ctx, z.object({ action: z.enum(['dismiss', 'remove_need', 'remove_person']) }));
  await guard(K.resolveReport(ctx.env.DB, ctx.params.id, o.email, b.action)); return json({ ok: true });
}
export async function restore(ctx: Ctx) { await owner(ctx); const b = await read(ctx, z.object({ email: z.string().email() })); await K.restorePerson(ctx.env.DB, b.email.toLowerCase()); return json({ ok: true }); }
export async function personBalance(ctx: Ctx) { await owner(ctx); return json({ tenths: await balance(ctx.env.DB, acct(decodeURIComponent(ctx.params.email))) }); }
