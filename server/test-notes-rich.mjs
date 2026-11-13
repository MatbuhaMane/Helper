// Tests for the rich notes' cleaning (server/notes-rich.ts):   node server/test-notes-rich.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'rich-test-'));
const out = join(dir, 'r.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/notes-rich.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const R = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const H = (s) => R.cleanRich(s).html, T = (s) => R.cleanRich(s).text;

/* ---- what is kept ---- */
eq('the four marks', H('<b>a</b><i>b</i><u>c</u><s>d</s>'), '<b>a</b><i>b</i><u>c</u><s>d</s>');
eq('their other names', H('<strong>a</strong><em>b</em><strike>c</strike><del>d</del>'), '<b>a</b><i>b</i><s>c</s><s>d</s>');
eq('a colour and a font', H('<p><span class="c-vine">x</span> <span class="f-serif c-red">y</span></p>'), '<p><span class="c-vine">x</span> <span class="f-serif c-red">y</span></p>');
eq('a div is a paragraph', H('<div>a</div><div>b</div>'), '<p>a</p><p>b</p>');
eq('nested divs stay lines', H('<div>a<div>b</div></div>'), '<p>a</p><p>b</p>');
eq('br', H('<p>a<br>b</p>'), '<p>a<br>b</p>');

/* ---- what is dropped ---- */
eq('a script with its content', H('<p>a<script>alert(1)</script>b</p>'), '<p>ab</p>');
eq('a style with its content', H('<style>p{color:red}</style><p>a</p>'), '<p>a</p>');
eq('an image', H('<p>a<img src=x onerror=alert(1)>b</p>'), '<p>ab</p>');
eq('a link keeps its text only', H('<p><a href="javascript:alert(1)">click</a></p>'), '<p>click</p>');
eq('handlers and styles on kept tags', H('<b onclick="x()" style="color:red">a</b>'), '<b>a</b>');
eq('a span with a style only: just its text', H('<span style="font-size:40px">a</span>'), 'a');
eq('a class not on the list', H('<span class="evil c-vine">a</span>'), '<span class="c-vine">a</span>');
eq('data-class is not class', H('<span data-class="c-vine">a</span>'), 'a');
eq('an svg with its content', H('<svg><script>x</script><text>t</text></svg>ok'), 'ok');
eq('an iframe', H('<iframe src="https://x"></iframe>a'), 'a');
eq('a comment', H('a<!-- <script>x</script> -->b'), 'ab');
eq('an unclosed tag stays text, escaped', H('a <img src=x onerror=alert(1)'), 'a &lt;img src=x onerror=alert(1)');
eq('text is escaped', H('<p>1 &lt; 2 &amp; "x"</p>'), '<p>1 &lt; 2 &amp; "x"</p>');
eq('an entity cannot make a tag', H('&lt;script&gt;alert(1)&lt;/script&gt;'), '&lt;script&gt;alert(1)&lt;/script&gt;');
eq('quotes in the class value', H('<span class="c-vine" onmouseover="x">a</span>'), '<span class="c-vine">a</span>');
eq('an attribute with > inside quotes', H('<b title="a>b">x</b>'), '<b>x</b>');
eq('unclosed marks are closed', H('<b>a<i>b'), '<b>a<i>b</i></b>');
eq('a stray closing tag', H('a</b>b'), 'ab');
eq('empty marks vanish', H('<b></b><span class="c-red"></span>a'), 'a');
eq('nothing at all', H('<p><br></p>'), '');
eq('only whitespace', H('   '), '');

/* ---- plain text ---- */
eq('lines from paragraphs', T('<p>a</p><p><br></p><p>b</p>'), 'a\n\nb');
eq('a first line outside a block (Chrome)', T('a<div>b</div>'), 'a\nb');
eq('a break inside a line', T('<p>a<br>b</p>'), 'a\nb');
eq('a trailing placeholder break', T('<p>a<br></p><p>b</p>'), 'a\nb');
eq('nbsp is a space', T('<p>a&nbsp;b</p>'), 'a b');
eq('#tags survive', T('<p><b>#קניות</b> חלב</p>'), '#קניות חלב');
eq('formatted', [R.cleanRich('<p>a</p>').formatted, R.cleanRich('<p><b>a</b></p>').formatted], [false, true]);

/* ---- plain to rich and back ---- */
eq('plain to paragraphs', R.plainToRich('a\n\nb <c>'), '<p>a</p><p><br></p><p>b &lt;c&gt;</p>');
eq('round trip', T(R.plainToRich('שלום\n\n#תגית ועוד\nשורה')), 'שלום\n\n#תגית ועוד\nשורה');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
