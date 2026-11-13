// Tests for the reports inbox (server/reports-rules.ts, and the gates in server/reports.ts):   node server/test-reports.mjs
// The owner's rule: only the person who sent a report ever sees it or the answer (anyone else: 404), and the team's side
// opens only through the back door (requireAdmin, the owner's own account).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'reports-test-'));
const out = join(dir, 'r.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/reports-rules.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const R = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.error('FAIL', name); } };
const eq = (name, got, want) => ok(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want));
const throws = (name, fn, code) => { try { fn(); ok(name + ' (did not throw)', false); } catch (e) { eq(name, [e.status, e.message], [400, code]); } };

/* ---- reply privacy: only the reporter ---- */
const rep = { id: 'r1', email: 'dana@x', text: 'הכפתור לא נלחץ', path: '/groceries/', title: 'רשימת קניות', state: 'working', created_at: 1, has_shot: 1, read_at: 5, name: 'דנה', shot_data: 'data:...' };
const msgs = [{ id: 'm1', report: 'r1', by_team: 1, by_email: 'owner@x', text: 'תוקן', at: 3 }, { id: 'm2', report: 'r2', by_team: 1, text: 'אחר', at: 4 }];
ok('the reporter may see their report', R.memberMaySee(rep, 'dana@x'));
for (const who of ['avi@x', 'DANA@x', '', 'owner@x']) ok(`${who || 'no one'} may not see it`, !R.memberMaySee(rep, who));
ok('no report: nobody sees it', !R.memberMaySee(null, 'dana@x'));
eq('someone else gets nothing (the handler answers 404)', R.memberThread(rep, msgs, 'avi@x'), null);
eq('a missing report: nothing either (the same 404, so an id cannot be probed)', R.memberThread(null, msgs, 'avi@x'), null);
const t = R.memberThread(rep, msgs, 'dana@x');
eq('the reporter gets only this report\'s answers', t.messages.map((m) => m.id), ['m1']);
eq('an answer carries no team member\'s email', Object.keys(t.messages[0]).sort(), ['at', 'id', 'team', 'text']);
ok('the report sent back has no internal fields', !('read_at' in t.report) && !('shot_data' in t.report) && !('email' in t.report) && !('name' in t.report));
eq('has_shot is a boolean', t.report.has_shot, true);

/* ---- the gates in reports.ts: every team handler opens the back door first; every member handler checks the reporter ---- */
const src = readFileSync(join(process.cwd(), 'server/reports.ts'), 'utf8');
const handlers = [...src.matchAll(/export async function (\w+)\(ctx: Ctx\)\s*\{([\s\S]*?)\n\}/g)].map((m) => ({ name: m[1], body: m[2] }));
const team = handlers.filter((h) => h.name.startsWith('admin'));
eq('the team handlers', team.map((h) => h.name).sort(), ['adminList', 'adminReply', 'adminShot', 'adminState', 'adminThread']);
for (const h of team) ok(`${h.name} opens with requireAdmin(ctx, 'own')`, /^\s*(const a = )?await requireAdmin\(ctx, 'own'\);/.test(h.body));
for (const h of handlers.filter((x) => !x.name.startsWith('admin'))) ok(`${h.name} needs a signed-in member`, /^\s*const u = requireUser\(ctx\);/.test(h.body));
for (const name of ['thread', 'shot']) ok(`${name} checks the reporter before anything`, /memberThread\(|memberMaySee\(/.test(handlers.find((h) => h.name === name).body));
ok('a member\'s list is only their own', /WHERE email = \?[^`]*`\)\.bind\(u\.email\)/.test(handlers.find((h) => h.name === 'mine').body));
const routes = readFileSync(join(process.cwd(), 'functions/api/[[path]].ts'), 'utf8');
for (const h of team) ok(`${h.name} is routed under /api/admin/`, new RegExp(`route\\('\\w+', '/api/admin/[^']+', reports\\.${h.name}\\)`).test(routes));
ok('no member route reaches a team handler', !/route\('\w+', '\/api\/reports[^']*', reports\.admin/.test(routes));

/* ---- what a report keeps ---- */
const c = R.cleanReport({ text: '  לא עובד\u0007  ', path: '/tree/?x=1', title: 'עץ', theme: 'dark', width: 375.4, shot: 'data:image/jpeg;base64,AAAA' });
eq('cleaned', c, { text: 'לא עובד', path: '/tree/?x=1', title: 'עץ', theme: 'dark', width: 375, shot: 'data:image/jpeg;base64,AAAA' });
throws('no text', () => R.cleanReport({ text: '   ' }), 'text_required');
eq('another site is not a page', R.cleanReport({ text: 'x', path: '//evil.com/a' }).path, '/');
eq('a full address is not a page', R.cleanReport({ text: 'x', path: 'https://evil.com/' }).path, '/');
eq('an unknown theme', R.cleanReport({ text: 'x', theme: 'blue' }).theme, null);
eq('no width', R.cleanReport({ text: 'x', width: 'wide' }).width, null);
eq('the text is cut at 1000', R.cleanReport({ text: 'א'.repeat(1500) }).text.length, 1000);
eq('a picture of a kind we do not keep', R.cleanReport({ text: 'x', shot: 'data:image/svg+xml;base64,AAAA' }).shot, null);
eq('not base64', R.cleanReport({ text: 'x', shot: 'data:image/png;base64,<script>' }).shot, null);
eq('too big', R.cleanReport({ text: 'x', shot: 'data:image/png;base64,' + 'A'.repeat(R.SHOT_MAX) }).shot, null);
eq('no screenshot unless chosen', R.cleanReport({ text: 'x' }).shot, null);
throws('an empty reply', () => R.cleanReply('  '), 'text_required');
eq('a reply is cut at 2000', R.cleanReply('x'.repeat(3000)).length, 2000);

/* ---- states, unread, the device ---- */
ok('the three states', ['new', 'working', 'done'].every(R.isState) && !R.isState('open') && !R.isState(undefined));
eq('a reply moves a new report to בטיפול', R.stateAfterReply('new'), 'working');
eq('a reply leaves טופלה as it is', R.stateAfterReply('done'), 'done');
ok('no answer: nothing unread for the member', !R.unreadForMember({ last_team_at: null, seen_at: null }));
ok('an answer not yet opened', R.unreadForMember({ last_team_at: 10, seen_at: null }));
ok('an answer after the last look', R.unreadForMember({ last_team_at: 10, seen_at: 5 }));
ok('opened after the answer', !R.unreadForMember({ last_team_at: 10, seen_at: 12 }));
ok('the team has not opened it', R.unreadForTeam({ created_at: 10, read_at: null }));
ok('the team opened it', !R.unreadForTeam({ created_at: 10, read_at: 11 }));
eq('iPhone', R.deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148', 390), 'phone');
eq('Android phone', R.deviceOf('Mozilla/5.0 (Linux; Android 14) Mobile Safari', 412), 'phone');
eq('Android tablet', R.deviceOf('Mozilla/5.0 (Linux; Android 14) Safari', 800), 'tablet');
eq('iPad', R.deviceOf('Mozilla/5.0 (iPad; CPU OS 17_0)', 820), 'tablet');
eq('Windows', R.deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 1280), 'pc');
eq('initials of two words', R.initials('דנה לוי', 'd@x'), 'דל');
eq('initials of one word', R.initials('דנה', 'd@x'), 'דנ');
eq('initials of an email', R.initials(null, 'dana@x'), 'DA');

console.log(`reports: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
