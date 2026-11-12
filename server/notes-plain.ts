// Notes without AI (docs/ai/without-ai.md, #12): a title from the note's first real line, and tags from the #words in
// it. The AI's title (notes.ts) sits on top of this where an AI is connected; without one, this is what the person gets.
// No database here.   Tests: node server/test-notes-plain.mjs

const MAX = 60;
/** a line without Markdown's marks, links and [[…]] brackets */
function clean(line: string) {
  return line
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\[@[^\]]+\]|\^\[[^\]]*\]|\{#[^}]+\}/g, ' ')
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/, '')
    .replace(/[*_`~]+/g, '')
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
/** cut to a title's length: at a sentence's end when one is near, else at a word, with … */
function cut(s: string) {
  if (s.length <= MAX) return s.replace(/[.,;:]+$/, '');
  const head = s.slice(0, MAX + 1);
  const stop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '), head.lastIndexOf(': '));
  if (stop >= 20) return head.slice(0, stop + (head[stop] === '?' || head[stop] === '!' ? 1 : 0)).trim();
  const space = head.lastIndexOf(' ');
  return (space >= 20 ? head.slice(0, space) : head.slice(0, MAX)).replace(/[.,;:\s]+$/, '') + '…';
}
/** a note's title without AI: its first line with words in it; for a bare link, the page's title or its site */
export function plainTitle(text: string, source?: { url?: string | null; title?: string | null } | null): string {
  for (const line of String(text || '').split(/\r?\n/)) {
    const c = clean(line);
    if (/[\p{L}\p{N}]/u.test(c)) return cut(c);
  }
  if (source?.title?.trim()) return cut(source.title.trim());
  const url = source?.url || (String(text || '').match(/https?:\/\/\S+/) || [])[0];
  if (url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { /* not a link */ } }
  return 'פתק';
}

/** the tags of a note: its #words (Hebrew or English, two letters or more, not a number), each once, in order */
export function tagsOf(text: string): string[] {
  const out: string[] = [], seen = new Set<string>();
  for (const m of String(text || '').matchAll(/(?:^|[\s(,])#([\p{L}\p{N}_]{2,30})(?![\p{L}\p{N}_])/gu)) {
    const t = m[1];
    if (/^\d+$/.test(t)) continue;
    const k = t.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(k); }
  }
  return out.slice(0, 20);
}
