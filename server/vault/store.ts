// Where the vault's (already encrypted) files live. Every file records its store, so files can live in different places and
// move between them; the rest of the vault never knows which one it is talking to.
//
//   r2     – Cloudflare R2, the default (the VAULT bucket if bound, else MEDIA under vault/)          ← in use
//   drive  – Google Drive: a "Helper vault" folder, through the person's own Google sign-in            ← ready to add
//   nas    – the family NAS, over WebDAV or S3 behind a Cloudflare Tunnel + Access (never an open port) ← ready to add
//
// Only ciphertext ever reaches a store (see crypto.ts), so Drive and the NAS hold copies that are useless without VAULT_KEY.
// That also makes them safe as backups: a scheduled copy of the r2 objects to the NAS is the planned first step (docs/security.md).

import { Env, HttpError } from '../core';

export interface VaultStore {
  readonly name: StoreName;
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}
export type StoreName = 'r2' | 'drive' | 'nas';

class R2Store implements VaultStore {
  readonly name = 'r2' as const;
  constructor(private bucket: R2Bucket, private prefix: string) {}
  async put(key: string, bytes: Uint8Array) {
    await this.bucket.put(this.prefix + key, bytes, { httpMetadata: { contentType: 'application/octet-stream' } });
  }
  async get(key: string) {
    const o = await this.bucket.get(this.prefix + key);
    if (!o) throw new HttpError(404, 'file_missing');
    return new Uint8Array(await o.arrayBuffer());
  }
  async delete(key: string) { await this.bucket.delete(this.prefix + key); }
}

/** Google Drive (planned): files.create in the person's "Helper vault" folder with the drive.file scope, which reaches only
    files the helper itself made. The token comes from googleAccessToken(); the object key is the Drive file id. */
class DriveStore implements VaultStore {
  readonly name = 'drive' as const;
  async put(): Promise<void> { throw new HttpError(501, 'drive_not_connected'); }
  async get(): Promise<Uint8Array> { throw new HttpError(501, 'drive_not_connected'); }
  async delete(): Promise<void> { throw new HttpError(501, 'drive_not_connected'); }
}

/** The family NAS (planned): WebDAV/S3 on the NAS, reachable only through a Cloudflare Tunnel guarded by Cloudflare Access
    with a service token (NAS_URL, NAS_ACCESS_ID, NAS_ACCESS_SECRET as Worker secrets). No port is opened at home. */
class NasStore implements VaultStore {
  readonly name = 'nas' as const;
  async put(): Promise<void> { throw new HttpError(501, 'nas_not_connected'); }
  async get(): Promise<Uint8Array> { throw new HttpError(501, 'nas_not_connected'); }
  async delete(): Promise<void> { throw new HttpError(501, 'nas_not_connected'); }
}

export function store(env: Env, name: StoreName = 'r2'): VaultStore {
  if (name === 'drive') return new DriveStore();
  if (name === 'nas') return new NasStore();
  const bucket = env.VAULT || env.MEDIA;
  if (!bucket) throw new HttpError(503, 'vault_storage_missing');
  return new R2Store(bucket, env.VAULT ? '' : 'vault/');
}
/** Where new files go. */
export const defaultStore = (env: Env) => store(env, (env.VAULT_STORE as StoreName) || 'r2');
