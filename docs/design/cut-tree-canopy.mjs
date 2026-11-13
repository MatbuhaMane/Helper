// The second family tree, "canopy" (עץ ב'): cut from the owner's Gemini drawing into our layer set.
//   node docs/design/cut-tree-canopy.mjs        (from the repo root; needs sharp, already a dev dependency)
// Source: docs/design/source/tree-canopy-gemini.jpg (the owner's image 4: crown, trunk, bare upper and lower boughs, on white).
// Output, in /assets/tree/canopy/: ground.webp, boughs.webp, trunk.webp, crown.webp (one 1000 x 1500 box, drawn at 1.4x).
//   - Alpha: the white is taken out; the edge pixels are un-multiplied from white, so no white fringe on a dark page.
//   - A thin warm rim (cream, crisp, no blur) round the whole silhouette: lost on the light page, a warm outline at night.
//   - The layers overlap where they meet (the trunk runs up under the crown, the boughs a little under it), so the sway
//     never opens a gap; at rest the stack is the drawing itself.
//   - The small leafy twigs (after the owner's references 6/7) are drawn here and baked into the boughs: they carry the low
//     tier's people out to the sides, where the bare lower boughs stop.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = 'docs/design/source/tree-canopy-gemini.jpg', OUT = 'public/assets/tree/canopy';
const BOX = [1000, 1500], K = 1.4;                  // box units → output px
const S = 0.7, OX = 22.6, OY = 150, SX0 = 466, SY0 = 27;   // source px → box units: b = O + (s - S0) * S
const toBox = (sx, sy) => [OX + (sx - SX0) * S, OY + (sy - SY0) * S];
const W = Math.round(BOX[0] * K), H = Math.round(BOX[1] * K);

const { data: src, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const SW = info.width, SH = info.height;

// 1. background: near-white and neutral; small white islands inside the drawing are highlights, not sky
const bg = new Uint8Array(SW * SH);
for (let i = 0; i < SW * SH; i++) { const r = src[i * 3], g = src[i * 3 + 1], b = src[i * 3 + 2], mn = Math.min(r, g, b), mx = Math.max(r, g, b); bg[i] = mn >= 236 && mx - mn < 16 ? 1 : 0; }
function components(mask, val) {   // label 4-connected components of mask == val; returns [labels, sizes]
  const lab = new Int32Array(SW * SH).fill(-1), sizes = [], st = [];
  for (let s = 0; s < SW * SH; s++) { if (mask[s] !== val || lab[s] >= 0) continue; const id = sizes.length; let n = 0; lab[s] = id; st.push(s);
    while (st.length) { const p = st.pop(); n++; const x = p % SW, y = (p - x) / SW;
      for (const q of [x > 0 ? p - 1 : -1, x < SW - 1 ? p + 1 : -1, y > 0 ? p - SW : -1, y < SH - 1 ? p + SW : -1]) if (q >= 0 && mask[q] === val && lab[q] < 0) { lab[q] = id; st.push(q); } }
    sizes.push(n); }
  return [lab, sizes];
}
{ const [lab, sizes] = components(bg, 1); for (let i = 0; i < SW * SH; i++) if (bg[i] && sizes[lab[i]] < 40) bg[i] = 0; }
// 2. the drawing: keep its real pieces, drop JPEG specks and strays far from the tree
const fg = new Uint8Array(SW * SH); for (let i = 0; i < SW * SH; i++) fg[i] = bg[i] ? 0 : 1;
{ const [lab, sizes] = components(fg, 1); const keep = sizes.map((n) => n >= 150);
  for (let i = 0; i < SW * SH; i++) if (fg[i] && !keep[lab[i]]) fg[i] = 0;
  console.log('pieces kept', sizes.filter((n) => n >= 150).sort((a, b) => b - a).join(' '), '| dropped', sizes.filter((n) => n < 150).length); }
// distance (chamfer) from the drawing, outward, for the edge alpha and the rim
const DIST = new Float32Array(SW * SH);
{ for (let i = 0; i < SW * SH; i++) DIST[i] = fg[i] ? 0 : 1e6;
  for (let y = 1; y < SH - 1; y++) for (let x = 1; x < SW - 1; x++) { const i = y * SW + x; DIST[i] = Math.min(DIST[i], DIST[i - 1] + 1, DIST[i - SW] + 1, DIST[i - SW - 1] + 1.414, DIST[i - SW + 1] + 1.414); }
  for (let y = SH - 2; y > 0; y--) for (let x = SW - 2; x > 0; x--) { const i = y * SW + x; DIST[i] = Math.min(DIST[i], DIST[i + 1] + 1, DIST[i + SW] + 1, DIST[i + SW + 1] + 1.414, DIST[i + SW - 1] + 1.414); } }
const nearBg = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < SW && yy < SH && !fg[yy * SW + xx]) return true; } return false; };
// 3. the full RGBA in source px: edge pixels un-multiplied from white; the rim outside
const RIM = [241, 223, 189], RIM_W = 2.6;
const full = Buffer.alloc(SW * SH * 4);
for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
  const i = y * SW + x, o = i * 4; let r = src[i * 3], g = src[i * 3 + 1], b = src[i * 3 + 2];
  if (fg[i]) {
    let a = 1;
    if (nearBg(x, y)) { a = Math.min(1, Math.max(0.08, (255 - Math.min(r, g, b)) / 215)); r = 255 - (255 - r) / a; g = 255 - (255 - g) / a; b = 255 - (255 - b) / a; }
    // under the rim's edge pixels stay solid colour over the rim (premultiply-free composite by hand)
    const ra = DIST[i] === 0 && a < 1 ? 1 : 0;
    if (ra) { r = r * a + RIM[0] * (1 - a); g = g * a + RIM[1] * (1 - a); b = b * a + RIM[2] * (1 - a); a = 1; }
    full[o] = Math.max(0, Math.min(255, r)); full[o + 1] = Math.max(0, Math.min(255, g)); full[o + 2] = Math.max(0, Math.min(255, b)); full[o + 3] = Math.round(a * 255);
  } else if (DIST[i] <= RIM_W + 1) {
    const a = Math.max(0, Math.min(1, RIM_W + 0.5 - DIST[i])) * 0.92;
    full[o] = RIM[0]; full[o + 1] = RIM[1]; full[o + 2] = RIM[2]; full[o + 3] = Math.round(a * 255);
  }
}

// 4. the regions, in source px (from the grid over the image)
const crownCut = (x) => (x < 650 ? 405 : 445);                     // under it: the canopy and the branches in it
const lerpPoly = (pts, y) => { if (y <= pts[0][0]) return pts[0].slice(1); for (let k = 1; k < pts.length; k++) if (y <= pts[k][0]) { const [y0, a0, b0] = pts[k - 1], [y1, a1, b1] = pts[k], t = (y - y0) / (y1 - y0); return [a0 + (a1 - a0) * t, b0 + (b1 - b0) * t]; } return pts.at(-1).slice(1); };
const TRUNK = [[300, 900, 1380], [470, 960, 1320], [560, 1010, 1250], [650, 1050, 1200], [800, 1060, 1200], [900, 1040, 1230], [960, 1000, 1300]];
const inTrunk = (x, y) => { if (y < 300 || y > 965) return false; const [a, b] = lerpPoly(TRUNK, y); return x >= a && x <= b; };
const REGION = {
  crown: (x, y) => y < crownCut(x),
  trunk: (x, y) => inTrunk(x, y),
  boughs: (x, y) => y >= crownCut(x) - 24 && y < 958 && !inTrunk(x, y),
  ground: (x, y) => y >= 935,
};

// 5. the twigs: small leafy sprigs at the ends of the lower boughs, out to the sides (box units), in the drawing's manner
function twig(x0, y0, x1, y1, bend, leaves) {
  const mx = (x0 + x1) / 2 + bend[0], my = (y0 + y1) / 2 + bend[1];
  const at = (t) => [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * mx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * my + t * t * y1];
  const tan = (t) => [2 * (1 - t) * (mx - x0) + 2 * t * (x1 - mx), 2 * (1 - t) * (my - y0) + 2 * t * (y1 - my)];
  // the stem tapers from the bough (about the bough tip's width) to a point: an outline pass, then the bark
  const N = 10, seg = (w, c) => Array.from({ length: N }, (_, k) => { const [ax, ay] = at(k / N), [bx, by] = at((k + 1) / N);
    return `<path d="M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}" stroke="${c}" stroke-width="${w(k / N).toFixed(1)}" stroke-linecap="round"/>`; }).join('');
  let s = seg((t) => 12 - 8 * t, '#1d130c') + seg((t) => 7.5 - 6 * t, '#7a5536') + seg((t) => 2.2 - 1.6 * t, '#9b7350');
  for (let k = 0; k < leaves; k++) {
    const t = 0.22 + 0.78 * (k / Math.max(1, leaves - 1)), [px, py] = at(t), [tx, ty] = tan(t), ang = Math.atan2(ty, tx) * 180 / Math.PI, side = k % 2 ? 1 : -1;
    const L = k === leaves - 1 ? 30 : 24 + 6 * Math.sin(k * 2.1), rot = k === leaves - 1 ? ang : ang + side * (42 + 12 * Math.cos(k)), fill = k % 3 === 1 ? '#5f7d33' : '#71903f';
    s += `<g transform="translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${rot.toFixed(1)})"><path d="M0 0C${L * .28} ${-L * .44} ${L * .76} ${-L * .42} ${L} 0C${L * .76} ${L * .42} ${L * .28} ${L * .44} 0 0Z" fill="${fill}" stroke="#1d130c" stroke-width="2.6" stroke-linejoin="round"/><path d="M${L * .1} 0Q${L * .5} ${-L * .06} ${L * .84} 0" fill="none" stroke="#45602a" stroke-width="1.5"/><path d="M${L * .2} ${-L * .14}Q${L * .45} ${-L * .3} ${L * .62} ${-L * .2}" fill="none" stroke="#a9c06a" stroke-width="1.6" stroke-linecap="round" opacity=".7"/></g>`;
  }
  return s;
}
// from the bough tips (measured in the source, a few px inside them) → box out to the sides; the mid tier hangs from the lower two
const T = (sx, sy) => toBox(sx, sy).map((v) => +v.toFixed(1));
const TWIGS = [
  [...T(817, 766), ...T(640, 800), [-30, 22], 8],      // left lower bough, out to the left
  [...T(828, 620), ...T(700, 594), [-4, 6], 6],       // its upper prong
  [...T(1451, 874), ...T(1652, 800), [8, 26], 8],     // right lower bough's low arm, out to the right
  [...T(1476, 628), ...T(1610, 600), [6, -6], 6],     // its upper prong
];
const twigSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${BOX[0]} ${BOX[1]}"><defs><filter id="rim" x="-5%" y="-5%" width="110%" height="110%"><feMorphology in="SourceAlpha" operator="dilate" radius="${(RIM_W * S).toFixed(2)}" result="d"/><feFlood flood-color="rgb(${RIM})" flood-opacity=".92"/><feComposite in2="d" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g filter="url(#rim)">${TWIGS.map((t) => twig(...t)).join('')}</g></svg>`;
// the ground: a soft patch of earth under the roots (no outline, so no halo at night)
const groundSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${BOX[0]} ${BOX[1]}"><defs><radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#2e2014" stop-opacity=".34"/><stop offset=".7" stop-color="#3a2a1a" stop-opacity=".14"/><stop offset="1" stop-color="#3a2a1a" stop-opacity="0"/></radialGradient></defs><ellipse cx="500" cy="1120" rx="490" ry="165" fill="url(#g)"/></svg>`;

// 6. each layer: the regions' pixels, placed in the box
mkdirSync(OUT, { recursive: true });
const cw = Math.round(SW * S * K), ch = Math.round(SH * S * K), left = Math.round((OX - SX0 * S) * K), top = Math.round((OY - SY0 * S) * K);
for (const name of ['ground', 'boughs', 'trunk', 'crown']) {
  const buf = Buffer.alloc(SW * SH * 4); const keep = REGION[name];
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) if (keep(x, y)) { const o = (y * SW + x) * 4; full.copy(buf, o, o, o + 4); }
  const scaled = await sharp(buf, { raw: { width: SW, height: SH, channels: 4 } }).resize(cw, ch, { kernel: 'lanczos3' }).png().toBuffer();
  // place the scaled drawing in the box (cropping what falls outside)
  const ex = { left: Math.max(0, -left), top: Math.max(0, -top) }; ex.width = Math.min(cw - ex.left, W - Math.max(0, left)); ex.height = Math.min(ch - ex.top, H - Math.max(0, top));
  const piece = await sharp(scaled).extract(ex).toBuffer();
  const under = name === 'ground' ? [{ input: Buffer.from(groundSvg), left: 0, top: 0 }] : [];
  const over = name === 'boughs' ? [{ input: Buffer.from(twigSvg), left: 0, top: 0 }] : [];
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([...under, { input: piece, left: Math.max(0, left), top: Math.max(0, top) }, ...over])
    .webp({ quality: 84, alphaQuality: 90, effort: 6 }).toFile(`${OUT}/${name}.webp`);
  console.log(name, 'done');
}
// the pivots for slots.json (percent of the box)
const pct = ([x, y]) => [+(x / BOX[0] * 100).toFixed(1), +(y / BOX[1] * 100).toFixed(1)];
console.log('crownPivot', pct(toBox(1120, 440)), 'trunkPivot', pct(toBox(1150, 1000)), 'twig ends', TWIGS.map((t) => pct([t[2], t[3]])));
