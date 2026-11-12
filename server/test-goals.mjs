// Tests for goal management's logic (server/goals-logic.ts):   node server/test-goals.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'goals-test-'));
const out = join(dir, 'g.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/goals-logic.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const G = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const SAT = 6;
// 2026-11-13 is a Friday; 2026-11-14 a Saturday
const days = (...ds) => new Set(ds);

/* ---- days ---- */
eq('a weekday', [G.weekday('2026-11-13'), G.weekday('2026-11-14'), G.weekday('2026-11-15')], [5, 6, 0]);
eq('a moment in Israel (21:30 UTC on the 12th is the 13th there)', G.dayOf(Date.UTC(2026, 10, 12, 22, 30)), '2026-11-13');
eq('the rest day by tradition', [G.restDayFor('jewish'), G.restDayFor('muslim'), G.restDayFor('christian'), G.restDayFor('none'), G.restDayFor('jewish', 0), G.restDayFor('jewish', null)], [6, 5, 0, null, 0, null]);

/* ---- the streak: Shabbat does not break it ---- */
eq('Thu, Fri, (Shabbat), Sun – today Monday, not yet: 3', G.streak(days('2026-11-12', '2026-11-13', '2026-11-15'), '2026-11-16', SAT), 3);
eq('the same with no rest day: Shabbat breaks it', G.streak(days('2026-11-12', '2026-11-13', '2026-11-15'), '2026-11-16', null), 1);
eq('today done counts', G.streak(days('2026-11-15', '2026-11-16'), '2026-11-16', SAT), 2);
eq('a missed working day breaks it', G.streak(days('2026-11-11', '2026-11-13'), '2026-11-15', SAT), 1);
eq('nothing', G.streak(days(), '2026-11-16', SAT), 0);

/* ---- the forgiving week ---- */
eq('4 of 6 (Shabbat out of the count)', G.week(days('2026-11-10', '2026-11-11', '2026-11-13', '2026-11-15'), '2026-11-16', SAT), { done: 4, of: 6 });
eq('with no rest day: of 7', G.week(days('2026-11-14'), '2026-11-16', null), { done: 1, of: 7 });

/* ---- the "why" ---- */
eq('two working days quiet: the why', G.whyDue(days('2026-11-11'), '2026-11-14'.replace('14', '15'), SAT), true);
eq('Thu and Fri done, Shabbat, Sunday morning: not yet', G.whyDue(days('2026-11-12', '2026-11-13'), '2026-11-15', SAT), false);
eq('one quiet day only: not yet', G.whyDue(days('2026-11-15'), '2026-11-17', SAT), false);
eq('never started: no', G.whyDue(days(), '2026-11-17', SAT), false);

/* ---- the weekly review: the day before the rest day ---- */
eq('Friday for Shabbat, Thursday for a Friday rest, Saturday for Sunday', [G.reviewDay(6), G.reviewDay(5), G.reviewDay(0), G.reviewDay(null)], [5, 4, 6, 4]);
eq('due on Friday', G.reviewDue('2026-11-13', SAT, null), true);
eq('not twice in a week', G.reviewDue('2026-11-13', SAT, '2026-11-13'), false);
eq('a week later again', G.reviewDue('2026-11-20', SAT, '2026-11-13'), true);

/* ---- today's steps ---- */
const goals = [
  { id: 'g1', title: 'האוהל', kind: 'long', due: null, days: null, status: 'active', sort: 1 },
  { id: 'g2', title: 'לקנות מתנה', kind: 'short', due: null, days: null, status: 'active', sort: 2 },
  { id: 'g3', title: 'לרוץ', kind: 'regular', due: null, days: [0, 2, 4], status: 'active', sort: 3 },
  { id: 'g4', title: 'נגמר', kind: 'regular', due: null, days: null, status: 'done', sort: 4 },
];
const processes = [{ id: 'p1', goal: 'g1', sort: 1 }, { id: 'p2', goal: 'g1', sort: 2 }, { id: 'p3', goal: 'g2', sort: 1 }, { id: 'p4', goal: 'g3', sort: 1 }];
const st = (id, goal, process, sort, done = false, small = false) => ({ id, goal, process, text: id, sort, done, small });
const steps = [st('a1', 'g1', 'p2', 1), st('a0', 'g1', 'p1', 2), st('a00', 'g1', 'p1', 1, true), st('b1', 'g2', 'p3', 1), st('c1', 'g4', 'p4', 1), st('r1', 'g3', 'p4', 1)];
eq('Monday: the short goal first, then the first process\'s next step, then a second round', G.todays(goals, processes, steps, '2026-11-16', SAT).map((s) => s.id), ['b1', 'a0', 'a1']);
eq('Sunday: the runner works too', G.todays(goals, processes, steps, '2026-11-15', SAT).map((s) => s.id), ['b1', 'a0', 'r1']);
eq('on the rest day: nothing to do', G.todays(goals, processes, steps, '2026-11-14', SAT), []);
eq('a 5-minute version comes first', G.todays(goals, processes, [...steps, st('a0s', 'g1', 'p1', 9, false, true)], '2026-11-16', SAT).map((s) => s.id).slice(0, 2), ['b1', 'a0s']);

/* ---- templates ---- */
eq('a template by the goal\'s words', [G.templateFor('לרוץ 5 ק"מ').id, G.templateFor('לעבור דירה לחיפה').id, G.templateFor('לבנות את האוהל').id, G.templateFor('משהו אחר').id], ['fitness', 'move', 'ohel', 'generic']);
eq('every template has processes with steps', G.TEMPLATES.every((t) => t.processes.length >= 2 && t.processes.every((p) => p.steps.length >= 1)), true);

/* ---- badges ---- */
const at = (d, h = 12) => Date.parse(`${d}T${String(h).padStart(2, '0')}:00:00+02:00`);
const base = { processesDone: 0, goalsDone: [], longActiveSince: null, rest: SAT, today: '2026-11-16' };
eq('the first step', G.earned({ ...base, doneAt: [at('2026-11-16')] }), ['peg']);
eq('3 days over Shabbat: גחלת', G.earned({ ...base, doneAt: [at('2026-11-12'), at('2026-11-13'), at('2026-11-15')] }).includes('ember'), true);
eq('back after Shabbat', G.earned({ ...base, doneAt: [at('2026-11-13'), at('2026-11-15')] }).includes('rest_return'), true);
eq('dawn and night', G.earned({ ...base, doneAt: [at('2026-11-16', 5), at('2026-11-16', 23)] }).filter((b) => b === 'dawn' || b === 'night'), ['dawn', 'night']);
eq('a process and a goal done', G.earned({ ...base, doneAt: [at('2026-11-16')], processesDone: 1, goalsDone: [{ kind: 'regular', created: at('2026-11-01'), done: at('2026-11-16') }] }).filter((b) => b === 'pole' || b === 'standing'), ['pole', 'standing']);
eq('a short goal each day for a week', G.earned({ ...base, doneAt: [], goalsDone: Array.from({ length: 7 }, (_, i) => ({ kind: 'short', created: at(G.addDays('2026-11-08', i), 9), done: at(G.addDays('2026-11-08', i), 18) })) }).includes('milestones'), true);
eq('a goal of more than a year', G.earned({ ...base, doneAt: [], goalsDone: [{ kind: 'long', created: at('2025-01-01'), done: at('2026-11-16') }] }).includes('traveller'), true);
eq('seven Shabbatot kept, in weeks with steps', G.earned({ ...base, today: '2027-01-04', doneAt: Array.from({ length: 8 }, (_, i) => at(G.addDays('2026-11-13', 7 * i))) }).includes('rest_seven'), true);
eq('a secret badge is marked secret', G.BADGES.find((b) => b.id === 'the_way').secret, true);
eq('the rest badges\' names for another tradition', [G.badgeName(G.BADGES.find((b) => b.id === 'rest_return'), 0), G.badgeName(G.BADGES.find((b) => b.id === 'rest_return'), 6)], ['חזרה אחרי המנוחה', 'שבת למנוחה']);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
