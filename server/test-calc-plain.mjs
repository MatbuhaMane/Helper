// Tests for the calculator without AI (public/tools/calc/plain.js):   node server/test-calc-plain.mjs
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// a browser script: it puts CalcPlain on the global object
await import(pathToFileURL(join(process.cwd(), 'public/tools/calc/plain.js')).href);
const C = globalThis.CalcPlain;

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

/* ---- currencies ---- */
eq('Hebrew words', C.money('100 דולר בשקלים'), '100 USD to ILS');
eq('a target with ל', C.money('50 יורו לדולר'), '50 EUR to USD');
eq('signs before', C.money('$1,200 to ₪'), '1200 USD to ILS');
eq('a sign after', C.money('100$ + 20 ש"ח'), '100 USD + 20 ILS');
eq('₪ and euro', C.money('₪50 ביורו'), '50 ILS to EUR');
eq('pounds', C.money('30 ליש"ט בשקלים'), '30 GBP to ILS');
eq('no currency stays', C.money('2*sin(pi/4)'), '2*sin(pi/4)');
eq('a word that only contains it', C.money('בדולרים'), 'בדולרים');

/* ---- percentages ---- */
eq('15% מ-80', C.percent('15% מ-80'), '15% * 80');
eq('15% מתוך 80', C.percent('15% מתוך 80'), '15% * 80');
eq('of', C.percent('20% of 50'), '20% * 50');
eq('a plain percent stays', C.percent('100 + 10%'), '100 + 10%');

/* ---- LaTeX ---- */
eq('frac and cdot', C.fromLatex('$\\frac{1}{2} \\cdot 4$'), '((1)/(2)) * 4');
eq('nested frac', C.fromLatex('\\frac{\\frac{1}{2}}{3}'), '((((1)/(2)))/(3))');
eq('sqrt, power, pi', C.fromLatex('\\sqrt{x^{2}+1} + \\pi'), 'sqrt(x^(2)+1) + pi');
eq('sin and ln', C.fromLatex('\\sin(x) + \\ln(2)'), 'sin(x) + log(2)');

/* ---- fractions ---- */
eq('0.75', C.asFraction(0.75), '3/4');
eq('1/3', C.asFraction(1 / 3), '1/3');
eq('negative', C.asFraction(-2.5), '-5/2');
eq('an integer has none', C.asFraction(4), null);
eq('pi has none', C.asFraction(Math.PI), null);

/* ---- equations and roots ---- */
eq('an equation', C.equation('x^2 - 5x + 6 = 0'), { expr: '(x^2 - 5x + 6) - (0)', v: 'x' });
eq('another letter', C.equation('2t + 1 = 7'), { expr: '(2t + 1) - (7)', v: 't' });
eq('two letters: not one equation', C.equation('x + y = 1'), null);
eq('no "="', C.equation('x^2 + 1'), null);
eq('"==" is a comparison', C.equation('x == 1'), null);
eq('functions are not letters', C.equation('sin(x) = 0.5'), { expr: '(sin(x)) - (0.5)', v: 'x' });
eq('roots of x^2-5x+6', C.roots((x) => x * x - 5 * x + 6), [2, 3]);
eq('a double root, x^2', C.roots((x) => x * x), [0]);
eq('no real roots', C.roots((x) => x * x + 1), []);
eq('1/x has a pole, not a root', C.roots((x) => 1 / x), []);
eq('sqrt(2)', C.roots((x) => x * x - 2).map((r) => +r.toFixed(9)), [-1.414213562, 1.414213562]);
eq('an off-grid root', C.roots((x) => 3 * x - 1).map((r) => +r.toFixed(12)), [0.333333333333]);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
