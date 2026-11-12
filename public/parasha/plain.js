/* The study room without AI (docs/ai/without-ai.md #7): a question to the researcher becomes a search of Sefaria's own
   texts by its key words, and a text in Aramaic becomes a list of its words to look up in Sefaria's dictionaries.
   No AI here; it runs in the tests too:   node server/test-parasha-plain.mjs */
(function (root) {
  // the words a question is made of but not about
  const STOP = new Set(('מה מי מהו מהי למה מדוע איך כיצד האם היכן איפה מתי כמה איזה איזו אילו של על את אל עם מן מ זה זו זאת הזה הזאת הזו ' +
    'הוא היא הם הן אני אנחנו אתה את אתם אם כי לא כן יש אין גם רק או אבל כל כך מאוד יותר פחות עוד ' +
    'פסוק הפסוק בפסוק פסוקים מילה המילה במילה מילים משמעות המשמעות פירוש הפירוש פירושו אומר אומרת כתוב נאמר כתב כתבו ' +
    'מפרשים המפרשים לפי שם כאן בו בה בהם להם לו לה הזה זהו זוהי בין אחר אחרי לפני תמיד אפשר צריך קשר הקשר ההבדל ' +
    'קטע הקטע בקטע פרק הפרק בפרק פרשה הפרשה בפרשה ספר הספר בספר תורה התורה בתורה מקור מקורות המקור הסבר להסביר תסביר הסבירו').split(/\s+/));
  const NIKUD = /[֑-ׇ]/g;
  const bare = (w) => w.replace(NIKUD, '').replace(/[״"׳'`]/g, '');

  /** a question's key words, in their order: no question words, no "the verse" and the like, at most `max` */
  function keywords(q, max = 4) {
    const words = String(q || '').replace(NIKUD, '').split(/[^א-תA-Za-z0-9״"׳']+/).map((w) => w.replace(/^["׳'״]+|["׳'״]+$/g, '')).filter(Boolean);
    const out = [];
    for (const w of words) {
      const b = bare(w);
      // a word with a one-letter prefix (ו, ה, ב, ל, מ, ש, כ) that is a stop word without it is a stop word too
      if (b.length < 2 || STOP.has(b) || (b.length > 2 && 'והבלמשכ'.includes(b[0]) && STOP.has(b.slice(1)))) continue;
      if (!out.some((x) => bare(x) === b)) out.push(w);
      if (out.length >= max) break;
    }
    return out;
  }
  /** if the whole question finds nothing: its two longest key words */
  const narrower = (words) => [...words].sort((a, b) => bare(b).length - bare(a).length).slice(0, 2);

  /** the words of a Hebrew-script text to look up, in order, each once, without nikud and cantillation */
  function lookupWords(text, max = 12) {
    const out = [];
    for (const w of String(text || '').replace(NIKUD, '').split(/[^א-ת]+/)) {
      if (w.length >= 2 && !out.includes(w)) out.push(w);
      if (out.length >= max) break;
    }
    return out;
  }

  root.ParashaPlain = { keywords, narrower, lookupWords };
})(typeof window !== 'undefined' ? window : globalThis);
