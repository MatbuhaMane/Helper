// node server/test-goals-remind.mjs — a goal's time-of-day reminder (server/goals-remind-rules.ts)
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = mkdtempSync(join(tmpdir(), 'gr-'));
const out = join(dir, 'g.mjs');
execSync(`npx esbuild server/goals-remind-rules.ts --bundle --format=esm --platform=neutral --outfile="${out}" --log-level=error`);
const R = await import('file://' + out.split(String.fromCharCode(92)).join('/'));
rmSync(dir, { recursive: true, force: true });
let pass = 0, fail = 0;
const eq = (name, a, b) => { if (JSON.stringify(a) === JSON.stringify(b)) pass++; else { fail++; console.log('FAIL', name, a, '!==', b); } };

// 2026-11-16 is a Monday (weekday 1); 10:30 in Israel (UTC+2 in winter) = 08:30 UTC
const at = Date.parse('2026-11-16T08:30:00Z');
const g = { id: 'g1', title: 'לרוץ', days: null, time: '10:30', repeat: null, created_at: Date.parse('2026-11-01T08:00:00Z'), reminded: null };
eq('hhmm in Israel', R.hhmmOf(at), '10:30');
eq('at its minute', R.dueNow(g, at, 6), true);
eq('a minute later', R.dueNow(g, at + 60000, 6), false);
eq('no time', R.dueNow({ ...g, time: null }, at, 6), false);
eq('already reminded today', R.dueNow({ ...g, reminded: '2026-11-16' }, at, 6), false);
eq('reminded yesterday', R.dueNow({ ...g, reminded: '2026-11-15' }, at, 6), true);
eq('rest day', R.dueNow(g, at, 1), false);
eq('goal days include today', R.dueNow({ ...g, days: [1, 3] }, at, 6), true);
eq('goal days exclude today', R.dueNow({ ...g, days: [2, 4] }, at, 6), false);
eq('no rest day set', R.dueNow(g, at, null), true);

const S = (id, goal, ps, sort, small, text, done) => ({ id, goal_id: goal, process_sort: ps, sort, small, text, done_at: done });
const steps = [S('a', 'g1', 0, 1, false, 'לבחור נעליים', Date.parse('2026-11-10T08:00:00Z')), S('b', 'g1', 0, 2, false, 'לרוץ שני ק"מ', null), S('c', 'g1', 0, 3, true, 'לצאת לחמש דקות', null), S('x', 'g2', 0, 1, false, 'אחר', null)];
eq('next open, small first', R.nextStep(g, steps, at)?.id, 'c');
eq('nothing left', R.nextStep(g, steps.map((s) => ({ ...s, done_at: 1 })), at), null);
// a recurring weekly goal: a step done last week is open again; one done this week is not (weeks start on Sunday: 2026-11-15)
const weekly = { ...g, repeat: JSON.stringify({ every: 'week' }) };
const wsteps = [S('a', 'g1', 0, 1, false, 'א', Date.parse('2026-11-10T08:00:00Z')), S('b', 'g1', 0, 2, false, 'ב', Date.parse('2026-11-16T05:00:00Z'))];
eq('weekly: last week open again', R.nextStep(weekly, wsteps, at)?.id, 'a');
eq('daily message with step', R.message(g, steps[1]).body, 'הצעד הבא: לרוץ שני ק"מ');
eq('message without step', R.message(g, null).body, 'הגיע הזמן לעבוד על המטרה.');
eq('title cut', R.message({ ...g, title: 'x'.repeat(200) }, null).title.length <= 83, true);
console.log(`goals-remind: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
