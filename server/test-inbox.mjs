// Tests for the inbox's rules (server/inbox-rules.ts): who sees which message.   node server/test-inbox.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'inbox-test-'));
const out = join(dir, 'i.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/inbox-rules.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const R = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const M = (o) => ({ id: 'x', to_email: null, by_email: 'owner@example.test', keep: null, ...o });
const noa = 'noa@example.test', dana = 'dana@example.test';

eq('a system note to me', R.sees(M({ by_email: 'system', to_email: noa }), noa), true);
eq('a system note to someone else', R.sees(M({ by_email: 'system', to_email: dana }), noa), false);
eq('the owner to me alone', R.sees(M({ to_email: noa }), noa), true);
eq('the owner to someone else alone', R.sees(M({ to_email: dana }), noa), false);
eq('the address in another case', R.sees(M({ to_email: 'Noa@Example.test' }), noa), true);
eq('to everyone, not kept', R.sees(M({}), noa), false);
eq('to everyone, kept', R.sees(M({ keep: 1 }), noa), true);
eq('to everyone, kept, seen by anyone', R.sees(M({ keep: 1 }), dana), true);
eq('a system row with no address stays the owner\'s', R.sees(M({ by_email: 'system', keep: 1 }), noa), false);
eq('keep on a message to someone else changes nothing', R.sees(M({ to_email: dana, keep: 1 }), noa), false);

const mine = new Set(['a1', 'a2']);
eq('read: my ids and notices only', R.readIds(['a1', 'b9', 'wn:v42', 'wn:', 'wn:a b', 7], mine), ['a1', 'wn:v42']);
eq('read: not a list', R.readIds('a1', mine), []);
eq('read: once each', R.readIds(['a1', 'a1'], mine), ['a1']);

console.log(fail ? `${fail} of ${pass + fail} inbox tests failed` : `inbox: all ${pass} tests passed`);
process.exit(fail ? 1 : 0);
