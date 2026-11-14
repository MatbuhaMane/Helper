// The inbox's "מהאוהל" tab (the owner, 2026-11-14; public/messages/): האוהל's own messages to a member, read only.
// Who sees what is in inbox-rules.ts (tested): their own messages (the room's 'system' notes and the owner's message to
// them alone), and the owner's messages to everyone that were marked to keep. Read marks go in message_reads, so a
// message read here no longer shows as the banner either. "האוהל התעדכן" notices come from /whats-new.json (the page reads
// it); their read marks are 'wn:<v>' rows in message_reads.

import { Ctx, body, json, requireUser } from './core';
import { readIds, Row, sees } from './inbox-rules';

type Msg = Row & { text: string; level: string; link: string | null; created_at: number; read: number };

async function mine(ctx: Ctx, email: string) {
  // the SQL narrows; sees() decides (the same rule the tests check)
  const { results } = await ctx.env.DB.prepare(`SELECT m.id, m.text, m.level, m.link, m.by_email, m.to_email, m.keep, m.created_at,
      EXISTS (SELECT 1 FROM message_reads r WHERE r.message = m.id AND r.email = ?) AS read
    FROM admin_messages m WHERE lower(m.to_email) = ? OR (m.to_email IS NULL AND m.keep = 1)
    ORDER BY m.created_at DESC LIMIT 100`).bind(email, email.toLowerCase()).all<Msg>();
  return results.filter((r) => sees(r, email));
}

/** GET /api/inbox → { messages: [{ id, text, level, link, created_at, from: 'system' | 'owner', to_me, read }], unread, wn_read } */
export async function list(ctx: Ctx) {
  const u = requireUser(ctx);
  const [msgs, wn] = await Promise.all([
    mine(ctx, u.email),
    ctx.env.DB.prepare("SELECT message FROM message_reads WHERE email = ? AND message LIKE 'wn:%'").bind(u.email).all<{ message: string }>(),
  ]);
  return json({
    messages: msgs.map((m) => ({ id: m.id, text: m.text, level: m.level, link: m.link, created_at: m.created_at,
      from: m.by_email === 'system' ? 'system' : 'owner', to_me: !!m.to_email, read: !!m.read })),
    unread: msgs.filter((m) => !m.read).length,
    wn_read: wn.results.map((r) => r.message.slice(3)),
  });
}

/** POST /api/inbox/read { ids } → marks the member's own messages (and notices, 'wn:<v>') read */
export async function read(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = await body<{ ids?: unknown }>(ctx.req).catch(() => ({} as { ids?: unknown }));
  const ids = readIds(b?.ids, new Set((await mine(ctx, u.email)).map((m) => m.id)));
  if (ids.length) {
    const now = Date.now();
    await ctx.env.DB.batch(ids.map((id) => ctx.env.DB.prepare('INSERT OR IGNORE INTO message_reads (message, email, at) VALUES (?, ?, ?)').bind(id, u.email, now)));
  }
  return json({ ok: true, marked: ids.length });
}
