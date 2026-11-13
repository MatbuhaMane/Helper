// Tests for shared goals and encouragement (server/goal-social-logic.ts):   node server/test-goal-social.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'social-test-'));
const out = join(dir, 's.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/goal-social-logic.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const S = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

const mom = { email: 'mom@x', household: 'A', child: false }, kid = { email: 'kid@x', household: 'A', child: true }, aunt = { email: 'aunt@x', household: 'B', child: false };
eq('the household sees a post', S.maySee(mom, kid), true);
eq('another household does not', S.maySee(aunt, mom), false);
eq('no heart on one\'s own post', S.mayHeart(mom, mom), false);
eq('a heart from the family', S.mayHeart(mom, kid), true);
eq('advice to a child from the family', S.mayAdvise(mom, kid), true);
eq('no advice to a child from outside the family', S.mayAdvise(aunt, kid), false);
eq('no advice from outside the household at all (for now)', S.mayAdvise(aunt, mom), false);

eq('advice is trimmed', S.cleanAdvice('  נסה בבוקר  '), 'נסה בבוקר');
eq('empty advice', S.cleanAdvice('   '), '');
eq('control characters out, many line breaks folded', S.cleanAdvice('א\u0007ב\n\n\n\nג'), 'א ב\n\nג');
eq('long advice is cut', S.cleanAdvice('א'.repeat(400)).length, S.ADVICE_MAX);

eq('one step', S.stepPostText('ריצה', 1), 'התקדמות ב"ריצה": עוד צעד');
eq('three steps', S.stepPostText('ריצה', 3), 'התקדמות ב"ריצה": 3 צעדים היום');
eq('a goal', S.goalPostText('ריצה'), 'השגת המטרה "ריצה"');

eq('nothing yet', S.encouragementBadges({ adviceHearted: 0, heartsGiven: 4, advisedGoalsDone: 0 }), []);
eq('the adviser', S.encouragementBadges({ adviceHearted: 1, heartsGiven: 0, advisedGoalsDone: 0 }), ['adviser']);
eq('a supporting shoulder at five hearts', S.encouragementBadges({ adviceHearted: 0, heartsGiven: 5, advisedGoalsDone: 0 }), ['shoulder']);
eq('an angel', S.encouragementBadges({ adviceHearted: 0, heartsGiven: 0, advisedGoalsDone: 1 }), ['angel']);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
