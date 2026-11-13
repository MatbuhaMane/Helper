// Renders the app icon's PNG sizes and tent-favicon.ico from the hand-drawn SVGs in public/assets/icons/.
// Run from the repo root: node docs/design/make-icons.mjs (uses sharp from the project's node_modules).
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/package.json');
const sharp = require('sharp');
const D = 'public/assets/icons/';
const jobs = [['tent.svg', 512, 'tent-icon-512.png'], ['tent.svg', 192, 'tent-icon-192.png'], ['tent.svg', 180, 'tent-icon-180.png'],
  ['tent-small.svg', 48, 'tent-icon-48.png'], ['tent-small.svg', 32, 'tent-icon-32.png'], ['tent-small.svg', 16, 'tent-icon-16.png'],
  ['tent-maskable.svg', 512, 'tent-icon-maskable-512.png'], ['tent-maskable.svg', 192, 'tent-icon-maskable-192.png'], ['tent-maskable.svg', 180, 'apple-touch-icon.png']];
for (const [src, n, out] of jobs) await sharp(D + src, { density: Math.max(72, 72 * n / 512 * 4) }).resize(n, n).png({ compressionLevel: 9 }).toFile(D + out);
// favicon.ico (16 + 32 + 48, PNG inside)
const parts = await Promise.all([16, 32, 48].map((n) => sharp(D + 'tent-small.svg', { density: 300 }).resize(n, n).png().toBuffer()));
const head = Buffer.alloc(6 + 16 * parts.length); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(parts.length, 4);
let off = head.length;
parts.forEach((b, i) => { const n = [16, 32, 48][i], e = 6 + 16 * i; head.writeUInt8(n, e); head.writeUInt8(n, e + 1); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(b.length, e + 8); head.writeUInt32LE(off, e + 12); off += b.length; });
(await import('node:fs')).writeFileSync(D + 'tent-favicon.ico', Buffer.concat([head, ...parts]));
// one contact sheet to look at: every size on light and on dark
const sizes = [512, 192, 48, 32, 16], files = ['tent-icon-512.png', 'tent-icon-192.png', 'tent-icon-48.png', 'tent-icon-32.png', 'tent-icon-16.png'];
console.log('icons ok');
