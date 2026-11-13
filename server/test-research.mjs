// Tests for the research assistant's citations (server/research-cite.ts):   node server/test-research.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'research-test-'));
const out = join(dir, 'c.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/research-cite.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const C = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}:\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); } };

const article = { type: 'journal-article', title: 'The ladder in Jacob\'s dream', author: [{ family: 'Cohen', given: 'Sarah Ruth' }, { family: 'Levi', given: 'David' }],
  issued: { 'date-parts': [[2020, 3]] }, 'container-title': 'Journal of Biblical Literature', volume: '139', issue: '2', page: '201-220', DOI: '10.15699/jbl.1392.2020.1' };
const book = { type: 'book', title: 'Genesis', author: [{ family: 'Sarna', given: 'Nahum M.' }], issued: { 'date-parts': [[1989]] }, publisher: 'Jewish Publication Society', 'publisher-place': 'Philadelphia' };

/* ---- the styles ---- */
eq('APA, an article', C.format(article, 'apa'), 'Cohen, S. R., & Levi, D. (2020). The ladder in Jacob\'s dream. *Journal of Biblical Literature*, *139*(2), 201-220. https://doi.org/10.15699/jbl.1392.2020.1');
eq('APA, a book', C.format(book, 'apa'), 'Sarna, N. M. (1989). *Genesis.* Jewish Publication Society.');
eq('MLA, an article', C.format(article, 'mla'), 'Cohen, Sarah Ruth, and David Levi. "The ladder in Jacob\'s dream." *Journal of Biblical Literature*, vol. 139, no. 2, 2020, pp. 201-220. https://doi.org/10.15699/jbl.1392.2020.1');
eq('MLA, a book', C.format(book, 'mla'), 'Sarna, Nahum M. *Genesis.* Jewish Publication Society, 1989.');
eq('Chicago, an article', C.format(article, 'chicago'), 'Cohen, Sarah Ruth, and David Levi. 2020. "The ladder in Jacob\'s dream." *Journal of Biblical Literature* 139 (2): 201-220. https://doi.org/10.15699/jbl.1392.2020.1');
eq('Chicago, a book', C.format(book, 'chicago'), 'Sarna, Nahum M. 1989. *Genesis.* Philadelphia: Jewish Publication Society.');
eq('no author, no year', C.format({ title: 'דף בלי שם', URL: 'https://x.test/p' }, 'apa'), '(n.d.). דף בלי שם. https://x.test/p');

/* ---- in the text ---- */
eq('in-text', [C.inText(article, 'apa'), C.inText(article, 'chicago'), C.inText(article, 'mla'), C.inText(book, 'apa')], ['(Cohen & Levi, 2020)', '(Cohen and Levi 2020)', '(Cohen and Levi)', '(Sarna, 1989)']);
eq('three authors: et al.', C.inText({ ...article, author: [...article.author, { family: 'Mizrahi', given: 'A' }] }, 'apa'), '(Cohen et al., 2020)');

/* ---- BibTeX ---- */
const used = new Set();
eq('BibTeX of an article', C.bibtex(article, used), '@article{cohen2020ladder,\n  title = {The ladder in Jacob\'s dream},\n  author = {Cohen, Sarah Ruth and Levi, David},\n  year = {2020},\n  journal = {Journal of Biblical Literature},\n  volume = {139},\n  number = {2},\n  pages = {201--220},\n  doi = {10.15699/jbl.1392.2020.1}\n}');
eq('a second key for the same is different', C.bibtex(article, used).split('\n')[0], '@article{cohen2020ladderb,');
eq('special characters escaped', C.bibtex({ title: 'Salt & 50% {more}', issued: { 'date-parts': [[2001]] } }).includes('title = {Salt \\& 50\\% more}'), true);

/* ---- DOI ---- */
eq('a DOI from what was pasted', [C.doiOf('https://doi.org/10.1000/xyz123.'), C.doiOf('doi:10.15699/jbl.1392.2020.1'), C.doiOf('no doi here')], ['10.1000/xyz123', '10.15699/jbl.1392.2020.1', null]);

/* ---- Crossref and OpenAlex answers ---- */
eq('from Crossref', C.fromCrossref({ type: 'journal-article', title: ['T'], author: [{ family: 'A', given: 'B' }, { name: 'The Group' }], issued: { 'date-parts': [[2019, 5, 1]] }, 'container-title': ['J'], DOI: '10.1/x', volume: '3' }),
  { type: 'journal-article', title: 'T', author: [{ family: 'A', given: 'B' }, { literal: 'The Group' }], issued: { 'date-parts': [[2019, 5, 1]] }, 'container-title': 'J', volume: '3', DOI: '10.1/x' });
const oa = C.fromOpenAlex({ id: 'https://openalex.org/W1', doi: 'https://doi.org/10.1/x', title: 'T', publication_year: 2018, authorships: [{ author: { display_name: 'Sarah R. Cohen' } }],
  primary_location: { source: { display_name: 'J', host_organization_name: 'P' }, landing_page_url: 'https://j.test/1' }, biblio: { volume: '2', first_page: '5', last_page: '9' },
  open_access: { oa_url: 'https://repo.test/1.pdf' }, is_retracted: true, cited_by_count: 12 });
eq('from OpenAlex', [oa.csl.DOI, oa.csl.author, oa.csl.page, oa.oa, oa.retracted, oa.cited], ['10.1/x', [{ family: 'Cohen', given: 'Sarah R.' }], '5-9', 'https://repo.test/1.pdf', true, 12]);

/* ---- links between notes ---- */
eq('[[links]] in a note', C.linksIn('ראו [[הסולם]] וגם [[ בית אל ]], ושוב [[הסולם]]'), ['הסולם', 'בית אל']);

/* ---- drafts (step 2) ---- */
const srcs = [{ id: 'src0001', csl: article }, { id: 'src0002', csl: book }];
const dr = C.renderDraft('כפי שטוענים [@src0001], ובספר [@src0002, p. 12]. שוב [@src0001]. ראו [[בית אל]]. [@nope99]', srcs, 'apa');
eq('a draft: citations written out, notes plain, an unknown one left', dr.text, 'כפי שטוענים (Cohen & Levi, 2020), ובספר (Sarna, 1989, p. 12). שוב (Cohen & Levi, 2020). ראו בית אל. [@nope99]');
eq('the draft cites these, in order of first use', dr.cited, ['src0001', 'src0002']);
eq('its bibliography: only what it cites, sorted', dr.bibliography.length, 2);
eq('MLA with a page', C.renderDraft('[@src0002, 12]', srcs, 'mla').text, '(Sarna 12)');
eq('an outline from notes', C.outlineFromNotes('הסולם', [{ title: 'בית אל', body: 'המקום' }], ['מה פירוש סלם?']).split('\n').filter((l) => l.startsWith('#') || l.startsWith('-')),
  ['# הסולם', '## מבוא', '## בית אל', '## שאלות שעוד פתוחות', '- מה פירוש סלם?', '## סיכום']);
eq('Markdown to HTML, escaped', C.mdToHtml('# כותרת\n\nשורה **חזקה** <script>\n\n- א\n- ב\n\n> ציטוט'), '<h1>כותרת</h1>\n<p>שורה <b>חזקה</b> &lt;script&gt;</p>\n<ul><li>א</li><li>ב</li></ul>\n<blockquote>ציטוט</blockquote>');
const BS = String.fromCharCode(92);
eq('Markdown to LaTeX, with \cite and escapes', C.mdToLatex('## פרק\n\n50% & _x_ [@src0001, p. 3] *נטוי*', new Map([['src0001', 'cohen2020ladder']])),
  `${BS}section{פרק}\n\n50${BS}% ${BS}& ${BS}_x${BS}_ ${BS}cite[p. 3]{cohen2020ladder} ${BS}emph{נטוי}`);
eq('a backslash in the text', C.mdToLatex('a' + BS + 'b'), 'a' + BS + 'textbackslash{}b');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
