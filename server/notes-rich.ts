// Rich notes (the owner, 2026-11-13): bold, italic, underline, strikethrough, a colour and a font, stored as a strict
// allowlist HTML. Only b, i, u, s, p, br, and span with an allowed class (a colour c-… or a font f-…) are kept; every
// other tag is dropped (its text stays, except inside script/style and the like), and no attribute but such a class
// survives, so there are no links, images, styles or handlers. The page cleans it again before showing it (notes.js).
// `text` is the same note as plain text: the body that search, tags, titles and Drive read.

export const RICH_CLASS = /^(?:c-(?:def|vine|olive|soil|red|blue)|f-(?:rubik|heebo|round|serif))$/;

const KEEP: Record<string, string> = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', s: 's', strike: 's', del: 's', p: 'p', div: 'p', br: 'br', span: 'span' };
const INLINE = new Set(['b', 'i', 'u', 's', 'span']);
const FORMAT = new Set(['b', 'i', 'u', 's', 'span']);
// their content is not text: dropped whole
const SKIP = new Set(['script', 'style', 'template', 'noscript', 'iframe', 'object', 'embed', 'svg', 'math', 'title', 'head', 'textarea', 'select', 'xmp', 'noembed', 'noframes', 'plaintext']);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s: string) {
  return s.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,6});/gi, (m, e: string) => {
    if (e[0] !== '#') return NAMED[e.toLowerCase()] ?? m;
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
  });
}
function classOf(attrs: string) {
  const m = /(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(attrs);
  const v = m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
  return [...new Set(decode(v).split(/\s+/).filter((c) => RICH_CLASS.test(c)))];
}

type Node = { tag: string; cls: string[]; kids: (Node | string)[] };

/** Clean rich-note HTML into the allowlist. `html` is '' when nothing is left; `formatted` is false when it is only
    paragraphs and line breaks (then the note is stored as plain text); `text` is it as plain text. */
export function cleanRich(input: string): { html: string; text: string; formatted: boolean } {
  const src = String(input || '').slice(0, 400000);
  const root: Node = { tag: '', cls: [], kids: [] };
  const stack: Node[] = [root];
  const top = () => stack[stack.length - 1];
  const inP = () => stack.some((n) => n.tag === 'p');
  const re = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|<[!?/][^>]*>/g;
  let at = 0, m: RegExpExecArray | null;
  const text = (s: string) => { if (s) top().kids.push(decode(s)); };
  while ((m = re.exec(src))) {
    text(src.slice(at, m.index));
    at = re.lastIndex;
    if (!m[2]) continue;                                  // a comment, a doctype, a stray "</…"
    const name = m[2].toLowerCase(), closing = !!m[1];
    if (SKIP.has(name)) {
      if (!closing && !/\/\s*$/.test(m[3])) {             // skip to its end tag
        const end = new RegExp(`</${name}\\s*>`, 'ig'); end.lastIndex = at;
        const e = end.exec(src); at = e ? end.lastIndex : src.length; re.lastIndex = at;
      }
      continue;
    }
    const tag = KEEP[name];
    if (!tag) continue;                                   // an unknown tag: dropped, its text stays
    if (tag === 'br') { if (!closing) top().kids.push({ tag: 'br', cls: [], kids: [] }); continue; }
    if (closing) {
      const i = stack.map((n) => n.tag).lastIndexOf(tag);
      if (i > 0) stack.length = i;                        // closes it and anything left open inside it
      continue;
    }
    if (tag === 'p') {
      // a block inside a block (div in div): its lines stay lines
      if (inP()) { while (top().tag !== 'p') stack.pop(); stack.pop(); }
      const n: Node = { tag: 'p', cls: [], kids: [] }; top().kids.push(n); stack.push(n); continue;
    }
    const cls = tag === 'span' ? classOf(m[3]) : [];
    const n: Node = { tag, cls, kids: [] };
    if (tag === 'span' && !cls.length) n.tag = '';        // a span with nothing allowed: just its content
    top().kids.push(n); stack.push(n);
  }
  text(src.slice(at));

  let formatted = false;
  const html = (n: Node | string): string => {
    if (typeof n === 'string') return esc(n);
    const inner = n.kids.map(html).join('');
    if (!n.tag) return inner;
    if (n.tag === 'br') return '<br>';
    if (INLINE.has(n.tag) && !inner) return '';
    if (FORMAT.has(n.tag)) formatted = true;
    return n.tag === 'span' ? `<span class="${n.cls.join(' ')}">${inner}</span>` : `<${n.tag}>${inner}</${n.tag}>`;
  };
  const out = root.kids.map(html).join('');

  // plain text: each block a line (inline runs between blocks are a block too), <br> a line break; a block's last <br>
  // is the editor's placeholder, not a line
  const lines: string[] = [];
  let run = '';
  const flat = (n: Node | string): string => (typeof n === 'string' ? n : n.tag === 'br' ? '\n' : n.kids.map(flat).join(''));
  for (const k of root.kids) {
    if (typeof k !== 'string' && k.tag === 'p') { if (run) { lines.push(run.replace(/\n$/, '')); run = ''; } lines.push(flat(k).replace(/\n$/, '')); }
    else run += flat(k);
  }
  if (run) lines.push(run.replace(/\n$/, ''));
  const plain = lines.join('\n').replace(/ /g, ' ').replace(/[ \t]+$/gm, '').trim();
  return { html: plain || /<span|<b>|<i>|<u>|<s>/.test(out) ? out : '', text: plain, formatted };
}

/** a plain-text note as the editor's paragraphs (for Drive and for the first edit) */
export function plainToRich(text: string) {
  return String(text || '').split('\n').map((l) => (l ? `<p>${esc(l)}</p>` : '<p><br></p>')).join('');
}
