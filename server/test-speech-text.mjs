// Tests for what the voice reads (server/speech-text.ts):   node server/test-speech-text.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'speech-test-'));
const out = join(dir, 's.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/speech-text.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const S = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (got === want) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const R = S.SPOKEN_RABA;

eq('with niqqud and "', S.forSpeech('שלום, אני רַאבַּ"ע.'), `שלום, אני ${R}.`);
eq('plain, with "', S.forSpeech('אני ראב"ע'), `אני ${R}`);
eq('with gershayim ״', S.forSpeech('אני ראב״ע'), `אני ${R}`);
eq("with two apostrophes ''", S.forSpeech("אני ראב''ע"), `אני ${R}`);
eq('with a prefix letter', S.forSpeech('כתבו לראב"ע'), `כתבו ל${R}`);
eq('twice', S.forSpeech('ראב"ע וראב"ע'), `${R} ו${R}`);
eq('other words untouched', S.forSpeech('ראבעים, ראב ע, רבע שעה'), 'ראבעים, ראב ע, רבע שעה');
eq('other acronyms untouched', S.forSpeech('רמב"ם ורש"י'), 'רמב"ם ורש"י');
eq('the spoken form has no gershayim', /["״]/.test(R), false);
eq('empty', S.forSpeech(''), '');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
