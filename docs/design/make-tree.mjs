// The family tree's drawn layers (vision: docs/vision/tree.md, spec 1). Run from the repo root: node docs/design/make-tree.mjs
// Writes public/assets/tree/<kind>/{ground,boughs,trunk,crown}.svg + slots.json, and the shared pieces in public/assets/tree/.
// Every layer of a kind shares one 1000 x 1800 box, so they stack exactly and each can move on its own (the crown sways from
// the trunk's top, the boughs from the trunk). Drawn in the tent's style: an even dark ink outline, flat warm earth colours,
// hand-drawn wobble baked into the geometry (no SVG filters, so the layers stay cheap to move on a phone).
import { mkdirSync, writeFileSync } from 'node:fs';

const W = 1000, H = 1800, INK = '#2a1c12', OW = 5;
const OUT = 'public/assets/tree';

// ---------- tiny geometry kit ----------
let seed = 1;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rr = (a, b) => a + rnd() * (b - a);
const f = (n) => Math.round(n * 10) / 10;
/** Catmull-Rom through the points → a smooth path (closed or open). */
function smooth(pts, closed = true) {
  const n = pts.length, P = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + (closed ? 'Z' : '');
}
const bez = (p0, p1, p2, p3, t) => { const u = 1 - t; return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]); };
/** A tapered limb along a cubic curve: wide at the start, thin at the end, the edges a little uneven. */
function limb(p0, p1, p2, p3, w0, w1, wob = 0.08, n = 14) {
  const L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = bez(p0, p1, p2, p3, t), q = bez(p0, p1, p2, p3, Math.min(1, t + 0.01)), q0 = bez(p0, p1, p2, p3, Math.max(0, t - 0.01));
    let dx = q[0] - q0[0], dy = q[1] - q0[1]; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
    const w = (w0 + (w1 - w0) * Math.pow(t, 0.8)) / 2 * (1 + rr(-wob, wob));
    L.push([p[0] - dy * w, p[1] + dx * w]); R.push([p[0] + dy * w, p[1] - dx * w]);
  }
  const tip = bez(p0, p1, p2, p3, 1);
  return [...L, tip, ...R.reverse()];
}
/** A lumpy round blob (a leaf cluster, a stone, a mound). */
function blob(cx, cy, rx, ry, n = 11, irr = 0.12, rot = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2, k = 1 + rr(-irr, irr); pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
  return pts;
}
/** Shapes drawn as one union with an even ink outline: the outline pass first, then the fills on top. */
const inked = (shapes, fill, ow = OW) => `<g fill="${INK}" stroke="${INK}" stroke-width="${ow * 2}" stroke-linejoin="round">${shapes.map((s) => `<path d="${s}"/>`).join('')}</g><g fill="${fill}">${shapes.map((s) => `<path d="${s}"/>`).join('')}</g>`;
const svg = (body, defs = '', vb = `0 0 ${W} ${H}`) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
const strokes = (ds, color, w, extra = '') => `<g fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}>${ds.map((d) => `<path d="${d}"/>`).join('')}</g>`;

// ---------- the three kinds of tree ----------
const EARTH = { soil: '#b98b5d', soilDark: '#996b43', soilLight: '#d3a777', grass: '#7d9441', grassDark: '#5d7230', stone: '#d2c5ae', stoneDark: '#a99a82', flower: '#e9c46a', bloom: '#d97a5b' };
const KINDS = {
  // the olive: a gnarled, twisting trunk and a wide silvery crown; the family's oldest tree of the land
  olive: { seed: 11, bark: '#8d6b50', barkDark: '#664b36', barkLight: '#ad8a69', leaf: '#8b9a5c', leafDark: '#64733e', leafLight: '#b3bf86', fruit: '#4b3a4f',
    trunk: { base: 210, top: 120, topY: 760, sway: 46, twist: 0.12 }, crown: { cx: 500, cy: 520, rx: 450, ry: 300, blobs: 26, r: [95, 150] },
    boughs: [[-1, 1290, 410, 1240, 52], [1, 1250, 420, 1185, 50], [-1, 1015, 380, 950, 42], [1, 985, 395, 925, 42]] },
  // the Tabor oak: a straight, broad trunk and a deep round crown
  oak: { seed: 23, bark: '#7b5337', barkDark: '#583a25', barkLight: '#9d6f4a', leaf: '#6f8e3f', leafDark: '#4d6a2a', leafLight: '#97b15d', fruit: '#a8763e',
    trunk: { base: 230, top: 150, topY: 820, sway: 14, twist: 0.04 }, crown: { cx: 500, cy: 500, rx: 420, ry: 360, blobs: 30, r: [100, 160] },
    boughs: [[-1, 1300, 420, 1230, 58], [1, 1300, 420, 1230, 58], [-1, 1040, 400, 975, 48], [1, 1040, 400, 975, 48]] },
  // the acacia of the desert, by the tent: a slim forked trunk and a wide, flat umbrella crown with yellow puffs
  acacia: { seed: 37, bark: '#9b6c46', barkDark: '#714f2f', barkLight: '#bb8c5f', leaf: '#8ea04b', leafDark: '#6a7a33', leafLight: '#b5c16f', fruit: '#efc649',
    trunk: { base: 170, top: 96, topY: 700, sway: 30, twist: 0.08 }, crown: { cx: 500, cy: 470, rx: 490, ry: 190, blobs: 30, r: [80, 120] },
    boughs: [[-1, 1320, 400, 1270, 44], [1, 1280, 410, 1225, 44], [-1, 1050, 410, 990, 38], [1, 1010, 420, 955, 38]] },
};

const GROUND_Y = 1610;   // where the trunk meets the mound

function ground(k) {
  const mound = blob(500, 1720, 500, 150, 16, 0.04, Math.PI);
  let s = inked([smooth(mound)], EARTH.soil);
  // a soft painted shade under the tree and a lighter crest (inside the mound, no outline)
  s += `<path d="${smooth(blob(500, 1650, 300, 44, 12, 0.08))}" fill="${EARTH.soilDark}" opacity=".55"/>`;
  s += `<path d="${smooth(blob(250, 1640, 120, 18, 9, 0.1))}" fill="${EARTH.soilLight}" opacity=".8"/><path d="${smooth(blob(780, 1650, 100, 16, 9, 0.1))}" fill="${EARTH.soilLight}" opacity=".8"/>`;
  // stones
  const stones = [[150, 1700, 34, 22], [205, 1716, 20, 14], [830, 1690, 30, 20], [880, 1712, 18, 13], [640, 1745, 22, 15]];
  s += inked(stones.map(([x, y, a, b]) => smooth(blob(x, y, a, b, 8, 0.1))), EARTH.stone, 4);
  s += strokes(stones.map(([x, y, a]) => `M${x - a * 0.4} ${y - 4}q${a * 0.3} -6 ${a * 0.6} -2`), EARTH.stoneDark, 4);
  // grass tufts along the crest
  const tufts = [[90, 1640], [330, 1600], [420, 1606], [600, 1604], [700, 1612], [930, 1650], [560, 1760], [300, 1740]];
  const blades = tufts.map(([x, y]) => { let d = `M${x - 28} ${y + 6}`; for (let i = 0; i < 5; i++) { const bx = x - 22 + i * 11; d += `L${f(bx + rr(-3, 3))} ${f(y - rr(26, 46))}L${f(bx + 6)} ${y + 2}`; } return d + `L${x + 28} ${y + 6}Z`; });
  s += inked(blades, EARTH.grass, 3.5);
  // a small flowering plant and two flowers
  s += strokes([`M760 1660q-6 -40 4 -70`, `M764 1630q18 -8 26 -24`, `M762 1610q-20 -6 -28 -22`], EARTH.grassDark, 5);
  const petals = (x, y, r, c) => inked([0, 1, 2, 3, 4].map((i) => { const a = (i / 5) * Math.PI * 2; return smooth(blob(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, r * 0.75, 7, 0.05)); }), c, 3) + inked([smooth(blob(x, y, r * 0.5, r * 0.5, 7, 0.05))], EARTH.flower, 3);
  s += petals(768, 1582, 11, EARTH.bloom) + petals(792, 1604, 8, '#f3e3c3') + petals(232, 1662, 8, EARTH.bloom);
  return svg(s);
}

function trunkShape(k) {
  const t = k.trunk, pts = [];
  // the centreline wanders (the olive twists), the edges flare at the foot
  const U = (y) => Math.max(-0.1, Math.min(1, (GROUND_Y - y) / (GROUND_Y - t.topY)));
  const cl = (y) => { const u = U(y); return 500 + Math.sin(u * Math.PI * 1.3 + 0.4) * t.sway * u; };
  const wid = (y) => { const u = Math.max(0, U(y)); return t.top + (t.base - t.top) * Math.pow(1 - u, 1.6) + (u < 0.12 ? (0.12 - u) * 600 : 0); };
  const ys = []; for (let y = GROUND_Y + 20; y >= k.crown.cy + 40; y -= 70) ys.push(y);
  const L = ys.map((y) => [cl(y) - wid(y) / 2 * (1 + rr(-t.twist, t.twist) * 0.5), y]);
  const R = ys.map((y) => [cl(y) + wid(y) / 2 * (1 + rr(-t.twist, t.twist) * 0.5), y]).reverse();
  return { d: smooth([...L, ...R]), cl, wid };
}

function trunk(k) {
  seed = k.seed * 7;
  const T = trunkShape(k), shapes = [T.d];
  // the roots: tapered, spreading over the mound
  const roots = [[-1, 330, 70], [-1, 190, 40], [1, 210, 50], [1, 340, 80], [-1, 90, 34], [1, 100, 36]];
  for (const [s, reach, drop] of roots) {
    const x0 = 500 + s * 50, y0 = GROUND_Y - 30;
    shapes.push(smooth(limb([x0, y0], [x0 + s * reach * 0.3, y0 + 10], [x0 + s * reach * 0.7, y0 + drop * 0.6], [x0 + s * reach, y0 + drop], 70, 8, 0.1), true));
  }
  let s = inked(shapes, k.bark);
  // bark: a lit side, long grain lines, a knot – clipped to the wood
  const clip = `<clipPath id="wood">${shapes.map((d) => `<path d="${d}"/>`).join('')}</clipPath>`;
  const lit = [], grain = [], dark = [];
  for (let y = GROUND_Y; y >= k.trunk.topY - 60; y -= 70) lit.push([T.cl(y) - T.wid(y) * 0.32, y]);
  s += `<g clip-path="url(#wood)"><path d="${smooth(lit, false)}" stroke="${k.barkLight}" stroke-width="34" fill="none" stroke-linecap="round" opacity=".75"/>`;
  for (let g = -2; g <= 2; g++) {
    const pts = []; for (let y = GROUND_Y + 10; y >= k.trunk.topY - 80; y -= 90) pts.push([T.cl(y) + g * T.wid(y) * 0.17 + rr(-6, 6), y]);
    grain.push(smooth(pts, false));
  }
  s += strokes(grain, k.barkDark, 5, ' opacity=".8"');
  // the shade side
  for (let y = GROUND_Y; y >= k.trunk.topY - 60; y -= 70) dark.push([T.cl(y) + T.wid(y) * 0.4, y]);
  s += `<path d="${smooth(dark, false)}" stroke="${k.barkDark}" stroke-width="30" fill="none" stroke-linecap="round" opacity=".45"/></g>`;
  // a knot (the olive's is a hollow)
  const ky = (GROUND_Y + k.trunk.topY) / 2 + 60, kx = T.cl(ky) + 12;
  s += inked([smooth(blob(kx, ky, 22, 30, 9, 0.08))], k.barkDark, 4) + `<path d="${smooth(blob(kx + 3, ky + 4, 11, 16, 8, 0.1))}" fill="${INK}" opacity=".7"/>`;
  return svg(s, clip);
}

function boughs(k) {
  seed = k.seed * 13;
  const T = trunkShape(k), shapes = [], tufts = [], slots = [];
  for (const [side, y0, reach, y1, w0] of k.boughs) {
    const x0 = T.cl(y0), x1 = 500 + side * reach;
    shapes.push(smooth(limb([x0, y0 + 10], [x0 + side * reach * 0.35, y0 - 10], [x1 - side * reach * 0.3, y1 + 30], [x1, y1], w0, 12, 0.08)));
    // a twig up from the middle and one down at the tip
    const mx = x0 + side * reach * 0.55, my = (y0 + y1) / 2 - 10;
    shapes.push(smooth(limb([mx, my], [mx + side * 20, my - 50], [mx + side * 40, my - 80], [mx + side * 70, my - 110], 18, 5, 0.1)));
    tufts.push([mx + side * 70, my - 120, 70, 48], [x1 + side * 10, y1 - 16, 86, 56]);
    slots.push([f(x1 / W * 100), f((y1 + 30) / H * 100)], [f((x0 + side * reach * 0.5) / W * 100), f((y0 - 4) / H * 100)]);
  }
  let s = inked(shapes, k.bark);
  s += leafCluster(k, tufts.map(([x, y, a, b]) => blob(x, y, a, b, 10, 0.16)));
  return { svg: svg(s), slots };
}

/** Leaf clusters: one inked union, a dark lower shade and a light upper sheen (clipped to the leaves), small leaf flicks. */
function leafCluster(k, blobs, id = 'lv', extra = '') {
  const ds = blobs.map((b) => smooth(b));
  let s = inked(ds, k.leaf);
  const shade = [], sheen = [], flicks = [];
  for (const b of blobs) {
    const cx = b.reduce((a, p) => a + p[0], 0) / b.length, cy = b.reduce((a, p) => a + p[1], 0) / b.length;
    const r = Math.max(...b.map((p) => Math.hypot(p[0] - cx, p[1] - cy)));
    shade.push(smooth(blob(cx + r * 0.12, cy + r * 0.38, r * 0.85, r * 0.55, 9, 0.12)));
    sheen.push(smooth(blob(cx - r * 0.25, cy - r * 0.35, r * 0.42, r * 0.28, 8, 0.15)));
    for (let i = 0; i < Math.round(r / 30); i++) { const a = rr(0, Math.PI * 2), q = rr(0.2, 0.75) * r, x = cx + Math.cos(a) * q, y = cy + Math.sin(a) * q * 0.8; flicks.push(`M${f(x - 9)} ${f(y - 5)}q9 10 18 0`); }
  }
  s += `<clipPath id="${id}">${ds.map((d) => `<path d="${d}"/>`).join('')}</clipPath><g clip-path="url(#${id})"><g fill="${k.leafDark}" opacity=".75">${shade.map((d) => `<path d="${d}"/>`).join('')}</g><g fill="${k.leafLight}" opacity=".85">${sheen.map((d) => `<path d="${d}"/>`).join('')}</g>`;
  s += strokes(flicks, k.leafDark, 4) + extra + '</g>';
  return s;
}

function crown(k) {
  seed = k.seed * 31;
  const c = k.crown, T = trunkShape(k), blobs = [];
  // the trunk splits into a few limbs that vanish into the leaves
  const top = k.trunk.topY, wood = [];
  for (const s of [-1, 1, -0.35, 0.4]) wood.push(smooth(limb([T.cl(top + 30), top + 30], [T.cl(top) + s * 40, top - 60], [500 + s * 120, top - 160], [500 + s * c.rx * 0.5, c.cy + 20], k.trunk.top * 0.55, 12, 0.08)));
  // leaf blobs on an ellipse (edge first, then the middle filled); the acacia's crown is flat and layered
  for (let i = 0; i < c.blobs; i++) {
    const a = (i / c.blobs) * Math.PI * 2 + rr(-0.1, 0.1), edge = i % 3 !== 0;
    const q = edge ? rr(0.78, 0.92) : rr(0.15, 0.55), r = rr(c.r[0], c.r[1]);
    let x = c.cx + Math.cos(a) * c.rx * q, y = c.cy + Math.sin(a) * c.ry * q;
    if (k === KINDS.acacia) y = Math.min(y, c.cy + c.ry * 0.55);
    blobs.push(blob(x, y, r * (k === KINDS.acacia ? 1.35 : 1), r * (k === KINDS.acacia ? 0.7 : 0.92), 11, 0.14));
  }
  // fruit and details: olives, acorns, the acacia's yellow puffs
  let extra = '';
  seed = k.seed * 41;
  for (let i = 0; i < 26; i++) {
    const a = rr(0, Math.PI * 2), q = rr(0.1, 0.85), x = c.cx + Math.cos(a) * c.rx * q, y = c.cy + Math.sin(a) * c.ry * q;
    if (k === KINDS.acacia) extra += inked([smooth(blob(x, y, 9, 9, 8, 0.25))], k.fruit, 3);
    else if (k === KINDS.oak) { if (i % 2) extra += inked([smooth(blob(x, y, 8, 11, 8, 0.05))], k.fruit, 3) + `<path d="M${f(x - 10)} ${f(y - 8)}q10 -9 20 0z" fill="${k.barkDark}" stroke="${INK}" stroke-width="3"/>`; }
    else extra += inked([smooth(blob(x, y, 7, 10, 8, 0.05, 0.6))], k.fruit, 3);
  }
  // a small nest on the olive and the oak, the place of the youngest
  if (k !== KINDS.acacia) extra += inked([smooth(blob(c.cx + c.rx * 0.42, c.cy - c.ry * 0.5, 34, 16, 10, 0.12))], k.barkLight, 4) + strokes([`M${c.cx + c.rx * 0.42 - 26} ${c.cy - c.ry * 0.5}q26 10 52 0`], k.barkDark, 4);
  let s = inked(wood, k.bark) + leafCluster(k, blobs, 'cr', extra);
  return svg(s);
}

function slotsFor(k, boughSlots) {
  const c = k.crown, pct = (x, y) => [f(x / W * 100), f(y / H * 100)];
  // tiers from the oldest (by the roots) to the youngest (the crown's top); each a line the app spreads people along.
  // x, y are percents of the drawing (left to right, top to bottom); a person's leaf hangs from the point.
  const row = (y, half, n) => Array.from({ length: n }, (_, i) => pct(c.cx - half + (2 * half * i) / (n - 1), y));
  return {
    box: [W, H], crownPivot: pct(500, k.trunk.topY), trunkPivot: pct(500, GROUND_Y),
    tiers: [
      { name: 'roots', note: 'the eldest, the forebears: on the mound by the roots', line: [pct(130, 1655), pct(330, 1640), pct(670, 1640), pct(870, 1655)] },
      { name: 'low', note: 'grandparents: under the low boughs', line: [boughSlots[0], boughSlots[1], boughSlots[3], boughSlots[2]] },
      { name: 'mid', note: 'parents: under the upper boughs', line: [boughSlots[4], boughSlots[5], boughSlots[7], boughSlots[6]] },
      { name: 'crown', note: 'you, your siblings and cousins: across the crown', line: row(c.cy + Math.max(c.ry * 0.35, 110), c.rx * 0.78, 4) },
      { name: 'top', note: 'children and grandchildren: the crown top', line: row(c.cy - Math.max(c.ry * 0.3, 125), c.rx * 0.62, 4) },
    ],
  };
}

for (const [name, k] of Object.entries(KINDS)) {
  seed = k.seed; mkdirSync(`${OUT}/${name}`, { recursive: true });
  writeFileSync(`${OUT}/${name}/ground.svg`, ground(k));
  writeFileSync(`${OUT}/${name}/trunk.svg`, trunk(k));
  const b = boughs(k); writeFileSync(`${OUT}/${name}/boughs.svg`, b.svg);
  writeFileSync(`${OUT}/${name}/crown.svg`, crown(k));
  writeFileSync(`${OUT}/${name}/slots.json`, JSON.stringify(slotsFor(k, b.slots), null, 1) + '\n');
}

// ---------- the shared pieces ----------
seed = 99;
const WOOD = '#d8b07a', WOOD_RIM = '#b0844f';
// a leaf to hold a face (green, and a quiet autumn one for those who have passed)
const leafSvg = (fill, dark, light) => {
  const d = 'M60 132C30 120 8 92 10 62C12 32 34 10 60 6C86 10 108 32 110 62C112 92 90 120 60 132Z';
  return svg(`<path d="M60 132q2 10 -6 18" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>${inked([d], fill)}<path d="M60 128C54 100 54 50 60 14" fill="none" stroke="${dark}" stroke-width="4" stroke-linecap="round"/><path d="M22 60C26 36 40 22 56 16C44 30 34 46 30 70Z" fill="${light}" opacity=".8"/>`, '', '0 0 120 152');
};
writeFileSync(`${OUT}/leaf.svg`, leafSvg('#8ea255', '#5f7034', '#b9c886'));
writeFileSync(`${OUT}/leaf-quiet.svg`, leafSvg('#c49a62', '#8e6a3f', '#dcbf8f'));
// the rope a tag hangs by (the plank itself is CSS, so it stretches to the name)
writeFileSync(`${OUT}/rope.svg`, svg(`<path d="M8 34L30 8L52 34" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 34L30 8L52 34" fill="none" stroke="#c9a46c" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 27l4 -1M20 20l4 -1M38 19l4 1M44 26l4 1" stroke="#8a6a3e" stroke-width="2" stroke-linecap="round"/>${inked(['M24 8a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z'], '#c9a46c', 3)}`, '', '0 0 60 36'));
// a bud for adding a person: closed, green, a cream plus on it
writeFileSync(`${OUT}/bud.svg`, svg(`<path d="M32 60q0 -8 0 -14" stroke="${INK}" stroke-width="8" stroke-linecap="round"/><path d="M32 60q0 -8 0 -14" stroke="#6d8a3a" stroke-width="3.5" stroke-linecap="round"/>${inked(['M32 6C46 14 54 28 52 40C50 50 42 54 32 54C22 54 14 50 12 40C10 28 18 14 32 6Z'], '#8fb158')}${inked(['M14 44C14 54 24 58 32 50C40 58 50 54 50 44C44 48 38 48 32 46C26 48 20 48 14 44Z'], '#5f7d30', 4)}<path d="M32 18v22M21 29h22" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M32 18v22M21 29h22" stroke="#fbf3df" stroke-width="4.5" stroke-linecap="round"/>`, '', '0 0 64 64'));
// the memorial candle (נר נשמה): a short glass with white wax and a wick; the flame is its own piece, so it can flicker
writeFileSync(`${OUT}/candle.svg`, svg(`${inked(['M14 40h52l-4 70q0 6 -6 6H24q-6 0 -6 -6Z'], '#f2ece0', 4.5)}<path d="M18 54h44l-3 54q0 3 -3 3H24q-3 0 -3 -3Z" fill="#fbf8f1"/><path d="M22 46l2 60" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity=".9"/><path d="M14 40h52" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M40 54v-16" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M22 116h36" stroke="#b9ac94" stroke-width="5" stroke-linecap="round"/>`, '', '0 0 80 120'));
writeFileSync(`${OUT}/flame.svg`, svg(`${inked(['M20 4C28 18 36 28 36 40C36 50 29 56 20 56C11 56 4 50 4 40C4 28 12 18 20 4Z'], '#f2a23a', 3)}<path d="M20 20C25 30 29 36 29 43C29 49 25 52 20 52C15 52 11 49 11 43C11 36 15 30 20 20Z" fill="#ffd970"/><path d="M20 34C22 39 24 42 24 45C24 48 22 50 20 50C18 50 16 48 16 45C16 42 18 39 20 34Z" fill="#fffbe9"/>`, '', '0 0 40 60'));
console.log('tree layers written to', OUT);
