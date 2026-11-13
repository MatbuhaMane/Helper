// node tools/test-push-gate.mjs — the notification gate's rules (server/push-gate.ts): quiet hours, quiet Shabbat, the five kinds
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'gate-'));
const out = join(dir, 'gate.mjs');
execSync(`npx esbuild server/push-gate.ts --bundle --format=esm --platform=neutral --outfile="${out}" --log-level=error`);
const G = await import('file://' + out.split(String.fromCharCode(92)).join('/'));
rmSync(dir, { recursive: true, force: true });

let pass = 0, fail = 0;
const eq = (name, a, b) => { if (JSON.stringify(a) === JSON.stringify(b)) pass++; else { fail++; console.log('FAIL', name, a, '!==', b); } };
const il = (iso) => Date.parse(iso + '+02:00');          // Israel winter time

// quiet hours
eq('23:00 quiet', G.quiet({}, 23 * 60), true);
eq('06:59 quiet', G.quiet({}, 6 * 60 + 59), true);
eq('07:00 open', G.quiet({}, 7 * 60), false);
eq('own 13-15', G.quiet({ quietFrom: '13:00', quietTo: '15:00' }, 14 * 60), true);
eq('own 13-15 at 16', G.quiet({ quietFrom: '13:00', quietTo: '15:00' }, 16 * 60), false);
eq('none', G.quiet({ quietFrom: '00:00', quietTo: '00:00' }, 3 * 60), false);
eq('bad falls back', G.quiet({ quietFrom: 'x' }, 23 * 60), true);
eq('israel minutes', G.israelMinutes(il('2026-11-13T09:30:00')), 9 * 60 + 30);

// the five kinds by day, the rest held
const noon = il('2026-11-12T12:00:00');
for (const k of ['family', 'gather', 'reminder', 'familyday', 'emergency']) eq('day ' + k, G.decide(k, noon, {}, []), 'send');
eq('day other', G.decide('other', noon, {}, []), 'hold');
eq('night family', G.decide('family', il('2026-11-12T23:30:00'), {}, []), 'hold');
eq('night emergency', G.decide('emergency', il('2026-11-12T23:30:00'), {}, []), 'send');

// Shabbat: a Friday candle lighting through a two-day Yom Tov to the havdalah
const items = [
  { category: 'candles', date: '2026-11-13T16:15:00+02:00' }, { category: 'parashat', date: '2026-11-14' },
  { category: 'havdalah', date: '2026-11-14T17:15:00+02:00' },
  { category: 'candles', date: '2026-11-20T16:10:00+02:00' }, { category: 'candles', date: '2026-11-21T17:12:00+02:00' },
  { category: 'havdalah', date: '2026-11-22T17:12:00+02:00' },
];
const w = G.windowsFrom(items);
eq('two windows', w.length, 2);
eq('yom tov runs on', w[1].to, Date.parse('2026-11-22T17:12:00+02:00'));
const sat = il('2026-11-14T11:00:00');
eq('shabbat family held', G.decide('family', sat, { shabbat: true }, w), 'hold');
eq('shabbat emergency', G.decide('emergency', sat, { shabbat: true }, w), 'send');
eq('not keeping', G.decide('family', sat, {}, w), 'send');
eq('after havdalah', G.decide('family', il('2026-11-14T18:00:00'), { shabbat: true }, w), 'send');
eq('test always', G.decide('test', il('2026-11-14T02:00:00'), { shabbat: true }, w), 'send');

console.log(fail ? `push-gate: ${fail} FAILED` : `push-gate: ${pass} passed`);
process.exit(fail ? 1 : 0);
