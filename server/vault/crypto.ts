// The vault's encryption. Envelope encryption, the way cloud key services do it:
//   * every file gets its own random data key (AES-256-GCM); the file is stored only as ciphertext
//   * the data key is stored wrapped (encrypted) by the master key, VAULT_KEY – a Worker secret, never in the database or the repo
//   * names, notes and details are sealed the same way, with a key derived from the master key (HKDF)
//   * every ciphertext is bound to its record (AES-GCM "additional data"), so a sealed value cannot be moved to another row
// Whoever reads the database, the R2 bucket, a Drive copy or a NAS backup sees only ciphertext. Without VAULT_KEY the
// documents cannot be read – so VAULT_KEY must also be kept safe offline (see docs/security.md).
//
// Key versions: each wrapped key and sealed value starts with the version of the master key ("k1."), so the key can be
// rotated: set VAULT_KEY to the new key and VAULT_KEY_OLD to the old one, and everything still opens while it is re-wrapped.

import { Env, HttpError } from '../core';

const enc = new TextEncoder(), dec = new TextDecoder();
export const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const b64url = (u: Uint8Array) => b64(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64url = (s: string) => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));

const DEV_KEY = 'aGVscGVyLWRldmVsb3BtZW50LXZhdWx0LWtleS0zMmI='; // development only (DEV_MODE=1): not a secret
const VERSION = 'k1';

function rawKey(env: Env, version: string): Uint8Array {
  const v = version === VERSION ? env.VAULT_KEY : env.VAULT_KEY_OLD;
  const s = v || (env.DEV_MODE === '1' ? DEV_KEY : '');
  if (!s) throw new HttpError(503, 'vault_not_configured');
  const k = unb64(s);
  if (k.length < 32) throw new HttpError(503, 'vault_key_too_short');
  return k.slice(0, 32);
}

const cache = new Map<string, CryptoKey>();
async function kek(env: Env, version: string, use: 'wrap' | 'meta'): Promise<CryptoKey> {
  const raw = rawKey(env, version);                  // checked every time: no key, no vault (even with a key in the cache)
  const src = (version === VERSION ? env.VAULT_KEY : env.VAULT_KEY_OLD) ? 'secret' : 'dev';
  const id = `${version}:${use}:${src}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('helper-vault'), info: enc.encode(use) },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  cache.set(id, key);
  return key;
}

async function gcm(key: CryptoKey, data: Uint8Array, aad: string): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, data));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return out;
}
async function ungcm(key: CryptoKey, blob: Uint8Array, aad: string): Promise<Uint8Array> {
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.slice(0, 12), additionalData: enc.encode(aad) }, key, blob.slice(12)));
  } catch {
    throw new HttpError(500, 'vault_integrity');   // tampered with, moved, or the wrong key
  }
}
const split = (s: string) => { const i = s.indexOf('.'); return i > 0 ? [s.slice(0, i), s.slice(i + 1)] : [VERSION, s]; };

/** A new data key for one file: the key itself (to encrypt with now) and its wrapped form (to store). */
export async function newDataKey(env: Env, aad: string): Promise<{ key: CryptoKey; wrapped: string }> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const wrapped = VERSION + '.' + b64(await gcm(await kek(env, VERSION, 'wrap'), raw, 'dek:' + aad));
  raw.fill(0);
  return { key, wrapped };
}
export async function openDataKey(env: Env, wrapped: string, aad: string): Promise<CryptoKey> {
  const [v, body] = split(wrapped);
  const raw = await ungcm(await kek(env, v, 'wrap'), unb64(body), 'dek:' + aad);
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  raw.fill(0);
  return key;
}

/** A file: encrypted with its data key, bound to its record. */
export const encryptFile = (key: CryptoKey, data: Uint8Array, aad: string) => gcm(key, data, 'file:' + aad);
export const decryptFile = (key: CryptoKey, blob: Uint8Array, aad: string) => ungcm(key, blob, 'file:' + aad);

/** A short text (a name, a title, details as JSON): sealed with the metadata key, bound to "table:id:field". */
export async function seal(env: Env, text: string | null | undefined, aad: string): Promise<string | null> {
  if (text == null || text === '') return null;
  return VERSION + '.' + b64(await gcm(await kek(env, VERSION, 'meta'), enc.encode(text), 'meta:' + aad));
}
export async function unseal(env: Env, sealed: string | null | undefined, aad: string): Promise<string> {
  if (!sealed) return '';
  const [v, body] = split(sealed);
  return dec.decode(await ungcm(await kek(env, v, 'meta'), unb64(body), 'meta:' + aad));
}

/** A one-way, keyed fingerprint (for the audit log's IP addresses: comparable, but not readable). */
export async function fingerprint(env: Env, s: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', rawKey(env, VERSION), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode('fp:' + s)))).slice(0, 16);
}
