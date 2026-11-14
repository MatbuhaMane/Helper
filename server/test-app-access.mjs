// Tests for beta and secret apps: server/app-access-rules.ts, and that it agrees with public/assets/apps.js.
//   node server/test-app-access.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'app-access-test-'));
const out = join(dir, 'a.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/app-access-rules.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const R = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

/* ---- the rules ---- */
eq('an open app needs no leave', R.leaveFor('/news/'), null);
eq('a beta app needs "beta"', R.leaveFor('/mail/'), 'beta');
eq('an open app opens for anyone', R.mayOpen('/news/', false, []), true);
eq('a beta app is closed without the leave', R.mayOpen('/mail/', false, []), false);
eq('a beta app opens for a beta tester', R.mayOpen('/mail/', false, ['beta']), true);
eq('the owner opens everything', R.mayOpen('/pc/', true, []), true);
eq('a secret app\'s leave does not open a beta app', R.mayOpen('/mail/', false, ['/mail/']), false);
eq('"beta" is grantable', R.grantable().includes('beta'), true);
eq('mail\'s API belongs to mail', R.appOfPath('/api/mail/status'), '/mail/');
eq('a similar path does not', R.appOfPath('/api/mailbox'), null);
eq('another API is open', R.appOfPath('/api/news'), null);

/* ---- a secret app: its own address is its leave ---- */
R.GATED['/x/'] = { access: 'secret', api: ['/api/x/'] };
eq('a secret app\'s leave is its address', R.leaveFor('/x/'), '/x/');
eq('"beta" does not open a secret app', R.mayOpen('/x/', false, ['beta']), false);
eq('its own leave opens it', R.mayOpen('/x/', false, ['/x/']), true);
eq('a secret app is grantable', R.grantable(), ['beta', '/x/']);
delete R.GATED['/x/'];

/* ---- the page's catalogue and the server agree (the page hides, the server refuses) ---- */
const apps = readFileSync(join(process.cwd(), 'public/assets/apps.js'), 'utf8');
const marked = {};
for (const line of apps.split('\n')) {
  const h = line.match(/\{ href: '([^']+)'/), a = line.match(/access: '(beta|secret)'/);
  if (h && a) marked[h[1]] = a[1];
}
const server = Object.fromEntries(Object.entries(R.GATED).map(([h, g]) => [h, g.access]));
eq('apps.js and the server list the same gated apps', Object.keys(marked).sort(), Object.keys(server).sort());
for (const h of Object.keys(marked)) eq(`${h}: the same access`, marked[h], server[h]);

console.log(`app-access: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
