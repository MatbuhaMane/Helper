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
import * as K from './kin';
import { ACCESS, Level, TRUST_MS, deviceLabel, trusted } from './access';
import { treeOpen } from '../lock';

const IDLE = 15 * 60e3, MAX = 2 * 3600e3, FRESH = 10 * 60e3, KEEP_DELETED = 30 * 864e5;
const MAX_FILE = 25 * 1024 * 1024;
const NAME = 'הָאֹ֔הֶל';

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
  return auditAt(ctx, u.household, u, action, target, personId, priv);
}
/** the same, in another household's log: what someone from outside saw or did there */
async function auditAt(ctx: Ctx, household: string, u: Member, action: string, target: string | null, personId: string | null, priv = false) {
  const ip = ctx.req.headers.get('cf-connecting-ip') || '';
  ctx.waitUntil(ctx.env.DB.prepare('INSERT INTO vault_audit (household, email, action, target, person_id, private, ip, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(household, u.email, action, target, personId, priv ? 1 : 0, ip ? await fingerprint(ctx.env, ip) : null, Date.now()).run().then(() => {}));
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

/** the tree: open to a signed-in member of the household, unless the person locked it (a code or a passkey; server/lock.ts) –
    then opened by that lock for 15 minutes from its last use. The owner's decision, docs/decisions.md "Locks and privacy":
    it replaces the trusted device. Documents and the rest stay 'fresh' (a passkey, or a Google sign-in from the last 10 minutes). */
async function requireTree(ctx: Ctx): Promise<Member> {
  const u = requireUser(ctx);
  if (await treeOpen(ctx, u.email)) return u;
  throw new HttpError(423, 'tree_locked');
}
/** the level a route needs, from the one table that decides it (access.ts ACCESS) */
const need = (ctx: Ctx, level: Level) => (level === 'tree' ? requireTree(ctx) : requireUnlocked(ctx));

async function unlock(ctx: Ctx, u: Member, how: string) {
  const now = Date.now();
  await ctx.env.DB.prepare('INSERT INTO vault_unlocks (sid, email, until, hard_until) VALUES (?, ?, ?, ?) ON CONFLICT(sid) DO UPDATE SET email = excluded.email, until = excluded.until, hard_until = excluded.hard_until')
    .bind(sid(ctx), u.email, now + IDLE, now + MAX).run();
  // this device is now trusted for the tree, 30 days from each use (a coarse name for the list, never the whole User-Agent)
  const was = await ctx.env.DB.prepare('SELECT vault_trust_until FROM sessions WHERE id = ?').bind(sid(ctx)).first<{ vault_trust_until: number | null }>();
  await ctx.env.DB.prepare('UPDATE sessions SET vault_trust_until = ?, vault_trust_used = ?, vault_trust_since = CASE WHEN ? THEN vault_trust_since ELSE ? END, vault_trust_label = ? WHERE id = ?')
    .bind(now + TRUST_MS, now, trusted(was?.vault_trust_until, now) ? 1 : 0, now, deviceLabel(ctx.req.headers.get('user-agent')), sid(ctx)).run();
  await audit(ctx, u, 'unlock:' + how, null, null);
  if (!trusted(was?.vault_trust_until, now)) await audit(ctx, u, 'trust:device', deviceLabel(ctx.req.headers.get('user-agent')), null);
}

/* ---------------- status, locking ---------------- */

export async function status(ctx: Ctx) {
  const u = requireUser(ctx);
  const now = Date.now();
  const [row, keys, age, s] = await Promise.all([
    ctx.env.DB.prepare('SELECT until, hard_until FROM vault_unlocks WHERE sid = ?').bind(sid(ctx)).first<{ until: number; hard_until: number }>(),
    ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM passkeys WHERE email = ?').bind(u.email).first<{ n: number }>(),
    sessionAge(ctx),
    ctx.env.DB.prepare('SELECT vault_trust_until FROM sessions WHERE id = ?').bind(sid(ctx)).first<{ vault_trust_until: number | null }>(),
  ]);
  const open = !!row && row.until > now && row.hard_until > now;
  return json({ unlocked: open, until: open ? Math.min(row!.until, row!.hard_until) : null, trusted: trusted(s?.vault_trust_until, now), passkeys: keys?.n || 0, fresh: age < FRESH, configured: !!(ctx.env.VAULT_KEY || ctx.env.DEV_MODE === '1') });
}

export async function lock(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('DELETE FROM vault_unlocks WHERE sid = ?').bind(sid(ctx)).run();
  // a lock is a lock: the recent Google sign-in no longer counts – opening again takes a passkey or a new sign-in –
  // and this device is no longer trusted for the tree. With ?keep=1 (the page, after five minutes away) only the
  // documents' unlock closes and the device stays trusted.
  const keep = ctx.url.searchParams.get('keep') === '1';
  await ctx.env.DB.prepare(keep ? 'UPDATE sessions SET created_at = 0 WHERE id = ?' : 'UPDATE sessions SET created_at = 0, vault_trust_until = NULL WHERE id = ?').bind(sid(ctx)).run();
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

export async function newChallenge(ctx: Ctx, email: string, kind: string) {
  const c = challenge(), id = uid();
  await ctx.env.DB.prepare('DELETE FROM webauthn_challenges WHERE expires_at < ?').bind(Date.now()).run();
  await ctx.env.DB.prepare('INSERT INTO webauthn_challenges (id, email, challenge, kind, expires_at) VALUES (?, ?, ?, ?, ?)').bind(id, email, c, kind, Date.now() + 5 * 60e3).run();
  return { id, c };
}
export async function takeChallenge(ctx: Ctx, id: string, email: string, kind: string) {
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
  const u = await need(ctx, ACCESS.passkeyList);
  const { results } = await ctx.env.DB.prepare('SELECT id, label, created_at, last_used FROM passkeys WHERE email = ? ORDER BY created_at').bind(u.email).all();
  return json({ passkeys: results });
}
export async function passkeyRemove(ctx: Ctx) {
  const u = await need(ctx, ACCESS.passkeyRemove);
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

export interface PersonRow { id: string; household: string; name_enc: string; details_enc: string; parent1: string | null; parent2: string | null; partner: string | null; member_email: string | null; photo_item: string | null; privacy: string | null; anonymous: number | null; updated_at: number }

async function person(ctx: Ctx, u: Member, id: string): Promise<PersonRow> {
  const p = await ctx.env.DB.prepare('SELECT * FROM family_people WHERE id = ? AND household = ? AND deleted_at IS NULL').bind(id, u.household).first<PersonRow>();
  if (!p) throw new HttpError(404, 'not_found');
  return p;
}

export async function tree(ctx: Ctx) {
  const u = await need(ctx, ACCESS.tree);
  // the deleted files whose 30 days have passed go for good (their ciphertext too)
  ctx.waitUntil(purge(ctx));
  const v = await viewerOf(ctx, u);
  const { results } = await ctx.env.DB.prepare('SELECT * FROM family_people WHERE household = ? AND deleted_at IS NULL ORDER BY created_at').bind(u.household).all<PersonRow>();
  const links = await linksOf(ctx, u.household, results);
  const counts = await ctx.env.DB.prepare(`SELECT person_id, kind, COUNT(*) AS n FROM vault_items WHERE household = ? AND deleted_at IS NULL AND (private = 0 OR owner_email = ?) GROUP BY person_id, kind`)
    .bind(u.household, u.email).all<{ person_id: string; kind: string; n: number }>();
  // how many other trees each of ours is linked to
  const linked = new Map<string, number>();
  for (const b of v.bridges) for (const [h, id] of [[b.house_a, b.person_a], [b.house_b, b.person_b]]) if (h === u.household) linked.set(id, (linked.get(id) || 0) + 1);
  const people = await Promise.all(results.map(async (p) => {
    const s = K.view(await cardOf(ctx, p), 'household', whoFor(v, p))!;
    return {
      id: p.id, name: s.name, member: s.member, photo: s.photo, sex: s.sex, user: isUser(v, p), linked: linked.get(p.id) || 0,
      life: lifeOf(s.details),   // the drawn tree: a birthday's glow, the passed, a yahrzeit's candle (only what privacy lets this viewer see)
      counts: s.hidden.includes('files') ? {} : Object.fromEntries(counts.results.filter((c) => c.person_id === p.id).map((c) => [c.kind, c.n])),
    };
  }));
  await audit(ctx, u, 'view:tree', null, null);
  return json({ people, links, me: u.email, roles: v.roles });
}

const clean = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

export async function personGet(ctx: Ctx) {
  const u = await need(ctx, ACCESS.personGet);
  const p = await person(ctx, u, ctx.params.id);
  const v = await viewerOf(ctx, u), who = whoFor(v, p), card = await cardOf(ctx, p);
  const s = K.view(card, 'household', who)!;
  // a user sets their own privacy; for someone who is not, a head of this household (or the tribe head)
  const may = { privacy: isUser(v, p) ? who.self : who.keeper, member: v.roles.head };
  await audit(ctx, u, 'view:person', null, p.id);
  return json({
    id: p.id, name: s.name, details: s.details, hidden: s.hidden, member: s.member, photo: s.photo, user: isUser(v, p), may,
    privacy: may.privacy ? card.privacy : undefined, anonymous: may.privacy ? card.anonymous : undefined,
    parent1: p.parent1, parent2: p.parent2, partner: p.partner, bridges: await bridgesOfPerson(ctx, u, p.id),
  });
}

async function relation(ctx: Ctx, u: Member, id: unknown) {
  if (!id) return null;
  const s = String(id);
  await person(ctx, u, s);            // must be in this family's tree
  return s;
}

export async function personSave(ctx: Ctx) {
  const u = await need(ctx, ACCESS.personSave);
  const b = await body<{ name?: string; details?: Record<string, string>; parent1?: string; parent2?: string; partner?: string; child?: string; member?: string }>(ctx.req);
  const id = ctx.params.id || uid();
  const v = await viewerOf(ctx, u);
  const existing = ctx.params.id ? await editable(ctx, v, id) : null;
  let name = clean(b.name, 80);
  let details: Record<string, unknown> = Object.fromEntries(Object.entries(b.details || {}).slice(0, 30).map(([k, x]) => [clean(k, 40), clean(x, 2000)]));
  let member = b.member ? clean(b.member, 120).toLowerCase() : null;
  if (existing) {
    // what the editor could not see stays as it was (they were sent "קרוב/ת משפחה", not the name)
    const card = await cardOf(ctx, existing);
    const seen = K.view(card, existing.household === u.household ? 'household' : K.distance(u.household, existing.household, v.bridges), whoFor(v, existing))!;
    details = K.keepHidden(card.details, details, seen.hidden);
    if (seen.hidden.includes('identity')) { name = card.name; member = existing.member_email; }
    if (existing.household !== u.household) member = existing.member_email;      // the tribe head never makes a card a user's
  }
  if (!name) throw new HttpError(400, 'name_required');
  // a user's email on a card gives that user the say over it: only a head puts someone else's email there
  const before = existing?.member_email || null;
  if (member !== before && !v.roles.head && member !== u.email && !(member === null && before === u.email)) throw new HttpError(403, 'head_only_member');
  const [p1, p2, pa] = existing ? [null, null, null] : await Promise.all([relation(ctx, u, b.parent1), relation(ctx, u, b.parent2), relation(ctx, u, b.partner)]);
  const child = existing || !b.child ? null : await relation(ctx, u, b.child);
  const now = Date.now();
  const nameEnc = await seal(ctx.env, name, `person:${id}:name`), detEnc = await seal(ctx.env, JSON.stringify(details), `person:${id}:details`);
  if (existing) {
    await ctx.env.DB.prepare('UPDATE family_people SET name_enc = ?, details_enc = ?, member_email = ?, updated_at = ? WHERE id = ?')
      .bind(nameEnc, detEnc, member, now, id).run();
  } else {
    await ctx.env.DB.prepare('INSERT INTO family_people (id, household, name_enc, details_enc, member_email, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, u.household, nameEnc, detEnc, member, u.email, now, now).run();
    // the relationship it was added with (never the tribe head's cross-household edit: that one only changes a card)
    for (const par of [p1, p2]) if (par) await addLink(ctx, u, { type: 'parent', a: par, b: id, kind: 'bio' });
    if (pa) await addLink(ctx, u, { type: 'partner', a: pa, b: id, kind: 'married', status: 'together' });
    if (child) await addLink(ctx, u, { type: 'parent', a: id, b: child, kind: 'bio' });
  }
  await audit(ctx, u, existing ? 'edit:person' : 'add:person', null, id);
  if (existing && existing.household !== u.household) await auditAt(ctx, existing.household, u, 'edit:person:tribe', null, id);
  return json({ id });
}

export async function personDelete(ctx: Ctx) {
  const u = await need(ctx, ACCESS.personDelete);
  const p = await person(ctx, u, ctx.params.id);
  await ctx.env.DB.prepare('UPDATE family_people SET deleted_at = ? WHERE id = ?').bind(Date.now(), p.id).run();
  await ctx.env.DB.prepare('DELETE FROM family_links WHERE household = ? AND (a = ? OR b = ?)').bind(u.household, p.id, p.id).run();
  // a person who leaves the tree leaves its links to other trees too
  await ctx.env.DB.prepare(`UPDATE family_bridges SET status = 'revoked', decided_by = ?, decided_at = ? WHERE status IN ('pending', 'awaiting_person', 'confirmed') AND ((house_a = ? AND person_a = ?) OR (house_b = ? AND person_b = ?))`)
    .bind(u.email, Date.now(), u.household, p.id, u.household, p.id).run();
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
  const u = await need(ctx, ACCESS.linkAdd);
  const b = await body<{ type: string; a: string; b: string; kind?: string; status?: string; since?: string; until?: string }>(ctx.req);
  return json({ id: await addLink(ctx, u, b) });
}
export async function linkSave(ctx: Ctx) {
  const u = await need(ctx, ACCESS.linkSave);
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
  const u = await need(ctx, ACCESS.linkDelete);
  await ctx.env.DB.prepare('DELETE FROM family_links WHERE id = ? AND household = ?').bind(ctx.params.id, u.household).run();
  await audit(ctx, u, 'delete:link', ctx.params.id, null);
  return json({ ok: true });
}

/** the few dates the drawn tree needs from the (already privacy-filtered) details; nothing when there are none */
function lifeOf(d: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of ['born', 'bornAfterSunset', 'died', 'diedAfterSunset', 'birthdayBy']) if (d?.[k]) out[k] = d[k];
  return Object.keys(out).length ? out : undefined;
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
  const u = await need(ctx, ACCESS.items);
  const p = await person(ctx, u, ctx.params.id);
  if (await filesHidden(ctx, u, p)) return json({ items: [], hidden: true });
  const trash = ctx.url.searchParams.get('trash') === '1';
  const { results } = await ctx.env.DB.prepare(`SELECT * FROM vault_items WHERE person_id = ? AND household = ? AND deleted_at IS ${trash ? 'NOT NULL' : 'NULL'} AND (private = 0 OR owner_email = ?) ORDER BY created_at DESC`)
    .bind(p.id, u.household, u.email).all<ItemRow>();
  return json({ items: await Promise.all(results.map((it) => view(ctx, it))) });
}

export async function itemAdd(ctx: Ctx) {
  const u = await need(ctx, ACCESS.itemAdd);
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
  const u = await need(ctx, ACCESS.itemFile);
  const it = await item(ctx, u, ctx.params.id);
  if (!it.object_key || !it.dek) throw new HttpError(404, 'no_file');
  const owner = await ctx.env.DB.prepare('SELECT * FROM family_people WHERE id = ? AND household = ?').bind(it.person_id, u.household).first<PersonRow>();
  if (owner && await filesHidden(ctx, u, owner)) throw new HttpError(404, 'not_found');
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
  const u = await need(ctx, ACCESS.itemSave);
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
  const u = await need(ctx, ACCESS.itemDelete);
  const it = await item(ctx, u, ctx.params.id);
  await ctx.env.DB.prepare('UPDATE vault_items SET deleted_at = ? WHERE id = ?').bind(Date.now(), it.id).run();
  await ctx.env.DB.prepare('UPDATE family_people SET photo_item = NULL WHERE photo_item = ?').bind(it.id).run();
  await audit(ctx, u, 'delete:' + it.kind, it.id, it.person_id, !!it.private);
  return json({ ok: true });
}

export async function itemRestore(ctx: Ctx) {
  const u = await need(ctx, ACCESS.itemRestore);
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
  const u = await need(ctx, ACCESS.auditLog);
  // everyone sees what was done in the family's vault – except what others did with their own private items
  const { results } = await ctx.env.DB.prepare(`SELECT email, action, target, person_id, at FROM vault_audit WHERE household = ? AND (private = 0 OR email = ?) ORDER BY at DESC LIMIT 200`)
    .bind(u.household, u.email).all();
  return json({ events: results });
}

/* ---------------- stage 2: heads, links between trees, privacy (docs/family-forest.md, rules in kin.ts) ---------------- */

type Confirmed = K.Bridge & { id: string };
interface Roles { owner: boolean; head: boolean; tribe: boolean }
interface Viewer { u: Member; roles: Roles; bridges: Confirmed[]; tribe: Set<string>; users: Set<string> }
interface BridgeRow {
  id: string; house_a: string; person_a: string; to_email: string; note_enc: string | null; house_b: string | null; person_b: string | null;
  status: string; consent_email: string | null; asked_by: string; decided_by: string | null; created_at: number; decided_at: number | null;
}
const OPEN = "('pending', 'awaiting_person', 'confirmed')";
const NO_TITLE = 'משפחה בלי שם';

async function confirmedBridges(ctx: Ctx): Promise<Confirmed[]> {
  const { results } = await ctx.env.DB.prepare("SELECT id, house_a, person_a, house_b, person_b FROM family_bridges WHERE status = 'confirmed'").all<Confirmed>();
  return results;
}
/** the app owners head their own household; others are named heads; the tribe head is named by the app owner */
export async function rolesOf(ctx: Ctx, u: Member): Promise<Roles> {
  const { results } = await ctx.env.DB.prepare('SELECT household, role FROM family_roles WHERE email = ?').bind(u.email).all<{ household: string; role: string }>();
  return { owner: u.role === 'owner', head: u.role === 'owner' || results.some((r) => r.role === 'head' && r.household === u.household), tribe: results.some((r) => r.role === 'tribe') };
}
async function viewerOf(ctx: Ctx, u: Member): Promise<Viewer> {
  const [roles, bridges, users] = await Promise.all([rolesOf(ctx, u), confirmedBridges(ctx), ctx.env.DB.prepare('SELECT email FROM members').all<{ email: string }>()]);
  return { u, roles, bridges, tribe: K.tribe(u.household, bridges), users: new Set(users.results.map((r) => r.email)) };
}
/** a card belongs to a user when its email is a member of the helper */
const isUser = (v: Viewer, p: PersonRow) => !!p.member_email && v.users.has(p.member_email);
function whoFor(v: Viewer, p: PersonRow): K.Who {
  const self = !!p.member_email && p.member_email === v.u.email;
  const keeper = !isUser(v, p) && ((v.roles.head && p.household === v.u.household) || (v.roles.tribe && v.tribe.has(p.household)));
  return { self, keeper };
}
async function cardOf(ctx: Ctx, p: PersonRow): Promise<K.Card> {
  return {
    id: p.id, household: p.household, name: await unseal(ctx.env, p.name_enc, `person:${p.id}:name`),
    details: JSON.parse((await unseal(ctx.env, p.details_enc, `person:${p.id}:details`)) || '{}'),
    member: p.member_email, photo: p.photo_item, privacy: K.parsePrivacy(p.privacy), anonymous: !!p.anonymous,
  };
}
async function filesHidden(ctx: Ctx, u: Member, p: PersonRow) {
  if (!p.privacy) return false;                        // the default (household) shows them to the household
  const v = await viewerOf(ctx, u);
  return !K.sees(K.parsePrivacy(p.privacy).files, 'household', whoFor(v, p), 'files');
}
/** a card the viewer may change: in their household, or (the tribe head) a non-user's anywhere in the tribe */
async function editable(ctx: Ctx, v: Viewer, id: string): Promise<PersonRow> {
  const p = await ctx.env.DB.prepare('SELECT * FROM family_people WHERE id = ? AND deleted_at IS NULL').bind(id).first<PersonRow>();
  if (p && (p.household === v.u.household || (v.roles.tribe && v.tribe.has(p.household) && !isUser(v, p)))) return p;
  throw new HttpError(404, 'not_found');
}
async function titles(ctx: Ctx): Promise<Map<string, string>> {
  const { results } = await ctx.env.DB.prepare('SELECT id, title FROM family_households').all<{ id: string; title: string }>();
  return new Map(results.map((r) => [r.id, r.title]));
}
const titleIn = (t: Map<string, string>, h: string | null) => (h && t.get(h)) || NO_TITLE;
async function householdOf(ctx: Ctx, email: string): Promise<string | null> {
  return (await ctx.env.DB.prepare('SELECT household FROM members WHERE email = ?').bind(email).first<{ household: string }>())?.household ?? null;
}
async function names(ctx: Ctx): Promise<Map<string, string>> {
  const { results } = await ctx.env.DB.prepare('SELECT email, name, he_name FROM members').all<{ email: string; name: string | null; he_name: string | null }>();
  return new Map(results.map((r) => [r.email, r.he_name || r.name || r.email.split('@')[0]]));
}
/** where each record in the links lives (enough for kin.bridgeProblem) */
const housesIn = (bridges: K.Bridge[], more: [string, string][] = []) => {
  const m = new Map<string, string>(more);
  for (const b of bridges) { m.set(b.person_a, b.house_a); m.set(b.person_b, b.house_b); }
  return (id: string) => m.get(id);
};
/** a person's links to other trees, for their panel */
async function bridgesOfPerson(ctx: Ctx, u: Member, id: string) {
  const { results } = await ctx.env.DB.prepare(`SELECT * FROM family_bridges WHERE status IN ${OPEN} AND ((house_a = ? AND person_a = ?) OR (house_b = ? AND person_b = ?)) ORDER BY created_at`)
    .bind(u.household, id, u.household, id).all<BridgeRow>();
  const t = await titles(ctx);
  return results.map((r) => ({ id: r.id, status: r.status, other: r.status === 'pending' ? r.to_email : titleIn(t, r.house_a === u.household ? r.house_b : r.house_a) }));
}
async function bridgeRow(ctx: Ctx, id: string) {
  const r = await ctx.env.DB.prepare('SELECT * FROM family_bridges WHERE id = ?').bind(id).first<BridgeRow>();
  if (!r) throw new HttpError(404, 'not_found');
  return r;
}
const rowById = (ctx: Ctx, id: string | null) => (id ? ctx.env.DB.prepare('SELECT * FROM family_people WHERE id = ? AND deleted_at IS NULL').bind(id).first<PersonRow>() : Promise.resolve(null));

/* ---- roles and the household's name ---- */

export async function roles(ctx: Ctx) {
  const u = await need(ctx, ACCESS.roles);
  const v = await viewerOf(ctx, u), n = await names(ctx), t = await titles(ctx);
  const { results: people } = await ctx.env.DB.prepare('SELECT email, role FROM members WHERE household = ? ORDER BY email').bind(u.household).all<{ email: string; role: string }>();
  const { results: rs } = await ctx.env.DB.prepare('SELECT r.household, r.email, r.role, m.household AS home FROM family_roles r LEFT JOIN members m ON m.email = r.email').all<{ household: string; email: string; role: string; home: string | null }>();
  const heads = new Set([...people.filter((m) => m.role === 'owner').map((m) => m.email), ...rs.filter((r) => r.role === 'head' && r.household === u.household).map((r) => r.email)]);
  return json({
    me: v.roles, title: t.get(u.household) || '',
    members: people.map((m) => ({ email: m.email, name: n.get(m.email), head: heads.has(m.email), owner: m.role === 'owner' })),
    // the tribe heads of this tribe: their names only
    tribe: rs.filter((r) => r.role === 'tribe' && r.home && v.tribe.has(r.home)).map((r) => ({ name: n.get(r.email), household: titleIn(t, r.home) })),
  });
}
export async function roleSave(ctx: Ctx) {
  const u = await need(ctx, ACCESS.roleSave);
  const v = await viewerOf(ctx, u);
  const b = await body<{ email?: string; role?: string; on?: boolean }>(ctx.req);
  const email = clean(b.email, 120).toLowerCase();
  const home = await householdOf(ctx, email);
  if (!home) throw new HttpError(404, 'not_member');
  let household: string;
  if (b.role === 'head') {
    if (!(u.role === 'owner' || (v.roles.head && home === u.household))) throw new HttpError(403, 'only_a_head');
    household = home;
  } else if (b.role === 'tribe') {
    if (u.role !== 'owner') throw new HttpError(403, 'only_the_owner');
    household = '';
  } else throw new HttpError(400, 'bad_role');
  if (b.on) await ctx.env.DB.prepare('INSERT OR IGNORE INTO family_roles (household, email, role, named_by, created_at) VALUES (?, ?, ?, ?, ?)').bind(household, email, b.role, u.email, Date.now()).run();
  else await ctx.env.DB.prepare('DELETE FROM family_roles WHERE household = ? AND email = ? AND role = ?').bind(household, email, b.role).run();
  await auditAt(ctx, home, u, `${b.on ? 'add' : 'remove'}:role:${b.role}`, email, null);
  return json({ ok: true });
}
export async function householdSave(ctx: Ctx) {
  const u = await need(ctx, ACCESS.householdSave);
  if (!(await rolesOf(ctx, u)).head) throw new HttpError(403, 'only_a_head');
  const title = clean((await body<{ title?: string }>(ctx.req)).title, 60);
  if (!title) throw new HttpError(400, 'title_required');
  await ctx.env.DB.prepare('INSERT INTO family_households (id, title, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_by = excluded.updated_by, updated_at = excluded.updated_at')
    .bind(u.household, title, u.email, Date.now()).run();
  await audit(ctx, u, 'edit:household', title, null);
  return json({ ok: true });
}

/* ---- privacy ---- */

/** PUT /api/vault/people/:id/privacy {privacy: {identity, dates, notes, files}, anonymous} */
export async function privacySave(ctx: Ctx) {
  const u = await need(ctx, ACCESS.privacySave);
  const v = await viewerOf(ctx, u);
  const b = await body<{ privacy?: unknown; anonymous?: unknown }>(ctx.req);
  const p = await rowById(ctx, ctx.params.id);
  if (!p || !v.tribe.has(p.household)) throw new HttpError(404, 'not_found');
  const who = whoFor(v, p);
  let targets: PersonRow[];
  if (isUser(v, p)) {
    // a user decides for themself, on every card that carries their email
    if (!who.self) throw new HttpError(403, 'only_the_person');
    targets = (await ctx.env.DB.prepare('SELECT * FROM family_people WHERE member_email = ? AND deleted_at IS NULL').bind(u.email).all<PersonRow>()).results;
  } else {
    if (!who.keeper) throw new HttpError(403, 'only_a_head');
    targets = [p];
  }
  for (const t of targets) {
    const next = K.mergePrivacy(K.parsePrivacy(t.privacy), b.privacy);
    const anon = typeof b.anonymous === 'boolean' ? (b.anonymous ? 1 : 0) : (t.anonymous || 0);
    await ctx.env.DB.prepare('UPDATE family_people SET privacy = ?, anonymous = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(next), anon, Date.now(), t.id).run();
    await auditAt(ctx, t.household, u, 'edit:privacy', null, t.id);
  }
  return json({ ok: true, privacy: K.mergePrivacy(K.parsePrivacy(p.privacy), b.privacy), anonymous: typeof b.anonymous === 'boolean' ? b.anonymous : !!p.anonymous });
}

/* ---- links between trees ---- */

/** POST /api/vault/bridges {person, email, note}: any member asks; nothing of the tree goes with it but the note */
export async function bridgeAsk(ctx: Ctx) {
  const u = await need(ctx, ACCESS.bridgeAsk);
  await rateLimit(ctx, 'bridge:' + u.email, 20, 864e5);
  const b = await body<{ person?: string; email?: string; note?: string }>(ctx.req);
  const p = await person(ctx, u, String(b.person || ''));
  const email = clean(b.email, 120).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'bad_email');
  if ((await householdOf(ctx, email)) === u.household) throw new HttpError(400, 'same_household');
  const note = clean(b.note, 300);
  if (!note) throw new HttpError(400, 'note_required');
  const open = await ctx.env.DB.prepare("SELECT id FROM family_bridges WHERE house_a = ? AND person_a = ? AND to_email = ? AND status IN ('pending', 'awaiting_person')").bind(u.household, p.id, email).first();
  if (open) throw new HttpError(409, 'already_asked');
  const id = uid();
  await ctx.env.DB.prepare('INSERT INTO family_bridges (id, house_a, person_a, to_email, note_enc, status, asked_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, u.household, p.id, email, await seal(ctx.env, note, `bridge:${id}:note`), 'pending', u.email, Date.now()).run();
  await audit(ctx, u, 'ask:bridge', id, p.id);
  // the same answer whether or not the email is a member yet: nobody learns who is registered
  return json({ id });
}

/** GET /api/vault/bridges: what waits for me, what we asked, our links, and (the tribe head) the tribe's links */
export async function bridges(ctx: Ctx) {
  const u = await need(ctx, ACCESS.bridges);
  const v = await viewerOf(ctx, u), t = await titles(ctx), n = await names(ctx);
  const { results } = await ctx.env.DB.prepare(`SELECT b.*, m.household AS to_house FROM family_bridges b LEFT JOIN members m ON m.email = b.to_email
    WHERE b.status IN ('pending', 'awaiting_person', 'confirmed', 'declined') AND (b.house_a = ? OR b.house_b = ? OR m.household = ? OR b.consent_email = ?) ORDER BY b.created_at DESC LIMIT 200`)
    .bind(u.household, u.household, u.household, u.email).all<BridgeRow & { to_house: string | null }>();
  const note = (r: BridgeRow) => unseal(ctx.env, r.note_enc, `bridge:${r.id}:note`);
  const incoming = [], outgoing = [], consent = [], linked = [];
  for (const r of results) {
    if (r.status === 'pending' && r.to_house === u.household && r.house_a !== u.household && v.roles.head)
      incoming.push({ id: r.id, from: titleIn(t, r.house_a), by: n.get(r.asked_by) || '', note: await note(r), at: r.created_at });
    if (r.house_a === u.household && r.status !== 'confirmed')
      outgoing.push({ id: r.id, person: r.person_a, to: r.to_email, status: r.status, at: r.created_at, mine: r.asked_by === u.email });
    if (r.status === 'awaiting_person' && r.consent_email === u.email)
      consent.push({ id: r.id, from: titleIn(t, r.house_a), to: titleIn(t, r.house_b), note: await note(r), at: r.decided_at });
    if (r.status === 'confirmed' && (r.house_a === u.household || r.house_b === u.household))
      linked.push({ id: r.id, person: r.house_a === u.household ? r.person_a : r.person_b, other: titleIn(t, r.house_a === u.household ? r.house_b : r.house_a), at: r.decided_at });
  }
  const tribe = v.roles.tribe ? v.bridges.filter((b) => v.tribe.has(b.house_a)).map((b) => ({ id: b.id, a: titleIn(t, b.house_a), b: titleIn(t, b.house_b) })) : [];
  return json({ incoming, outgoing, consent, linked, tribe, head: v.roles.head });
}

/** the person's own say: needed when they are a user and neither asked nor approved */
function consentNeeded(v: Viewer, x: PersonRow, y: PersonRow, asker: string, approver: string): string | null {
  const emails = [...new Set([x.member_email, y.member_email].filter((e): e is string => !!e && v.users.has(e)))];
  if (emails.length > 1) throw new HttpError(409, 'different_people');
  const e = emails[0];
  return e && e !== asker && e !== approver ? e : null;
}

/** POST /api/vault/bridges/:id/approve {person}: a head of the household the request was sent to */
export async function bridgeApprove(ctx: Ctx) {
  const u = await need(ctx, ACCESS.bridgeApprove);
  const v = await viewerOf(ctx, u);
  const r = await bridgeRow(ctx, ctx.params.id);
  if (r.status !== 'pending' || (await householdOf(ctx, r.to_email)) !== u.household) throw new HttpError(404, 'not_found');
  if (!v.roles.head) throw new HttpError(403, 'only_a_head');
  const y = await person(ctx, u, String((await body<{ person?: string }>(ctx.req)).person || ''));
  const x = await rowById(ctx, r.person_a);
  if (!x) throw new HttpError(410, 'gone');
  const problem = K.bridgeProblem({ id: x.id, household: r.house_a }, { id: y.id, household: u.household }, v.bridges, housesIn(v.bridges, [[x.id, r.house_a], [y.id, u.household]]));
  if (problem) throw new HttpError(409, problem);
  const waitFor = consentNeeded(v, x, y, r.asked_by, u.email);
  const status = waitFor ? 'awaiting_person' : 'confirmed';
  await ctx.env.DB.prepare('UPDATE family_bridges SET house_b = ?, person_b = ?, status = ?, consent_email = ?, decided_by = ?, decided_at = ? WHERE id = ?')
    .bind(u.household, y.id, status, waitFor, u.email, Date.now(), r.id).run();
  await audit(ctx, u, 'approve:bridge', r.id, y.id);
  await auditAt(ctx, r.house_a, u, 'approve:bridge', r.id, x.id);
  return json({ status });
}
/** POST /api/vault/bridges/:id/consent: the person themself */
export async function bridgeConsent(ctx: Ctx) {
  const u = await need(ctx, ACCESS.bridgeConsent);
  const v = await viewerOf(ctx, u);
  const r = await bridgeRow(ctx, ctx.params.id);
  if (r.status !== 'awaiting_person' || r.consent_email !== u.email || !r.house_b || !r.person_b) throw new HttpError(404, 'not_found');
  const problem = K.bridgeProblem({ id: r.person_a, household: r.house_a }, { id: r.person_b, household: r.house_b }, v.bridges, housesIn(v.bridges, [[r.person_a, r.house_a], [r.person_b, r.house_b]]));
  if (problem) throw new HttpError(409, problem);
  await ctx.env.DB.prepare("UPDATE family_bridges SET status = 'confirmed', decided_at = ? WHERE id = ?").bind(Date.now(), r.id).run();
  for (const h of [r.house_a, r.house_b]) await auditAt(ctx, h, u, 'consent:bridge', r.id, null);
  return json({ status: 'confirmed' });
}
/** POST /api/vault/bridges/:id/decline: a head where it was sent, or the person whose consent it waits for */
export async function bridgeDecline(ctx: Ctx) {
  const u = await need(ctx, ACCESS.bridgeDecline);
  const r = await bridgeRow(ctx, ctx.params.id);
  const mayDecline = r.status === 'pending' ? (await householdOf(ctx, r.to_email)) === u.household && (await rolesOf(ctx, u)).head : r.status === 'awaiting_person' && r.consent_email === u.email;
  if (!mayDecline) throw new HttpError(404, 'not_found');
  await ctx.env.DB.prepare("UPDATE family_bridges SET status = 'declined', decided_by = ?, decided_at = ? WHERE id = ?").bind(u.email, Date.now(), r.id).run();
  for (const h of new Set([r.house_a, r.house_b || u.household])) await auditAt(ctx, h, u, 'decline:bridge', r.id, null);
  return json({ ok: true });
}
/** DELETE /api/vault/bridges/:id: whoever asked, a head of either side, the person, or the tribe head; it ends at once */
export async function bridgeRevoke(ctx: Ctx) {
  const u = await need(ctx, ACCESS.bridgeRevoke);
  const v = await viewerOf(ctx, u);
  const r = await bridgeRow(ctx, ctx.params.id);
  if (!['pending', 'awaiting_person', 'confirmed'].includes(r.status)) throw new HttpError(404, 'not_found');
  const [x, y] = await Promise.all([rowById(ctx, r.person_a), rowById(ctx, r.person_b)]);
  const sides = [r.house_a, r.house_b].filter((h): h is string => !!h);
  const may = r.asked_by === u.email || (v.roles.head && sides.includes(u.household)) || [x?.member_email, y?.member_email].includes(u.email)
    || (v.roles.tribe && sides.some((h) => v.tribe.has(h)));
  if (!may) throw new HttpError(403, 'not_yours');
  await ctx.env.DB.prepare("UPDATE family_bridges SET status = 'revoked', decided_by = ?, decided_at = ? WHERE id = ?").bind(u.email, Date.now(), r.id).run();
  for (const h of sides) await auditAt(ctx, h, u, 'revoke:bridge', r.id, null);
  return json({ ok: true });
}

/* ---- the joined trees, as this viewer may see them ---- */

type ForestPerson = K.Seen & { pid: string; root: string };
interface Forest {
  people: ForestPerson[];
  links: K.KinLink[];                                // between records (real ids)
  root: (id: string) => string;
  pidOf: Map<string, string>; idOf: Map<string, string>;
  houses: Set<string>;
}
/** every household of the viewer's tribe: its people as the viewer may see them, and its links */
async function forestOf(ctx: Ctx, v: Viewer): Promise<Forest> {
  const houses = [...v.tribe];
  const marks = houses.map(() => '?').join(', ');
  const [{ results: rows }, { results: links }] = await Promise.all([
    ctx.env.DB.prepare(`SELECT * FROM family_people WHERE household IN (${marks}) AND deleted_at IS NULL`).bind(...houses).all<PersonRow>(),
    ctx.env.DB.prepare(`SELECT type, a, b, kind, status FROM family_links WHERE household IN (${marks})`).bind(...houses).all<K.KinLink>(),
  ]);
  const cards = new Map<string, K.Card>(), rowOf = new Map(rows.map((r) => [r.id, r]));
  for (const r of rows) cards.set(r.id, await cardOf(ctx, r));
  const root = K.sameness(v.bridges);
  // outside its household a person shows by kin.outside: the user's own levels, or the strictest of all their records
  const byRoot = new Map<string, { privacy: K.Privacy; anonymous: boolean; user: boolean }[]>();
  for (const c of cards.values()) {
    const r = root(c.id), entry = { privacy: c.privacy, anonymous: c.anonymous, user: isUser(v, rowOf.get(c.id)!) };
    (byRoot.get(r) || byRoot.set(r, []).get(r)!).push(entry);
  }
  const pidOf = new Map<string, string>(), idOf = new Map<string, string>();
  const people: ForestPerson[] = [];
  for (const c of cards.values()) {
    // records outside the viewer's household go by an opaque id that means nothing elsewhere
    const pid = c.household === v.u.household ? c.id : 'f' + (await fingerprint(ctx.env, `forest:${v.u.household}:${c.id}`));
    pidOf.set(c.id, pid); idOf.set(pid, c.id);
    const s = K.view(c, K.distance(v.u.household, c.household, v.bridges), whoFor(v, rowOf.get(c.id)!), K.outside(byRoot.get(root(c.id))!));
    if (s) people.push({ ...s, pid, root: root(c.id) });
  }
  const alive = new Set(cards.keys());
  return { people, links: links.filter((l) => alive.has(l.a) && alive.has(l.b)), root, pidOf, idOf, houses: v.tribe };
}
async function auditForest(ctx: Ctx, u: Member, houses: Set<string>, action: string) {
  for (const h of houses) await auditAt(ctx, h, u, h === u.household ? action : action + ':from-outside', null, null);
}
/** households outside the viewer's go by a label that means nothing elsewhere */
const houseLabel = (u: Member, houses: Set<string>) => { const sorted = [...houses].sort(); return (h: string) => (h === u.household ? 'mine' : 'h' + sorted.indexOf(h)); };

/** GET /api/vault/forest: the tribe's households, their people (as the viewer may see them), the links, and who is the same person */
export async function forest(ctx: Ctx) {
  const u = await need(ctx, ACCESS.forest);
  const v = await viewerOf(ctx, u), f = await forestOf(ctx, v), t = await titles(ctx);
  const pid = (id: string) => f.pidOf.get(id)!, label = houseLabel(u, f.houses);
  const out = {
    households: [...f.houses].map((h) => ({ id: label(h), title: titleIn(t, h), distance: K.distance(u.household, h, v.bridges) })),
    people: f.people.map((p) => ({ id: p.pid, household: label(p.household), name: p.name, sex: p.sex, anonymous: p.anonymous, details: p.details, hidden: p.hidden })),
    links: f.links.map((l) => ({ ...l, a: pid(l.a), b: pid(l.b) })),
    same: v.bridges.filter((b) => f.houses.has(b.house_a)).map((b) => [pid(b.person_a), pid(b.person_b)]),
  };
  if (f.houses.size > 1) await auditForest(ctx, u, f.houses, 'view:forest');
  return json(out);
}

/** GET /api/vault/related?from=&to=: how two people are related over the joined trees, named in Hebrew */
export async function related(ctx: Ctx) {
  const u = await need(ctx, ACCESS.related);
  const v = await viewerOf(ctx, u), f = await forestOf(ctx, v);
  const from = f.idOf.get(ctx.url.searchParams.get('from') || ''), to = f.idOf.get(ctx.url.searchParams.get('to') || '');
  if (!from || !to) throw new HttpError(404, 'not_found');
  // one node per person: shown by the viewer's own record if there is one, else the most visible record
  const score = (x: ForestPerson) => (x.household === u.household ? 2 : x.hidden.includes('identity') ? 0 : 1);
  const best = new Map<string, ForestPerson>();
  for (const p of f.people) { const cur = best.get(p.root); if (!cur || score(p) > score(cur)) best.set(p.root, p); }
  const k = K.kin(K.mergeLinks(f.links, f.root), (id) => best.get(id)?.sex || '');
  const a = f.root(from), b = f.root(to);
  const r = k.pathBetween(a, b);
  const at = (id: string) => { const p = best.get(id)!; return { id: p.pid, name: p.name, mine: p.household === u.household }; };
  const touched = new Set(f.people.filter((p) => r?.nodes.includes(p.root)).map((p) => p.household));
  if (touched.size > 1) await auditForest(ctx, u, touched, 'view:related');
  return json({ name: k.relationName(a, b), steps: r?.steps ?? null, path: r ? r.nodes.map(at) : [], from: at(a), to: at(b) });
}

/** for other modules (the family calendar): the household's cards as this member may see them inside the household */
export async function seenAtHome(ctx: Ctx, u: Member, rows: PersonRow[]): Promise<K.Seen[]> {
  const v = await viewerOf(ctx, u);
  return Promise.all(rows.map(async (p) => K.view(await cardOf(ctx, p), 'household', whoFor(v, p))!));
}

/* ---------------- recognized devices (settings → "מכשירים מוכרים") ---------------- */

/** a device's id for the page: a fingerprint of its session, never the session itself */
const deviceId = (ctx: Ctx, id: string) => fingerprint(ctx.env, 'device:' + id);

/** GET /api/vault/devices – this person's trusted devices: their name, since when, last used, and which one is this */
export async function devices(ctx: Ctx) {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare('SELECT id, vault_trust_label AS label, vault_trust_since AS since, vault_trust_used AS used, vault_trust_until AS until FROM sessions WHERE email = ? AND vault_trust_until > ? ORDER BY vault_trust_used DESC')
    .bind(u.email, Date.now()).all<{ id: string; label: string | null; since: number | null; used: number | null; until: number }>();
  return json({ devices: await Promise.all(results.map(async (d) => ({ id: await deviceId(ctx, d.id), label: d.label || 'מכשיר', since: d.since, used: d.used, here: d.id === sid(ctx) }))) });
}
/** DELETE /api/vault/devices/:id (?signout=1) – that device is no longer trusted, at once (and, if asked, signed out) */
export async function deviceRevoke(ctx: Ctx) {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare('SELECT id, vault_trust_label AS label FROM sessions WHERE email = ? AND vault_trust_until IS NOT NULL').bind(u.email).all<{ id: string; label: string | null }>();
  let hit: { id: string; label: string | null } | null = null;
  for (const d of results) if ((await deviceId(ctx, d.id)) === ctx.params.id) hit = d;
  if (!hit) throw new HttpError(404, 'not_found');
  const signout = ctx.url.searchParams.get('signout') === '1';
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE sessions SET vault_trust_until = NULL WHERE id = ?').bind(hit.id),
    ctx.env.DB.prepare('DELETE FROM vault_unlocks WHERE sid = ?').bind(hit.id),
    ...(signout ? [ctx.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(hit.id)] : []),
  ]);
  await audit(ctx, u, signout ? 'trust:revoke+signout' : 'trust:revoke', hit.label, null);
  return json({ ok: true });
}

/* ---------------- the family profile (server/family-profile.ts): who of a household may show on it ---------------- */

/** the users of a household, each with what of their tree card may leave it (kin.outside over all their records),
    and the confirmed links; the profile's view filter (server/family-profile-rules.ts) decides from these */
export async function profilePeople(ctx: Ctx, house: string) {
  const [bridges, { results: mem }, { results: rows }, users] = await Promise.all([
    confirmedBridges(ctx),
    ctx.env.DB.prepare('SELECT email, name, he_name FROM members WHERE household = ? ORDER BY created_at').bind(house).all<{ email: string; name: string | null; he_name: string | null }>(),
    ctx.env.DB.prepare('SELECT * FROM family_people WHERE household = ? AND member_email IS NOT NULL AND deleted_at IS NULL').bind(house).all<PersonRow>(),
    ctx.env.DB.prepare('SELECT email FROM members').all<{ email: string }>(),
  ]);
  const userSet = new Set(users.results.map((r) => r.email));
  const houseOf = housesIn(bridges, rows.map((r) => [r.id, r.household] as [string, string]));
  const people = [];
  for (const m of mem) {
    const name = m.he_name || m.name || m.email.split('@')[0];
    const own = rows.find((r) => r.member_email === m.email);
    if (!own) { people.push({ email: m.email, name, cardName: null, outside: null }); continue; }
    const ids = K.recordsOf(own.id, bridges, houseOf).map((r) => r.id);
    const { results: recs } = await ctx.env.DB.prepare(`SELECT * FROM family_people WHERE id IN (${ids.map(() => '?').join(', ')}) AND deleted_at IS NULL`).bind(...ids).all<PersonRow>();
    const outside = K.outside(recs.map((r) => ({ privacy: K.parsePrivacy(r.privacy), anonymous: !!r.anonymous, user: !!r.member_email && userSet.has(r.member_email) })));
    people.push({ email: m.email, name, cardName: (await cardOf(ctx, own)).name, outside });
  }
  return { people, bridges };
}
/** someone from outside opened a household's profile: written in that household's log */
export const auditProfile = (ctx: Ctx, house: string, u: Member, how: string) => auditAt(ctx, house, u, 'view:profile:' + how, null, null);
