// Tests for which voice speaks for which companion (server/voice-figures.ts):   node server/test-voice-figures.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'voice-fig-test-'));
const out = join(dir, 's.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/voice-figures.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const V = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (got === want) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const known = (v) => ['Algenib', 'Charon', 'Puck', 'Fenrir', 'Achird', 'Sadachbia', 'Leda'].includes(v);
const own = { fennec: 'Fenrir', owl: 'Achird', hedgehog: 'Sadachbia', lamb: 'Puck' };

// רַאבַּ"ע: the person's choice, then the old saved choice, then Algenib
eq('ezra, nothing chosen', V.voiceFor('', '', '', known), 'Algenib');
eq('ezra by id', V.voiceFor('ibn_ezra', '', '', known), 'Algenib');
eq('ezra, the old saved choice', V.voiceFor('', '', 'Charon', known), 'Charon');
eq('ezra, chosen now beats saved', V.voiceFor('ibn_ezra', 'Leda', 'Charon', known), 'Leda');
eq('ezra, unknown voice', V.voiceFor('', 'Nope', '', known), 'Algenib');
// every animal speaks in its own voice; Algenib never
for (const [f, v] of Object.entries(own)) {
  eq(`${f}: its own`, V.voiceFor(f, '', '', known), v);
  eq(`${f}: the old saved Algenib is ignored`, V.voiceFor(f, '', 'Algenib', known), v);
  eq(`${f}: another saved choice is ignored too (it was made for רַאבַּ"ע)`, V.voiceFor(f, '', 'Charon', known), v);
  eq(`${f}: Algenib asked for falls back`, V.voiceFor(f, 'Algenib', '', known), v);
  eq(`${f}: a chosen voice`, V.voiceFor(f, 'Leda', 'Algenib', known), 'Leda');
  eq(`${f}: light directions`, /playful/.test(V.figureOf(f).style) && !/gravelly/.test(V.figureOf(f).style), true);
}
eq('another figure: never Algenib', V.voiceFor('dog', 'Algenib', 'Algenib', known), 'Puck');
eq('ezra keeps the sage', /gravelly/.test(V.figureOf('').style), true);
eq('four different voices', new Set(Object.values(own)).size, 4);
eq('no animal has Algenib', Object.keys(own).every((f) => V.FIGURES[f].voice !== 'Algenib'), true);
eq('sample: ezra', V.sampleLine('').includes('אבן עזרא'), true);
eq('sample: the owl by name', V.sampleLine('owl').includes('ינשוף'), true);
eq('sample: another figure', V.sampleLine('dog').includes('אבן עזרא'), false);

console.log(`voice-figures: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
