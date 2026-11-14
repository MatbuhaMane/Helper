// Tests for the funny feed's "מצחיק ואמיתי" filter (server/fun.ts):   node server/test-fun.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'fun-test-'));
const out = join(dir, 'f.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/fun.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const F = await import(pathToFileURL(out).href);
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.error('FAIL', name); } };

for (const t of ['AI generated cat plays piano', 'This is staged lol', 'Sora video of a dog', 'Our prank on dad', 'comedy skit', 'סרטון בינה מלאכותית', 'זה מבוים', 'A.I. baby'])
  ok(F.NOT_REAL.test(t), 'not real: ' + t);
for (const t of ['My dog fell asleep mid-bark', 'Grandpa laughing at his own joke', 'Kid tries lemon for the first time', 'Cat said no', 'Trail cam caught a bear dancing', 'Brain freeze', 'Main character energy'])
  ok(!F.NOT_REAL.test(t), 'real: ' + t);
ok(F.firstTtl(null) === 600 && F.firstTtl('') === 600 && F.firstTtl('abc') === 3600, 'first page kept ten minutes, later an hour');
ok(F.REAL_SUBS.split('+').length >= 5 && !/nsfw/i.test(F.REAL_SUBS), 'real communities');

console.log(`fun: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
