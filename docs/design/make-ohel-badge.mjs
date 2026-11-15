// The notification badge: the tent mark in pure white on transparent, 96x96 (Android draws only the non-transparent pixels).
// node docs/design/make-ohel-badge.mjs  (uses sharp from the project's node_modules)
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/package.json');
const sharp = require('sharp');
// a bold tent: one filled triangle with a flap opening cut out (even-odd), a pole on top; nothing thin
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path fill="#fff" fill-rule="evenodd" d="M48 12 L88 82 H8 Z M48 46 L62 82 H34 Z"/><rect x="44" y="5" width="8" height="14" rx="4" fill="#fff"/></svg>`;
await sharp(Buffer.from(svg), { density: 288 }).resize(96, 96).png({ compressionLevel: 9 }).toFile('public/assets/icons/ohel-badge-96.png');
console.log('badge ok');
