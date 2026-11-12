// Passkeys (WebAuthn) without outside packages: the device's own lock – fingerprint, Face ID, Windows Hello, the phone's PIN –
// proves it is the person, and the private key never leaves the device. We keep only the public key.
// Supported: ES256 (most phones and Macs) and RS256 (Windows Hello). Registration uses "none" attestation (no device
// certificates are needed: the person registering has just signed in with Google, freshly).

import { HttpError } from '../core';
import { b64url, unb64url } from './crypto';

/* ---------- a small CBOR reader (enough for attestation objects and COSE keys) ---------- */
function cbor(buf: Uint8Array): any {
  let p = 0;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const len = (info: number): number => {
    if (info < 24) return info;
    if (info === 24) return buf[p++];
    if (info === 25) { const v = dv.getUint16(p); p += 2; return v; }
    if (info === 26) { const v = dv.getUint32(p); p += 4; return v; }
    if (info === 27) { const v = Number(dv.getBigUint64(p)); p += 8; return v; }
    throw new HttpError(400, 'cbor_unsupported');
  };
  const item = (): any => {
    if (p >= buf.length) throw new HttpError(400, 'cbor_truncated');
    const b = buf[p++], major = b >> 5, info = b & 31;
    switch (major) {
      case 0: return len(info);
      case 1: return -1 - len(info);
      case 2: { const n = len(info); const v = buf.slice(p, p + n); p += n; return v; }
      case 3: { const n = len(info); const v = new TextDecoder().decode(buf.slice(p, p + n)); p += n; return v; }
      case 4: { const n = len(info); return Array.from({ length: n }, item); }
      case 5: { const n = len(info); const m = new Map(); for (let i = 0; i < n; i++) { const k = item(); m.set(k, item()); } return m; }
      case 7: return info === 20 ? false : info === 21 ? true : null;
      default: throw new HttpError(400, 'cbor_unsupported');
    }
  };
  const v = item();
  return Object.assign(v instanceof Map ? v : { value: v }, { __end: p });
}

/* ---------- authenticator data ---------- */
interface AuthData { rpIdHash: Uint8Array; flags: number; signCount: number; credId?: Uint8Array; cose?: Map<number, any> }
function authData(a: Uint8Array): AuthData {
  if (a.length < 37) throw new HttpError(400, 'bad_authenticator_data');
  const dv = new DataView(a.buffer, a.byteOffset, a.byteLength);
  const out: AuthData = { rpIdHash: a.slice(0, 32), flags: a[32], signCount: dv.getUint32(33) };
  if (out.flags & 0x40) {                         // attested credential data follows
    const n = dv.getUint16(53);
    out.credId = a.slice(55, 55 + n);
    out.cose = cbor(a.slice(55 + n)) as Map<number, any>;
  }
  return out;
}

const sha256 = async (d: Uint8Array | string) => new Uint8Array(await crypto.subtle.digest('SHA-256', typeof d === 'string' ? new TextEncoder().encode(d) : d));
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The public key as a JWK, from its COSE form. */
function coseToJwk(c: Map<number, any>): { alg: number; jwk: JsonWebKey } {
  const kty = c.get(1), alg = c.get(3);
  if (kty === 2 && alg === -7 && c.get(-1) === 1) return { alg, jwk: { kty: 'EC', crv: 'P-256', x: b64url(c.get(-2)), y: b64url(c.get(-3)), ext: true } };
  if (kty === 3 && alg === -257) return { alg, jwk: { kty: 'RSA', n: b64url(c.get(-1)), e: b64url(c.get(-2)), alg: 'RS256', ext: true } };
  throw new HttpError(400, 'passkey_algorithm_not_supported');
}

/** WebAuthn ECDSA signatures are DER; WebCrypto wants r||s. */
function derToRaw(der: Uint8Array): Uint8Array {
  let p = 2;
  if (der[1] & 0x80) p += der[1] & 0x7f;
  const read = () => { p++; const n = der[p++]; let v = der.slice(p, p + n); p += n; while (v.length > 32 && v[0] === 0) v = v.slice(1); const o = new Uint8Array(32); o.set(v, 32 - v.length); return o; };
  const r = read(), s = read();
  const out = new Uint8Array(64); out.set(r); out.set(s, 32);
  return out;
}

function checkClient(clientDataJSON: Uint8Array, type: string, challenge: string, origin: string) {
  const c = JSON.parse(new TextDecoder().decode(clientDataJSON));
  if (c.type !== type) throw new HttpError(400, 'passkey_wrong_type');
  if (c.challenge !== challenge) throw new HttpError(400, 'passkey_wrong_challenge');
  if (c.origin !== origin) throw new HttpError(400, 'passkey_wrong_origin');
}

/** Registration: checks the browser's answer and returns the credential to keep. */
export async function verifyRegistration(r: { clientDataJSON: string; attestationObject: string }, challenge: string, origin: string, rpId: string) {
  const cd = unb64url(r.clientDataJSON);
  checkClient(cd, 'webauthn.create', challenge, origin);
  const att = cbor(unb64url(r.attestationObject)) as Map<string, any>;
  const ad = authData(att.get('authData'));
  if (!same(ad.rpIdHash, await sha256(rpId))) throw new HttpError(400, 'passkey_wrong_site');
  if (!(ad.flags & 0x01)) throw new HttpError(400, 'passkey_no_presence');
  if (!(ad.flags & 0x04)) throw new HttpError(400, 'passkey_not_verified');   // the device lock (fingerprint, face, PIN) must be used
  if (!ad.credId || !ad.cose) throw new HttpError(400, 'passkey_no_credential');
  const { alg, jwk } = coseToJwk(ad.cose);
  return { id: b64url(ad.credId), alg, jwk, signCount: ad.signCount };
}

/** Sign-in with a passkey: checks the signature with the kept public key; returns the new signature counter. */
export async function verifyAssertion(
  r: { clientDataJSON: string; authenticatorData: string; signature: string },
  cred: { alg: number; jwk: JsonWebKey; signCount: number }, challenge: string, origin: string, rpId: string,
) {
  const cd = unb64url(r.clientDataJSON), adRaw = unb64url(r.authenticatorData);
  checkClient(cd, 'webauthn.get', challenge, origin);
  const ad = authData(adRaw);
  if (!same(ad.rpIdHash, await sha256(rpId))) throw new HttpError(400, 'passkey_wrong_site');
  if (!(ad.flags & 0x01) || !(ad.flags & 0x04)) throw new HttpError(401, 'passkey_not_verified');
  const signed = new Uint8Array(adRaw.length + 32);
  signed.set(adRaw); signed.set(await sha256(cd), adRaw.length);
  let ok = false;
  if (cred.alg === -7) {
    const key = await crypto.subtle.importKey('jwk', cred.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(unb64url(r.signature)), signed);
  } else if (cred.alg === -257) {
    const key = await crypto.subtle.importKey('jwk', cred.jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64url(r.signature), signed);
  }
  if (!ok) throw new HttpError(401, 'passkey_bad_signature');
  // a counter that goes backwards means a cloned key (counters of 0 are allowed: synced passkeys don't count)
  if (ad.signCount && cred.signCount && ad.signCount <= cred.signCount) throw new HttpError(401, 'passkey_cloned');
  return ad.signCount;
}

export const challenge = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
