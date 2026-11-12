// The vault's backups. Cloudflare R2 stays the main store; every file also goes, encrypted as it is, to:
//   * Google Drive – the owner's Drive, a folder "Helper vault (encrypted)" made by the helper (the drive.file scope reaches
//     only files the helper made). A file that R2 cannot give back is read from here (store.ts → readWithFailover).
//   * the family NAS – which pulls the vault/ prefix of the bucket itself (Synology Cloud Sync, a read-only R2 token), so
//     nothing at home is open to the internet. docs/security.md has the setup.
// Every night (the Worker's cron) the files that have no Drive copy yet get one, and a snapshot of the vault's records
// (the tree and the items' sealed metadata and wrapped keys) is written, encrypted, to R2 and to Drive. With VAULT_KEY,
// a snapshot and the files, tools/vault-restore.mjs opens everything – even with Cloudflare gone.

import { Env, HttpError, googleAccessToken } from '../core';
import { encryptFile, newDataKey } from './crypto';
import { store } from './store';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER = 'Helper vault (encrypted)';
const KEEP_SNAPSHOTS = 14;

/* ---------------- settings (a tiny key/value table) ---------------- */
export async function getState(env: Env, key: string): Promise<string | null> {
  const r = await env.DB.prepare('SELECT value FROM backup_state WHERE key = ?').bind(key).first<{ value: string }>();
  return r?.value ?? null;
}
export async function setState(env: Env, key: string, value: string | null) {
  if (value == null) await env.DB.prepare('DELETE FROM backup_state WHERE key = ?').bind(key).run();
  else await env.DB.prepare('INSERT INTO backup_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value).run();
}

/* ---------------- Google Drive ---------------- */
async function driveToken(env: Env) {
  const email = await getState(env, 'drive_email');
  if (!email) throw new HttpError(409, 'drive_not_connected');
  return { email, token: await googleAccessToken(env, email) };
}
async function drive(env: Env, path: string, init: RequestInit = {}, token?: string) {
  const t = token || (await driveToken(env)).token;
  const r = await fetch('https://www.googleapis.com' + path, { ...init, headers: { authorization: `Bearer ${t}`, ...(init.headers || {}) } });
  if (!r.ok) throw new HttpError(r.status === 404 ? 404 : 502, `drive_${r.status}`);
  return r;
}
async function folder(env: Env, token: string): Promise<string> {
  const known = await getState(env, 'drive_folder');
  if (known) return known;
  const q = encodeURIComponent(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = (await (await drive(env, `/drive/v3/files?q=${q}&fields=files(id)`, {}, token)).json()) as { files: { id: string }[] };
  let id = found.files[0]?.id;
  if (!id) {
    const made = (await (await drive(env, '/drive/v3/files?fields=id', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder', description: 'Encrypted backups of the family helper vault. Unreadable without the vault key.' }) }, token)).json()) as { id: string };
    id = made.id;
  }
  await setState(env, 'drive_folder', id);
  return id;
}
/** Upload (resumable, so large files work too); returns the Drive file id. */
export async function drivePut(env: Env, name: string, bytes: Uint8Array): Promise<string> {
  const { token } = await driveToken(env);
  const parent = await folder(env, token);
  const start = await drive(env, '/upload/drive/v3/files?uploadType=resumable&fields=id', {
    method: 'POST', headers: { 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': 'application/octet-stream', 'x-upload-content-length': String(bytes.length) },
    body: JSON.stringify({ name, parents: [parent] }),
  }, token);
  const where = start.headers.get('location');
  if (!where) throw new HttpError(502, 'drive_no_upload_url');
  const up = await fetch(where, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: bytes });
  if (!up.ok) throw new HttpError(502, `drive_upload_${up.status}`);
  return ((await up.json()) as { id: string }).id;
}
export async function driveGet(env: Env, id: string): Promise<Uint8Array> {
  return new Uint8Array(await (await drive(env, `/drive/v3/files/${encodeURIComponent(id)}?alt=media`)).arrayBuffer());
}
export async function driveDelete(env: Env, id: string) {
  await drive(env, `/drive/v3/files/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
}

/* ---------------- copies of the files ---------------- */
/** One item's ciphertext to Drive (as it is: it is already encrypted). Quietly skipped when Drive is not connected. */
export async function replicate(env: Env, item: { id: string; store: string; object_key: string | null }) {
  if (!item.object_key || !(await getState(env, 'drive_email'))) return false;
  const have = await env.DB.prepare("SELECT 1 FROM vault_replicas WHERE item_id = ? AND target = 'drive'").bind(item.id).first();
  if (have) return true;
  const bytes = await store(env, item.store as any).get(item.object_key);
  const remote = await drivePut(env, `${item.id}.bin`, bytes);
  await env.DB.prepare("INSERT INTO vault_replicas (item_id, target, remote_id, at) VALUES (?, 'drive', ?, ?) ON CONFLICT(item_id, target) DO UPDATE SET remote_id = excluded.remote_id, at = excluded.at")
    .bind(item.id, remote, Date.now()).run();
  return true;
}

/** A file from the main store – or, if that fails, from its Drive copy. */
export async function readWithFailover(env: Env, item: { id: string; store: string; object_key: string }): Promise<Uint8Array> {
  try {
    return await store(env, item.store as any).get(item.object_key);
  } catch (e) {
    const r = await env.DB.prepare("SELECT remote_id FROM vault_replicas WHERE item_id = ? AND target = 'drive'").bind(item.id).first<{ remote_id: string }>();
    if (!r) throw e;
    console.warn('vault: read from the Drive copy', item.id);
    return driveGet(env, r.remote_id);
  }
}

/* ---------------- the nightly snapshot of the records ---------------- */
/** base64 in slices (a whole snapshot spread into one call would overflow the stack) */
function toB64(u: Uint8Array) { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }
async function snapshot(env: Env) {
  const [people, items] = await Promise.all([
    env.DB.prepare('SELECT * FROM family_people').all(),
    env.DB.prepare('SELECT * FROM vault_items WHERE deleted_at IS NULL').all(),
  ]);
  // the rows are already sealed (names, titles) or wrapped (keys); the whole snapshot is encrypted once more on top
  const day = new Date().toISOString().slice(0, 10);
  const id = `snapshot-${day}`;
  const plain = new TextEncoder().encode(JSON.stringify({ version: 1, at: Date.now(), people: people.results, items: items.results }));
  const k = await newDataKey(env, id);
  const body = await encryptFile(k.key, plain, id);
  const blob = new TextEncoder().encode(JSON.stringify({ id, dek: k.wrapped, data: toB64(body) }));
  const r2 = store(env, 'r2');
  await r2.put(`_backup/${id}.json`, blob);
  // keep the last two weeks in R2 (the NAS keeps its own history)
  const bucket = env.VAULT || env.MEDIA;
  if (bucket) {
    const list = await bucket.list({ prefix: (env.VAULT ? '' : 'vault/') + '_backup/snapshot-' });
    const old = list.objects.map((o) => o.key).sort().slice(0, -KEEP_SNAPSHOTS);
    for (const key of old) await bucket.delete(key);
  }
  if (await getState(env, 'drive_email')) await drivePut(env, `${id}.json`, blob);
  await setState(env, 'last_snapshot', String(Date.now()));
  return id;
}

/** The nightly job: copies that are missing, then the snapshot. Also run by hand from the vault's backups panel. */
export async function nightly(env: Env) {
  const out = { copied: 0, failed: 0, snapshot: '' };
  if (await getState(env, 'drive_email')) {
    const { results } = await env.DB.prepare(`SELECT id, store, object_key FROM vault_items i WHERE deleted_at IS NULL AND object_key IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM vault_replicas r WHERE r.item_id = i.id AND r.target = 'drive') LIMIT 40`).all<{ id: string; store: string; object_key: string }>();
    for (const it of results) {
      try { if (await replicate(env, it)) out.copied++; } catch (e) { out.failed++; console.error('vault backup', it.id, e instanceof Error ? e.message : e); }
    }
  }
  out.snapshot = await snapshot(env);
  await setState(env, 'last_run', JSON.stringify({ at: Date.now(), ...out }));
  return out;
}

export async function backupStatus(env: Env) {
  const [email, last, snap, counts] = await Promise.all([
    getState(env, 'drive_email'), getState(env, 'last_run'), getState(env, 'last_snapshot'),
    env.DB.prepare(`SELECT (SELECT COUNT(*) FROM vault_items WHERE deleted_at IS NULL AND object_key IS NOT NULL) AS files,
      (SELECT COUNT(*) FROM vault_replicas WHERE target = 'drive') AS onDrive`).first<{ files: number; onDrive: number }>(),
  ]);
  return { drive: { email, files: counts?.files || 0, copies: counts?.onDrive || 0 }, lastRun: last ? JSON.parse(last) : null, lastSnapshot: snap ? Number(snap) : null };
}
