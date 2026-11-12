// Tests for the vault's cryptography and passkey checks, with a simulated authenticator (real keys, real signatures).
//   npx esbuild server/vault/test-entry.ts ... is done by this script itself:  node tools/test-vault.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'vault-test-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, `export * from ${JSON.stringify(join(process.cwd(), 'server/vault/webauthn.ts'))};\nexport * as vcrypto from ${JSON.stringify(join(process.cwd(), 'server/vault/crypto.ts'))};\n`);
const out = join(dir, 'bundle.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), entry, '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const W = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.error('FAIL', name); } };
const throwsCode = async (name, fn, code) => { try { await fn(); fail++; console.error('FAIL (no error)', name); } catch (e) { ok(name + ' → ' + e.message, !code || e.message === code); } };

const enc = new TextEncoder();
const b64url = (u) => Buffer.from(u).toString('base64url');
const sha = async (d) => new Uint8Array(await crypto.subtle.digest('SHA-256', typeof d === 'string' ? enc.encode(d) : d));
/* a tiny CBOR writer for the simulated authenticator */
const head = (major, n) => n < 24 ? [major << 5 | n] : n < 256 ? [major << 5 | 24, n] : n < 65536 ? [major << 5 | 25, n >> 8, n & 255] : [major << 5 | 26, (n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const cb = (v) => {
  if (typeof v === 'number') return Uint8Array.from(v >= 0 ? head(0, v) : head(1, -1 - v));
  if (typeof v === 'string') { const b = enc.encode(v); return Uint8Array.from([...head(3, b.length), ...b]); }
  if (v instanceof Uint8Array) return Uint8Array.from([...head(2, v.length), ...v]);
  if (v instanceof Map) { const parts = [Uint8Array.from(head(5, v.size))]; for (const [k, x] of v) parts.push(cb(k), cb(x)); return Uint8Array.from(parts.flatMap((p) => [...p])); }
  throw new Error('cbor');
};
const ORIGIN = 'https://helper.example', RP = 'helper.example';

async function device(alg) {
  const kp = alg === -7
    ? await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    : await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const cose = alg === -7
    ? new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]].map(([k, v]) => [k, v instanceof Buffer ? new Uint8Array(v) : v]))
    : new Map([[1, 3], [3, -257], [-1, new Uint8Array(Buffer.from(jwk.n, 'base64url'))], [-2, new Uint8Array(Buffer.from(jwk.e, 'base64url'))]]);
  const credId = crypto.getRandomValues(new Uint8Array(16));
  let count = 0;
  const authData = async (attested, flags = 0x05) => {
    const parts = [...await sha(RP), (attested ? flags | 0x40 : flags), 0, 0, 0, ++count];
    if (attested) { const c = cb(cose); parts.push(...new Uint8Array(16), 0, 16, ...credId, ...c); }
    return Uint8Array.from(parts);
  };
  const derSig = (raw) => { const int = (b) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.slice(i); if (b[0] & 0x80) b = Uint8Array.from([0, ...b]); return [2, b.length, ...b]; }; const r = int(raw.slice(0, 32)), s = int(raw.slice(32)); return Uint8Array.from([0x30, r.length + s.length, ...r, ...s]); };
  return {
    async register(challenge, origin = ORIGIN) {
      const cd = enc.encode(JSON.stringify({ type: 'webauthn.create', challenge, origin }));
      const att = cb(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', await authData(true)]]));
      return { clientDataJSON: b64url(cd), attestationObject: b64url(att) };
    },
    async sign(challenge, { origin = ORIGIN, flags = 0x05, tamper = false } = {}) {
      const cd = enc.encode(JSON.stringify({ type: 'webauthn.get', challenge, origin }));
      const ad = await authData(false, flags);
      const data = Uint8Array.from([...ad, ...await sha(cd)]);
      let sig = new Uint8Array(alg === -7 ? await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, data) : await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, data));
      if (alg === -7) sig = derSig(sig);
      if (tamper) sig[sig.length - 5] ^= 1;
      return { clientDataJSON: b64url(cd), authenticatorData: b64url(ad), signature: b64url(sig) };
    },
  };
}

for (const alg of [-7, -257]) {
  const d = await device(alg), name = alg === -7 ? 'ES256' : 'RS256';
  const c1 = W.challenge();
  const cred = await W.verifyRegistration(await d.register(c1), c1, ORIGIN, RP);
  ok(`${name} registration`, cred.alg === alg && cred.id.length > 10);
  await throwsCode(`${name} registration from another site`, async () => W.verifyRegistration(await d.register(c1, 'https://evil.example'), c1, ORIGIN, RP), 'passkey_wrong_origin');
  await throwsCode(`${name} registration with another challenge`, async () => W.verifyRegistration(await d.register(c1), W.challenge(), ORIGIN, RP), 'passkey_wrong_challenge');
  const c2 = W.challenge();
  const n = await W.verifyAssertion(await d.sign(c2), { ...cred }, c2, ORIGIN, RP);
  ok(`${name} sign-in`, n > 0);
  const c3 = W.challenge();
  await throwsCode(`${name} forged signature`, async () => W.verifyAssertion(await d.sign(c3, { tamper: true }), { ...cred }, c3, ORIGIN, RP), 'passkey_bad_signature');
  await throwsCode(`${name} without the device lock (no user verification)`, async () => W.verifyAssertion(await d.sign(c3, { flags: 0x01 }), { ...cred }, c3, ORIGIN, RP), 'passkey_not_verified');
  await throwsCode(`${name} a replayed counter`, async () => W.verifyAssertion(await d.sign(c3), { ...cred, signCount: 999 }, c3, ORIGIN, RP), 'passkey_cloned');
  await throwsCode(`${name} for another site`, async () => W.verifyAssertion(await d.sign(c3, { origin: 'https://evil.example' }), { ...cred }, c3, ORIGIN, RP), 'passkey_wrong_origin');
  const other = await device(alg);
  await throwsCode(`${name} another device's key`, async () => W.verifyAssertion(await other.sign(c3), { ...cred }, c3, ORIGIN, RP), 'passkey_bad_signature');
}

/* envelope encryption */
const env = { DEV_MODE: '1' };
const C = W.vcrypto;
const k = await C.newDataKey(env, 'item1');
const file = crypto.getRandomValues(new Uint8Array(5000));
const blob = await C.encryptFile(k.key, file, 'item1');
const k2 = await C.openDataKey(env, k.wrapped, 'item1');
ok('file round trip', Buffer.compare(Buffer.from(await C.decryptFile(k2, blob, 'item1')), Buffer.from(file)) === 0);
await throwsCode('a file moved to another record', async () => C.decryptFile(k2, blob, 'item2'), 'vault_integrity');
await throwsCode('a data key moved to another record', async () => C.openDataKey(env, k.wrapped, 'item2'), 'vault_integrity');
const flipped = blob.slice(); flipped[40] ^= 1;
await throwsCode('a tampered file', async () => C.decryptFile(k2, flipped, 'item1'), 'vault_integrity');
const s = await C.seal(env, 'דרכון של מישאל', 'item:1:title');
ok('sealed text is not readable', !s.includes('דרכון') && s.startsWith('k1.'));
ok('sealed text opens', (await C.unseal(env, s, 'item:1:title')) === 'דרכון של מישאל');
await throwsCode('sealed text moved to another field', async () => C.unseal(env, s, 'item:2:title'), 'vault_integrity');
await throwsCode('another master key cannot open', async () => C.unseal({ VAULT_KEY: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64') }, s, 'item:1:title'), 'vault_integrity');
await throwsCode('production without VAULT_KEY refuses', async () => C.seal({}, 'x', 'a'), 'vault_not_configured');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
