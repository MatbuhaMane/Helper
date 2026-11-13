// Tests for messages between members (server/dm-rules.ts, and the gates in server/dm.ts):   node server/test-dm.mjs
// The rules: only the household and the joined trees; only the two sides read a conversation (anyone else: 404);
// the page never gets an email; the back door counts only; a block stops both sides; sending is rate-limited.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'dm-test-'));
const out = join(dir, 'd.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/dm-rules.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const D = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.error('FAIL', name); } };
const eq = (name, got, want) => ok(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want));
const throws = (name, fn, code) => { try { fn(); ok(name + ' (did not throw)', false); } catch (e) { eq(name, [e.status, e.message], [400, code]); } };

/* ---- who may write to whom ---- */
const R = (o) => ({ self: false, sameHousehold: false, sameTribe: false, iBlocked: false, theyBlocked: false, ...o });
eq('the household', D.mayMessage(R({ sameHousehold: true })), null);
eq('a joined tree', D.mayMessage(R({ sameTribe: true })), null);
eq('a stranger', D.mayMessage(R({})), 'not_reachable');
eq('oneself', D.mayMessage(R({ self: true, sameHousehold: true })), 'self');
eq('I blocked them', D.mayMessage(R({ sameHousehold: true, iBlocked: true })), 'blocked');
eq('they blocked me', D.mayMessage(R({ sameTribe: true, theyBlocked: true })), 'blocked');
eq('a stranger who also blocked: still just out of reach', D.mayMessage(R({ theyBlocked: true })), 'not_reachable');

/* ---- one conversation per pair ---- */
eq('pair is ordered', D.pair('Zed@x.com', 'amy@x.com'), ['amy@x.com', 'zed@x.com']);
eq('pair either way', D.pair('amy@x.com', 'zed@x.com'), D.pair('zed@x.com', 'AMY@x.com'));

/* ---- only the two sides read ---- */
const t = { id: 't1', a: 'amy@x.com', b: 'zed@x.com', created_at: 1, last_at: 50, last_by: 'zed@x.com', a_seen: 10, b_seen: 50 };
eq('side a', D.sideOf(t, 'amy@x.com'), 'a');
eq('side b, any case', D.sideOf(t, 'Zed@X.com'), 'b');
eq('the household or the owner: nothing', D.sideOf(t, 'owner@x.com'), null);
eq('no thread', D.sideOf(null, 'amy@x.com'), null);
eq('no email', D.sideOf(t, ''), null);
eq('the other side', D.otherOf(t, 'amy@x.com'), 'zed@x.com');

/* ---- unread ---- */
ok('unread for amy (zed wrote after she opened)', D.unreadFor(t, 'amy@x.com'));
ok('not unread for the writer', !D.unreadFor(t, 'zed@x.com'));
ok('not unread once opened', !D.unreadFor({ ...t, a_seen: 60 }, 'amy@x.com'));
ok('unread when never opened', D.unreadFor({ ...t, a_seen: null }, 'amy@x.com'));
ok('nothing sent: not unread', !D.unreadFor({ ...t, last_at: null, last_by: null }, 'amy@x.com'));
ok('a stranger has nothing unread', !D.unreadFor(t, 'owner@x.com'));

/* ---- what the page gets: never an email ---- */
const m = { id: 'm1', thread: 't1', sender: 'zed@x.com', text: 'שלום', at: 50 };
eq('a message', D.publicMsg(m, 'amy@x.com'), { id: 'm1', mine: false, text: 'שלום', at: 50 });
ok('mine', D.publicMsg(m, 'ZED@x.com').mine);
const pt = D.publicThread(t, 'amy@x.com', { name: 'זד', last: m, iBlocked: false });
ok('no email in a listed thread', !/@/.test(JSON.stringify(pt)));
eq('listed thread', [pt.id, pt.name, pt.unread, pt.blocked, pt.last.mine], ['t1', 'זד', true, false, false]);
ok('no email in a message', !/@/.test(JSON.stringify(D.publicMsg(m, 'amy@x.com'))));
eq('name: the Hebrew name first', D.nameOf({ name: 'Zed', he_name: 'זד' }), 'זד');
eq('name: never the email', D.nameOf({ name: null, he_name: '' }), 'בן משפחה');
eq('preview is one short line', D.preview('א\nב  ג'), 'א ב ג');
ok('preview cut', D.preview('x'.repeat(200)).length === 79);

/* ---- the text ---- */
eq('text cleaned', D.cleanText('  שלום\u0007 לך\r\n\n\n\nמה נשמע  '), 'שלום  לך\n\nמה נשמע');
throws('empty text', () => D.cleanText('   '), 'text_required');
throws('no text', () => D.cleanText(undefined), 'text_required');
eq('text cut at the maximum', D.cleanText('א'.repeat(5000)).length, D.TEXT_MAX);

/* ---- the contact list ---- */
const wr = (o) => D.writable({ user: true, self: false, mine: false, anonymous: false, hidden: [], ...o });
ok('a user in a joined tree', wr({}));
ok('not someone who is not a user', !wr({ user: false }));
ok('not an anonymous card', !wr({ anonymous: true }));
ok('not a hidden identity', !wr({ hidden: ['identity'] }));
ok('the household comes from the members list, not the forest', !wr({ mine: true }));
ok('not oneself', !wr({ self: true }));
const list = D.contacts([{ id: 'h2', name: 'תמר', where: 'home' }, { id: 'h1', name: 'אבי', where: 'home' }], [{ id: 'p1', name: 'אהרן', where: 'tribe' }, { id: 'h1', name: 'אבי', where: 'tribe' }]);
eq('household first, by name, once each', list.map((c) => c.id), ['h1', 'h2', 'p1']);

/* ---- the back door: counts only ---- */
eq('stats are numbers', D.stats(2, 9, 4, 1), { threads: 2, messages: 9, lastWeek: 4, blocks: 1 });

/* ---- the gates in the handlers (a read of the source: every handler signs in, the thread goes through threadFor) ---- */
const src = readFileSync(join(process.cwd(), 'server/dm.ts'), 'utf8').replace(/
/g, '
');   // a Windows checkout has CRLF
const fns = [...src.matchAll(/export async function (\w+)\(ctx: Ctx\) \{\n([\s\S]*?)\n\}/g)].map((x) => [x[1], x[2]]);
eq('the handlers', fns.map((f) => f[0]).sort(), ['adminStats', 'block', 'list', 'people', 'send', 'start', 'thread', 'unread']);
for (const [n, b] of fns) ok(`${n} signs in first`, /^\s*(const u = requireUser\(ctx\)|await requireAdmin\(ctx, 'any'\))/.test(b));
for (const n of ['thread', 'send', 'block']) ok(`${n} opens a conversation only through threadFor`, /await threadFor\(ctx, u\)/.test(fns.find((f) => f[0] === n)[1]));
ok('threadFor answers 404 to anyone but the two sides', /if \(!t \|\| !side\) throw new HttpError\(404/.test(src));
ok('send checks the reach rule and both rate limits', (() => { const b = fns.find((f) => f[0] === 'send')[1]; return /await check\(/.test(b) && /'dm:' \+ me/.test(b) && /'dmday:' \+ me/.test(b); })());
ok('start checks the reach rule', /await check\(ctx, u, other\)/.test(fns.find((f) => f[0] === 'start')[1]));
const admin = fns.find((f) => f[0] === 'adminStats')[1];
ok('the back door reads no text, name or email', /COUNT\(\*\)/.test(admin) && !/SELECT (?!COUNT)/.test(admin) && !/text|email|name/.test(admin.replace(/COUNT\(\*\) AS n FROM dm_\w+/g, '')));
ok('no answer names an email', [...src.matchAll(/return json\(([^\n]*)/g)].every((x) => !/email/i.test(x[1])));

console.log(`dm: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
