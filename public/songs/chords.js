/* Chords: parse, transpose, and draw them for guitar (a fingering found by search) and piano (the keys). */
(() => {
  'use strict';
  const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT_PREF = { 1: 'C#', 3: 'Eb', 6: 'F#', 8: 'Ab', 10: 'Bb' };
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const QUAL = {
    '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9],
    9: [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14], add9: [0, 4, 7, 14], sus2: [0, 2, 7], sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10],
    dim: [0, 3, 6], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], aug: [0, 4, 8], 5: [0, 7], mmaj7: [0, 3, 7, 11], maj9: [0, 4, 7, 11, 14],
  };
  const ALIAS = {
    '': '', maj: '', M: '', m: 'm', min: 'm', '-': 'm', 7: '7', dom7: '7', m7: 'm7', min7: 'm7', '-7': 'm7', maj7: 'maj7', M7: 'maj7', 'Δ': 'maj7',
    6: '6', m6: 'm6', 9: '9', m9: 'm9', add9: 'add9', add2: 'add9', 2: 'sus2', sus2: 'sus2', sus: 'sus4', sus4: 'sus4', '7sus4': '7sus4', '7sus': '7sus4',
    dim: 'dim', '°': 'dim', o: 'dim', dim7: 'dim7', '°7': 'dim7', o7: 'dim7', m7b5: 'm7b5', 'ø': 'm7b5', aug: 'aug', '+': 'aug', 5: '5', mmaj7: 'mmaj7', mM7: 'mmaj7', maj9: 'maj9',
  };
  const NAME_RE = /^([A-G])([#b♯♭]?)([^/\s]*)(?:\/([A-G])([#b♯♭]?))?$/;

  const acc = (a) => (a === '#' || a === '♯' ? 1 : a === 'b' || a === '♭' ? -1 : 0);
  function parse(name) {
    const m = NAME_RE.exec(String(name).trim());
    if (!m) return null;
    const q = m[3];
    let qual = ALIAS[q];
    if (qual === undefined) {
      if (/^(m|min)(?!aj)/.test(q)) qual = /7/.test(q) ? 'm7' : 'm';
      else if (/^maj/.test(q)) qual = 'maj7';
      else if (/^(7|9|11|13)/.test(q)) qual = '7';
      else if (/^[a-z0-9#b+°ø()-]*$/i.test(q) && q.length <= 6) qual = '';
      else return null;
    }
    const root = (PC[m[1]] + acc(m[2]) + 12) % 12;
    const bass = m[4] ? (PC[m[4]] + acc(m[5]) + 12) % 12 : null;
    return { root, qual, raw: q, bass, flat: m[2] === 'b' || m[2] === '♭' };
  }
  const noteName = (pc, flat) => (flat && [1, 3, 6, 8, 10].includes(pc) ? ['', 'Db', '', 'Eb', '', '', 'Gb', '', 'Ab', '', 'Bb'][pc] : FLAT_PREF[pc] || SHARP[pc]);
  function format(c) { return noteName(c.root, c.flat) + c.raw + (c.bass != null ? '/' + noteName(c.bass, c.flat) : ''); }
  function transpose(name, steps) {
    const c = parse(name);
    if (!c || !steps) return name;
    return format({ ...c, root: (c.root + steps + 120) % 12, bass: c.bass == null ? null : (c.bass + steps + 120) % 12, flat: false });
  }
  const isChord = (tok) => !!parse(tok);
  const FILLER = /^(x\d+|\||\|\||-+|\/|\(|\)|\.+|:|N\.C\.?)$/i;
  /** A line made only of chords (and bar marks / repeats). */
  function isChordLine(line) {
    const toks = line.trim().split(/\s+/).filter(Boolean);
    if (!toks.length) return false;
    let n = 0;
    for (const t of toks) { if (isChord(t)) n++; else if (!FILLER.test(t)) return false; }
    return n > 0;
  }
  /** Transpose a chord line keeping the columns where possible. */
  function transposeLine(line, steps) {
    if (!steps) return line;
    let out = '', debt = 0;
    for (const part of line.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        let sp = part.length - debt;
        debt = sp < 1 ? 1 - sp : 0;
        out += ' '.repeat(Math.max(1, sp));
      } else {
        const t = isChord(part) ? transpose(part, steps) : part;
        debt += t.length - part.length;
        out += t;
      }
    }
    return out;
  }
  function tones(c) { return (QUAL[c.qual] || QUAL['']).map((i) => (c.root + i) % 12); }

  /* ---- guitar: search the neck for a playable fingering ---- */
  const TUNING = [4, 9, 2, 7, 11, 4];   // E A D G B E, low to high
  const cache = new Map();
  // the standard shapes guitarists know (x = muted); everything else is found by searching the neck
  const SHAPES = {
    C: 'x32010', D: 'xx0232', E: '022100', G: '320003', A: 'x02220', F: '133211', B: 'x24442', Bb: 'x13331', 'F#': '244322', Eb: 'xx1343', Ab: '466544', 'C#': 'x46664',
    Am: 'x02210', Em: '022000', Dm: 'xx0231', Bm: 'x24432', 'F#m': '244222', 'C#m': 'x46654', 'G#m': '466444', Gm: '355333', Cm: 'x35543', Fm: '133111', Bbm: 'x13321', Ebm: 'xx4342',
    C7: 'x32310', D7: 'xx0212', E7: '020100', G7: '320001', A7: 'x02020', B7: 'x21202', F7: '131211', 'F#7': '242322',
    Cmaj7: 'x32000', Dmaj7: 'xx0222', Emaj7: '021100', Fmaj7: 'xx3210', Gmaj7: '320002', Amaj7: 'x02120',
    Am7: 'x02010', Em7: '022030', Dm7: 'xx0211', Bm7: 'x20202', 'F#m7': '242222',
    Asus4: 'x02230', Dsus4: 'xx0233', Esus4: '022200', Asus2: 'x02200', Dsus2: 'xx0230', Csus2: 'x30013', Gsus4: '330013',
    A6: 'x02222', D6: 'xx0202', Am6: 'x02212', Cadd9: 'x32033', Gadd9: '320203',
  };
  function fromShape(sh) {
    const frets = [...sh].map((ch) => (ch === 'x' ? -1 : Number(ch)));
    const fretted = frets.filter((f) => f > 0);
    const minF = fretted.length ? Math.min(...fretted) : 0;
    const barre = fretted.length > 4 && frets.filter((f) => f === minF).length >= 2 ? minF : 0;
    return { frets, barre };
  }
  function guitar(name) {
    if (cache.has(name)) return cache.get(name);
    const c = parse(name);
    if (!c) return null;
    const std = SHAPES[format({ ...c, flat: c.flat })] || SHAPES[format({ ...c, flat: true })] || SHAPES[format({ ...c, flat: false })];
    if (std && c.raw === (format({ ...c }).slice(noteName(c.root, c.flat).length).replace(/\/.*/, ''))) { const v = fromShape(std); cache.set(name, v); return v; }
    const T = new Set(tones(c));
    const need = new Set(tones(c).filter((pc, i, a) => !(a.length >= 4 && pc === (c.root + 7) % 12)));   // the 5th may go
    const bass = c.bass != null ? c.bass : c.root;
    if (c.bass != null) T.add(c.bass);
    let best = null;
    for (let p = 0; p <= 9; p++) {
      const opts = TUNING.map((open) => {
        const o = [-1];
        if (T.has(open % 12)) o.push(0);
        for (let f = Math.max(1, p); f <= p + 3; f++) if (T.has((open + f) % 12)) o.push(f);
        return o;
      });
      const cur = [];
      const walk = (s) => {
        if (s === 6) { score(cur.slice(), p); return; }
        for (const f of opts[s]) { cur[s] = f; walk(s + 1); }
      };
      const score = (fr, pos) => {
        const first = fr.findIndex((f) => f >= 0);
        if (first < 0 || first > 2) return;
        if (fr.slice(first).some((f) => f < 0)) return;          // mute only on the bass side
        if ((TUNING[first] + fr[first]) % 12 !== bass) return;     // the right bass note
        const sounding = fr.slice(first).map((f, i) => (TUNING[first + i] + f) % 12);
        for (const t of need) if (!sounding.includes(t)) return;
        const fretted = fr.filter((f) => f > 0);
        const minF = fretted.length ? Math.min(...fretted) : 0;
        let barre = false;
        if (fretted.length > 4) {
          if (fretted.filter((f) => f === minF).length < 2 || fretted.filter((f) => f > minF).length > 3) return;
          barre = true;
        }
        if (fretted.length && Math.max(...fretted) - minF > 3) return;
        if (barre && fr.slice(first).some((f) => f === 0)) return;  // a barre and open strings below it don't mix well
        if (fretted.length && Math.max(...fretted) > 3 && fr.some((f) => f === 0)) return;   // no open strings up the neck
        const sc = pos * 1.2 + first * 0.7 + fretted.length * 0.15 + (barre ? 1.2 : 0) - (6 - first) * 0.25 + (minF > 0 && !barre && pos === 0 ? 0 : 0);
        if (!best || sc < best.sc) best = { sc, frets: fr, barre: barre ? minF : 0 };
      };
      walk(0);
      if (best && p === 0 && best.sc < 1) break;
    }
    cache.set(name, best);
    return best;
  }

  const NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.append(e);
    return e;
  }
  function guitarSvg(name) {
    const v = guitar(name);
    const svg = svgEl('svg', { viewBox: '0 0 90 112', class: 'chord-svg', role: 'img', 'aria-label': `${name} בגיטרה` });
    svgEl('text', { x: 45, y: 11, 'text-anchor': 'middle', class: 'cn' }, svg).textContent = name;
    if (!v) { svgEl('text', { x: 45, y: 60, 'text-anchor': 'middle', class: 'na' }, svg).textContent = 'אין צורה'; return svg; }
    const fretted = v.frets.filter((f) => f > 0);
    const lo = fretted.length && Math.max(...fretted) > 4 ? Math.min(...fretted) : 1;
    const x0 = 15, y0 = 26, dx = 12, dy = 16;
    for (let s = 0; s < 6; s++) svgEl('line', { x1: x0 + s * dx, y1: y0, x2: x0 + s * dx, y2: y0 + 4 * dy, class: 'str' }, svg);
    for (let f = 0; f <= 4; f++) svgEl('line', { x1: x0, y1: y0 + f * dy, x2: x0 + 5 * dx, y2: y0 + f * dy, class: f === 0 && lo === 1 ? 'nut' : 'fr' }, svg);
    if (lo > 1) svgEl('text', { x: 4, y: y0 + dy * 0.7, class: 'pos' }, svg).textContent = lo;
    if (v.barre) {
      const strs = v.frets.map((f, i) => (f === v.barre ? i : -1)).filter((i) => i >= 0);
      const y = y0 + (v.barre - lo + 0.5) * dy;
      svgEl('rect', { x: x0 + strs[0] * dx - 4, y: y - 4.5, width: (strs[strs.length - 1] - strs[0]) * dx + 8, height: 9, rx: 4.5, class: 'dot' }, svg);
    }
    v.frets.forEach((f, s) => {
      const x = x0 + s * dx;
      if (f < 0) svgEl('text', { x, y: y0 - 5, 'text-anchor': 'middle', class: 'xo' }, svg).textContent = '×';
      else if (f === 0) svgEl('circle', { cx: x, cy: y0 - 8, r: 3, class: 'open' }, svg);
      else if (f !== v.barre) svgEl('circle', { cx: x, cy: y0 + (f - lo + 0.5) * dy, r: 4.6, class: 'dot' }, svg);
    });
    return svg;
  }
  function pianoSvg(name) {
    const c = parse(name);
    const svg = svgEl('svg', { viewBox: '0 0 148 76', class: 'chord-svg piano', role: 'img', 'aria-label': `${name} בפסנתר` });
    svgEl('text', { x: 74, y: 11, 'text-anchor': 'middle', class: 'cn' }, svg).textContent = name;
    if (!c) return svg;
    // voice it upward from the root inside two octaves from C
    const iv = QUAL[c.qual] || QUAL[''];
    const keys = new Set(iv.map((i) => c.root + i));
    if (c.bass != null) keys.add(c.bass > c.root ? c.bass - 12 + 12 : c.bass);
    const whites = [0, 2, 4, 5, 7, 9, 11];
    const W = 148 / 14;
    let wi = 0;
    for (let o = 0; o < 2; o++) for (const w of whites) {
      const k = o * 12 + w;
      svgEl('rect', { x: wi * W, y: 16, width: W - 0.6, height: 58, rx: 1.5, class: keys.has(k) ? 'wk on' + (k % 12 === c.root ? ' root' : '') : 'wk' }, svg);
      wi++;
    }
    wi = 0;
    for (let o = 0; o < 2; o++) for (const w of whites) {
      if (![4, 11].includes(w)) {
        const k = o * 12 + w + 1;
        svgEl('rect', { x: (wi + 1) * W - W * 0.32, y: 16, width: W * 0.64, height: 36, rx: 1.2, class: keys.has(k) ? 'bk on' + (k % 12 === c.root ? ' root' : '') : 'bk' }, svg);
      }
      wi++;
    }
    return svg;
  }

  window.Chords = { parse, format, transpose, transposeLine, isChord, isChordLine, guitar, guitarSvg, pianoSvg, tones, SHARP, noteName, QUALITIES: Object.keys(QUAL) };
})();
