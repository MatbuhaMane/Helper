// Tests for discovery (server/discover-logic.ts):   node server/test-discover.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'discover-test-'));
const out = join(dir, 'd.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/discover-logic.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const D = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

eq('a tool', D.toolOf('/news/'), 'news');
eq('without the last slash', D.toolOf('/news'), 'news');
eq('a deeper address, with a query and a hash', D.toolOf('/tools/tasks/?g=1#x'), 'goals');
eq('the longest start wins (the fridge, not food)', D.toolOf('/food/fridge/'), 'fridge');
eq('a folder is not a tool', [D.toolOf('/tools/'), D.toolOf('/food/')], [null, null]);
eq('the home page is not a tool', D.toolOf('/'), null);
eq('an unknown address', D.toolOf('/admin/'), null);
eq('not a prefix of another word', D.toolOf('/newsletter/'), null);
eq('every tool is found by its own address', D.TOOLS.every((t) => D.toolOf(t.href) === t.id), true);
eq('ids are unique', new Set(D.TOOLS.map((t) => t.id)).size, D.TOOLS.length);

const p0 = D.progress([]);
eq('nothing found', [p0.found, p0.total, p0.scout], [0, D.TOOLS.length, false]);
const some = D.TOOLS.slice(0, D.SCOUT_AT - 1).map((t) => t.id);
eq('one short of the scout', D.progress(some).scout, false);
eq('the scout', D.progress([...some, D.TOOLS[D.SCOUT_AT - 1].id]).scout, true);
eq('an unknown id does not count', D.progress(['nope', 'news']).found, 1);
eq('each tool says whether it was found', D.progress(['news']).tools.find((t) => t.id === 'news').found, true);

/* ---- a badge for every tool ---- */
eq('a badge per tool, settings left out', D.TOOL_BADGES.length, D.TOOLS.length - 1);
eq('the badge of a tool', D.TOOL_BADGES.find((b) => b.id === D.toolBadge('news'))?.group, 'tools');
eq('every tool badge has its approved name, not the tool\'s', D.TOOL_BADGES.every((b) => b.name !== D.TOOLS.find((t) => D.toolBadge(t.id) === b.id).name), true);
eq('the family tree: השורשים', D.TOOL_BADGES.find((b) => b.id === 'tool_family').name, 'השורשים');
eq('no settings badge', D.TOOL_BADGES.some((b) => b.id === D.toolBadge('settings')), false);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
