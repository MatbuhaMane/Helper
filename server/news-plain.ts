// News without AI (docs/ai/without-ai.md, #6): which headlines tell the same story (by the words they share – the AI
// groups them better, across languages, where it is connected), and an article's opening sentences in place of a
// summary. No database or network here.   Tests: node server/test-news-plain.mjs

const STOP = new Set(('של על את עם אחרי לפני כי גם לא זה זו היא הוא הם הן אל מה כל יותר בין אך או אם אבל כך רק עוד אין יש היה היו ' +
  'אמר אמרה אומר נגד תוך ללא מול בו בה להם לו לה שלו שלה כמו איך למה מי אחד אחת שני שתי שלושה ' +
  'the a an of in to and for on is are was at with by from as that this it its be has have after over new says said will').split(' '));
/** a headline's words for matching: no punctuation, a Hebrew prefix letter off a long word, no little words */
export function titleWords(title: string): string[] {
  const words = String(title || '').toLowerCase().replace(/[׳״'"`’]/g, '').match(/[\p{L}\p{N}]+/gu) || [];
  const out = new Set<string>();
  for (let w of words) {
    if (/^[א-ת]+$/.test(w) && w.length > 4 && /^[והבלמשכ]/.test(w)) w = w.slice(1);
    if (w.length < 2 || STOP.has(w) || /^\d{1,2}$/.test(w)) continue;
    out.add(w);
  }
  return [...out];
}

/** groups (of two or more, by index) of headlines that share enough words to be the same story: at least three words,
    and at least half of the shorter headline's */
export function sameStory(titles: string[]): number[][] {
  const ws = titles.map((t) => new Set(titleWords(t)));
  const parent = titles.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let a = 0; a < ws.length; a++) {
    for (let b = a + 1; b < ws.length; b++) {
      const A = ws[a], B = ws[b];
      if (A.size < 3 || B.size < 3) continue;
      let shared = 0;
      for (const w of A) if (B.has(w)) shared++;
      if (shared >= 3 && shared / Math.min(A.size, B.size) >= 0.5) parent[find(a)] = find(b);
    }
  }
  const groups = new Map<number, number[]>();
  titles.forEach((_, i) => { const r = find(i); (groups.get(r) || groups.set(r, []).get(r)!).push(i); });
  return [...groups.values()].filter((g) => g.length > 1);
}

/** an article's opening sentences (its lead), in place of a summary: up to `n` sentences and about 500 characters */
export function lead(text: string, n = 3): string[] {
  const clean = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [clean];
  const out: string[] = [];
  let length = 0;
  for (const s of sentences.map((x) => x.trim()).filter((x) => x.length > 1)) {
    if (out.length >= n || (out.length && length + s.length > 500)) break;
    out.push(s.length > 500 ? s.slice(0, 497).replace(/\s+\S*$/, '') + '…' : s);
    length += s.length;
  }
  return out;
}

const mediaAttr = (tag: string, name: string) => new RegExp(`\\b${name}=["']([^"']+)`, 'i').exec(tag)?.[1] ?? null;
/** the item's pictures (media:content and media:thumbnail; videos left out). Several feeds (the Guardian, the BBC, the
    NYT) list one picture in several sizes, the first often the full ~1200px: the list gets the smallest that is at
    least 300 wide (else the widest there is; without widths, the first), the article's hero the widest. */
export function feedMedia(b: string): { small: string | null; full: string | null } {
  const all = [...b.matchAll(/<media:(?:content|thumbnail)\b[^>]*>/gi)].map((m) => m[0])
    .filter((t) => !/medium=["'](?:video|audio)|type=["'](?:video|audio)\//i.test(t))
    .map((t) => ({ url: mediaAttr(t, 'url'), w: +(mediaAttr(t, 'width') || 0) }))
    .filter((m): m is { url: string; w: number } => !!m.url);
  if (!all.length) return { small: null, full: null };
  const sized = all.filter((m) => m.w > 0).sort((a, b) => a.w - b.w);
  if (!sized.length) return { small: all[0].url, full: all[0].url };
  const small = sized.find((m) => m.w >= 300) || sized[sized.length - 1];
  return { small: small.url, full: sized[sized.length - 1].url };
}
