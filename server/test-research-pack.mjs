// Tests for the academic writing pack (server/research-pack.ts):   node server/test-research-pack.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const dir = mkdtempSync(join(tmpdir(), 'pack-test-'));
const out = join(dir, 'p.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/research-pack.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const P = await import(pathToFileURL(out).href);
void inflateRawSync; void writeFileSync;

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}:\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); } };

/* ---- templates ---- */
const imrad = P.draftTemplate('imrad');
const t = P.fromTemplate(imrad, 'הסולם', [{ title: 'בית אל', body: 'המקום' }]);
eq('a template: its sections in order', [...t.matchAll(/^## (.*)$/gm)].map((m) => m[1]), ['תקציר', 'מבוא', 'שיטות', 'תוצאות', 'דיון', 'מסקנות']);
eq('the notes go under the main section', t.includes('## תוצאות\n\n### בית אל\n\nהמקום'), true);
eq('an unknown template', P.draftTemplate('nope'), null);

/* ---- numbering and cross-references ---- */
const n = P.numberHeadings('# כותרת\n\n## מבוא\n\n### רקע {#bg}\n\n## דיון\n\nכפי שב[ref:bg] וב[ref:nope].');
eq('numbered headings', [...n.md.matchAll(/^#{2,4} (.*)$/gm)].map((m) => m[1]), ['1. מבוא', '1.1. רקע', '2. דיון']);
eq('a cross-reference written out, an unknown one left', n.md.split('\n').pop(), 'כפי שבסעיף 1.1 וב[ref:nope].');
eq('without numbers: the section\'s name', P.plainHeadings('### רקע {#bg}\n\nראו [ref:bg].'), '### רקע\n\nראו "רקע".');

/* ---- footnotes ---- */
eq('footnotes numbered, collected', P.footnotes('טענה^[מקור א] ועוד^[מקור ב].'), { text: 'טענה[1] ועוד[2].', notes: ['מקור א', 'מקור ב'] });
eq('a citation inside a footnote is not cut', P.footnotes('טענה.^[ראו גם [@abcd1234, p. 3].] סוף'), { text: 'טענה.[1] סוף', notes: ['ראו גם [@abcd1234, p. 3].'] });
eq('a footnote never closed stays as it is', P.footnotes('טקסט ^[פתוח'), { text: 'טקסט ^[פתוח', notes: [] });

/* ---- words and the checklist ---- */
eq('words, without the marks', P.wordCount('## כותרת\n\nשלוש מילים כאן [@abcd1234] ^[הערה ארוכה מאוד] {#x}'), 4);
const checks = P.checklist('## מבוא\n\nטקסט [@good0001] ו[@lost0001].\n\n(להשלים: מקור)\n\n## דיון\n\n[ref:nowhere]', { template: imrad, sourceIds: ['good0001'] });
eq('the checklist', checks.map((c) => [c.ok, c.text]), [
  [false, 'חסרים פרקים: תקציר, שיטות, תוצאות, מסקנות'], [false, '6 מילים מתוך 6,000 – עוד רחוק'], [false, '1 ציטוטים בלי מקור במחקר'],
  [false, '1 מקומות שעוד צריך להשלים'], [false, 'יש תקציר'], [false, '1 הפניות לסעיף שלא קיים']]);
eq('a clean draft with no template', P.checklist('## א\n\nטקסט [@good0001].', { sourceIds: ['good0001'] }).every((c) => c.ok), true);

/* ---- Hebrew and English ---- */
eq('a paragraph finds its direction; English stays in order', P.bidiHtml('<p>כפי שכתב Smith (2020) בספר</p>'), '<p dir="auto">כפי שכתב <bdi dir="ltr">Smith (2020)</bdi> בספר</p>');

/* ---- .docx: a valid zip Word can open ---- */
eq('crc32 of "123456789"', P.crc32(new TextEncoder().encode('123456789')).toString(16), 'cbf43926');
const d = P.docx('הסולם', '# הסולם\n\n## מבוא\n\nשורה **חזקה** & <רעה>\n\n- א\n- ב', ['Cohen, S. (2020). Title.'], ['הערה']);
eq('a zip that starts and ends right', [d[0], d[1], d[2], d[3], d[d.length - 22], d[d.length - 21]], [0x50, 0x4b, 3, 4, 0x50, 0x4b]);
const s = new TextDecoder().decode(d);
eq('it holds the five parts of a document', ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels'].every((f) => s.includes(f)), true);
eq('right to left, headings styled, text escaped', [s.includes('<w:bidi/>'), s.includes('w:val="Heading1"'), s.includes('&amp; &lt;רעה&gt;'), s.includes('<w:b/>')], [true, true, true, true]);
eq('the bibliography and the notes in it', [s.includes('ביבליוגרפיה'), s.includes('Cohen, S. (2020)'), s.includes('1. הערה')], [true, true, true]);

/* ---- slides ---- */
const html = P.slidesHtml('הסולם', '# הסולם\n\n## מבוא {#a}\n\nשורה אחת\n\n(להשלים)\n\n## דיון\n\n- נקודה\n- עוד', (m) => '<ul>' + m.split('\n').map((l) => `<li>${l.slice(2)}</li>`).join('') + '</ul>');
eq('slides: the title and a slide for each section', (html.match(/<section/g) || []).length, 3);
eq('their points, without the placeholders', [html.includes('<li>שורה אחת</li>'), html.includes('להשלים'), html.includes('<li>נקודה</li>')], [true, false, true]);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
