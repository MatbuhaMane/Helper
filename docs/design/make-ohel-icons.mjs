// The app icon from the owner's logo (אהל in the old script, docs/design/brand/ohel-logo-inline.svg), 2026-11-13.
// Writes the tile SVGs and renders every size into public/assets/icons/ohel-*. Run from the repo root:
//   node docs/design/make-ohel-icons.mjs [contact-sheet.png]   (uses sharp from the project's node_modules)
// The tile is limestone with the logo in basalt ink, so it reads on a light and on a dark home screen alike.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(process.cwd() + '/package.json');
const sharp = require('sharp');
const D = 'public/assets/icons/';
const d = fs.readFileSync('docs/design/brand/ohel-logo-inline.svg', 'utf8').match(/ d="([^"]+)"/)[1];
const W = 405.4, H = 159.4, CHALK = '#ece6d7', INK = '#2e2a1e';   // a warmer limestone than the page, so the tile holds on a white screen
// one tile: the corner radius (0 = full bleed), the logo's width on the 512 grid, its stroke (thicker for the small sizes)
const tile = ({ rx, w, stroke, edge = 6 }) => {
  const s = w / W, x = (512 - w) / 2, y = (512 - H * s) / 2 + 4;   // a hair below centre: the letters sit on a line
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512"${rx ? ` rx="${rx}"` : ''} fill="${CHALK}"/>${rx ? `<rect x="6" y="6" width="500" height="500" rx="${rx - 6}" fill="none" stroke="${INK}" stroke-opacity=".16" stroke-width="${edge}"/>` : ''}` +
    `<path transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(4)})" fill="${INK}" stroke="${INK}" stroke-width="${stroke}" stroke-linejoin="round" d="${d}"/></svg>\n`;
};
const SRC = {
  'ohel.svg': tile({ rx: 112, w: 404, stroke: 5.71 }),            // "any", 180 px and up
  'ohel-small.svg': tile({ rx: 96, w: 488, stroke: 16, edge: 16 }),         // 48, 32, 16: the logo fills the tile, the strokes thicker
  'ohel-maskable.svg': tile({ rx: 0, w: 356, stroke: 6.5 }),      // full bleed; the logo inside the safe circle (r 40%)
};
for (const [f, svg] of Object.entries(SRC)) fs.writeFileSync(D + f, svg);
const png = (src, n) => sharp(Buffer.from(SRC[src]), { density: Math.max(72, 72 * n / 512 * 4) }).resize(n, n).png({ compressionLevel: 9 });
const jobs = [['ohel.svg', 512, 'ohel-icon-512.png'], ['ohel.svg', 192, 'ohel-icon-192.png'], ['ohel.svg', 180, 'ohel-icon-180.png'],
  ['ohel-small.svg', 48, 'ohel-icon-48.png'], ['ohel-small.svg', 32, 'ohel-icon-32.png'], ['ohel-small.svg', 16, 'ohel-icon-16.png'],
  ['ohel-maskable.svg', 512, 'ohel-icon-maskable-512.png'], ['ohel-maskable.svg', 192, 'ohel-icon-maskable-192.png'],
  ['ohel-maskable.svg', 180, 'ohel-apple-touch-icon.png']];
for (const [src, n, out] of jobs) await png(src, n).toFile(D + out);
// favicon (16 + 32 + 48, PNG inside)
const sz = [16, 32, 48], parts = await Promise.all(sz.map((n) => png('ohel-small.svg', n).toBuffer()));
const head = Buffer.alloc(6 + 16 * parts.length); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(parts.length, 4);
let off = head.length;
parts.forEach((b, i) => { const e = 6 + 16 * i; head.writeUInt8(sz[i], e); head.writeUInt8(sz[i], e + 1); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(b.length, e + 8); head.writeUInt32LE(off, e + 12); off += b.length; });
fs.writeFileSync(D + 'ohel-favicon.ico', Buffer.concat([head, ...parts]));
// a contact sheet to look at (optional): each size on a light and on a dark ground, the maskable cut to a circle
const sheet = process.argv[2];
if (sheet) {
  const row = [['ohel-icon-512.png', 160], ['ohel-icon-192.png', 96], ['ohel-icon-maskable-512.png', 160, true], ['ohel-icon-48.png', 48], ['ohel-icon-32.png', 32], ['ohel-icon-16.png', 16]];
  const comp = [];
  for (const [y, bg] of [[0, '#f4f1ea'], [200, '#070b14']]) {
    comp.push({ input: { create: { width: 760, height: 200, channels: 4, background: bg } }, left: 0, top: y });
    let x = 20;
    for (const [f, n, round] of row) {
      let img = sharp(D + f).resize(n, n);
      if (round) img = img.composite([{ input: Buffer.from(`<svg width="${n}" height="${n}"><circle cx="${n / 2}" cy="${n / 2}" r="${n / 2}"/></svg>`), blend: 'dest-in' }]);
      comp.push({ input: await img.png().toBuffer(), left: x, top: y + 100 - Math.round(n / 2) }); x += n + 24;
    }
  }
  await sharp({ create: { width: 760, height: 400, channels: 4, background: '#fff' } }).composite(comp).png().toFile(sheet);
}
console.log('ohel icons ok');
