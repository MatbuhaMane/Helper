// Tests for news without AI (server/news-plain.ts):   node server/test-news-plain.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'news-test-'));
const out = join(dir, 'n.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/news-plain.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const N = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

/* ---- a headline's words ---- */
eq('little words and punctuation out', N.titleWords('הממשלה אישרה את התקציב של 2027!'), ['ממשלה', 'אישרה', 'תקציב', '2027']);
eq('a prefix letter off a long word, not a short one', N.titleWords('ובירושלים ובית'), ['בירושלים', 'ובית']);
eq('English, lower case', N.titleWords('The Government Approves the Budget'), ['government', 'approves', 'budget']);

/* ---- the same story ---- */
const titles = [
  'הממשלה אישרה את תקציב המדינה לשנת 2027',          // 0
  'תקציב המדינה לשנת 2027 אושר בממשלה הלילה',          // 1
  'גשם כבד צפוי בצפון בסוף השבוע',                    // 2
  'הממשלה אישרה תוכנית לשיפור התחבורה הציבורית',      // 3 (same broad topic as 0, another story)
  'Government approves 2027 state budget',            // 4 (another language: only the AI groups it)
  'צפוי גשם כבד בצפון הארץ בסוף השבוע הקרוב',         // 5
];
eq('the same story grouped; another story on the same topic is not', N.sameStory(titles), [[0, 1], [2, 5]]);
eq('headlines too short to tell: not grouped', N.sameStory(['שריפה', 'שריפה']), []);
eq('nothing', N.sameStory([]), []);

/* ---- the lead ---- */
eq('the first sentences', N.lead('משפט ראשון. משפט שני! משפט שלישי? משפט רביעי.'), ['משפט ראשון.', 'משפט שני!', 'משפט שלישי?']);
eq('tags out, spaces folded', N.lead('<p>שלום   לכם.</p><p>עוד</p>', 2), ['שלום לכם.', 'עוד']);
eq('a text with no stop', N.lead('בלי נקודה בסוף'), ['בלי נקודה בסוף']);
eq('about 500 characters at most', N.lead(('מילה '.repeat(150) + '. ') + 'שני.').length, 1);
eq('empty', N.lead(''), []);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
