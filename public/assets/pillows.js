/* Bedouin cushions for the home page's apps ring, drawn in SVG so they stay sharp at every size.
   Each one is a stuffed square (sides pulled in, corners puffed out) with a tassel at every corner, woven bands
   along the edge (tatreez cross-stitch and kilim teeth), a patterned field and a stepped diamond in the middle
   that holds the app's icon. Light and shade on top make it look full. */
(() => {
  // Palettes taken from the reference cushions: tatreez on black, and the kilims' reds, rusts, indigo and teal.
  const PALETTES = {
    tatreez: { bg: '#1c1416', a: '#d8283f', b: '#2f9a4e', c: '#f2c230', d: '#3a6fd8', cream: '#f1e4c8', ink: '#1c1416' },
    kilim:   { bg: '#b02a20', a: '#ef8a2c', b: '#1f2c48', c: '#f0dfbd', d: '#2d2420', cream: '#f4e7cb', ink: '#3a1712' },
    rust:    { bg: '#c0562b', a: '#231b17', b: '#f0dcb8', c: '#8e1c1c', d: '#e9a34a', cream: '#f6e8cd', ink: '#2a1a12' },
    indigo:  { bg: '#7b1d2c', a: '#2c3f78', b: '#efdfbf', c: '#e6862f', d: '#1d1830', cream: '#f2e5ca', ink: '#2b1520' },
    teal:    { bg: '#8a3a28', a: '#2c7c78', b: '#dba543', c: '#efe0c0', d: '#2a1c16', cream: '#f4e6c9', ink: '#2a1a14' },
    wine:    { bg: '#5d1c2a', a: '#3f8150', b: '#d6a63c', c: '#e9d6b4', d: '#c23a3a', cream: '#f1e2c4', ink: '#2a1219' },
  };
  const SHAPE = 'M14 16 C40 25 80 25 106 16 C97 42 97 78 106 104 C80 95 40 95 14 104 C23 78 23 42 14 16 Z';

  /** A diamond with stepped (cross-stitched) edges, as the weavers make them. */
  function stepped(cx, cy, r, s) {
    const pts = [];
    const n = Math.max(1, Math.round(r / s));
    for (let k = 0; k < n; k++) { pts.push([cx + k * s, cy - r + k * s], [cx + (k + 1) * s, cy - r + k * s]); }
    for (let k = 0; k < n; k++) { pts.push([cx + r - k * s, cy + k * s], [cx + r - k * s, cy + (k + 1) * s]); }
    for (let k = 0; k < n; k++) { pts.push([cx - k * s, cy + r - k * s], [cx - (k + 1) * s, cy + r - k * s]); }
    for (let k = 0; k < n; k++) { pts.push([cx - r + k * s, cy - k * s], [cx - r + k * s, cy - (k + 1) * s]); }
    return 'M' + pts.map((p) => p.map((v) => +v.toFixed(2)).join(' ')).join('L') + 'Z';
  }

  /** The field: a repeating tile in one of the weaves. */
  function fieldTile(kind, p, id) {
    switch (kind) {
      case 'tatreez':   // little cross-stitch stars and hearts between green diamonds
        return `<pattern id="${id}" width="20" height="20" patternUnits="userSpaceOnUse">
          <rect width="20" height="20" fill="${p.bg}"/>
          <path d="${stepped(10, 10, 6, 2)}" fill="none" stroke="${p.b}" stroke-width="1.6"/>
          <path d="M9 9h2v2H9zM10 0v3M10 17v3M0 10h3M17 10h3" stroke="${p.a}" stroke-width="2" fill="${p.c}"/>
          <path d="M1 1h2v2H1zM17 1h2v2h-2zM1 17h2v2H1zM17 17h2v2h-2z" fill="${p.a}"/></pattern>`;
      case 'zigzag':    // kilim chevrons
        return `<pattern id="${id}" width="16" height="14" patternUnits="userSpaceOnUse">
          <rect width="16" height="14" fill="${p.bg}"/>
          <path d="M0 4 L4 0 L8 4 L12 0 L16 4" fill="none" stroke="${p.a}" stroke-width="2.4"/>
          <path d="M0 10 L4 6 L8 10 L12 6 L16 10" fill="none" stroke="${p.c}" stroke-width="1.6"/>
          <path d="M3 12h2v2H3zM11 12h2v2h-2z" fill="${p.b}"/></pattern>`;
      case 'arrows':    // rows of small stepped diamonds with hooks
        return `<pattern id="${id}" width="18" height="18" patternUnits="userSpaceOnUse">
          <rect width="18" height="18" fill="${p.bg}"/>
          <path d="${stepped(9, 9, 5, 1.7)}" fill="${p.a}"/>
          <path d="${stepped(9, 9, 2, 1)}" fill="${p.c}"/>
          <path d="M0 0h3v1.5H1.5V3H0zM18 18h-3v-1.5h1.5V15H18z" fill="${p.b}"/></pattern>`;
      case 'stripes':   // banded kilim stripes with tiny diamonds
        return `<pattern id="${id}" width="12" height="16" patternUnits="userSpaceOnUse">
          <rect width="12" height="16" fill="${p.bg}"/>
          <rect y="0" width="12" height="3" fill="${p.a}"/><rect y="8" width="12" height="2" fill="${p.c}"/>
          <path d="${stepped(6, 12.5, 2, 1)}" fill="${p.b}"/><path d="${stepped(0, 5, 1.6, 0.8)}${stepped(12, 5, 1.6, 0.8)}" fill="${p.d}"/></pattern>`;
      default:          // 'grid': diamonds on a lattice
        return `<pattern id="${id}" width="14" height="14" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" fill="${p.bg}"/>
          <path d="M0 7L7 0L14 7L7 14Z" fill="none" stroke="${p.a}" stroke-width="1.5"/>
          <path d="${stepped(7, 7, 2.4, 1.2)}" fill="${p.c}"/></pattern>`;
    }
  }

  /**
   * pillow({ palette, weave, icon, id }) → SVG markup.
   * icon: the inner markup of a 24×24 stroke icon (H.icon's paths).
   */
  function pillow({ palette = 'kilim', weave = 'grid', icon = '', id = 'p' + Math.random().toString(36).slice(2, 7) }) {
    const p = PALETTES[palette] || PALETTES.kilim;
    const inset = (k) => `transform="translate(60 60) scale(${k}) translate(-60 -60)"`;
    // the woven edge: teeth (the serrated tatreez border), then a row of little blocks, then a thin line
    const teeth = `<path d="${SHAPE}" ${inset(0.9)} fill="none" stroke="${p.a}" stroke-width="7" stroke-dasharray="3.2 2.4"/>`;
    const blocks = `<path d="${SHAPE}" ${inset(0.79)} fill="none" stroke="${p.c}" stroke-width="2.6" stroke-dasharray="2.2 2.2"/>`;
    const blocks2 = `<path d="${SHAPE}" ${inset(0.79)} fill="none" stroke="${p.d}" stroke-width="2.6" stroke-dasharray="2.2 2.2" stroke-dashoffset="2.2"/>`;
    const line = `<path d="${SHAPE}" ${inset(0.73)} fill="none" stroke="${p.b}" stroke-width="1.4"/>`;
    const tassel = (x, y, dx, dy) => `<g transform="translate(${x} ${y})">
        <path d="M0 0 l${dx * 5} ${dy * 5}" stroke="${p.ink}" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M${dx * 5} ${dy * 5} l${dx * 6 - dy * 2} ${dy * 6 + dx * 2} M${dx * 5} ${dy * 5} l${dx * 7} ${dy * 7} M${dx * 5} ${dy * 5} l${dx * 6 + dy * 2} ${dy * 6 - dx * 2}"
          stroke="${p.a}" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="${dx * 5}" cy="${dy * 5}" r="2.2" fill="${p.c}"/></g>`;
    return `<svg class="pillow" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <clipPath id="${id}-c"><path d="${SHAPE}"/></clipPath>
        ${fieldTile(weave, p, id + '-f')}
        <radialGradient id="${id}-s" cx="46%" cy="40%" r="62%">
          <stop offset="0" stop-color="#fff" stop-opacity=".26"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/>
          <stop offset=".85" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></radialGradient>
      </defs>
      ${tassel(14, 16, -1, -1)}${tassel(106, 16, 1, -1)}${tassel(14, 104, -1, 1)}${tassel(106, 104, 1, 1)}
      <g clip-path="url(#${id}-c)">
        <rect width="120" height="120" fill="${p.bg}"/>
        <rect width="120" height="120" fill="url(#${id}-f)" opacity=".95"/>
        ${teeth}${blocks}${blocks2}${line}
        <path d="${stepped(60, 60, 25, 3.125)}" fill="${p.cream}" stroke="${p.a}" stroke-width="2.2"/>
        <path d="${stepped(60, 60, 30, 3)}" fill="none" stroke="${p.c}" stroke-width="1.4" stroke-dasharray="2 1.5"/>
        <svg x="46" y="46" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${p.ink}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
        <rect width="120" height="120" fill="url(#${id}-s)"/>
      </g>
      <path d="${SHAPE}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.6"/>
    </svg>`;
  }

  window.H = Object.assign(window.H || {}, { pillow });
})();
