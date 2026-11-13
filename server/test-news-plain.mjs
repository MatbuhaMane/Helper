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

// feedMedia: the list's picture is the smallest at least 300 wide, the hero the widest; videos left out
const guardian = '<media:content width="140" url="https://i/140.jpg"/><media:content width="460" url="https://i/460.jpg"/><media:content width="1200" url="https://i/1200.jpg"/>';
eq('several sizes', N.feedMedia(guardian), { small: 'https://i/460.jpg', full: 'https://i/1200.jpg' });
eq('the full size listed first', N.feedMedia('<media:content url="https://i/big.jpg" width="1200"/><media:thumbnail url="https://i/s.jpg" width="320"/>'), { small: 'https://i/s.jpg', full: 'https://i/big.jpg' });
eq('all too small: the widest', N.feedMedia('<media:thumbnail url="https://i/a.jpg" width="100"/><media:thumbnail url="https://i/b.jpg" width="200"/>'), { small: 'https://i/b.jpg', full: 'https://i/b.jpg' });
eq('no widths: the first', N.feedMedia('<media:thumbnail url="https://i/a.jpg"/><media:content url="https://i/b.jpg"/>'), { small: 'https://i/a.jpg', full: 'https://i/a.jpg' });
eq('a video is left out', N.feedMedia('<media:content url="https://v/x.mp4" type="video/mp4" width="640"/><media:thumbnail url="https://i/t.jpg" width="480"/>'), { small: 'https://i/t.jpg', full: 'https://i/t.jpg' });
eq('none', N.feedMedia('<title>x</title>'), { small: null, full: null });
eq('media:group is not a picture', N.feedMedia('<media:group><media:content url="https://i/g.jpg" width="600"/></media:group>'), { small: 'https://i/g.jpg', full: 'https://i/g.jpg' });

// smallImage: a Cloudinary address that says its size asks for 480 wide
const jp = 'https://images.jpost.com/image/upload/f_auto,fl_lossy/q_auto/c_fill,g_faces:center,h_2400,w_3600/746245';
eq('jpost h,w', N.smallImage(jp), 'https://images.jpost.com/image/upload/f_auto,fl_lossy/q_auto/c_fill,g_faces:center,h_320,w_480/746245');
eq('w,h order', N.smallImage('https://x.com/image/upload/c_fill,w_1200,h_800/a.jpg'), 'https://x.com/image/upload/c_fill,w_480,h_320/a.jpg');
eq('already small', N.smallImage('https://x.com/image/upload/c_fill,h_200,w_300/a.jpg'), 'https://x.com/image/upload/c_fill,h_200,w_300/a.jpg');
eq('not cloudinary', N.smallImage('https://i.guim.co.uk/img/media/a.jpg?width=1200'), 'https://i.guim.co.uk/img/media/a.jpg?width=1200');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
