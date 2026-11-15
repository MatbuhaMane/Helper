// Own storage (vision batch 28; CEO's review 2026-11-15, limits in docs/decisions.md): a person connects their own Google Drive
// or a home NAS, and the heavy files live there.
//  - Drive: the drive.file scope only (files the helper made; the Google Picker for existing files is a later step), asked for
//    incrementally from the settings ("לחבר את ה-Drive שלי", /api/auth/login?drive=1), never at sign-in. The refresh token is
//    sealed (core.ts encrypt). Disconnecting revokes it at Google and deletes it.
//  - NAS: https WebDAV only (storage-rules.ts nasUrl: no IP literals, no private or localhost hosts), the user name and password
//    sealed; every request has a time limit and a size limit.
//  - Nothing from the files is read by any AI, and no route here calls one.
import { Ctx, DRIVE_FILE_SCOPE, HttpError, body, decrypt, encrypt, googleAccessToken, json, rateHit, requireUser } from './core';
import { DRIVE_MAX_BYTES, MAX_BYTES, TIMEOUT_MS, fileName, nasUrl, parseListing, sizeOk } from './storage-rules';
import { folderId } from './notes';

const FOLDER = 'האוהל – קבצים';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

async function hasDrive(ctx: Ctx, email: string) {
  const row = await ctx.env.DB.prepare('SELECT scope FROM google_tokens WHERE email = ?').bind(email).first<{ scope: string | null }>();
  return !!row?.scope?.includes(DRIVE_FILE_SCOPE);
}
const nasRow = (ctx: Ctx, email: string) => ctx.env.DB.prepare('SELECT * FROM storage_nas WHERE email = ?').bind(email).first<{ url: string; user_enc: string; pass_enc: string; created_at: number }>();

/** GET /api/storage → what is connected (never a token, a user name or a password) */
export async function status(ctx: Ctx) {
  const u = requireUser(ctx);
  const nas = await nasRow(ctx, u.email);
  return json({ drive: { connected: await hasDrive(ctx, u.email), folder: FOLDER }, nas: nas ? { connected: true, host: new URL(nas.url).host } : { connected: false } });
}

/* ---------------- NAS (WebDAV over https) ---------------- */

/** one request to the person's NAS: the sealed credentials, a time limit, and no redirects (a redirect could lead somewhere private) */
async function dav(ctx: Ctx, email: string, method: string, path: string, init: RequestInit & { depth?: string } = {}) {
  const row = await nasRow(ctx, email);
  if (!row) throw new HttpError(409, 'nas_not_connected');
  const target = new URL(path, row.url);
  if (!target.href.startsWith(row.url)) throw new HttpError(400, 'bad_path');
  const auth = 'Basic ' + btoa(unescape(encodeURIComponent(`${await decrypt(ctx.env, row.user_enc)}:${await decrypt(ctx.env, row.pass_enc)}`)));
  const headers: Record<string, string> = { authorization: auth, ...(init.depth ? { depth: init.depth } : {}), ...((init.headers as Record<string, string>) || {}) };
  try {
    return await fetch(target.href, { ...init, method, headers, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch { throw new HttpError(502, 'nas_unreachable'); }
}

/** POST /api/storage/nas { url, user, pass } – checks the address by the rules, tries it once, then keeps it sealed */
export async function nasConnect(ctx: Ctx) {
  const u = requireUser(ctx);
  await rateHit(ctx.env, 'nas-connect:' + u.email, 10, 60 * 60_000);
  const b = await body<{ url?: string; user?: string; pass?: string }>(ctx.req);
  const chk = nasUrl(b.url);
  if (!chk.ok) throw new HttpError(400, chk.why);
  const user = String(b.user ?? '').slice(0, 200), pass = String(b.pass ?? '').slice(0, 400);
  if (!user || !pass) throw new HttpError(400, 'credentials_needed');
  const auth = 'Basic ' + btoa(unescape(encodeURIComponent(`${user}:${pass}`)));
  let r: Response;
  try { r = await fetch(chk.url, { method: 'PROPFIND', headers: { authorization: auth, depth: '0' }, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) }); }
  catch { throw new HttpError(502, 'nas_unreachable'); }
  if (r.status === 401 || r.status === 403) throw new HttpError(401, 'nas_wrong_credentials');
  if (r.status !== 207 && r.status !== 200) throw new HttpError(502, 'nas_not_webdav');
  await ctx.env.DB.prepare(
    `INSERT INTO storage_nas (email, url, user_enc, pass_enc, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET url = excluded.url, user_enc = excluded.user_enc, pass_enc = excluded.pass_enc, created_at = excluded.created_at`,
  ).bind(u.email, chk.url, await encrypt(ctx.env, user), await encrypt(ctx.env, pass), Date.now()).run();
  return json({ ok: true, host: chk.host });
}

/** DELETE /api/storage/nas – forgets the address and the credentials (the files on the NAS are untouched) */
export async function nasDisconnect(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('DELETE FROM storage_nas WHERE email = ?').bind(u.email).run();
  return json({ ok: true });
}

/** GET /api/storage/nas/files → { files: [{ name, size, dir }] } the top folder of the person's NAS address */
export async function nasList(ctx: Ctx) {
  const u = requireUser(ctx);
  const row = await nasRow(ctx, u.email);
  const r = await dav(ctx, u.email, 'PROPFIND', '', { depth: '1' });
  if (r.status !== 207) throw new HttpError(502, 'nas_error_' + r.status);
  const xml = (await r.text()).slice(0, 2_000_000);
  return json({ files: parseListing(xml, row!.url) });
}

/** PUT /api/storage/nas/file?name= – the body goes to the NAS as that file (needs an honest content-length, up to MAX_BYTES) */
export async function nasPut(ctx: Ctx) {
  const u = requireUser(ctx);
  await rateHit(ctx.env, 'nas-put:' + u.email, 60, 60 * 60_000);
  const name = fileName(ctx.url.searchParams.get('name'));
  if (!name) throw new HttpError(400, 'bad_name');
  const len = ctx.req.headers.get('content-length');
  if (!sizeOk(len, MAX_BYTES)) throw new HttpError(413, 'too_big');
  const r = await dav(ctx, u.email, 'PUT', encodeURIComponent(name), {
    body: ctx.req.body, headers: { 'content-type': ctx.req.headers.get('content-type') || 'application/octet-stream', 'content-length': len! },
    // @ts-expect-error duplex is required by the runtime for a streamed body
    duplex: 'half',
  });
  if (!r.ok) throw new HttpError(502, 'nas_error_' + r.status);
  return json({ ok: true, name });
}

/** GET /api/storage/nas/file?name= – one file from the NAS, passed through (only if it declares a size within the limit) */
export async function nasGet(ctx: Ctx) {
  const u = requireUser(ctx);
  const name = fileName(ctx.url.searchParams.get('name'));
  if (!name) throw new HttpError(400, 'bad_name');
  const r = await dav(ctx, u.email, 'GET', encodeURIComponent(name));
  if (r.status === 404) throw new HttpError(404, 'Not found');
  if (!r.ok) throw new HttpError(502, 'nas_error_' + r.status);
  if (!sizeOk(r.headers.get('content-length'), MAX_BYTES)) throw new HttpError(413, 'too_big');
  return new Response(r.body, { headers: { 'content-type': r.headers.get('content-type') || 'application/octet-stream', 'content-length': r.headers.get('content-length')!, 'content-disposition': 'attachment', 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' } });
}

/* ---------------- Google Drive (drive.file) ---------------- */

/** DELETE /api/storage/drive – revokes the token at Google and deletes it here. Refused while the vault's backups use this Drive. */
export async function driveDisconnect(ctx: Ctx) {
  const u = requireUser(ctx);
  const row = await ctx.env.DB.prepare('SELECT refresh_token, scope FROM google_tokens WHERE email = ?').bind(u.email).first<{ refresh_token: string; scope: string | null }>();
  if (!row) return json({ ok: true });
  const bk = await ctx.env.DB.prepare("SELECT value FROM backup_state WHERE key = 'drive_email'").first<{ value: string }>();
  if (bk?.value === u.email) throw new HttpError(409, 'drive_used_by_backups');
  const alsoGmail = !!row.scope?.includes('gmail');
  try {
    await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: await decrypt(ctx.env, row.refresh_token) }), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch { /* Google unreachable or already revoked: the token is deleted here either way */ }
  await ctx.env.DB.prepare('DELETE FROM google_tokens WHERE email = ?').bind(u.email).run();
  return json({ ok: true, alsoGmail });   // one grant held both scopes: the Gmail connection needs reconnecting too
}

async function driveToken(ctx: Ctx, email: string) {
  if (!(await hasDrive(ctx, email))) throw new HttpError(409, 'drive_not_connected');
  try { return await googleAccessToken(ctx.env, email); } catch { throw new HttpError(409, 'drive_not_connected'); }
}

/** GET /api/storage/drive/files → the files the helper made in the person's folder */
export async function driveList(ctx: Ctx) {
  const u = requireUser(ctx);
  const token = await driveToken(ctx, u.email);
  const folder = await folderId(token, FOLDER);
  const q = encodeURIComponent(`'${folder}' in parents and trashed = false`);
  const r = await fetch(`${DRIVE}?q=${q}&fields=files(id,name,size,mimeType,webViewLink)&pageSize=100&orderBy=modifiedTime desc`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new HttpError(502, `drive_error_${r.status}`);
  const files = ((await r.json()) as { files: { id: string; name: string; size?: string; mimeType: string; webViewLink?: string }[] }).files;
  return json({ files: files.map((f) => ({ id: f.id, name: f.name, size: Number(f.size || 0), type: f.mimeType, url: f.webViewLink || null })) });
}

/** PUT /api/storage/drive/file?name= – the body is saved as that file in the helper's folder (up to DRIVE_MAX_BYTES) */
export async function drivePut(ctx: Ctx) {
  const u = requireUser(ctx);
  await rateHit(ctx.env, 'drive-put:' + u.email, 60, 60 * 60_000);
  const name = fileName(ctx.url.searchParams.get('name'));
  if (!name) throw new HttpError(400, 'bad_name');
  if (!sizeOk(ctx.req.headers.get('content-length'), DRIVE_MAX_BYTES)) throw new HttpError(413, 'too_big');
  const bytes = new Uint8Array(await ctx.req.arrayBuffer());
  if (!bytes.length || bytes.length > DRIVE_MAX_BYTES) throw new HttpError(413, 'too_big');
  const token = await driveToken(ctx, u.email);
  const mime = (ctx.req.headers.get('content-type') || 'application/octet-stream').slice(0, 100);
  const meta = JSON.stringify({ name, parents: [await folderId(token, FOLDER)] });
  const edge = 'helper' + crypto.randomUUID();
  const head = new TextEncoder().encode(`--${edge}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${edge}\r\ncontent-type: ${mime}\r\n\r\n`);
  const tail = new TextEncoder().encode(`\r\n--${edge}--`);
  const all = new Uint8Array(head.length + bytes.length + tail.length);
  all.set(head); all.set(bytes, head.length); all.set(tail, head.length + bytes.length);
  const r = await fetch(`${UPLOAD}?uploadType=multipart&fields=id,name,webViewLink`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/related; boundary=${edge}` }, body: all, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new HttpError(502, `drive_error_${r.status}`);
  const f = (await r.json()) as { id: string; name: string; webViewLink?: string };
  return json({ ok: true, id: f.id, name: f.name, url: f.webViewLink || null });
}
