// node server/test-coach-remind.mjs — the coach's pushes (server/coach-remind-rules.ts)
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = mkdtempSync(join(tmpdir(), 'cr-'));
const out = join(dir, 'c.mjs');
execSync(`npx esbuild server/coach-remind-rules.ts --bundle --format=esm --platform=neutral --outfile="${out}" --log-level=error`);
const R = await import('file://' + out.split(String.fromCharCode(92)).join('/'));
rmSync(dir, { recursive: true, force: true });
let pass = 0, fail = 0;
const eq = (name, a, b) => { if (JSON.stringify(a) === JSON.stringify(b)) pass++; else { fail++; console.log('FAIL', name, a, '!==', b); } };
const D = (s) => Date.parse(s + 'T08:00:00Z');
const now = D('2026-11-17');   // a Tuesday
eq('kinds', [R.kindAt('18:30'), R.kindAt('20:30'), R.kindAt('12:00')], ['nudge', 'cheer', null]);
eq('no workouts', R.words('nudge', [], now, 6), null);
eq('not a list', R.words('nudge', 'x', now, 6), null);
eq('worked out yesterday', R.words('nudge', [D('2026-11-16')], now, 6), null);
eq('worked out today: no nudge', R.words('nudge', [D('2026-11-17')], now, 6), null);
eq('two days', R.words('nudge', [D('2026-11-15')], now, 6)?.body, 'עברו 2 ימים מהאימון האחרון. אימון קצר היום?');
eq('a week', R.words('nudge', [D('2026-11-10')], now, 6)?.body.includes('7 ימים'), true);
eq('after two weeks the coach waits', R.words('nudge', [D('2026-10-20')], now, 6), null);
eq('rest day', R.words('nudge', [D('2026-11-14')], now, 2), null);
eq('cheer, nothing today', R.words('cheer', [D('2026-11-16')], now, 6), null);
eq('cheer, first', R.words('cheer', [D('2026-11-17')], now, 6)?.body, 'כל הכבוד על האימון היום!');
eq('cheer, three this week', R.words('cheer', [D('2026-11-13'), D('2026-11-15'), D('2026-11-17')], now, 6)?.body, 'כבר 3 אימונים השבוע. כל הכבוד, ממשיכים!');
eq('two workouts one day count once', R.words('cheer', [D('2026-11-17'), D('2026-11-17') + 3600e3], now, 6)?.body, 'כל הכבוד על האימון היום!');
eq('future timestamps ignored', R.words('nudge', [D('2026-12-01')], now, 6), null);
console.log(`coach-remind: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
