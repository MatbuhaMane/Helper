// Gmail organizer: the user describes what she wants in plain Hebrew, Claude turns it into a plan of
// Gmail operations, the plan is previewed (counts + sample messages), and nothing runs until she approves.
//
// Safety rules (enforced here, not just in the prompt):
//  - Nothing is ever deleted or trashed. "Delete" becomes a review label + archive, which is reversible.
//  - Every applied change records exactly which messages changed and how, so a plan can be undone.
//  - Work runs in small steps (one page of up to 500 messages per request) so nothing times out half-way silently.

import { z } from 'zod';
import { aiJson } from './ai';
import { Ctx, Env, HttpError, body, googleAccessToken, json, requireUser, uid } from './core';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
export const REVIEW_LABEL = 'Helper/לבדיקה לפני מחיקה';
const PAGE = 500;
const MAX_PASSES = 4;

/* ---------------- Gmail client ---------------- */

async function gmail<T = any>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  if (res.status === 401) throw new HttpError(409, 'gmail_not_connected');
  if (!res.ok) throw new HttpError(502, `gmail_error_${res.status}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

interface MsgMeta { id: string; from: string; subject: string; date: string; labelIds: string[] }

/** Fetch metadata for up to 100 messages per HTTP request with Gmail's batch endpoint. */
async function getMetadata(token: string, ids: string[]): Promise<MsgMeta[]> {
  const out: MsgMeta[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const boundary = 'batch_' + uid();
    const parts = chunk.map((id, n) =>
      `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <m${n}>\r\n\r\n` +
      `GET /gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date\r\n\r\n`);
    const res = await fetch('https://gmail.googleapis.com/batch/gmail/v1', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/mixed; boundary=${boundary}` },
      body: parts.join('') + `--${boundary}--`,
    });
    if (res.status === 401) throw new HttpError(409, 'gmail_not_connected');
    if (!res.ok) throw new HttpError(502, `gmail_batch_${res.status}`);
    const respBoundary = /boundary=([^;]+)/.exec(res.headers.get('content-type') || '')?.[1]?.replace(/"/g, '');
    const raw = await res.text();
    for (const part of respBoundary ? raw.split('--' + respBoundary) : []) {
      const start = part.indexOf('{');
      const end = part.lastIndexOf('}');
      if (start < 0 || end < start) continue;
      try {
        const m = JSON.parse(part.slice(start, end + 1));
        if (!m.id) continue;
        const h = (name: string) => m.payload?.headers?.find((x: any) => x.name.toLowerCase() === name.toLowerCase())?.value || '';
        out.push({ id: m.id, from: h('From'), subject: h('Subject'), date: h('Date'), labelIds: m.labelIds || [] });
      } catch { /* skip malformed part */ }
    }
  }
  return out;
}

async function listIds(token: string, q: string, pageToken?: string, max = PAGE) {
  const p = new URLSearchParams({ q, maxResults: String(max) });
  if (pageToken) p.set('pageToken', pageToken);
  const r = await gmail<{ messages?: { id: string }[]; nextPageToken?: string; resultSizeEstimate?: number }>(token, `/messages?${p}`);
  return { ids: (r.messages || []).map((m) => m.id), next: r.nextPageToken, estimate: r.resultSizeEstimate || 0 };
}

async function labelMap(token: string): Promise<Map<string, string>> {
  const r = await gmail<{ labels: { id: string; name: string }[] }>(token, '/labels');
  return new Map(r.labels.map((l) => [l.name, l.id]));
}

async function ensureLabel(token: string, labels: Map<string, string>, name: string): Promise<string> {
  const found = labels.get(name);
  if (found) return found;
  const created = await gmail<{ id: string }>(token, '/labels', {
    method: 'POST',
    body: JSON.stringify({ name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }),
  });
  labels.set(name, created.id);
  return created.id;
}

async function batchModify(token: string, ids: string[], add: string[], remove: string[]) {
  if (!ids.length) return;
  await gmail(token, '/messages/batchModify', { method: 'POST', body: JSON.stringify({ ids, addLabelIds: add, removeLabelIds: remove }) });
}

/* ---------------- status & overview ---------------- */

export async function mailStatus(ctx: Ctx) {
  const u = requireUser(ctx);
  const row = await ctx.env.DB.prepare('SELECT updated_at FROM google_tokens WHERE email = ?').bind(u.email).first();
  return json({ connected: !!row, reviewLabel: REVIEW_LABEL });
}

export async function disconnect(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('DELETE FROM google_tokens WHERE email = ?').bind(u.email).run();
  return json({ ok: true });
}

async function overviewData(token: string) {
  const [labels, profile] = await Promise.all([
    gmail<{ labels: { id: string; name: string; type: string }[] }>(token, '/labels'),
    gmail<{ emailAddress: string; messagesTotal: number }>(token, '/profile'),
  ]);
  const counts: Record<string, number> = {};
  const queries: Record<string, string> = {
    inbox: 'in:inbox', unread_inbox: 'in:inbox is:unread', promotions: 'category:promotions in:inbox',
    social: 'category:social in:inbox', older_than_1y_inbox: 'in:inbox older_than:1y', large: 'larger:10M',
  };
  await Promise.all(Object.entries(queries).map(async ([k, q]) => { counts[k] = (await listIds(token, q, undefined, 1)).estimate; }));
  const recent = await listIds(token, 'in:inbox', undefined, 300);
  const metas = await getMetadata(token, recent.ids);
  const senders = new Map<string, number>();
  for (const m of metas) senders.set(m.from, (senders.get(m.from) || 0) + 1);
  const topSenders = [...senders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([from, count]) => ({ from, count }));
  const userLabels = labels.labels.filter((l) => l.type === 'user').map((l) => l.name).sort();
  return { email: profile.emailAddress, total: profile.messagesTotal, counts, topSenders, labels: userLabels };
}

export async function overview(ctx: Ctx) {
  const u = requireUser(ctx);
  const token = await googleAccessToken(ctx.env, u.email);
  return json(await overviewData(token));
}

/* ---------------- planning ---------------- */

const ACTIONS = ['label', 'unlabel', 'archive', 'mark_read', 'star', 'review_delete'] as const;

const PlanSchema = z.object({
  reply: z.string().describe('Short message to the user in simple Hebrew: what you propose, or a clarifying question.'),
  operations: z.array(z.object({
    title: z.string().describe('One line in simple Hebrew describing this step, e.g. "להעביר לארכיון את כל הפרסומות מלפני שנה"'),
    query: z.string().describe('Gmail search query selecting the messages, e.g. "from:newsletter@shop.co.il older_than:1y"'),
    action: z.enum(ACTIONS),
    label: z.string().describe('Label name for label/unlabel actions (may be nested with "/"); empty string otherwise.'),
  })),
});

const SYSTEM = `You help a non-technical Israeli mother organize her Gmail inbox. She writes in Hebrew, in her own words.
Turn her request into a small list of Gmail operations. She will see a preview with counts and sample emails and must approve before anything runs.

Available actions (no others exist):
- label: add a label (creates it if missing). Use clear Hebrew label names; nest with "/" (e.g. "חשבונות/חשמל").
- unlabel: remove a label.
- archive: remove from the inbox (the email stays in "All Mail" and in its labels).
- mark_read: mark as read.
- star: add a star.
- review_delete: when she wants to delete, use this. It labels the emails "${REVIEW_LABEL}" and archives them so she can review them later. Real deletion is never possible through this tool; say so gently if she asks to delete.

Rules:
- Write each query in Gmail search syntax (from:, to:, subject:, label:, category:, older_than:, newer_than:, has:attachment, larger:, is:unread, in:inbox, OR, quotes, parentheses, -exclusion).
- Be precise and conservative: prefer specific senders/subjects from the mailbox overview over broad queries. Never select all mail.
- Never touch starred or important messages with archive/review_delete: add "-is:starred -is:important" to those queries.
- To organize by a label and also clear the inbox, use two operations with the same query: label, then archive.
- If the request is ambiguous or risky, return no operations and ask one short clarifying question in "reply".
- "reply" and every "title" must be in warm, simple Hebrew, without technical terms.`;

/** Build and preview a plan (nothing changes in Gmail). Used by the mail app and by the daemon. */
export async function buildPlan(env: Env, email: string, request: string, history: { role: 'user' | 'assistant'; text: string }[] = []) {
  const token = await googleAccessToken(env, email);
  const ov = await overviewData(token);

  const convo = history.slice(-10).map((h) => `${h.role === 'user' ? 'היא' : 'אתה'}: ${h.text}`).join('\n');
  const prompt = `Mailbox overview (JSON):\n${JSON.stringify(ov)}\n\n` +
    (convo ? `Conversation so far:\n${convo}\n\n` : '') + `Her new request:\n${request}`;
  const result = await aiJson(env, { prefer: 'claude', effort: 'high', system: SYSTEM, prompt, schema: PlanSchema });

  // Preview each operation: how many emails would actually change, plus a few examples.
  const labels = await labelMap(token);
  const previews = [];
  for (const op of result.operations.slice(0, 8)) {
    const { ids, next } = await listIds(token, op.query, undefined, PAGE);
    const sample = await getMetadata(token, ids.slice(0, 100));
    const changing = sample.filter((m) => wouldChange(op, m.labelIds, labels));
    const ratio = sample.length ? changing.length / sample.length : 0;
    previews.push({
      ...op,
      matched: ids.length,
      more: !!next,
      estimatedChanges: Math.round(ids.length * ratio),
      samples: changing.slice(0, 6).map(({ from, subject, date }) => ({ from, subject, date })),
    });
  }
  const id = uid();
  await env.DB.prepare('INSERT INTO mail_plans (id, email, request, plan, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, email, request, JSON.stringify({ reply: result.reply, operations: previews }), 'proposed', Date.now()).run();
  return { id, reply: result.reply, operations: previews };
}

export async function plan(ctx: Ctx) {
  const u = requireUser(ctx);
  const { request, history } = await body<{ request: string; history?: { role: 'user' | 'assistant'; text: string }[] }>(ctx.req);
  if (!request?.trim()) throw new HttpError(400, 'Empty request');
  return json(await buildPlan(ctx.env, u.email, request, history || []));
}

/** A plan made elsewhere (e.g. by the daemon), so the mail app can show it for approval. */
export async function getPlan(ctx: Ctx) {
  const u = requireUser(ctx);
  const p = await loadPlan(ctx, u.email);
  return json({ id: p.id, request: p.request, status: p.status, ...p.plan });
}

type Op = { action: (typeof ACTIONS)[number]; label: string; query: string };

function changeFor(op: Op, labels: Map<string, string>): { add: string[]; remove: string[]; needs: (l: string[]) => boolean } {
  const lid = (name: string) => labels.get(name) || `__missing:${name}`;
  switch (op.action) {
    case 'label': return { add: [lid(op.label)], remove: [], needs: (l) => !l.includes(lid(op.label)) };
    case 'unlabel': return { add: [], remove: [lid(op.label)], needs: (l) => l.includes(lid(op.label)) };
    case 'archive': return { add: [], remove: ['INBOX'], needs: (l) => l.includes('INBOX') };
    case 'mark_read': return { add: [], remove: ['UNREAD'], needs: (l) => l.includes('UNREAD') };
    case 'star': return { add: ['STARRED'], remove: [], needs: (l) => !l.includes('STARRED') };
    case 'review_delete': return { add: [lid(REVIEW_LABEL)], remove: ['INBOX'], needs: (l) => !l.includes(lid(REVIEW_LABEL)) || l.includes('INBOX') };
  }
}

function wouldChange(op: Op, labelIds: string[], labels: Map<string, string>): boolean {
  return changeFor(op, labels).needs(labelIds);
}

/* ---------------- applying (step by step) and undo ---------------- */

async function loadPlan(ctx: Ctx, email: string) {
  const row = await ctx.env.DB.prepare('SELECT * FROM mail_plans WHERE id = ? AND email = ?').bind(ctx.params.id, email).first<any>();
  if (!row) throw new HttpError(404, 'Plan not found');
  return { ...row, plan: JSON.parse(row.plan) };
}

/**
 * Apply one page of one operation. The browser calls this repeatedly with the cursor it gets back
 * until `done` is true, showing progress. Body: { enabled: number[], cursor?: {op, pageToken, pass, changedInPass, batch} }
 */
export async function applyStep(ctx: Ctx) {
  const u = requireUser(ctx);
  const p = await loadPlan(ctx, u.email);
  if (!['proposed', 'applying'].includes(p.status)) throw new HttpError(409, 'Plan already ' + p.status);
  const b = await body<{ enabled: number[]; cursor?: any }>(ctx.req);
  const enabled = (b.enabled || []).filter((i) => p.plan.operations[i]).sort((x, y) => x - y);
  const cur = b.cursor || { op: 0, pageToken: null, pass: 0, changedInPass: 0, batch: 0 };
  const db = ctx.env.DB;

  if (cur.op >= enabled.length) {
    await db.prepare('UPDATE mail_plans SET status = ?, applied_at = ? WHERE id = ?').bind('applied', Date.now(), p.id).run();
    return json({ done: true });
  }
  if (p.status === 'proposed') await db.prepare('UPDATE mail_plans SET status = ? WHERE id = ?').bind('applying', p.id).run();

  const opIndex = enabled[cur.op];
  const op: Op = p.plan.operations[opIndex];
  const token = await googleAccessToken(ctx.env, u.email);
  const labels = await labelMap(token);
  if (op.action === 'label') await ensureLabel(token, labels, op.label);
  if (op.action === 'review_delete') await ensureLabel(token, labels, REVIEW_LABEL);
  const change = changeFor(op, labels);

  const { ids, next } = await listIds(token, op.query, cur.pageToken || undefined);
  const metas = await getMetadata(token, ids);
  const toChange = metas.filter((m) => change.needs(m.labelIds));

  // Record precisely what changes for each message so undo restores the previous state.
  const groups = new Map<string, { ids: string[]; add: string[]; remove: string[] }>();
  for (const m of toChange) {
    const add = change.add.filter((l) => !m.labelIds.includes(l));
    const remove = change.remove.filter((l) => m.labelIds.includes(l));
    if (!add.length && !remove.length) continue;
    const key = add.join(',') + '|' + remove.join(',');
    if (!groups.has(key)) groups.set(key, { ids: [], add, remove });
    groups.get(key)!.ids.push(m.id);
  }
  let changed = 0;
  let batchNo = cur.batch;
  for (const g of groups.values()) {
    // Write the record first: if the Gmail call fails afterwards, undo of an unchanged message is harmless.
    await db.prepare('INSERT INTO mail_changes (plan_id, op_index, batch, message_ids) VALUES (?, ?, ?, ?)')
      .bind(p.id, opIndex, batchNo++, JSON.stringify(g)).run();
    await batchModify(token, g.ids, g.add, g.remove);
    changed += g.ids.length;
  }

  // Next cursor: next page; when pages run out, do another pass if this pass changed anything
  // (changes can shift Gmail's result pages), up to MAX_PASSES; then move to the next operation.
  let nextCur;
  const changedInPass = cur.changedInPass + changed;
  if (next) nextCur = { ...cur, pageToken: next, changedInPass, batch: batchNo };
  else if (changedInPass > 0 && cur.pass + 1 < MAX_PASSES) nextCur = { ...cur, pageToken: null, pass: cur.pass + 1, changedInPass: 0, batch: batchNo };
  else nextCur = { op: cur.op + 1, pageToken: null, pass: 0, changedInPass: 0, batch: batchNo };
  return json({ done: false, cursor: nextCur, opIndex, changed });
}

export async function undo(ctx: Ctx) {
  const u = requireUser(ctx);
  const p = await loadPlan(ctx, u.email);
  if (!['applied', 'applying'].includes(p.status)) throw new HttpError(409, 'Nothing to undo');
  const token = await googleAccessToken(ctx.env, u.email);
  const { results } = await ctx.env.DB.prepare('SELECT message_ids FROM mail_changes WHERE plan_id = ? ORDER BY op_index DESC, batch DESC')
    .bind(p.id).all<{ message_ids: string }>();
  let restored = 0;
  for (const r of results) {
    const g = JSON.parse(r.message_ids) as { ids: string[]; add: string[]; remove: string[] };
    for (let i = 0; i < g.ids.length; i += 1000) await batchModify(token, g.ids.slice(i, i + 1000), g.remove, g.add);
    restored += g.ids.length;
  }
  await ctx.env.DB.prepare('UPDATE mail_plans SET status = ? WHERE id = ?').bind('undone', p.id).run();
  return json({ ok: true, restored });
}

export async function cancelPlan(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare("UPDATE mail_plans SET status = 'cancelled' WHERE id = ? AND email = ? AND status = 'proposed'").bind(ctx.params.id, u.email).run();
  return json({ ok: true });
}

export async function history(ctx: Ctx) {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare(
    `SELECT p.id, p.request, p.status, p.created_at, p.applied_at, p.plan,
       (SELECT COUNT(*) FROM mail_changes c WHERE c.plan_id = p.id) AS batches
     FROM mail_plans p WHERE p.email = ? AND p.status IN ('applied','applying','undone') ORDER BY p.created_at DESC LIMIT 50`,
  ).bind(u.email).all<any>();
  return json({
    plans: results.map((r) => {
      const plan = JSON.parse(r.plan);
      return { id: r.id, request: r.request, status: r.status, created_at: r.created_at, applied_at: r.applied_at, titles: plan.operations.map((o: any) => o.title) };
    }),
  });
}
