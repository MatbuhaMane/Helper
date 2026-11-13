// Tests for the forest search's filter (server/family-find-rules.ts):   node server/test-family-find.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'find-test-'));
const out = join(dir, 'find.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/family-find-rules.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const F = await import(pathToFileURL(out).href);

let failed = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { failed++; console.error('✗', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

const c = (pid, name, o = {}) => ({ pid, root: o.root || pid, mine: !!o.mine, name, anonymous: !!o.anonymous, hidden: o.hidden || [], user: !!o.user, self: !!o.self });
const people = [
  c('me', 'דוד כהן', { mine: true, user: true, self: true }),
  c('sara', 'שרה כהן', { mine: true, user: true }),
  c('grandpa', 'אברהם כהן', { mine: true }),                                   // a record, not a user
  c('f1', 'רבקה לוי', { user: true }),                                         // another household of the tribe
  c('f2', 'קרוב/ת משפחה', { anonymous: true, hidden: ['identity', 'dates', 'notes', 'files'] }),   // anonymous there
  c('f3', 'יעקב כהן', { hidden: ['identity'] }),                               // identity hidden (would be ANON anyway)
  c('f4', 'שָׂרָה לוי', { root: 'sara2', user: true }),                          // niqqud in the name
  c('f5', 'משה מזרחי', { user: true }),                                       // in the tribe, no family path
  c('mine-of-f1', 'רבקה לוי', { root: 'f1', mine: true }),                    // the same person, our own record
];
const kin = new Set(['sara', 'grandpa', 'f1', 'sara2']);
const isKin = (r) => kin.has(r);
const ids = (r) => r.map((x) => x.pid);

// the query
eq(F.cleanQuery('ד'), null, 'one letter is too short');
eq(F.cleanQuery(' "ד" '), null, 'quotes and spaces do not count as letters');
eq(F.cleanQuery('דָּוִד'), 'דוד', 'niqqud is folded away');
eq(F.cleanQuery('x'.repeat(200))?.length, 60, 'a long query is cut');
eq(F.find(people, 'כ', {}, isKin), [], 'too short: nothing, not everyone');
eq(F.find(people, '', {}, isKin), [], 'empty: nothing');

// privacy: never anonymous, never identity-hidden
const all = F.find(people, 'כהן', {}, isKin);
ok(!ids(all).includes('f3'), 'an identity-hidden card never shows');
ok(!ids(F.find(people, 'קרוב', {}, isKin)).includes('f2'), 'an anonymous card never shows, even by its placeholder name');
ok(!F.find(people, 'משפחה', {}, isKin).length, 'the placeholder name finds nobody');
eq(ids(all).sort(), ['grandpa', 'me', 'sara'].sort(), 'the visible Cohens');
ok(all.every((x) => !('email' in x) && !('member' in x)), 'no email in what the filter returns');

// matching
eq(ids(F.find(people, 'שרה', {}, isKin)).sort(), ['f4', 'sara'].sort(), 'niqqud in a name still matches');
eq(F.match('שרה כהן', 'כהן'), 2, 'a word that starts with the query');
eq(F.match('שרה כהן', 'שרה כהן'), 3, 'the whole name');
eq(F.match('אברהם', 'רהם'), 1, 'inside a word');
eq(F.match('אברהם', 'משה'), 0, 'no match');
eq(ids(F.find(people, 'דוד', {}, isKin)), ['me'], 'the viewer finds themself in the plain search');

// one per person: our own record first
const rivka = F.find(people, 'רבקה', {}, isKin);
eq(ids(rivka), ['mine-of-f1'], 'one card per person, the household\'s own record');
ok(rivka[0].user, 'a person is a user when any of their visible records is');

// the filters
eq(ids(F.find(people, 'כהן', { kinOnly: true }, isKin)).sort(), ['grandpa', 'sara'].sort(), 'kin only: not the viewer, only family paths');
ok(!ids(F.find(people, 'משה', { kinOnly: true }, isKin)).length, 'kin only: a tribe member with no path is left out');
eq(ids(F.find(people, 'משה', {}, isKin)), ['f5'], 'without the filter, the same tribe member shows');
eq(ids(F.find(people, 'כהן', { usersOnly: true }, isKin)).sort(), ['me', 'sara'].sort(), 'users only: records that are not users are left out');
ok(!ids(F.find(people, 'כהן', { kinOnly: true }, () => true)).includes('f3'), 'kin only never brings back a hidden card');

// order and size
eq(ids(F.find(people, 'שרה כהן', {}, isKin))[0], 'sara', 'the whole name first');
const many = Array.from({ length: 50 }, (_, i) => c('p' + i, 'לוי ' + i, { user: true }));
eq(F.find(many, 'לוי', {}, isKin).length, F.MAX_RESULTS, 'at most MAX_RESULTS');

console.log(failed ? `${failed} of ${n} failed` : `all ${n} forest-search tests passed`);
process.exit(failed ? 1 : 0);
