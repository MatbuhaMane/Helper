// Tests for who sees a published item at each of the four levels (server/audience-rules.ts):   node server/test-audience.mjs
// SECURITY-SENSITIVE: this is the matrix the master and the owner review. Every level against every kind of viewer.
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'audience-test-'));
const out = join(dir, 'audience.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/audience-rules.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const A = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.error('FAIL', name); } };
const eq = (name, got, want) => ok(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want));

/* ---- the matrix: level × viewer → sees? (1 = sees) ----
                 self household tribe friend member none */
const MATRIX = {
  all:       [1, 1, 1, 1, 1, 0],
  friends:   [1, 1, 1, 1, 0, 0],
  family:    [1, 1, 1, 0, 0, 0],
  me:        [1, 0, 0, 0, 0, 0],
  // the old values: never wider than they were
  household: [1, 1, 0, 0, 0, 0],
  tribe:     [1, 1, 1, 0, 0, 0],
  private:   [1, 0, 0, 0, 0, 0],
  // anything unknown opens to nobody but the publisher
  '':        [1, 0, 0, 0, 0, 0],
  public:    [1, 0, 0, 0, 0, 0],
  ALL:       [1, 0, 0, 0, 0, 0],
};
for (const [level, row] of Object.entries(MATRIX))
  A.REL_ORDER.forEach((rel, i) => eq(`${level || '(empty)'} → ${rel}`, A.reaches(level, rel), !!row[i]));
for (const v of [null, undefined, 3, {}, ['all']]) A.REL_ORDER.slice(1).forEach((rel) => eq(`odd value ${JSON.stringify(v)} → ${rel}`, A.reaches(v, rel), false));

/* ---- every level is a superset of the one below it (the ladder never crosses) ---- */
const ladder = ['me', 'family', 'friends', 'all'];
for (let i = 1; i < ladder.length; i++)
  for (const rel of A.REL_ORDER) ok(`${ladder[i]} ⊇ ${ladder[i - 1]} for ${rel}`, !A.reaches(ladder[i - 1], rel) || A.reaches(ladder[i], rel));
for (const rel of A.REL_ORDER) ok(`household ⊆ family for ${rel}`, !A.reaches('household', rel) || A.reaches('family', rel));

/* ---- the relation: the closest tie wins; a friend who is also family is family ---- */
const base = { signedIn: true, self: false, sameHousehold: false, sameTribe: false, friend: false };
eq('signed out is none, whatever else', A.relOf({ ...base, signedIn: false, self: true, sameHousehold: true, friend: true }), 'none');
eq('self', A.relOf({ ...base, self: true, sameHousehold: true }), 'self');
eq('household beats friend', A.relOf({ ...base, sameHousehold: true, friend: true }), 'household');
eq('tribe beats friend', A.relOf({ ...base, sameTribe: true, friend: true }), 'tribe');
eq('friend', A.relOf({ ...base, friend: true }), 'friend');
eq('a stranger in the tent', A.relOf(base), 'member');

/* ---- old values as the picker shows them ---- */
eq('private shows as me', A.shown('private'), 'me');
eq('tribe shows as family', A.shown('tribe'), 'family');
eq('household shows as family', A.shown('household'), 'family');
eq('unknown shows as me', A.shown('xyz'), 'me');
eq('normalize keeps household', A.normalize('household'), 'household');

/* ---- choosing a level ---- */
eq('an adult may choose all four', A.choosable({ child: false }), ['all', 'friends', 'family', 'me']);
eq('a child only family or me', A.choosable({ child: true }), ['family', 'me']);
eq('pick: an adult chooses friends', A.pick('friends', { child: false }), 'friends');
eq('pick: a child cannot choose all', A.pick('all', { child: true }), 'family');
eq('pick: a child cannot choose friends', A.pick('friends', { child: true }), 'family');
eq('pick: old tribe becomes family', A.pick('tribe', { child: false }), 'family');
eq('pick: old private becomes me', A.pick('private', { child: true }), 'me');
eq('pick: household is not chosen anew', A.pick('household', { child: false }), 'family');
eq('pick: junk falls back', A.pick('<script>', { child: false }, 'me'), 'me');
eq('names', A.AUDIENCES.map((a) => A.AUDIENCE_NAME[a]), ['כולם', 'חברים ומשפחה', 'רק משפחה', 'רק אני']);

console.log(`audience: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
