// Tests for the vault's two levels (server/vault/access.ts): which route needs what, and that every handler in
// server/vault/index.ts reads its level from the table.   node server/vault/test-access.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'access-test-'));
const out = join(dir, 'a.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/vault/access.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const A = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.error('FAIL', name); } };
const eq = (name, got, want) => ok(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want));

/* ---- the owner's rule, route by route ---- */
for (const r of ['tree', 'personGet', 'personSave', 'linkAdd', 'linkSave', 'roles', 'householdSave', 'bridges', 'forest', 'related'])
  eq(`${r}: open on a trusted device`, A.ACCESS[r], 'tree');
for (const [what, routes] of Object.entries({
  'documents and files': ['items', 'itemAdd', 'itemFile', 'itemSave', 'itemDelete', 'itemRestore'],
  'privacy': ['privacySave'],
  'linking trees': ['bridgeAsk', 'bridgeApprove', 'bridgeConsent', 'bridgeDecline', 'bridgeRevoke'],
  'any delete': ['personDelete', 'linkDelete', 'itemDelete'],
  'export and backups': ['auditLog', 'backups', 'backupsRun', 'driveDisconnect'],
  'the keys': ['passkeyList', 'passkeyRemove'],
  'rights': ['roleSave'],
})) for (const r of routes) eq(`${r} (${what}): always a fresh unlock`, A.ACCESS[r], 'fresh');

/* ---- every handler reads its level from the table (and nothing guarded is left out of it) ---- */
const src = readFileSync(join(process.cwd(), 'server/vault/index.ts'), 'utf8');
const handlers = [...src.matchAll(/export async function (\w+)\(ctx: Ctx\)\s*\{([\s\S]*?)\n\}/g)].map((m) => ({ name: m[1], body: m[2] }));
const guarded = handlers.filter((h) => /\bneed\(ctx, /.test(h.body) || /requireUnlocked\(ctx\)|requireOwnerUnlocked\(ctx\)/.test(h.body));
for (const h of guarded) {
  ok(`${h.name} is in the table`, h.name in A.ACCESS);
  ok(`${h.name} reads ACCESS.${h.name}`, h.body.includes(`need(ctx, ACCESS.${h.name}`) || h.body.includes(`requireOwnerUnlocked(ctx)`) && A.ACCESS[h.name] === 'fresh');
  ok(`${h.name} does not call requireUnlocked directly`, !/\brequireUnlocked\(ctx\)/.test(h.body));
}
for (const name of Object.keys(A.ACCESS)) ok(`ACCESS.${name} is a real handler`, handlers.some((h) => h.name === name));

/* ---- trust ---- */
const now = 1_000_000_000_000;
ok('trusted while its time lasts', A.trusted(now + 1000, now) && !A.trusted(now - 1, now) && !A.trusted(null, now));
eq('30 days', A.TRUST_MS, 30 * 864e5);

/* ---- a device's name, never the whole string ---- */
eq('Chrome on Windows', A.deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'), 'Chrome · Windows');
eq('Edge on Windows', A.deviceLabel('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0'), 'Edge · Windows');
eq('Safari on iPhone', A.deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'), 'Safari · iPhone');
eq('Chrome on Android', A.deviceLabel('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36'), 'Chrome · Android');
eq('Firefox on Mac', A.deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:132.0) Gecko/20100101 Firefox/132.0'), 'Firefox · Mac');
eq('the desktop app', A.deviceLabel('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Electron/33.0 Safari/537.36'), 'Chrome · Windows (האפליקציה למחשב)');
eq('nothing known', A.deviceLabel(''), 'דפדפן · מכשיר');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
