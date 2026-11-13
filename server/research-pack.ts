// The academic formatting and writing pack (the research assistant, step 2 – docs/vision/research.md): templates for
// a draft (IMRaD, a seminar paper, an essay, a talk), numbered headings and cross-references, footnotes, a length
// target, mixed Hebrew and English kept in order, and a checklist before handing in. Plus the two exports with no
// library: .docx (a zip written here, stored, with its CRC) and slides (one HTML page). No AI.
// Tests: node server/test-research.mjs

/* ---------------- templates ---------------- */

export interface DraftTemplate { id: string; name: string; sections: string[]; words?: number; abstract?: boolean }
export const DRAFT_TEMPLATES: DraftTemplate[] = [
  { id: 'imrad', name: 'מאמר מחקר (IMRaD)', sections: ['תקציר', 'מבוא', 'שיטות', 'תוצאות', 'דיון', 'מסקנות'], words: 6000, abstract: true },
  { id: 'seminar', name: 'עבודה סמינריונית', sections: ['מבוא', 'סקירת ספרות', 'גוף העבודה', 'דיון', 'סיכום'], words: 8000 },
  { id: 'essay', name: 'מאמר עיון', sections: ['פתיחה', 'הטענה', 'הראיות', 'טענות נגד', 'סיכום'], words: 3000 },
  { id: 'talk', name: 'הרצאה', sections: ['פתיחה: למה זה חשוב', 'שלוש נקודות', 'דוגמה', 'סיכום ושאלות'], words: 2000 },
  { id: 'post', name: 'פוסט', sections: ['פתיחה', 'העיקר', 'סיכום'], words: 1200 },
];
export const draftTemplate = (id?: string | null) => DRAFT_TEMPLATES.find((t) => t.id === id) || null;

/** a draft from a template: its sections in order, the notes placed under the section that names them (else the body) */
export function fromTemplate(t: DraftTemplate, title: string, notes: { title: string; body: string }[] = []) {
  const parts = [`# ${title}`, ''];
  const main = t.sections.find((s) => /גוף|תוצאות|הראיות|העיקר|שלוש נקודות/.test(s)) || t.sections[Math.min(1, t.sections.length - 1)];
  for (const s of t.sections) {
    parts.push(`## ${s}`, '');
    if (s === main && notes.length) for (const n of notes) parts.push(`### ${n.title}`, '', n.body.trim() || '(להרחיב)', '');
    else parts.push(`(${s})`, '');
  }
  return parts.join('\n');
}

/* ---------------- numbering, cross-references and footnotes ---------------- */

/** headings numbered (1, 1.1, 1.1.1 under the title), and {#label} on a heading becomes a target for [ref:label] → "סעיף 2.1" */
export function numberHeadings(md: string) {
  const counts = [0, 0, 0];
  const labels = new Map<string, string>();
  const lines = String(md || '').split('\n').map((l) => {
    const h = /^(#{2,4})\s+(.*?)\s*(?:\{#([\w֐-׿-]{1,40})\})?\s*$/.exec(l);
    if (!h) return l;
    const level = h[1].length - 2;
    counts[level]++;
    for (let k = level + 1; k < counts.length; k++) counts[k] = 0;
    const num = counts.slice(0, level + 1).join('.');
    if (h[3]) labels.set(h[3], num);
    return `${h[1]} ${num}. ${h[2]}`;
  });
  const out = lines.join('\n').replace(/\[ref:([\w֐-׿-]{1,40})\]/g, (m, k: string) => (labels.has(k) ? `סעיף ${labels.get(k)}` : m));
  return { md: out, labels };
}
/** headings without numbers, their {#labels} taken off and [ref:…] written as the section's name */
export function plainHeadings(md: string) {
  const names = new Map<string, string>();
  const out = String(md || '').split('\n').map((l) => {
    const h = /^(#{1,4})\s+(.*?)\s*\{#([\w֐-׿-]{1,40})\}\s*$/.exec(l);
    if (!h) return l;
    names.set(h[3], h[2]);
    return `${h[1]} ${h[2]}`;
  }).join('\n');
  return out.replace(/\[ref:([\w֐-׿-]{1,40})\]/g, (m, k: string) => (names.has(k) ? `"${names.get(k)}"` : m));
}

/** every ^[footnote] replaced by what f gives for it; brackets inside a footnote (a citation [@…]) are matched, not cut */
export function replaceFootnotes(md: string, f: (note: string, i: number) => string): string {
  const s = String(md || '');
  let out = '', i = 0, n = 0;
  while (i < s.length) {
    const at = s.indexOf('^[', i);
    if (at < 0) { out += s.slice(i); break; }
    let depth = 0, end = -1;
    for (let k = at + 1; k < s.length && k < at + 2000; k++) {
      if (s[k] === '[') depth++;
      else if (s[k] === ']' && --depth === 0) { end = k; break; }
    }
    if (end < 0) { out += s.slice(i, at + 2); i = at + 2; continue; }   // not closed: left as it is
    out += s.slice(i, at) + f(s.slice(at + 2, end).trim(), n++);
    i = end + 1;
  }
  return out;
}
/** ^[a footnote] in the text → a number in the text and the note in a list (for Markdown and HTML) */
export function footnotes(md: string) {
  const notes: string[] = [];
  const text = replaceFootnotes(md, (n) => { notes.push(n); return `[${notes.length}]`; });
  return { text, notes };
}

/* ---------------- words, the length target and the checklist ---------------- */

/** words in a draft, without its Markdown signs, citation marks or footnote marks */
export const wordCount = (md: string) => String(md || '').replace(/\[@[^\]]*\]|\^\[[^\]]*\]|\{#[^}]*\}|\[ref:[^\]]*\]|[#*>\-[\]()]/g, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

export interface Check { ok: boolean; text: string }
/** before handing in: the sections of its template, the length, citations that point nowhere, and the open "(להשלים…)" */
export function checklist(md: string, opts: { template?: DraftTemplate | null; target?: number | null; sourceIds: string[] }): Check[] {
  const out: Check[] = [];
  const heads = [...String(md || '').matchAll(/^#{2,4}\s+(.*)$/gm)].map((m) => m[1].replace(/\{#[^}]*\}/, '').trim());
  if (opts.template) {
    const missing = opts.template.sections.filter((s) => !heads.some((h) => h.includes(s)));
    out.push({ ok: !missing.length, text: missing.length ? `חסרים פרקים: ${missing.join(', ')}` : 'כל הפרקים של התבנית קיימים' });
  }
  const words = wordCount(md), target = opts.target || opts.template?.words || 0;
  if (target) out.push({ ok: words <= target * 1.1 && words >= target * 0.5, text: `${words.toLocaleString('he-IL')} מילים מתוך ${target.toLocaleString('he-IL')}` + (words > target * 1.1 ? ' – ארוך מדי' : words < target * 0.5 ? ' – עוד רחוק' : '') });
  const ids = new Set(opts.sourceIds);
  const cites = [...String(md || '').matchAll(/\[@([A-Za-z0-9_-]{4,40})/g)].map((m) => m[1]);
  const broken = cites.filter((c) => !ids.has(c));
  out.push({ ok: !broken.length, text: broken.length ? `${broken.length} ציטוטים בלי מקור במחקר` : cites.length ? `${new Set(cites).size} מקורות מצוטטים, כולם בביבליוגרפיה` : 'אין עדיין ציטוטים' });
  const todo = (String(md || '').match(/\(להשלים[^)]*\)|\((?:מבוא|שיטות|תוצאות|דיון|מסקנות|סיכום|פתיחה|הטענה|הראיות|טענות נגד|תקציר)\)|\(להרחיב\)/g) || []).length;
  out.push({ ok: !todo, text: todo ? `${todo} מקומות שעוד צריך להשלים` : 'אין מקומות פתוחים' });
  if (opts.template?.abstract) out.push({ ok: heads.some((h) => /תקציר/.test(h)), text: 'יש תקציר' });
  const refs = (String(md || '').match(/\[ref:[^\]]+\]/g) || []).length;
  if (refs) { const n = numberHeadings(md); const lost = (n.md.match(/\[ref:[^\]]+\]/g) || []).length; out.push({ ok: !lost, text: lost ? `${lost} הפניות לסעיף שלא קיים` : 'כל ההפניות לסעיפים תקינות' }); }
  return out;
}

/* ---------------- Hebrew and English together ---------------- */

/** in HTML: each paragraph finds its own direction, and every run of Latin letters is kept left to right inside it */
export const bidiHtml = (html: string) => html.replace(/<(p|li|h[1-4]|blockquote)>/g, '<$1 dir="auto">')
  .replace(/>([^<]*)</g, (m, t: string) => '>' + t.replace(/([A-Za-z][A-Za-z0-9 .,;:'’"()&\-–]*[A-Za-z0-9.)])/g, '<bdi dir="ltr">$1</bdi>') + '<');

/* ---------------- .docx, written here (no library) ---------------- */

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(b: Uint8Array) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
/** a zip of the given files, stored (no compression) – enough for Word to open */
export function zip(files: { name: string; data: string }[]): Uint8Array {
  const enc = new TextEncoder(), parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff], u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  for (const f of files) {
    const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
    const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
    parts.push(local, name, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    offset += local.length + name.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(size), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}
const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** a .docx from Markdown (headings, paragraphs, lists, **bold**, *italics*), right to left, with the bibliography and notes */
export function docx(title: string, md: string, bibliography: string[] = [], notes: string[] = []): Uint8Array {
  const run = (t: string, b = false, i = false) => `<w:r><w:rPr><w:rtl/>${b ? '<w:b/><w:bCs/>' : ''}${i ? '<w:i/><w:iCs/>' : ''}<w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/></w:rPr><w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
  const runs = (s: string) => s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).filter(Boolean).map((p) => (p.startsWith('**') ? run(p.slice(2, -2), true) : p.startsWith('*') ? run(p.slice(1, -1), false, true) : run(p))).join('');
  const para = (s: string, style?: string, ltr = false) => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${ltr ? '' : '<w:bidi/>'}</w:pPr>${runs(s)}</w:p>`;
  const body: string[] = [];
  for (const block of String(md || '').replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const h = /^(#{1,4})\s+(.*)$/.exec(lines[0]);
    if (h && lines.length === 1) { body.push(para(h[2], h[1].length === 1 ? 'Title' : `Heading${h[1].length - 1}`)); continue; }
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) { for (const l of lines) body.push(para('• ' + l.replace(/^\s*[-*]\s+/, ''))); continue; }
    body.push(para(lines.join(' ')));
  }
  if (notes.length) { body.push(para('הערות', 'Heading1')); notes.forEach((n, i) => body.push(para(`${i + 1}. ${n}`))); }
  if (bibliography.length) { body.push(para('ביבליוגרפיה', 'Heading1')); for (const b of bibliography) body.push(para(b, undefined, true)); }
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:bidi="he-IL"/></w:rPr></w:rPrDefault></w:docDefaults>`
    + ['Title:40', 'Heading1:32', 'Heading2:28', 'Heading3:26'].map((s) => { const [id, sz] = s.split(':'); return `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${id === 'Title' ? 'Title' : 'heading ' + id.slice(-1)}"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`; }).join('') + '</w:styles>';
  return zip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'word/styles.xml', data: styles },
    { name: 'word/document.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body.join('')}<w:sectPr><w:bidi/></w:sectPr></w:body></w:document>` },
  ]);
}

/* ---------------- slides: one HTML page, a slide for each ## section ---------------- */

/** slides from a draft: the title, then a slide for each ## section with its first lines as points; arrows, space and a tap move */
export function slidesHtml(title: string, md: string, toHtml: (s: string) => string): string {
  const sections = String(md || '').split(/^## /m).slice(1).map((s) => { const [head, ...rest] = s.split('\n'); return { head: head.replace(/\{#[^}]*\}/, '').trim(), body: rest.join('\n').trim() }; });
  const point = (body: string) => {
    const lines = body.split(/\n+/).map((l) => l.replace(/^[-*]\s+|^#{3,4}\s+/, '').trim()).filter((l) => l && !/^\(.*\)$/.test(l));
    return lines.slice(0, 6).map((l) => (l.length > 140 ? l.slice(0, 137) + '…' : l));
  };
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const slides = [`<section class="title"><h1>${esc(title)}</h1></section>`, ...sections.map((s) => `<section><h2>${esc(s.head)}</h2>${toHtml(point(s.body).map((p) => '- ' + p).join('\n'))}</section>`)];
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>html,body{margin:0;height:100%;background:#1d2018;color:#f4f1e6;font-family:"Rubik","Segoe UI",sans-serif}section{display:none;box-sizing:border-box;height:100vh;padding:7vh 8vw;flex-direction:column;justify-content:center}section.on{display:flex}h1{font-size:6vw;margin:0}h2{font-size:4vw;margin:0 0 4vh;color:#d8c37a}ul{font-size:2.6vw;line-height:1.5;padding-inline-start:1.2em}li{margin:.6em 0}.n{position:fixed;inset-block-end:2vh;inset-inline-start:3vw;opacity:.5;font-size:1.4vw}@media print{section{display:flex;page-break-after:always;height:auto;min-height:100vh}}</style></head>
<body>${slides.join('\n')}<div class="n"></div>
<script>const s=[...document.querySelectorAll('section')],n=document.querySelector('.n');let i=0;const go=(k)=>{i=Math.max(0,Math.min(s.length-1,k));s.forEach((x,j)=>x.classList.toggle('on',j===i));n.textContent=(i+1)+' / '+s.length;};
addEventListener('keydown',(e)=>{if(['ArrowLeft','ArrowDown',' ','PageDown'].includes(e.key))go(i+1);if(['ArrowRight','ArrowUp','PageUp'].includes(e.key))go(i-1);});addEventListener('click',(e)=>go(e.clientX<innerWidth/2?i+1:i-1));go(0);</script></body></html>`;
}
