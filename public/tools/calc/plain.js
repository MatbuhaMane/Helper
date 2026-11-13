/* The calculator without AI (docs/ai/without-ai.md #2): what turns everyday writing into something mathjs computes –
   currencies in Hebrew and in signs, "15% מ-80", a little LaTeX – and the plain answers: a simple fraction for a decimal,
   and the roots of an equation. No mathjs here (it gets a function), so it runs in the tests too:
   node server/test-calc-plain.mjs */
(function (root) {
  const CUR = [
    [/(?:ש["״']?ח|שקלים|שקל|₪|nis)/i, 'ILS'],
    [/(?:דולרים|דולר|\$|usd)/i, 'USD'],
    [/(?:יורו|אירו|€|eur)/i, 'EUR'],
    [/(?:לירות שטרלינג|לירה שטרלינג|ליש["״']?ט|פאונד|£|gbp)/i, 'GBP'],
  ];
  const word = (re) => re.source.slice(3, -1);   // the alternatives inside (?: … )
  const NUM = String.raw`(\d[\d,]*(?:\.\d+)?)`;

  /** "100 דולר בשקלים", "$100 to ₪", "₪50 ביורו" → "100 USD to ILS"… (only the currency words; the rest stays) */
  function money(s) {
    let t = String(s);
    for (const [re, code] of CUR) {
      const w = word(re);
      // a target: "בשקלים", "לדולר", "in euro" (after a number or a unit)
      t = t.replace(new RegExp(String.raw`(\S)\s+(?:ב|ל|in |to )(?:${w})(?=$|[\s),.?])`, 'gi'), `$1 to ${code}`);
      // a sign or word before the number: "$100", "₪ 50"
      t = t.replace(new RegExp(String.raw`(?:${w})\s*${NUM}`, 'gi'), (_, n) => `${n.replace(/,/g, '')} ${code}`);
      // after the number: "100$", "100 דולר"
      t = t.replace(new RegExp(String.raw`${NUM}\s*(?:${w})(?=$|[\s),.+\-*/?])`, 'gi'), (_, n) => `${n.replace(/,/g, '')} ${code}`);
    }
    return t;
  }

  /** "15% מ-80", "15% מתוך 80", "15% of 80" → "15% * 80" */
  const percent = (s) => String(s).replace(/(\d+(?:\.\d+)?)\s*%\s*(?:מתוך|מ-?|of)\s*/gi, '$1% * ');

  /** a little LaTeX to mathjs: $…$, \frac, \sqrt, \cdot, \pi, ^{…}, \left( \right) */
  function fromLatex(s) {
    // powers first: their braces sit inside the others
    let t = String(s).replace(/\$+/g, ' ').replace(/\^\s*\{([^{}]*)\}/g, '^($1)');
    for (let i = 0; i < 5 && /\\[dt]?frac/.test(t); i++) t = t.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '(($1)/($2))');
    t = t.replace(/\\sqrt\s*\[([^\]]+)\]\s*\{([^{}]*)\}/g, 'nthRoot($2, $1)').replace(/\\sqrt\s*\{([^{}]*)\}/g, 'sqrt($1)')
      .replace(/\\left|\\right/g, '').replace(/\\cdot|\\times/g, '*').replace(/\\div/g, '/')
      .replace(/\\pi/g, 'pi').replace(/\\(sin|cos|tan|ln|log|exp|arcsin|arccos|arctan)/g, (_, f) => ({ ln: 'log', log: 'log10', arcsin: 'asin', arccos: 'acos', arctan: 'atan' }[f] || f))
      .replace(/[{}]/g, ' ').replace(/\\[,;!: ]/g, ' ');
    return t.replace(/\s+/g, ' ').trim();
  }

  /** everyday writing to an expression mathjs reads */
  const prepare = (s) => percent(money(s));

  /** 0.75 → "3/4", 2.5 → "5/2" when a small fraction is exact; else null */
  function asFraction(x, maxDen = 1000) {
    if (typeof x !== 'number' || !Number.isFinite(x) || Number.isInteger(x)) return null;
    let h0 = 0, h1 = 1, k0 = 1, k1 = 0, v = Math.abs(x);
    for (let i = 0; i < 40; i++) {             // continued fractions
      const a = Math.floor(v);
      [h0, h1] = [h1, a * h1 + h0]; [k0, k1] = [k1, a * k1 + k0];
      if (k1 > maxDen) return null;
      if (Math.abs(h1 / k1 - Math.abs(x)) < 1e-12 * Math.max(1, Math.abs(x))) return `${x < 0 ? '-' : ''}${h1}/${k1}`;
      v = 1 / (v - a);
      if (!Number.isFinite(v)) break;
    }
    return null;
  }

  /** the real roots of f between lo and hi: sign changes found on a grid, then halved down; touching zeros too */
  function roots(f, lo = -100, hi = 100, n = 4000) {
    const out = [];
    const val = (x) => { try { const y = f(x); return typeof y === 'number' ? y : NaN; } catch (_) { return NaN; } };
    const add = (r) => {
      const v = Math.abs(r) < 1e-10 ? 0 : Number(r.toPrecision(12));
      if (!out.some((o) => Math.abs(o - v) < 1e-7 * Math.max(1, Math.abs(v)))) out.push(v);
    };
    const h = (hi - lo) / n;
    let x0 = lo, y0 = val(lo);
    for (let i = 1; i <= n; i++) {
      const x1 = lo + i * h, y1 = val(x1);
      if (y0 === 0) add(x0);
      else if (Number.isFinite(y0) && Number.isFinite(y1) && y0 * y1 < 0) {
        let a = x0, b = x1, ya = y0;
        for (let k = 0; k < 80; k++) { const m = (a + b) / 2, ym = val(m); if (ym === 0) { a = b = m; break; } if (ya * ym < 0) b = m; else { a = m; ya = ym; } }
        const r = (a + b) / 2;
        // a sign change across a pole (1/x) is not a root
        if (Math.abs(val(r)) < 1e-6 * Math.max(1, Math.abs(y0), Math.abs(y1)) || Math.abs(val(r)) < 1e-9) add(r);
      } else if (Number.isFinite(y0) && Number.isFinite(y1) && i > 1) {
        // touching zero (x^2): a small |f| at a local minimum of |f|
        const yp = val(x0 - h);
        if (Math.abs(y0) < 1e-6 && Math.abs(y0) <= Math.abs(yp) && Math.abs(y0) <= Math.abs(y1)) {
          let a = x0 - h, b = x0 + h;                           // golden-section on |f|
          for (let k = 0; k < 100; k++) { const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3; if (Math.abs(val(m1)) < Math.abs(val(m2))) b = m2; else a = m1; }
          const r = (a + b) / 2;
          if (Math.abs(val(r)) < 1e-9) add(r);
        }
      }
      x0 = x1; y0 = y1;
    }
    if (y0 === 0) add(x0);
    return out.sort((a, b) => a - b);
  }

  /** "x^2 - 5x + 6 = 0" → { expr: "(x^2 - 5x + 6) - (0)", v: "x" }; no "=" or no single letter → null */
  function equation(s) {
    const parts = String(s).split(/(?<![<>!=])=(?!=)/);
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) return null;
    const letters = [...new Set((s.replace(/\b(sin|cos|tan|asin|acos|atan|sqrt|log|log10|exp|abs|pi|nthRoot|e)\b/g, '').match(/(?<![a-zA-Z])[a-zA-Z](?![a-zA-Z0-9])/g) || []))];
    if (letters.length !== 1) return null;
    return { expr: `(${parts[0].trim()}) - (${parts[1].trim()})`, v: letters[0] };
  }

  const api = { money, percent, fromLatex, prepare, asFraction, roots, equation };
  root.CalcPlain = api;
})(typeof window !== 'undefined' ? window : globalThis);
