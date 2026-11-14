// Tests for public/tools/breath/breath-logic.js (the breathing patterns). Run: node server/test-breath.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = {};
vm.runInNewContext(readFileSync(new URL('../public/tools/breath/breath-logic.js', import.meta.url), 'utf8'), ctx);
const B = ctx.Breath;
let fail = 0, n = 0;
const eq = (got, want, what) => { n++; const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { fail++; console.log(`✗ ${what}: got ${g}, want ${w}`); } };
const P = (id) => B.PATTERNS.find((p) => p.id === id);

eq(B.length(P('calm')), 10, 'calm is 10 seconds a round');
eq(B.length(P('box')), 16, 'box is 16');
eq(B.length(P('478')), 19, '4-7-8 is 19');
eq(B.at(P('calm'), 0).phase, 'in', 'it starts with an in-breath');
eq(B.at(P('calm'), 3.5).left, 0.5, 'half a second left');
eq(B.at(P('calm'), 4).phase, 'out', 'then out');
eq(B.at(P('calm'), 4).word, 'נשיפה', 'its word');
eq(B.at(P('calm'), 10).round, 1, 'the second round');
eq(B.at(P('calm'), 10).phase, 'in', 'starts again');
eq(B.at(P('box'), 9).phase, 'out', 'box: out at 9');
eq(B.at(P('478'), 5).phase, 'hold', '4-7-8: hold at 5');
eq(B.at(P('478'), 5).left, 6, '4-7-8: six left of the hold');
eq(B.rounds(P('calm'), 5), 30, 'five minutes of calm');
eq(B.rounds(P('478'), 2), 6, 'two minutes of 4-7-8, rounded');
eq(B.rounds(P('box'), 0), 1, 'at least one round');
eq(B.PATTERNS.every((p) => p.steps[0][0] === 'in' && p.steps.some(([x]) => x === 'out')), true, 'every pattern starts in and has an out');
eq(new Set(B.PATTERNS.map((p) => p.id)).size, B.PATTERNS.length, 'ids are unique');

console.log(fail ? `${fail} of ${n} breath tests failed` : `breath: all ${n} tests passed`);
process.exit(fail ? 1 : 0);
