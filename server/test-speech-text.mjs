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

/* ---- niqqud for the voice ---- */
eq('plain Hebrew needs niqqud', S.needsNiqqud('שלום, מה שלומכם היום?'), true);
eq('pointed Hebrew does not', S.needsNiqqud('שָׁלוֹם, מַה שְּׁלוֹמְכֶם הַיּוֹם?'), false);
eq('English does not', S.needsNiqqud('Hello there'), false);
eq('the name alone (pointed) does not', S.needsNiqqud(R), false);
const p = S.protect(`שלום, אני ${R}. ו${R} שוב`);
eq('the name is put aside', p.text, 'שלום, אני @@1@@. ו@@2@@ שוב');
eq('twice', p.kept.length, 2);
eq('and back', S.restore('שָׁלוֹם, אֲנִי @@1@@. וְ@@2@@ שׁוּב', `שלום, אני ${R}. ו${R} שוב`, p.kept), `שָׁלוֹם, אֲנִי ${R}. וְ${R} שׁוּב`);
eq('a lost token: the original', S.restore('שָׁלוֹם, אֲנִי.', 'שלום, אני @@1@@.', [R]), 'שלום, אני @@1@@.');
eq('changed letters: the original', S.restore('שָׁלוֹם רַב', 'שלום', []), 'שלום');
eq('the same letters with niqqud: used', S.restore('שָׁלוֹם', 'שלום', []), 'שָׁלוֹם');
eq('deficient spelling (the vav dropped): used', S.restore('בֹּקֶר טוֹב', 'בוקר טוב', []), 'בֹּקֶר טוֹב');
// (Gemini's real answer for a line, 2026-11-13)
const line = `בוקר טוב! הוספתי חלב ולחם לרשימת הקניות. ${R} כאן אם תצטרכו עוד משהו.`;
const pl = S.protect(line);
eq('a real answer comes back whole', S.restore('בֹּקֶר טוֹב! הוֹסַפְתִּי חָלָב וְלֶחֶם לִרְשִׁימַת הַקְּנִיּוֹת. @@1@@ כָּאן אִם תִּצְטָרְכוּ עוֹד מַשֶּׁהוּ.', line, pl.kept),
  `בֹּקֶר טוֹב! הוֹסַפְתִּי חָלָב וְלֶחֶם לִרְשִׁימַת הַקְּנִיּוֹת. ${R} כָּאן אִם תִּצְטָרְכוּ עוֹד מַשֶּׁהוּ.`);
eq('a changed word is still caught', S.restore('בֹּקֶר רַע', 'בוקר טוב', []), 'בוקר טוב');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
