/* H.palette – a colour theme of one's own (vision batch 5), kept readable. The person picks an active colour, a field
   colour and (if they like) a ground tone; derive() returns the tokens for the day and for the night, with the active
   colour nudged darker (by day) or lighter (at night) until text on it and it on the page reach 4.5:1, and the ground and
   cards kept quiet enough for long reading. Settings (ai-features) stores the picks per person and sets the result on
   <html> with data-palette="custom":   Object.entries(H.palette.derive(p)[night ? 'night' : 'day']).forEach(([k, v]) => root.style.setProperty(k, v))
     H.palette.derive({ primary: '#7a3fa0', field: '#e8b26a', ground?: '#f1ece2' }) → { day: { '--primary': …, … }, night: {…}, report }
     H.palette.contrast('#fff', '#000') → 21 */
(() => {
  const H = window.H || (window.H = {});
  if (H.palette) return;
  const hex = (h) => { h = String(h).replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const toHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const lum = (h) => hex(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
  /** move a colour toward black or white, a little at a time, until it reaches the contrast against every background given */
  function reach(c, against, min, toward) {
    let out = c;
    for (let i = 0; i < 40 && against.some((bg) => contrast(out, bg) < min); i++) out = mix(out, toward, 0.06);
    return out;
  }
  function derive({ primary, field, ground }) {
    const g = ground || '#efeee6';
    // by day: a light ground (forced light enough), cards a shade lighter, lines from the ground
    let bg = g; for (let i = 0; i < 30 && lum(bg) < 0.8; i++) bg = mix(bg, '#ffffff', 0.12);   // a day ground stays light, keeping a trace of its hue
    const card = mix(bg, '#ffffff', 0.55);
    const ink = '#2b2720';
    const p = reach(primary, [bg, card], 4.5, '#000000');
    const f = reach(field, [ink], 6, '#ffffff');               // the field carries ink text: light enough for it
    const day = {
      '--bg': bg, '--card': card, '--chalk': bg, '--chalk-raised': card, '--text': ink, '--ink': ink,
      '--muted': reach(mix(ink, bg, 0.42), [card], 5, '#000000'), '--line': mix(bg, ink, 0.12), '--line-strong': mix(bg, ink, 0.22),
      '--primary': p, '--vine': p, '--primary-ink': contrast('#ffffff', p) >= 4.5 ? '#fbfaf6' : ink, '--olive': f, '--tint': mix(p, '#ffffff', 0.85),
    };
    // at night: the ground a deep shade of the same hue, the active colour lightened to read on it
    const nbg = mix(mix(g, '#000000', 0.9), primary, 0.06), ncard = mix(nbg, '#ffffff', 0.05), ntext = '#e6e2d8';
    const np = reach(primary, [nbg, ncard], 5, '#ffffff');
    const night = {
      '--bg': nbg, '--card': ncard, '--text': ntext, '--muted': reach(mix(ntext, nbg, 0.35), [ncard], 5, '#ffffff'),
      '--line': mix(nbg, ntext, 0.1), '--line-strong': mix(nbg, ntext, 0.18), '--primary': np, '--ok': np, '--primary-ink': nbg, '--olive': f,
      '--tint': mix(nbg, primary, 0.25),
    };
    const report = { day: { text: contrast(ink, card), primary: contrast(p, bg), field: contrast(ink, f) }, night: { text: contrast(ntext, ncard), primary: contrast(np, nbg) },
      changed: { primary: p !== primary.toLowerCase(), field: f !== field.toLowerCase() } };
    return { day, night, report };
  }
  H.palette = { derive, contrast, mix };
})();
