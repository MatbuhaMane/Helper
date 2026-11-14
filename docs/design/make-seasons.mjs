// The tree's seasons (vision batch 18): small seamless tiles in the tent's look, one warm ink outline and flat fills.
//   <season>-dress.svg  the crown's seasonal dress, masked by the crown itself in tree.css (autumn leaves, snow, blossom)
//   <season>-fall.svg   a sparse tile of what falls, moved down by transform only (leaves, snowflakes, petals)
//   leaf-empty.svg      the leaf of a person with no record: a pale leaf with a dashed outline
// Run: node docs/design/make-seasons.mjs   (writes public/assets/tree/season/ and public/assets/tree/leaf-empty.svg)
import { mkdirSync, writeFileSync } from 'node:fs';

const INK = '#2a1c12';
const OUT = 'public/assets/tree/season';
mkdirSync(OUT, { recursive: true });

let seed = 18;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const svg = (body, box = '0 0 200 200') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${body.replace(/\d+\.\d{2,}/g, (m) => Math.round(m * 10) / 10)}</svg>\n`;
const f = (n) => Math.round(n * 10) / 10;

/** n points, kept `m` from the tile's edges (so nothing is cut where the tile repeats) and `gap` apart */
function places(n, m, gap) {
  const out = [];
  for (let tries = 0; out.length < n && tries < 4000; tries++) {
    const p = [m + rnd() * (200 - 2 * m), m + rnd() * (200 - 2 * m)];
    if (out.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > gap)) out.push(p);
  }
  return out;
}

// shapes, drawn round 0,0 and placed with a transform
const leaf = (fill, vein, s) => `<path d="M0 -${9 * s}C${6 * s} -${6 * s} ${7 * s} ${3 * s} 0 ${9 * s}C-${7 * s} ${3 * s} -${6 * s} -${6 * s} 0 -${9 * s}Z" fill="${fill}" stroke="${INK}" stroke-width="${f(1.4 * s)}" stroke-linejoin="round"/><path d="M0 -${6 * s}V${7 * s}" stroke="${vein}" stroke-width="${f(1 * s)}" stroke-linecap="round"/>`;
const blossom = (fill, heart, s) => {
  const petals = [0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-${4.2 * s}" rx="${3.4 * s}" ry="${4.4 * s}" transform="rotate(${a})"/>`).join('');
  return `<g fill="${fill}" stroke="${INK}" stroke-width="${f(1.1 * s)}">${petals}</g><circle r="${2 * s}" fill="${heart}"/>`;
};
const snowClump = (s) => `<path d="M-${8 * s} ${2 * s}C-${8 * s} -${3 * s} -${3 * s} -${5 * s} 0 -${3 * s}C${3 * s} -${6 * s} ${9 * s} -${3 * s} ${8 * s} ${2 * s}C${8 * s} ${5 * s} -${8 * s} ${5 * s} -${8 * s} ${2 * s}Z" fill="#fbfdff" stroke="#9fb3c8" stroke-width="${f(1.2 * s)}"/>`;
const flake = (s) => `<g stroke="#ffffff" stroke-width="${f(1.8 * s)}" stroke-linecap="round"><path d="M0 -${5 * s}V${5 * s}M-${4.3 * s} -${2.5 * s}L${4.3 * s} ${2.5 * s}M-${4.3 * s} ${2.5 * s}L${4.3 * s} -${2.5 * s}"/></g><circle r="${1.4 * s}" fill="#ffffff" stroke="#9fb3c8" stroke-width=".8"/>`;
const petal = (fill, s) => `<ellipse rx="${3 * s}" ry="${4.6 * s}" fill="${fill}" stroke="${INK}" stroke-width="${f(1 * s)}"/>`;
const at = ([x, y], r, body) => `<g transform="translate(${f(x)} ${f(y)}) rotate(${Math.round(r)})">${body}</g>`;

// autumn: amber, rust and gold leaves over the crown; a few leaves drift down
const AUT = [['#d98b2b', '#9a5a17'], ['#c2552e', '#83341a'], ['#e6b43c', '#a7791c'], ['#b8742f', '#7d4c1b']];
writeFileSync(`${OUT}/autumn-dress.svg`, svg(places(30, 12, 22).map((p) => { const [c, v] = pick(AUT); return at(p, rnd() * 360, leaf(c, v, 1 + rnd() * .35)); }).join('')));
writeFileSync(`${OUT}/autumn-fall.svg`, svg(places(2, 22, 90).map((p) => { const [c, v] = pick(AUT); return at(p, rnd() * 360, leaf(c, v, 1.15)); }).join('')));
// winter: snow resting on the crown in soft clumps; small flakes falling
writeFileSync(`${OUT}/winter-dress.svg`, svg(places(24, 12, 26).map((p) => at(p, rnd() * 30 - 15, snowClump(1 + rnd() * .4))).join('')));
writeFileSync(`${OUT}/winter-fall.svg`, svg(places(4, 12, 70).map((p) => at(p, rnd() * 60, flake(.8 + rnd() * .5))).join('')));
// spring: pink and white blossom over the crown; a few petals drift
const SPR = [['#f4b9c4', '#e9c46a'], ['#fbf3ef', '#e9c46a'], ['#eea3b4', '#f2d27a']];
writeFileSync(`${OUT}/spring-dress.svg`, svg(places(26, 12, 24).map((p) => { const [c, h] = pick(SPR); return at(p, rnd() * 72, blossom(c, h, .9 + rnd() * .35)); }).join('')));
writeFileSync(`${OUT}/spring-fall.svg`, svg(places(2, 16, 90).map((p) => at(p, rnd() * 360, petal(pick(SPR)[0], 1))).join('')));

// the empty leaf: the person's leaf with no colour yet, a dashed outline (a place waiting for someone)
const d = 'M60 132C30 120 8 92 10 62C12 32 34 10 60 6C86 10 108 32 110 62C112 92 90 120 60 132Z';
writeFileSync('public/assets/tree/leaf-empty.svg', svg(`<path d="M60 132q2 10 -6 18" fill="none" stroke="#8a7a62" stroke-width="6" stroke-linecap="round" stroke-dasharray="7 7"/><path d="${d}" fill="#efe8d6" fill-opacity=".72" stroke="#8a7a62" stroke-width="5" stroke-dasharray="11 9" stroke-linejoin="round"/><path d="M60 126C55 100 55 50 60 18" fill="none" stroke="#b9ab90" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="6 8"/>`, '0 0 120 152'));
console.log('seasons written');
