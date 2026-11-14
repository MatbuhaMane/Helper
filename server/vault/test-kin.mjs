// Tests for the family tree's stage-2 rules (server/vault/kin.ts): privacy, the tribe, one person in two trees,
// paths and names across the trees.   node server/vault/test-kin.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'kin-test-'));
const out = join(dir, 'kin.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/vault/kin.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const K = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.error('FAIL', name); } };
const eq = (name, got, want) => ok(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want));

/* ---- privacy levels ---- */
eq('default levels', K.parsePrivacy(null), { identity: 'household', dates: 'household', notes: 'household', files: 'household' });
eq('bad JSON → default', K.parsePrivacy('{oops').identity, 'household');
eq('partial and invalid levels', K.parsePrivacy('{"identity":"forest","dates":"everyone"}'), { identity: 'forest', dates: 'household', notes: 'household', files: 'household' });
eq('strictest of two', K.strictest([K.parsePrivacy('{"identity":"forest","notes":"linked"}'), K.parsePrivacy('{"identity":"linked","notes":"forest"}')]), { identity: 'linked', dates: 'household', notes: 'linked', files: 'household' });

const nobody = { self: false, keeper: false }, self = { self: true, keeper: false }, keeper = { self: false, keeper: true };
ok('household sees household', K.sees('household', 'household', nobody, 'identity'));
ok('linked does not see household', !K.sees('household', 'linked', nobody, 'identity'));
ok('linked sees linked', K.sees('linked', 'linked', nobody, 'identity'));
ok('forest does not see linked', !K.sees('linked', 'forest', nobody, 'identity'));
ok('forest sees forest', K.sees('forest', 'forest', nobody, 'dates'));
ok('none sees nothing', !K.sees('forest', 'none', nobody, 'identity'));
ok('private: the household does not see it', !K.sees('private', 'household', nobody, 'notes'));
ok('private: the person sees it', K.sees('private', 'household', self, 'notes'));
ok('private: the keeper sees it', K.sees('private', 'household', keeper, 'notes'));
ok('files never leave the household', !K.sees('forest', 'linked', nobody, 'files') && !K.sees('forest', 'forest', self, 'files'));

/* ---- a card as seen ---- */
const card = (o) => ({ id: 'x', household: 'B', name: 'רינה', member: null, photo: 'ph1', anonymous: false, privacy: K.parsePrivacy(null),
  details: { sex: 'f', born: '1960-01-02', place: 'חיפה', notes: 'אוהבת עוגות', calendar: true, extra: 'שדה לא מוכר' }, ...o });
let v = K.view(card(), 'linked', nobody);
eq('default from a linked household: no name', v.name, K.ANON);
eq('default from a linked household: no details at all', v.details, {});
eq('default from a linked household: no sex, no photo', [v.sex, v.photo], ['', null]);
v = K.view(card({ privacy: K.parsePrivacy('{"identity":"linked","dates":"forest"}') }), 'linked', nobody);
eq('identity linked → the name', v.name, 'רינה');
eq('dates forest → dates and place', [v.details.born, v.details.place, v.details.notes], ['1960-01-02', 'חיפה', undefined]);
eq('the photo is a file: not outside', v.photo, null);
eq('an unknown detail counts as a note', v.details.extra, undefined);
v = K.view(card({ privacy: K.parsePrivacy('{"identity":"linked"}') }), 'forest', nobody);
eq('identity linked, seen from the forest: no name', v.name, K.ANON);
v = K.view(card({ member: 'rina@example.test', privacy: K.parsePrivacy('{"identity":"forest"}') }), 'linked', nobody);
eq('an email never leaves the household', v.member, null);
v = K.view(card({ member: 'rina@example.test' }), 'household', nobody);
eq('inside the household: everything at household level', [v.name, v.member, v.photo, v.details.notes], ['רינה', 'rina@example.test', 'ph1', 'אוהבת עוגות']);
v = K.view(card({ privacy: K.parsePrivacy('{"notes":"private"}') }), 'household', nobody);
eq('private notes: the household does not see them', [v.details.notes, v.hidden], [undefined, ['notes']]);
v = K.view(card({ privacy: K.parsePrivacy('{"identity":"forest","dates":"forest"}'), anonymous: true }), 'linked', nobody);
eq('anonymous outside: nothing but קרוב/ת משפחה', [v.name, v.anonymous, v.details, v.sex], [K.ANON, true, {}, '']);
v = K.view(card({ anonymous: true }), 'household', nobody);
eq('anonymous: inside the household as usual', [v.name, v.anonymous], ['רינה', false]);
v = K.view(card({ privacy: K.parsePrivacy('{"identity":"forest"}') }), 'linked', nobody, { privacy: K.parsePrivacy('{"identity":"household"}'), anonymous: false });
eq('outside: the strictest levels of the person decide', v.name, K.ANON);
v = K.view(card({ privacy: K.parsePrivacy('{"identity":"forest"}') }), 'linked', nobody, { privacy: K.parsePrivacy('{"identity":"forest"}'), anonymous: true });
eq('outside: anonymous in any tree is anonymous', v.anonymous, true);
eq('none: not seen at all', K.view(card(), 'none', nobody), null);
const lv = (s) => K.parsePrivacy(s);
eq('outside, no user: the strictest of the records', K.outside([{ privacy: lv('{"identity":"forest"}'), anonymous: false, user: false }, { privacy: lv(null), anonymous: false, user: false }]).privacy.identity, 'household');
eq('outside, no user: anonymous in any record', K.outside([{ privacy: lv(null), anonymous: true, user: false }, { privacy: lv(null), anonymous: false, user: false }]).anonymous, true);
eq('outside, a user: the user decides, not another tree\'s default', K.outside([{ privacy: lv('{"identity":"forest"}'), anonymous: false, user: true }, { privacy: lv(null), anonymous: true, user: false }]), { privacy: lv('{"identity":"forest"}'), anonymous: false });
eq('the tribe head (keeper) sees an anonymous non-user', K.view(card({ anonymous: true }), 'forest', keeper).name, 'רינה');

eq('saving keeps what the editor could not see', K.keepHidden({ notes: 'סוד', born: '1960-01-02', sex: 'f' }, { born: '1961-01-01', sex: 'f', notes: '' }, ['notes']), { born: '1961-01-01', sex: 'f', notes: 'סוד' });

/* ---- the tribe and the same person ---- */
// A (ours) and B (the in-laws) share Dana (dA ≡ dB); B and C (Yossi's sister's family) share Yossi (yB ≡ yC); D is alone
const bridges = [{ house_a: 'A', person_a: 'dA', house_b: 'B', person_b: 'dB' }, { house_a: 'B', person_a: 'yB', house_b: 'C', person_b: 'yC' }];
eq('distance: the same household', K.distance('A', 'A', bridges), 'household');
eq('distance: linked directly', K.distance('A', 'B', bridges), 'linked');
eq('distance: linked, the other way', K.distance('C', 'B', bridges), 'linked');
eq('distance: in the tribe', K.distance('A', 'C', bridges), 'forest');
eq('distance: outside the tribe', K.distance('A', 'D', bridges), 'none');
eq('the tribe', [...K.tribe('C', bridges)].sort(), ['A', 'B', 'C']);
const root = K.sameness(bridges);
ok('one person in two trees', root('dA') === root('dB') && root('yB') === root('yC') && root('dA') !== root('yB'));
const houses = { dA: 'A', mA: 'A', dB: 'B', yB: 'B', yC: 'C', zC: 'C', dC: 'C' };
const houseOf = (id) => houses[id];
eq('records of a person', K.recordsOf('dB', bridges, houseOf).map((r) => r.id).sort(), ['dA', 'dB']);
eq('link: the same household', K.bridgeProblem({ id: 'dA', household: 'A' }, { id: 'mA', household: 'A' }, bridges, houseOf), 'same_household');
eq('link: already one person', K.bridgeProblem({ id: 'dA', household: 'A' }, { id: 'dB', household: 'B' }, bridges, houseOf), 'already_linked');
eq('link: would give Dana two records in A', K.bridgeProblem({ id: 'mA', household: 'A' }, { id: 'dB', household: 'B' }, bridges, houseOf), 'two_in_one_tree');
eq('link: would give Yossi two records in C', K.bridgeProblem({ id: 'yB', household: 'B' }, { id: 'zC', household: 'C' }, bridges, houseOf), 'two_in_one_tree');
eq('link: fine', K.bridgeProblem({ id: 'dC', household: 'C' }, { id: 'dA', household: 'A' }, [], houseOf), null);

/* ---- names inside one tree: the same as stage 1 ---- */
const P = (a, b, kind = 'bio') => ({ type: 'parent', a, b, kind, status: null });
const M = (a, b, status = 'together', kind = 'married') => ({ type: 'partner', a, b, kind, status });
const sex = { moshe: 'm', rachel: 'f', david: 'm', sarah: 'f', yosef: 'm', me: 'm', noa: 'f', amit: 'm', tal: 'f', ben: 'm', liat: 'f', eli: 'm' };
const one = [P('moshe', 'david'), P('rachel', 'david'), M('moshe', 'rachel'), P('moshe', 'yosef'), P('rachel', 'yosef'), M('david', 'sarah'),
  P('david', 'me'), P('sarah', 'me'), P('david', 'noa'), P('sarah', 'noa'), P('yosef', 'amit'), P('amit', 'tal'), P('noa', 'ben'),
  P('david', 'eli'), P('liat', 'eli'), M('david', 'liat', 'divorced')];
const k1 = K.kin(one, (id) => sex[id] || '');
eq('אבא', k1.relationName('me', 'david'), 'אבא');
eq('סבתא', k1.relationName('me', 'rachel'), 'סבתא');
eq('אחות', k1.relationName('me', 'noa'), 'אחות');
eq('אח למחצה', k1.relationName('me', 'eli'), 'אח למחצה');
eq('דוד', k1.relationName('me', 'yosef'), 'דוד');
eq('בן דוד', k1.relationName('me', 'amit'), 'בן דוד');
eq('אחיין', k1.relationName('me', 'ben'), 'אחיין');
eq('אישה', k1.relationName('david', 'sarah'), 'אישה');
eq('גרושה', k1.relationName('david', 'liat'), 'גרושה');
eq('נכד', k1.relationName('moshe', 'me'), 'נכד');
eq('the path in words', k1.relationName('me', 'tal'), 'בת של בן של אח של אבא');
eq('זה אתה', k1.relationName('me', 'me'), 'זה אתה');
eq('no path', k1.relationName('me', 'nobody'), null);

/* ---- across two trees: our tree (A) and the in-laws' (B), Dana married into ours ---- */
// A: moshe+rachel → david; david+sarah → me; me+danaA.   B: yossi+rina → danaB, gil (Dana's brother); danaB ≡ danaA
const treeA = [P('moshe', 'david'), P('rachel', 'david'), M('moshe', 'rachel'), M('david', 'sarah'), P('david', 'me'), P('sarah', 'me'), P('david', 'noa'), P('sarah', 'noa'), M('danaA', 'me')];
const treeB = [M('rina', 'yossi'), P('yossi', 'danaB'), P('rina', 'danaB'), P('yossi', 'gil'), P('rina', 'gil'), M('danaB', 'meB')];
// B also keeps a card for "me" (meB) – not linked yet, so it is someone else as far as the trees know
const br = [{ house_a: 'A', person_a: 'danaA', house_b: 'B', person_b: 'danaB' }];
const r2 = K.sameness(br);
const merged = K.mergeLinks([...treeA, ...treeB], r2);
const sex2 = { ...sex, danaA: 'f', danaB: 'f', yossi: 'm', rina: 'f', gil: 'm', meB: 'm' };
const k2 = K.kin(merged, (id) => sex2[id] || '');
eq('across: my wife', k2.relationName('me', r2('danaB')), 'אישה');
eq('across: her mother is my חותנת', k2.relationName('me', 'rina'), 'חותנת');
eq('across: her brother is my גיס', k2.relationName('me', 'gil'), 'גיס');
eq('across: my father and her father are מחותנים', k2.relationName('david', 'yossi'), 'מחותן');
eq('across: I am Rina\'s חתן', k2.relationName('rina', 'me'), 'חתן');
eq('across: my sister to Dana\'s brother', k2.relationName('noa', 'gil'), 'אח של אישה של אח');
ok('across: the path goes through Dana once', k2.pathBetween('me', 'rina').nodes.length === 3);
eq('a repeated link is merged', K.mergeLinks([M('a', 'b'), M('b', 'a'), P('a', 'c'), P('a', 'c')], (x) => x).length, 2);
eq('a link between two records of one person is dropped', K.mergeLinks([M('danaA', 'danaB')], r2).length, 0);
// a person whose sex is hidden: neutral forms
const k3 = K.kin(merged, (id) => (id === 'rina' ? '' : sex2[id] || ''));
eq('hidden sex → the neutral form', k3.relationName('me', 'rina'), 'חותן/חותנת');

/* ---- changes to the tree: who must say yes ---- */
const me = 'me@x', ruth = 'ruth@x', dan = 'dan@x';
eq('a card of someone who is not a user: at once', K.approversFor(me, [{ member: null, user: false }]), []);
eq('an email that is not a member is not a user: at once', K.approversFor(me, [{ member: 'nobody@x', user: false }]), []);
eq('my own card: at once', K.approversFor(me, [{ member: me, user: true }]), []);
eq('another user: waits for them', K.approversFor(me, [{ member: ruth, user: true }]), [ruth]);
eq('a link between me and another user: waits for them', K.approversFor(me, [{ member: me, user: true }, { member: ruth, user: true }]), [ruth]);
eq('a link between two other users: waits for both', K.approversFor(me, [{ member: ruth, user: true }, { member: dan, user: true }]), [ruth, dan]);
eq('the same user twice: asked once', K.approversFor(me, [{ member: ruth, user: true }, { member: ruth, user: true }]), [ruth]);
ok('the one it waits for decides', K.mayDecide({ for_email: ruth, status: 'pending' }, ruth));
ok('nobody decides for another', !K.mayDecide({ for_email: ruth, status: 'pending' }, me));
ok('the one who proposed cannot approve it', !K.mayDecide({ for_email: ruth, status: 'pending' }, dan));
ok('no email, no decision', !K.mayDecide({ for_email: ruth, status: 'pending' }, ''));
ok('a decided change is not decided again', !K.mayDecide({ for_email: ruth, status: 'approved' }, ruth) && !K.mayDecide({ for_email: ruth, status: 'declined' }, ruth));
eq('one yes of one: applied', K.groupOutcome([{ status: 'approved' }]), 'apply');
eq('one yes of two: waits', K.groupOutcome([{ status: 'approved' }, { status: 'pending' }]), 'wait');
eq('one no: nothing changes', K.groupOutcome([{ status: 'approved' }, { status: 'declined' }]), 'declined');
eq('a decline alone: nothing changes', K.groupOutcome([{ status: 'declined' }]), 'declined');
eq('cancelled by the one who asked: nothing changes', K.groupOutcome([{ status: 'cancelled' }]), 'declined');
const t0 = 1_000_000;
ok('the deleter undoes at once', K.mayRestore({ deleted_at: t0, deleted_by: me }, me, false, t0 + 10e3));
ok('the deleter, after ten minutes: no', !K.mayRestore({ deleted_at: t0, deleted_by: me }, me, false, t0 + 11 * 60e3));
ok('someone else: no', !K.mayRestore({ deleted_at: t0, deleted_by: me }, ruth, false, t0 + 1e3));
ok('the owner: always', K.mayRestore({ deleted_at: t0, deleted_by: me }, ruth, true, t0 + 365 * 864e5));
ok('a card that was not deleted: nothing to restore', !K.mayRestore({ deleted_at: null, deleted_by: null }, me, true, t0));
eq('changed keys', K.changedKeys({ name: 'רות', details: { born: '1980-01-01', place: 'חיפה' } }, { name: 'רותי', details: { born: '1980-01-01', place: '' , notes: 'x' } }), ['name', 'place', 'notes']);
eq('nothing changed', K.changedKeys({ name: 'a', details: { born: '1' } }, { name: 'a', details: { born: '1' } }), []);

/* ---- arranging: a move to another generation rewrites the relationships ---- */
{
  // אבא and אמא are the parents of me and נועה; עברי (my brother) entered himself as the parent of both of us
  const L = (a, b, type = 'parent') => ({ id: `${a}>${b}`, type, a, b, kind: type === 'parent' ? 'bio' : 'married', status: null });
  const base = [L('dad', 'me'), L('mom', 'me'), L('dad', 'noa'), L('mom', 'noa'), L('ivri', 'me'), L('ivri', 'noa'), L('ivri', 'tali', 'partner'), L('ivri', 'son'), L('tali', 'son')];
  const ids = (ls) => ls.map((l) => l.id ?? `${l.a}>${l.b}`).sort();
  const apply = (links, plan) => [...links.filter((l) => !plan.remove.includes(l)), ...plan.add.map((l) => ({ ...l, id: `${l.a}>${l.b}`, status: null }))];

  const down = K.movePlan(base, 'ivri', { sibling: 'me' });
  eq('parent row → sibling row: the wrong parent links go', ids(down.remove), ['ivri>me', 'ivri>noa']);
  eq('parent row → sibling row: the parents of the sibling are added', ids(down.add), ['dad>ivri', 'mom>ivri']);
  eq('parent row → sibling row: his own son and partner stay', ids(apply(base, down)).filter((x) => x.startsWith('ivri') || x.endsWith('ivri')), ['dad>ivri', 'ivri>son', 'ivri>tali', 'mom>ivri']);
  const after = apply(base, down), k = K.kin(after, () => 'm');
  eq('now he is my brother', k.relationName('me', 'ivri'), 'אח');
  eq('the keyboard "down" does the same', ids(K.movePlan(base, 'ivri', { down: true }).remove), ['ivri>me', 'ivri>noa']);
  eq('the sentence', K.moveWords('ivri', down, (x) => ({ ivri: 'עברי', dad: 'דוד', mom: 'שרה', me: 'אני', noa: 'נועה' })[x], () => 'm'), 'עברי יהיה ילד של דוד ושל שרה, ולא הורה של אני ושל נועה.');

  // and back: from the siblings' row to the parents' row (parent of me): no longer a child of my parents
  const up = K.movePlan(after, 'ivri', { parentOf: 'me' });
  eq('sibling row → parent row: no longer a child of my parents', ids(up.remove), ['dad>ivri', 'mom>ivri']);
  eq('sibling row → parent row: my parent', ids(up.add), ['ivri>me']);
  eq('…and the keyboard "up" makes him a sibling of his parent (an uncle)', ids(K.movePlan(after, 'ivri', { up: true }).remove), ['dad>ivri', 'mom>ivri']);

  // a child row: like the siblings of the other children
  eq('child of ivri and tali, like their son', ids(K.movePlan(after, 'noa', { childOf: 'ivri' }).add), ['ivri>noa', 'tali>noa']);
  eq('…and no longer a child of my parents', ids(K.movePlan(after, 'noa', { childOf: 'ivri' }).remove), ['dad>noa', 'mom>noa']);
  // the rules hold
  const err = (f) => { try { f(); return 'ok'; } catch (e) { return e.message; } };
  eq('nobody their own ancestor', err(() => K.movePlan(after, 'dad', { childOf: 'son' })), 'ok');   // (dad leaves his parents' place: it can be done)
  eq('a sibling of oneself', err(() => K.movePlan(base, 'me', { sibling: 'me' })), 'no_target');
  eq('nothing to move', err(() => K.movePlan(base, 'me', { sibling: 'noa' })), 'nothing_to_move');
  eq('up with no parents', err(() => K.movePlan(base, 'dad', { up: true })), 'no_target');
  eq('a parent of my own parent → my link to them goes', ids(K.movePlan([...base, L('dad', 'mom', 'partner')], 'me', { parentOf: 'dad' }).remove), ['dad>me', 'mom>me']);   // (mom is dad's partner; ivri stays)
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
