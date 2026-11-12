// The family vault: a family tree, and for each person their documents, pictures and details.
//
// Who sees what (enforced here, on the server – never only in the page):
//   * members of the same household see and edit the tree and every shared item
//   * an item marked private is seen only by the member who added it (the owner of the app included – no exceptions)
//   * nothing opens until the vault is unlocked on this session: a passkey (the device's fingerprint / face / Windows Hello),
//     or a sign-in to Google made in the last ten minutes. An unlock lasts 15 minutes from the last action, two hours at most.
//   * every view, upload, change and deletion is written to the audit log; a deletion can be undone for 30 days
// What is stored: names, titles, notes and details sealed with the vault key; files only as ciphertext (crypto.ts, store.ts).

import { Ctx, HttpError, Member, body, getCookie, json, requireUser, uid } from '../core';
import { decryptFile, encryptFile, fingerprint, newDataKey, openDataKey, seal, unseal, b64url } from './crypto';
import { defaultStore, store, StoreName } from './store';
import { challenge, verifyAssertion, verifyRegistration } from './webauthn';
import { backupStatus, driveDelete, nightly, readWithFailover, replicate, setState } from './backup';

const IDLE = 15 * 60e3, MAX = 2 * 3600e3, FRESH = 10 * 60e3, KEEP_DELETED = 30 * 864e5;
const MAX_FILE = 25 * 1024 * 1024;
const NAME = 'העוזר המשפחתי';

/* ---------------- small helpers ---------------- */

const sid = (ctx: Ctx) => getCookie(ctx.req, 'sid') || '';
const rpId = (ctx: Ctx) => ctx.url.hostname;

/** At most `max` tries per window, per key (signing in, unlocking, uploading). */
export async function rateLimit(ctx: Ctx, key: string, max: number, windowMs: number) {
  const now = Date.now();
  const row = await ctx.env.DB.prepare('SELECT count, reset_at FROM rate_hits WHERE key = ?').bind(key).first<{ count: number; reset_at: number }>();
  if (!row || row.reset_at < now) {
    await ctx.env.DB.prepare('INSERT INTO rate_hits (key, count, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at').bind(key, now + windowMs).run();
    return;
  }
  if (row.count >= max) throw new HttpError(429, 'too_many_tries');
  await ctx.env.DB.prepare('UPDATE rate_hits SET count = count + 1 WHERE key = ?').bind(key).run();
}

async function audit(ctx: Ctx, u: Member, action: string, target: string | null, personId: string | null, priv = false) {
  const ip = ctx.req.headers.get('cf-connecting-ip') || '';
  ctx.waitUntil(ctx.env.DB.prepare('INSERT INTO vault_audit (household, email, action, target, person_id, private, ip, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(u.household, u.email, action, target, personId, priv ? 1 : 0, ip ? await fingerprint(ctx.env, ip) : null, Date.now()).run().then(() => {}));
}

async function sessionAge(ctx: Ctx): Promise<number> {
  const row = await ctx.env.DB.prepare('SELECT created_at FROM sessions WHERE id = ?').bind(sid(ctx)).first<{ created_at: number | null }>();
  return row?.created_at ? Date.now() - row.created_at : Infinity;
}

/** The vault is open on this session (and the opening is extended a little). */
async function requireUnlocked(ctx: Ctx): Promise<Member> {
  const u = requireUser(ctx);
  const now = Date.now();
  const row = await ctx.env.DB.prepare('SELECT until, hard_until FROM vault_unlocks WHERE sid = ? AND email = ?').bind(sid(ctx), u.email).first<{ until: number; hard_until: number }>();
  if (!row || row.until < now || row.hard_until < now) throw new HttpError(423, 'vault_locked');
  ctx.waitUntil(ctx.env.DB.prepare('UPDATE vault_unlocks SET until = ? WHERE sid = ?').bind(Math.min(now + IDLE, row.hard_until), sid(ctx)).run().then(() => {}));
  return u;
}

async function unlock(ctx: Ctx, u: Member, how: string) {
  const now = Date.now();
  await ctx.env.DB.prepare('INSERT INTO vault_unlocks (sid, email, until, hard_until) VALUES (?, ?, ?, ?) ON CONFLICT(sid) DO UPDATE SET email = excluded.email, until = excluded.until, hard_until = excluded.hard_until')
    .bind(sid(ctx), u.email, now + IDLE, now + MAX).run();
  await audit(ctx, u, 'unlock:' + how, null, null);
}

/* ---------------- status, locking ---------------- */

export async function status(ctx: Ctx) {
  const u = requireUser(ctx);
  const now = Date.now();
  const [row, keys, age] = await Promise.all([
    ctx.env.DB.prepare('SELECT until, hard_until FROM vault_unlocks WHERE sid = ?').bind(sid(ctx)).first<{ until: number; hard_until: number }>(),
    ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM passkeys WHERE email = ?').bind(u.email).first<{ n: number }>(),
    sessionAge(ctx),
  ]);
  const open = !!row && row.until > now && row.hard_until > now;
  return json({ unlocked: open, until: open ? Math.min(row!.until, row!.hard_until) : null, passkeys: keys?.n || 0, fresh: age < FRESH, configured: !!(ctx.env.VAULT_KEY || ctx.env.DEV_MODE === '1') });
}

export async function lock(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('DELETE FROM vault_unlocks WHERE sid = ?').bind(sid(ctx)).run();
  // a lock is a lock: the recent Google sign-in no longer counts – opening again takes a passkey or a new sign-in
  await ctx.env.DB.prepare('UPDATE sessions SET created_at = 0 WHERE id = ?').bind(sid(ctx)).run();
  await audit(ctx, u, 'lock', null, null);
  return json({ ok: true });
}

/** Unlocking right after a fresh Google sign-in (for a device without passkeys, or before the first passkey). */
export async function unlockFresh(ctx: Ctx) {
  const u = requireUser(ctx);
  await rateLimit(ctx, 'unlock:' + u.email, 10, 15 * 60e3);
  if ((await sessionAge(ctx)) > FRESH) throw new HttpError(401, 'sign_in_again');
  await unlock(ctx, u, 'google');
  return json({ ok: true });
}

/* ---------------- passkeys ---------------- */

async function newChallenge(ctx: Ctx, email: string, kind: string) {
  const c = challenge(), id = uid();
  await ctx.env.DB.prepare('DELETE FROM webauthn_challenges WHERE expires_at < ?').bind(Date.now()).run();
  await ctx.env.DB.prepare('INSERT INTO webauthn_challenges (id, email, challenge, kind, expires_at) VALUES (?, ?, ?, ?, ?)').bind(id, email, c, kind, Date.now() + 5 * 60e3).run();
  return { id, c };
}
async function takeChallenge(ctx: Ctx, id: string, email: string, kind: string) {
  const row = await ctx.env.DB.prepare('SELECT challenge FROM webauthn_challenges WHERE id = ? AND email = ? AND kind = ? AND expires_at > ?').bind(id, email, kind, Date.now()).first<{ challenge: string }>();
  await ctx.env.DB.prepare('DELETE FROM webauthn_challenges WHERE id = ?').bind(id).run();   // single use
  if (!row) throw new HttpError(400, 'challenge_expired');
  return row.challenge;
}

/** Adding a passkey: right after a fresh Google sign-in, or while the vault is open. */
async function mayAddPasskey(ctx: Ctx, u: Member) {
  if ((await sessionAge(ctx)) < FRESH) return;
  await requireUnlocked(ctx);
  void u;
}

export async function passkeyOptions(ctx: Ctx) {
  const u = requireUser(ctx);
  await mayAddPasskey(ctx, u);
  const { id, c } = await newChallenge(ctx, u.email, 'reg');
  const { results } = await ctx.env.DB.prepare('SELECT id FROM passkeys WHERE email = ?').bind(u.email).all<{ id: string }>();
  const userId = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('helper-user:' + u.email))).slice(0, 16));
  return json({ challengeId: id, publicKey: {
    rp: { id: rpId(ctx), name: NAME }, challenge: c,
    user: { id: userId, name: u.email, displayName: u.he_name || u.name || u.email },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
    excludeCredentials: results.map((r) => ({ type: 'public-key', id: r.id })), timeout: 120000, attestation: 'none',
  } });
}

export async function passkeyAdd(ctx: Ctx) {
  const u = requireUser(ctx);
  await mayAddPasskey(ctx, u);
  await rateLimit(ctx, 'passkey-add:' + u.email, 10, 3600e3);
  const b = await body<{ challengeId: string; label?: string; response: { clientDataJSON: string; attestationObject: string } }>(ctx.req);
  const c = await takeChallenge(ctx, b.challengeId, u.email, 'reg');
  const cred = await verifyRegistration(b.response, c, ctx.url.origin, rpId(ctx));
  await ctx.env.DB.prepare('INSERT INTO passkeys (id, email, alg, jwk, sign_count, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(cred.id, u.email, cred.alg, JSON.stringify(cred.jwk), cred.signCount, String(b.label || '').slice(0, 60) || null, Date.now()).run();
  await audit(ctx, u, 'passkey:add', cred.id.slice(0, 8), null);
  await unlock(ctx, u, 'passkey');
  return json({ ok: true });
}

export async function passkeyList(ctx: Ctx) {
  const u = await requireUnlocked(ctx);
  const { results } = await ctx.env.DB.prepare('SELECT id, label, created_at, last_used FROM passkeys WHERE email = ? ORDER BY created_at').bind(u.email).all();
  return json({ passkeys: results });
}
export async function passkeyRemove(ctx: Ctx) {
  const u = await requireUnlocked(ctx);
  await ctx.env.DB.prepare('DELETE FROM passkeys WHERE id = ? AND email = ?').bind(decodeURIComponent(ctx.params.id), u.email).run();
  await audit(ctx, u, 'passkey:remove', ctx.params.id.slice(0, 8), null);
  return json({ ok: true });
}

export async function unlockOptions(ctx: Ctx) {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare('SELECT id FROM passkeys WHERE email = ?').bind(u.email).all<{ id: string }>();
  if (!results.length) throw new HttpError(409, 'no_passkey');
  const { id, c } = await newChallenge(ctx, u.email, 'auth');
  return json({ challengeId: id, publicKey: { challenge: c, rpId: rpId(ctx), userVerification: 'required', timeout: 120000, allowCredentials: results.map((r) => ({ type: 'public-key', id: r.id })) } });
}

export async function unlockPasskey(ctx: Ctx) {
  const u = requireUser(ctx);
  await rateLimit(ctx, 'unlock:' + u.email, 10, 15 * 60e3);
  const b = await body<{ challengeId: string; id: string; response: { clientDataJSON: string; authenticatorData: string; signature: string } }>(ctx.req);
  const c = await takeChallenge(ctx, b.challengeId, u.email, 'auth');
  const row = await ctx.env.DB.prepare('SELECT alg, jwk, sign_count FROM passkeys WHERE id = ? AND email = ?').bind(b.id, u.email).first<{ alg: number; jwk: string; sign_count: number }>();
  if (!row) throw new HttpError(401, 'passkey_unknown');
  const count = await verifyAssertion(b.response, { alg: row.alg, jwk: JSON.parse(row.jwk), signCount: row.sign_count }, c, ctx.url.origin, rpId(ctx));
  await ctx.env.DB.prepare('UPDATE passkeys SET sign_count = ?, last_used = ? WHERE id = ?').bind(count, Date.now(), b.id).run();
  await unlock(ctx, u, 'passkey');
  return json({ ok: true });
}

/* ---------------- the tree ---------------- */

interface PersonRow { id: string; name_enc: string; details_enc: string; parent1: string | null; parent2: string | null; partner: string | null; member_email: string | null; photo_item: string | null; updated_at: number }

async function person(ctx: Ctx, u: Member, id: string): Promise<PersonRow> {
  const p = await ctx.env.DB.prepare('SELECT * FROM family_people WHERE id = ? AND household = ? AND deleted_at IS NULL').bind(id, u.household).first<PersonRow>();
  if (!p) throw new HttpError(404, 'not_found');
  return p;
}

export async function tree(ctx: Ctx) {
  const u = await requireUnlocked(ctx);
  // the deleted files whose 30 days have passed go for good (their ciphertext too)
  ctx.waitUntil(purge(ctx));
  const { results } = await ctx.env.DB.prepare('SELECT * FROM family_people WHERE household = ? AND deleted_at IS NULL ORDER BY created_at').bind(u.household).all<PersonRow>();
  const links = await linksOf(ctx, u.household, results);
  const counts = await ctx.env.DB.prepare(`SELECT person_id, kind, COUNT(*) AS n FROM vault_items WHERE household = ? AND deleted_at IS NULL AND (private = 0 OR owner_email = ?) GROUP BY person_id, kind`)
    .bind(u.household, u.email).all<{ person_id: string; kind: string; n: number }>();
  const people = await Promise.all(results.map(async (p) => ({
    id: p.id, name: await unseal(ctx.env, p.name_enc, `person:${p.id}:name`),
    member: p.member_email, photo: p.photo_item, sex: (JSON.parse((await unseal(ctx.env, p.details_enc, `person:${p.id}:details`)) || '{}').sex) || '',
    counts: Object.fromEntries(counts.results.filter((c) => c.person_id === p.id).map((c) => [c.kind, c.n])),
  })));
  await audit(ctx, u, 'view:tree', null, null);
  return json({ people, links, me: u.email });
}

const clean = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

export async function personGet(ctx: Ctx) {
  const u = await requireUnlocked(ctx);
  const p = await person(ctx, u, ctx.params.id);
  const details = JSON.parse((await unseal(ctx.env, p.details_enc, `person:${p.id}:details`)) || '{}');
  await audit(ctx, u, 'view:person', null, p.id);
  return json({ id: p.id, name: await unseal(ctx.env, p.name_enc, `person:${p.id}:name`), details, parent1: p.parent1, parent2: p.parent2, partner: p.partner, member: p.member_email, photo: p.photo_item });
}

async function relation(ctx: Ctx, u: Member, id: unknown) {
  if (!id) return null;
  const s = String(id);
  await person(ctx, u, s);            // must be in this family's tree
  return s;
}

export async function personSave(ctx: Ctx) {
  const u = await requireUnlocked(ctx);
  const b = await body<{ name?: string; details?: Record<string, string>; parent1?: string; parent2?: string; partner?: string; child?: string; member?: string }>(ctx.req);
  const id = ctx.params.id || uid();
  const existing = ctx.params.id ? await person(ctx, u, id) : null;
  const name = clean(b.name, 80);
  if (!name) throw new HttpError(400, 'name_required');
  const details = Object.fromEntries(Object.entries(b.details || {}).slice(0, 30).map(([k, v]) => [clean(k, 40), clean(v, 2000)]));
  const [p1, p2, pa] = existing ? [null, null, null] : await Promise.all([relation(ctx, u, b.parent1), relation(ctx, u, b.parent2), relation(ctx, u, b.partner)]);
  const child = existing || !b.child ? null : await relation(ctx, u, b.child);
  const member = b.member ? clean(b.member, 120).toLowerCase() : null;
  const now = Date.now();
  const nameEnc = await seal(ctx.env, name, `person:${id}:name`), detEnc = await seal(ctx.env, JSON.stringify(details), `person:${id}:details`);
  if (existing) {
    await ctx.env.DB.prepare('UPDATE family_people SET name_enc = ?, details_enc = ?, member_email = ?, updated_at = ? WHERE id = ?')
      .bind(nameEnc, detEnc, member, now, id).run();
  } else {
    await ctx.env.DB.prepare('INSERT INTO family_people (id, household, name_enc, details_enc, member_email, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, u.household, nameEnc, detEnc, member, u.email, now, now).run();
    // the relationship it was added with
    for (const par of [p1, p2]) if (par) await addLink(ctx, u, { type: 'parent', a: par, b: id, kind: 'bio' });
    if (pa) await addLink(ctx, u, { type: 'partner', a: pa, b: id, kind: 'married', status: 'together' });
    if (child) await addLink(ctx, u, { type: 'parent', a: id, b: child, kind: 'bio' });
  }
  await audit(ctx, u, existing ? 'edit:person' : 'add:person', null, id);
  return json({ id });
}

export async function personDelete(ctx: Ctx) {
  const u = await requireUnlocked(ctx);
  const p = await person(ctx, u, ctx.params.id);
  await ctx.env.DB.prepare('UPDATE family_people SET deleted_at = ? WHERE id = ?').bind(Date.now(), p.id).run();
  await ctx.env.DB.prepare('DELETE FROM family_links WHERE household = ? AND (a = ? OR b = ?)').bind(u.household, p.id, p.id).run();
  await audit(ctx, u, 'delete:person', null, p.id);
  return json({ ok: true });
}

/* ---------------- relationships (family_links) ---------------- */

const PARENT_KINDS = new Set(['bio', 'adopt', 'step', 'foster']);
const PARTNER_KINDS = new Set(['married', 'partner', 'engaged']);
const PARTNER_STATUS = new Set(['together', 'divorced', 'widowed', 'separated']);
const isoDay = (s: unknown) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
interface Link { id: string; type: 'parent' | 'partner'; a: string; b: string; kind: string | null; status: string | null; since: string | null; until: string | null }

/** The household's relationships; the first time, the old parent1/parent2/partner columns are read into them. */
async function linksOf(ctx: Ctx, household: string, people: PersonRow[]): Promise<Link[]> {
  let { results } = await ctx.env.DB.prepare('SELECT id, type, a, b, kind, status, since, until FROM family_links WHERE household = ?').bind(household).all<Link>();
  if (!results.length && people.some((p) => p.parent1 || p.parent2 || p.partner)) {
    const ids = new Set(people.map((p) => p.id)), now = Date.now(), done = new Set<string>();
    const add: Link[] = [];
    for (const p of people) {
      for (const par of [p.parent1, p.parent2]) if (par && ids.has(par)) add.push({ id: uid(), type: 'parent', a: par, b: p.id, kind: 'bio', status: null, since: null, until: null });
      if (p.partner && ids.has(p.partner)) {
        const [x, y] = [p.id, p.partner].sort(); const k = x + y;
        if (!done.has(k)) { done.add(k); add.push({ id: uid(), type: 'partner', a: x, b: y, kind: 'married', status: 'together', since: null, until: null }); }
      }
    }
    if (add.length) await ctx.env.DB.batch(add.map((l) => ctx.env.DB.prepare('INSERT INTO family_links (id, household, type, a, b, kind, status, since, until, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(l.id, household, l.type, l.a, l.b, l.kind, l.status, null, null, 'migration', now)));
    results = add;
  }
  const alive = new Set(people.map((p) => p.id));
  return results.filter((l) => alive.has(l.a) && alive.has(l.b));
}

async function addLink(ctx: Ctx, u: Member, b: { type: string; a: string; b: string; kind?: string; status?: string; since?: unknown; until?: unknown }) {
  if (b.type !== 'parent' && b.type !== 'partner') throw new HttpError(400, 'bad_link');
  if (b.a === b.b) throw new HttpError(400, 'self_relation');
  await person(ctx, u, b.a); await person(ctx, u, b.b);
  const [a, c] = b.type === 'partner' ? [b.a, b.b].sort() : [b.a, b.b];
  const kind = b.type === 'parent' ? (PARENT_KINDS.has(b.kind || '') ? b.kind! : 'bio') : (PARTNER_KINDS.has(b.kind || '') ? b.kind! : 'married');
  const status = b.type === 'partner' ? (PARTNER_STATUS.has(b.status || '') ? b.status! : 'together') : null;
  const { results } = await ctx.env.DB.prepare('SELECT type, a, b FROM family_links WHERE household = ?').bind(u.household).all<{ type: string; a: string; b: string }>();
  if (results.some((l) => l.type === b.type && ((l.a === a && l.b === c) || (b.type === 'partner' && l.a === c && l.b === a)))) throw new HttpError(409, 'link_exists');
  if (b.type === 'parent') {
    // nobody is their own ancestor: the child may not be an ancestor of the parent
    const up = new Map<string, string[]>();
    for (const l of results) if (l.type === 'parent') (up.get(l.b) || up.set(l.b, []).get(l.b)!).push(l.a);
    const seen = new Set<string>(), stack = [a];
    while (stack.length) { const x = stack.pop()!; if (x === c) throw new HttpError(400, 'circular_family'); if (seen.has(x)) continue; seen.add(x); stack.push(...(up.get(x) || [])); }
    if (results.filter((l) => l.type === 'parent' && l.b === c).length >= 6) throw new HttpError(400, 'too_many_parents');
  }
  const id = uid();
  await ctx.env.DB.prepare('INSERT INTO family_links (id, household, type, a, b, kind, status, since, until, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, u.household, b.type, a, c, kind, status, isoDay(b.since), isoDay(b.until), u.email, Date.now()).run();
  await audit(ctx, u, 'add:link', id, c);
  return id;
}

export async function linkAdd(ctx: Ctx) {
  const u = await requireUnlocked(ctx);
  const b = await body<{ type: string; a: string; b: string; kind?: string; status?: string; since?: string; until?: string }>(ctx.req);
  return json({ id: await addLink(ctx, u, b) });
}
export async function linkSave(ctx: Ctx) {
  const u = await requireUnlocked(ctx);
  const l = await ctx.env.DB.prepare('SELECT * FROM family_links WHERE id = ? AND household = ?').bind(ctx.params.id, u.household).first<Link>();
  if (!l) throw new HttpError(404, 'not_found');
  const b = await body<{ kind?: string; status?: string; since?: string; until?: string }>(ctx.req);
  const kind = l.type === 'parent' ? (PARENT_KINDS.has(b.kind || '') ? b.kind : l.kind) : (PARTNER_KINDS.has(b.kind || '') ? b.kind : l.kind);
  const status = l.type === 'partner' ? (PARTNER_STATUS.has(b.status || '') ? b.status : l.status) : null;
  await ctx.env.DB.prepare('UPDATE family_links SET kind = ?, status = ?, since = ?, until = ? WHERE id = ?')
    .bind(kind, status, b.since === undefined ? l.since : isoDay(b.since), b.until === undefined ? l.until : isoDay(b.until), l.id).run();
  await audit(ctx, u, 'edit:link', l.id, l.b);
  return json({ ok: true });
}
export async function linkDelete(ctx: Ctx) {
  const u = await requireUnlocked(ctx);
  await ctx.env.DB.prepare('DELETE FROM family_links WHERE id = ? AND household = ?').bind(ctx.params.id, u.household).run();
  await audit(ctx, u, 'delete:link', ctx.params.id, null);
  return json({ ok: true });
}

/* ---------------- items: documents, pictures, details ---------------- */

const KINDS = new Set(['doc', 'photo', 'info']);
// what may be kept, and how each kind of file begins (the bytes are checked: a renamed file is refused)
const TYPES: Record<string, (b: Uint8Array) => boolean> = {
  'application/pdf': (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/gif': (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
  'image/webp': (b) => b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45,
  'image/heic': (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70,
  'image/heif': (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (b) => b[0] === 0x50 && b[1] === 0x4b,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (b) => b[0] === 0x50 && b[1] === 0x4b,
  'application/msword': (b) => b[0] === 0xd0 && b[1] === 0xcf,
  'text/plain': (b) => !b.slice(0, 512).includes(0),
};

interface ItemRow { id: string; person_id: string; kind: string; title_enc: string; note_enc: string; mime: string | null; size: number | null; store: string; object_key: string | null; dek: string | null; owner_email: string; private: number; created_at: number; updated_at: number; deleted_at: number | null }

async function item(ctx: Ctx, u: Member, id: string, withDeleted = false): Promise<ItemRow> {
  const it = await ctx.env.DB.prepare(`SELECT * FROM vault_items WHERE id = ? AND household = ? ${withDeleted ? '' : 'AND deleted_at IS NULL'}`).bind(id, u.household).first<ItemRow>();
  if (!it || (it.private && it.owner_email !== u.email)) throw new HttpError(404, 'not_found');   // a private item: as if it were not there
  return it;
}
const view = async (ctx: Ctx, it: ItemRow) => ({
  id: it.id, person: it.person_id, kind: it.kind, mime: it.mime, size: it.size, private: !!it.private, mine: it.owner_email === ctx.user!.email,
  by: it.owner_email, title: await unseal(ctx.env, it.title_enc, `item:${it.id}:title`), note: await unseal(ctx.env, it.note_enc, `item:${it.id}:note`),
  created: it.created_at, updated: it.updated_at, deleted: it.deleted_at,
});

export async function items(ctx: Ctx) {
  const u = await requireUnlocked(ctx);
  const p = await person(ctx, u, ctx.params.id);
  const trash = ctx.url.searchParams.get('trash') === '1';
  const { results } = await ctx.env.DB.prepare(`SELECT * FROM vault_items WHERE person_id = ? AND household = ? AND deleted_at IS ${trash ? 'NOT NULL' : 'NULL'} AND (private = 0 OR owner_email = ?) ORDER BY created_at DESC`)
    .bind(p.id, u.household, u.email).all<ItemRow>();
  return json({ items: await Promise.all(results.map((it) => view(ctx, it))) });
}

export async function itemAdd(ctx: Ctx) {
  const u = await requireUnlocked(ctx);
  await rateLimit(ctx, 'upload:' + u.email, 120, 3600e3);
  const form = await ctx.req.formData();
  const p = await person(ctx, u, String(form.get('person') || ''));
  const kind = String(form.get('kind') || '');
  if (!KINDS.has(kind)) throw new HttpError(400, 'bad_kind');
  const id = uid(), now = Date.now();
  const priv = form.get('private') === '1' ? 1 : 0;
  const title = clean(form.get('title'), 160), note = clean(form.get('note'), 4000);
  let mime: string | null = null, size: number | null = null, objectKey: string | null = null, dek: string | null = null, storeName: StoreName = 'r2';
  const file = form.get('file') as unknown as File | null;
  if (file && typeof file === 'object' && 'arrayBuffer' in file) {
    if (file.size > MAX_FILE) throw new HttpError(413, 'file_too_large');
    const bytes = new Uint8Array(await file.arrayBuffer());
    mime = String(file.type || '').toLowerCase();
    if (!TYPES[mime] || !TYPES[mime](bytes)) throw new HttpError(415, 'file_type_not_allowed');
    size = bytes.length;
    const st = defaultStore(ctx.env);
    storeName = st.name;
    const k = await newDataKey(ctx.env, id);
    objectKey = `${u.household}/${p.id}/${id}`;
    await st.put(objectKey, await encryptFile(k.key, bytes, id));
    dek = k.wrapped;
    bytes.fill(0);
  } else if (kind !== 'info') throw new HttpError(400, 'file_required');
  await ctx.env.DB.prepare('INSERT INTO vault_items (id, household, person_id, kind, title_enc, note_enc, mime, size, store, object_key, dek, owner_email, private, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, u.household, p.id, kind, await seal(ctx.env, title || (file as any)?.name || '', `item:${id}:title`), await seal(ctx.env, note, `item:${id}:note`), mime, size, storeName, objectKey, dek, u.email, priv, now, now).run();
  await audit(ctx, u, 'add:' + kind, id, p.id, !!priv);
  // the encrypted copy on Drive, right away (the nightly job catches whatever this misses)
  if (objectKey) ctx.waitUntil(replicate(ctx.env, { id, store: storeName, object_key: objectKey }).catch((e) => console.error('vault copy', id, e instanceof Error ? e.message : e)));
  return json({ id });
}

/** A file, decrypted for the person who may see it: never cached, never run, always a download (the page shows it from memory). */
export async function itemFile(ctx: Ctx) {
  const u = await requireUnlocked(ctx);
  const it = await item(ctx, u, ctx.params.id);
  if (!it.object_key || !it.dek) throw new HttpError(404, 'no_file');
  const key = await openDataKey(ctx.env, it.dek, it.id);
  const bytes = await decryptFile(key, await readWithFailover(ctx.env, { id: it.id, store: it.store, object_key: it.object_key }), it.id);
  await audit(ctx, u, 'view:' + it.kind, it.id, it.person_id, !!it.private);
  return new Response(bytes, { headers: {
    'content-type': it.mime || 'application/octet-stream', 'content-length': String(bytes.length),
    'content-disposition': 'attachment', 'cache-control': 'no-store, private', 'x-content-type-options': 'nosniff',
    'content-security-policy': "sandbox; default-src 'none'", 'cross-origin-resource-policy': 'same-origin',
  } });
}

export async function itemSave(ctx: Ctx) {
  const u = await requireUnlocked(ctx);
  const it = await item(ctx, u, ctx.params.id);
  const b = await body<{ title?: string; note?: string; private?: boolean; photo?: boolean }>(ctx.req);
  // only the one who added it may make it private or shared again
  const priv = b.private == null || it.owner_email !== u.email ? it.private : b.private ? 1 : 0;
  await ctx.env.DB.prepare('UPDATE vault_items SET title_enc = ?, note_enc = ?, private = ?, updated_at = ? WHERE id = ?')
    .bind(b.title == null ? it.title_enc : await seal(ctx.env, clean(b.title, 160), `item:${it.id}:title`), b.note == null ? it.note_enc : await seal(ctx.env, clean(b.note, 4000), `item:${it.id}:note`), priv, Date.now(), it.id).run();
  // the picture of the person in the tree (a shared picture only)
  if (b.photo && it.kind === 'photo' && !priv) await ctx.env.DB.prepare('UPDATE family_people SET photo_item = ? WHERE id = ?').bind(it.id, it.person_id).run();
  await audit(ctx, u, 'edit:' + it.kind, it.id, it.person_id, !!priv);
  return json({ ok: true });
}

export async function itemDelete(ctx: Ctx) {
  const u = await requireUnlocked(ctx);
  const it = await item(ctx, u, ctx.params.id);
  await ctx.env.DB.prepare('UPDATE vault_items SET deleted_at = ? WHERE id = ?').bind(Date.now(), it.id).run();
  await ctx.env.DB.prepare('UPDATE family_people SET photo_item = NULL WHERE photo_item = ?').bind(it.id).run();
  await audit(ctx, u, 'delete:' + it.kind, it.id, it.person_id, !!it.private);
  return json({ ok: true });
}

export async function itemRestore(ctx: Ctx) {
  const u = await requireUnlocked(ctx);
  const it = await item(ctx, u, ctx.params.id, true);
  if (!it.deleted_at) return json({ ok: true });
  await ctx.env.DB.prepare('UPDATE vault_items SET deleted_at = NULL WHERE id = ?').bind(it.id).run();
  await audit(ctx, u, 'restore:' + it.kind, it.id, it.person_id, !!it.private);
  return json({ ok: true });
}

async function purge(ctx: Ctx) {
  const { results } = await ctx.env.DB.prepare('SELECT id, store, object_key FROM vault_items WHERE deleted_at IS NOT NULL AND deleted_at < ? LIMIT 50').bind(Date.now() - KEEP_DELETED).all<{ id: string; store: string; object_key: string | null }>();
  for (const r of results) {
    if (r.object_key) await store(ctx.env, r.store as StoreName).delete(r.object_key).catch(() => {});
    const copies = await ctx.env.DB.prepare('SELECT target, remote_id FROM vault_replicas WHERE item_id = ?').bind(r.id).all<{ target: string; remote_id: string }>();
    for (const c of copies.results) if (c.target === 'drive') await driveDelete(ctx.env, c.remote_id);
    await ctx.env.DB.prepare('DELETE FROM vault_replicas WHERE item_id = ?').bind(r.id).run();
    await ctx.env.DB.prepare('DELETE FROM vault_items WHERE id = ?').bind(r.id).run();
  }
}

/* ---------------- backups (the owner's panel) ---------------- */

async function requireOwnerUnlocked(ctx: Ctx) {
  const u = await requireUnlocked(ctx);
  if (u.role !== 'owner') throw new HttpError(403, 'Owner only');
  return u;
}
export async function backups(ctx: Ctx) {
  await requireOwnerUnlocked(ctx);
  return json(await backupStatus(ctx.env));
}
export async function backupsRun(ctx: Ctx) {
  const u = await requireOwnerUnlocked(ctx);
  await rateLimit(ctx, 'backup-run', 6, 3600e3);
  const r = await nightly(ctx.env);
  await audit(ctx, u, 'backup:run', null, null);
  return json(r);
}
export async function driveDisconnect(ctx: Ctx) {
  const u = await requireOwnerUnlocked(ctx);
  for (const k of ['drive_email', 'drive_folder']) await setState(ctx.env, k, null);
  await audit(ctx, u, 'backup:drive-off', null, null);
  return json({ ok: true });
}

/* ---------------- the audit log ---------------- */

export async function auditLog(ctx: Ctx) {
  const u = await requireUnlocked(ctx);
  // everyone sees what was done in the family's vault – except what others did with their own private items
  const { results } = await ctx.env.DB.prepare(`SELECT email, action, target, person_id, at FROM vault_audit WHERE household = ? AND (private = 0 OR email = ?) ORDER BY at DESC LIMIT 200`)
    .bind(u.household, u.email).all();
  return json({ events: results });
}
