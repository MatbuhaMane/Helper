// A request for access (master): someone who signs in with Google and is not a member, and has no invitation, may ask the
// owner to let them in. The rules:
//   - the email is never taken from the page: the sign-in leaves a one-hour ticket (only its hash is kept), and the form
//     sends the ticket back; the server knows whose request it is from Google's verified sign-in;
//   - nothing opens by asking: the request only tells the owner (a message only the owner sees, and an email from the
//     owner's own Gmail to the owner), and the owner invites from the back door;
//   - one email per person a day, and at most DAY_CAP requests a day for everyone.
import type { Ctx, Env } from './core';
import { HttpError, json, body, uid, sha1Hex, googleAccessToken, requireOwner } from './core';
import { requireAdmin } from './admin';

const TICKET_MS = 3600_000;
const DAY = 86400_000;
const DAY_CAP = 30;

/** called by the sign-in when the person is not admitted: returns the ticket for the request form */
export async function deniedTicket(env: Env, email: string, googleName: string | null): Promise<string> {
  const t = uid() + uid(), now = Date.now();
  await env.DB.prepare(`INSERT INTO access_requests (email, google_name, ticket_hash, ticket_exp, status, created_at, last_denied_at)
      VALUES (?, ?, ?, ?, 'denied', ?, ?)
    ON CONFLICT(email) DO UPDATE SET google_name = excluded.google_name, ticket_hash = excluded.ticket_hash,
      ticket_exp = excluded.ticket_exp, last_denied_at = excluded.last_denied_at`)
    .bind(email, (googleName || '').slice(0, 80) || null, await sha1Hex(t), now + TICKET_MS, now, now).run();
  return t;
}

const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);

/** POST /api/access/request { t, name, note } — no session (the person is not a member) */
export async function request(ctx: Ctx): Promise<Response> {
  const b = await body<{ t?: string; name?: string; note?: string }>(ctx.req);
  const t = clean(b.t, 80);
  if (!t) throw new HttpError(400, 'ticket_required');
  const now = Date.now();
  const row = await ctx.env.DB.prepare('SELECT email, google_name, status, asked_at FROM access_requests WHERE ticket_hash = ? AND ticket_exp > ?')
    .bind(await sha1Hex(t), now).first<{ email: string; google_name: string | null; status: string; asked_at: number | null }>();
  if (!row) throw new HttpError(410, 'ticket_expired');
  if (row.asked_at && row.asked_at > now - DAY) return json({ ok: true, again: true });          // already asked today
  const today = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM access_requests WHERE asked_at > ?').bind(now - DAY).first<{ n: number }>();
  if ((today?.n || 0) >= DAY_CAP) throw new HttpError(429, 'too_many_requests');

  const name = clean(b.name, 60) || row.google_name || '';
  const note = clean(b.note, 600).replace(/\n{3,}/g, '\n\n');
  if (!name) throw new HttpError(400, 'name_required');
  await ctx.env.DB.prepare("UPDATE access_requests SET name = ?, note = ?, status = 'asked', asked_at = ? WHERE email = ?")
    .bind(name, note || null, now, row.email).run();

  const owners = (ctx.env.OWNER_EMAIL || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  for (const owner of owners) {
    await ctx.env.DB.prepare('INSERT INTO admin_messages (id, text, level, link, by_email, created_at, ends_at, active, to_email) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)')
      .bind(uid(), `${name} מבקש/ת הרשאה להצטרף לאוהל.`, 'info', '/admin/', 'system', now, now + 30 * DAY, owner).run().catch(() => {});
  }
  let mailed = false;
  if (owners[0]) {
    mailed = await mailOwner(ctx.env, owners[0], ctx.url.origin, { name, email: row.email, note })
      .then(() => true, (e) => { console.error('access mail', e instanceof Error ? e.message : e); return false; });
  }
  return json({ ok: true, mailed });
}

/** an email from the owner's own Gmail to the owner (the owner connected Gmail; the scope gmail.modify may send) */
async function mailOwner(env: Env, owner: string, origin: string, r: { name: string; email: string; note: string }) {
  const token = await googleAccessToken(env, owner);
  const b64 = (s: string) => { const u = new TextEncoder().encode(s); let x = ''; for (const c of u) x += String.fromCharCode(c); return btoa(x); };
  const subject = `=?UTF-8?B?${b64('בקשת הרשאה לאוהל: ' + r.name)}?=`;
  const text = [
    `${r.name} ביקש/ה להצטרף לאוהל.`,
    '',
    `אימייל: ${r.email}`,
    r.note ? `מה כתב/ה:\n${r.note}` : 'לא נכתב הסבר.',
    '',
    `להזמנה או לדחייה, בדלת האחורית: ${origin}/admin/`,
  ].join('\n');
  const msg = [`To: ${owner}`, `From: ${owner}`, `Subject: ${subject}`, 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(text)].join('\r\n');
  const raw = b64(msg).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error('gmail ' + res.status);
}

/** GET /api/admin/access-requests — the owner's list (the back door) */
export async function list(ctx: Ctx): Promise<Response> {
  requireOwner(ctx);
  await requireAdmin(ctx, 'own');
  const { results } = await ctx.env.DB.prepare("SELECT email, name, google_name, note, status, asked_at, last_denied_at FROM access_requests WHERE status != 'denied' OR last_denied_at > ? ORDER BY COALESCE(asked_at, last_denied_at) DESC LIMIT 200")
    .bind(Date.now() - 30 * DAY).all();
  return json({ requests: results });
}
