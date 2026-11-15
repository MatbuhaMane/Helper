// node server/test-nag.mjs — "רמת הניג'וס": the level of a tool or an item, the routing, the repeat, the clean-up (server/nag-rules.ts)
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = mkdtempSync(join(tmpdir(), 'nag-'));
const out = join(dir, 'n.mjs');
execSync(`npx esbuild server/nag-rules.ts --bundle --format=esm --platform=neutral --outfile="${out}" --log-level=error`);
const N = await import('file://' + out.split(String.fromCharCode(92)).join('/'));
rmSync(dir, { recursive: true, force: true });
let pass = 0, fail = 0;
const eq = (name, a, b) => { if (JSON.stringify(a) === JSON.stringify(b)) pass++; else { fail++; console.log('FAIL', name, a, '!==', b); } };

// defaults: the owner's list is normal, the rest quiet
for (const t of ['family', 'gather', 'familyday', 'home', 'kitchen']) eq('default ' + t, N.levelFor(undefined, t), 'normal');
for (const t of ['garden', 'goals', 'coach']) eq('default ' + t, N.levelFor({}, t), 'quiet');
eq('unknown tool', N.levelFor({}, 'zzz'), 'quiet');
// the specific wins over the general
const p = { lv: { goals: 'normal', home: 'off' }, it: { 'goals:g1': 'nag', 'home:h1': 'normal' } };
eq('tool level', N.levelFor(p, 'goals'), 'normal');
eq('item beats tool', N.levelFor(p, 'goals', 'g1'), 'nag');
eq('other item uses tool', N.levelFor(p, 'goals', 'g2'), 'normal');
eq('item on in an off tool', N.levelFor(p, 'home', 'h1'), 'normal');
eq('off tool', N.levelFor(p, 'home', 'h9'), 'off');
eq('junk level ignored', N.levelFor({ lv: { goals: 'loud' }, it: { 'goals:g1': 7 } }, 'goals', 'g1'), 'quiet');
// routing
eq('off drops', N.route('off'), 'drop');
eq('quiet is the summary', N.route('quiet'), 'summary');
eq('normal now', N.route('normal'), 'now');
eq('nag now', N.route('nag'), 'now');
// the repeat stops by itself
let sent = 1, at = 0, n = 0;
while ((at = N.nextRepeat(sent, 1000)) !== null) { sent++; n++; if (n > 50) break; }
eq('repeats are capped', n, N.MAX_REPEATS - 1);
eq('first repeat time', N.nextRepeat(1, 1000), 1000 + N.REPEAT_EVERY_MS);
// clean-up of what a device sends
const c = N.cleanNag({ lv: { goals: 'nag', evil: 'nag', home: 'x' }, it: { 'goals:abc': 'off', 'goals:': 'off', 'nope:1': 'nag', 'home:a b': 'nag' } });
eq('clean lv', c.lv, { goals: 'nag' });
eq('clean it', c.it, { 'goals:abc': 'off' });
eq('clean junk', N.cleanNag('x'), { lv: {}, it: {} });
console.log(fail ? `nag: ${fail} FAILED, ${pass} ok` : `nag: all ${pass} ok`);
process.exit(fail ? 1 : 0);
