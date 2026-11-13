// Tests for the study room without AI (public/parasha/plain.js):   node server/test-parasha-plain.mjs
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

await import(pathToFileURL(join(process.cwd(), 'public/parasha/plain.js')).href);   // a browser script: it sets globalThis.ParashaPlain
const P = globalThis.ParashaPlain;

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

eq('a question to its key words', P.keywords('מה המשמעות של הסולם בחלום יעקב?'), ['הסולם', 'בחלום', 'יעקב']);
eq('question words and "the verse" go', P.keywords('למה כתוב בפסוק "ויצא יעקב"?'), ['ויצא', 'יעקב']);
eq('a stop word with a prefix goes too ("לפרשה" is "the parasha")', P.keywords('ומה הקשר לפרשה הזאת ולמלאכים'), ['ולמלאכים']);
eq('nikud is taken off', P.keywords('מַלְאֲכֵי אֱלֹהִים'), ['מלאכי', 'אלהים']);
eq('each word once', P.keywords('יעקב ועשו, יעקב ולבן'), ['יעקב', 'ועשו', 'ולבן']);
eq('at most four', P.keywords('אברהם יצחק יעקב משה אהרן'), ['אברהם', 'יצחק', 'יעקב', 'משה']);
eq('English works too', P.keywords('What is the ladder?'), ['What', 'is', 'the', 'ladder']);
eq('quotes kept inside a word, not around it', P.keywords('מה פירוש "רש״י"'), ['רש״י']);
eq('nothing left', P.keywords('מה זה?'), []);
eq('the two longest when nothing is found', P.narrower(['הסולם', 'בחלום', 'יעקב']), ['הסולם', 'בחלום']);

eq('Aramaic words to look up', P.lookupWords('וַאֲמַר יַעֲקֹב: וַדַּאי אִית יְקָרָא דַּיְיָ בְּאַתְרָא הָדֵין'), ['ואמר', 'יעקב', 'ודאי', 'אית', 'יקרא', 'דיי', 'באתרא', 'הדין']);
eq('Latin letters are not looked up', P.lookupWords('In principio creavit'), []);
eq('at most twelve', P.lookupWords(Array.from({ length: 20 }, (_, i) => 'מילה' + 'אבגדהוזחטיכלמנסעפצקרשת'[i]).join(' ')).length, 12);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
