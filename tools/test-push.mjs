// node tools/test-push.mjs — server/push.ts's encryption, decrypted by an independent RFC 8291 implementation (node:crypto)
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';

const dir = mkdtempSync(join(tmpdir(), 'push-'));
const out = join(dir, 'push.mjs');
execSync(`npx esbuild server/push.ts --bundle --format=esm --platform=neutral --outfile="${out}" --log-level=error`);
const { encrypt } = await import('file://' + out.replace(/\\/g, '/'));
rmSync(dir, { recursive: true, force: true });

// a browser's subscription
const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
const auth = crypto.randomBytes(16);
const msg = JSON.stringify({ title: 'חירום', body: 'בדיקה', urgent: true });
const b = Buffer.from(await encrypt(ua.getPublicKey().toString('base64url'), auth.toString('base64url'), new TextEncoder().encode(msg)));

// decrypt (RFC 8291 §3.4, RFC 8188)
const salt = b.subarray(0, 16), rs = b.readUInt32BE(16), idlen = b[20], asPub = b.subarray(21, 21 + idlen), ct = b.subarray(21 + idlen);
const hk = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));
const shared = ua.computeSecret(asPub);
const ikm = hk(auth, shared, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub]), 32);
const cek = hk(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
const nonce = hk(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
d.setAuthTag(ct.subarray(ct.length - 16));
const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
const ok = rs === 4096 && idlen === 65 && plain[plain.length - 1] === 2 && plain.subarray(0, -1).toString() === msg;
console.log(ok ? 'push: 1 passed' : 'push: FAILED');
process.exit(ok ? 0 : 1);
