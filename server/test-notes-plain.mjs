// Tests for notes without AI (server/notes-plain.ts):   node server/test-notes-plain.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'notes-test-'));
const out = join(dir, 'n.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/notes-plain.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const N = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

/* ---- the title ---- */
eq('the first line', N.plainTitle('לקנות חלב\nולחם וביצים'), 'לקנות חלב');
eq('empty lines and marks skipped', N.plainTitle('\n\n## **רעיון** לטיול\n\nפרטים'), 'רעיון לטיול');
eq('a list item and a checkbox', N.plainTitle('- [ ] להתקשר לסבתא'), 'להתקשר לסבתא');
eq('a numbered item and a quote', [N.plainTitle('1. ראשון'), N.plainTitle('> ציטוט יפה')], ['ראשון', 'ציטוט יפה']);
eq('links and [[…]] as their words', N.plainTitle('ראו [[הסולם]] ו[כאן](https://x.org) https://y.org'), 'ראו הסולם וכאן');
eq('the #tags are not the title', N.plainTitle('#קניות #בית\nחלב'), 'חלב');
eq('a long line: cut at a sentence', N.plainTitle('הפגישה עם המורה עברה טוב מאוד. היא אמרה שהוא מתקדם בחשבון ובקריאה, וצריך עוד קצת סבלנות'), 'הפגישה עם המורה עברה טוב מאוד');
const long = N.plainTitle('מילה '.repeat(30));
eq('else at a word, with …', [long.endsWith('…'), long.length <= 61, !long.includes('  ')], [true, true, true]);
eq('a bare link: the page\'s title', N.plainTitle('https://example.org/a', { url: 'https://example.org/a', title: 'מתכון לשקשוקה' }), 'מתכון לשקשוקה');
eq('or its site', N.plainTitle('https://www.example.org/a'), 'example.org');
eq('nothing at all', N.plainTitle('   '), 'פתק');
eq('a trailing period goes', N.plainTitle('סוף.'), 'סוף');
eq('numbers count as words', N.plainTitle('2 + 2 = 4'), '2 + 2 = 4');

/* ---- the tags ---- */
eq('#words, each once', N.tagsOf('קניות #בית ו#לא-תג #בית #Kitchen\n#kitchen'), ['בית', 'kitchen']);
eq('a heading is not a tag; a number is not one', N.tagsOf('# כותרת\n#1 #2024 #ab'), ['ab']);
eq('in brackets and after a comma', N.tagsOf('(#מתכון),#עוגה'), ['מתכון', 'עוגה']);
eq('a link\'s #anchor is not a tag', N.tagsOf('https://x.org/page#part'), []);
eq('no tags', N.tagsOf(''), []);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
