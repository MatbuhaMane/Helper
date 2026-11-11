// The Torah researcher (חוקר) of פרשת השבוע: a question about a passage, answered as a critical scholar of the Hebrew Bible,
// the ancient Near East and Second Temple literature would – from the texts themselves, never from memory.
// Claude fetches the exact Hebrew/Aramaic texts, the commentaries, the dictionaries and the manuscripts through Sefaria's MCP
// server (the MCP connector), and checks scholarship and DOIs with web search. Every source is cited in SBL style.
// Gemini (grounded in Google Search, with the passage fetched from Sefaria first) answers when Claude is unavailable.
// Answers are kept for a month per (passage, question), so a question asked twice costs once.

import Anthropic from '@anthropic-ai/sdk';
import type { BetaContentBlock, BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { z } from 'zod';
import { aiJson, geminiGrounded, jsonIn } from './ai';
import { Ctx, HttpError, body, json, requireUser } from './core';

const MODEL = 'claude-opus-5-5';
const SEFARIA_MCP = 'https://mcp.sefaria.org/mcp';
const TTL = 30 * 24 * 3600 * 1000;

const Input = z.object({
  ref: z.string().min(2).max(120),                   // a Sefaria ref, e.g. "Genesis 28:10-22"
  focus: z.string().max(120).optional().nullable(),  // the verse or word the reader is looking at
  question: z.string().min(2).max(1500),
  history: z.array(z.object({ q: z.string().max(1500), a: z.string().max(6000) })).max(4).default([]),
  fresh: z.boolean().optional(),
});

const Answer = z.object({
  title: z.string().default(''),
  answer: z.string().default(''),
  terms: z.array(z.object({ word: z.string().default(''), lang: z.string().default(''), translit: z.string().default(''), gloss: z.string().default('') })).default([]),
  sources: z.array(z.object({ n: z.number().int().optional(), sbl: z.string().default(''), url: z.string().default(''), kind: z.string().default('') })).default([]),
  followups: z.array(z.string()).default([]),
});
type Answer = z.infer<typeof Answer>;
const str = { type: 'string' };
const ANSWER_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'answer', 'terms', 'sources', 'followups'],
  properties: {
    title: str, answer: str,
    terms: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['word', 'lang', 'translit', 'gloss'], properties: { word: str, lang: str, translit: str, gloss: str } } },
    sources: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'sbl', 'url', 'kind'],
      properties: { n: { type: 'integer' }, sbl: str, url: str, kind: { type: 'string', enum: ['primary', 'commentary', 'scholarship'] } } } },
    followups: { type: 'array', items: str },
  },
};

const SYSTEM = `You are a critical scholar of the Hebrew Bible, the Ancient Near East, and Second Temple / New Testament studies, answering a reader of the weekly Torah portion (פרשת השבוע) in a family app.
Rules:
- Never quote scripture, commentaries or academic literature from memory. Fetch every text you quote with the Sefaria tools (get_text, text_search, search_in_book, get_links_between_texts, search_in_dictionaries, get_available_manuscripts…), and check original Hebrew/Aramaic terms there (Targum Onkelos and the other Targumim are on Sefaria; so is מנחת שי for Masoretic textual notes, and the Leningrad Codex for manuscripts).
- For the Septuagint, the Dead Sea Scrolls, the Samaritan Pentateuch and modern scholarship, use web search and find_scholarship; cite only works you actually found, and verify every DOI with check_doi before citing it. Never state a detail you did not verify in this conversation, not even marked "from memory": if something remains unchecked (for example the search budget ran out), name only what is left to check and where (e.g. the Göttingen Septuagint, the critical edition of the Samaritan Pentateuch).
- Distinguish clearly between the plain text, the traditional Jewish commentators, and critical scholarship (source criticism, comparative ANE material, textual criticism). Present scholarly views as views, with who holds them; mark what is debated or uncertain. Be respectful of tradition and honest about evidence.
- Write the answer in Hebrew, clear for an educated lay reader; keep terms in their original language and script where they matter (Hebrew, Aramaic, Greek), with a transliteration and gloss in "terms".
- Mark each claim drawn from a source with its number in square brackets, e.g. [1], matching "sources".
- Cite every source in SBL style (Society of Biblical Literature Handbook of Style, 2nd ed.): primary texts by book chapter:verse and edition/translation; commentaries by author, title, and place; modern works with author, title, publisher/journal, year, pages, and DOI when there is one. Give a URL for each source (Sefaria page for primary texts and commentaries, doi.org or the publisher page for scholarship).
- Keep it focused: about 150–450 words in "answer", in short paragraphs separated by blank lines. Plain text only – no markdown headings, no tables.
Answer with JSON only, exactly this shape:
{"title": "a short Hebrew title for the answer",
 "answer": "the answer in Hebrew with [n] markers",
 "terms": [{"word": "the term in its script", "lang": "Hebrew|Aramaic|Greek|Akkadian|Ugaritic…", "translit": "transliteration", "gloss": "Hebrew gloss"}],
 "sources": [{"n": 1, "sbl": "the SBL-style citation", "url": "https://…", "kind": "primary|commentary|scholarship"}],
 "followups": ["two or three good follow-up questions, in Hebrew"]}`;

function userText(ref: string, focus: string | null | undefined, question: string) {
  return `The passage: ${ref}${focus ? `\nThe reader is looking at: ${focus}` : ''}\nThe question: ${question}`;
}

function client(ctx: Ctx) {
  return new Anthropic({ apiKey: ctx.env.ANTHROPIC_API_KEY, maxRetries: 1, ...(ctx.env.DEV_MODE === '1' && ctx.env.ANTHROPIC_BASE_URL ? { baseURL: ctx.env.ANTHROPIC_BASE_URL } : {}) });
}

/* The scholarship tools Claude calls through us: Semantic Scholar to find work, Crossref to check a DOI (both public, no key). */
const UA = { 'user-agent': 'HelperFamilyApp/1.0 (research tool)' };
const TOOLS = [
  { name: 'find_scholarship', strict: true,
    description: 'Search Semantic Scholar (and Crossref when it finds nothing) for peer-reviewed scholarship. Returns title, authors, year, venue, DOI and URL for each paper. Use English search terms (author names, book of the Bible, topic).',
    input_schema: { type: 'object', additionalProperties: false, required: ['query'], properties: { query: { type: 'string', description: 'Search terms, in English.' } } } },
  { name: 'check_doi', strict: true,
    description: 'Look a DOI up in Crossref. Returns the registered title, authors, journal, year, volume, issue and pages, or found: false. Call it for every DOI before you cite it.',
    input_schema: { type: 'object', additionalProperties: false, required: ['doi'], properties: { doi: { type: 'string', description: 'The DOI, e.g. 10.1163/15685330-12341234' } } } },
];
async function findScholarship(query: string) {
  try {
    const r = await fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=6&fields=title,authors,year,venue,externalIds,url,abstract`, { headers: UA });
    if (r.ok) {
      const d = (await r.json()) as any;
      const list = (d.data || []).map((x: any) => ({ title: x.title, authors: (x.authors || []).map((a: any) => a.name).slice(0, 4), year: x.year, venue: x.venue,
        doi: x.externalIds?.DOI || null, url: x.url, abstract: String(x.abstract || '').slice(0, 400) }));
      if (list.length) return { source: 'Semantic Scholar', results: list };
    }
  } catch (_) { /* Crossref below */ }
  const r = await fetch(`https://api.crossref.org/works?rows=6&query.bibliographic=${encodeURIComponent(query)}&select=DOI,title,author,container-title,issued,page,volume`, { headers: UA });
  if (!r.ok) return { error: 'search unavailable' };
  const d = (await r.json()) as any;
  return { source: 'Crossref', results: (d.message?.items || []).map((x: any) => ({ title: x.title?.[0], authors: (x.author || []).map((a: any) => `${a.given || ''} ${a.family || ''}`.trim()).slice(0, 4),
    year: x.issued?.['date-parts']?.[0]?.[0], venue: x['container-title']?.[0], volume: x.volume, pages: x.page, doi: x.DOI, url: `https://doi.org/${x.DOI}` })) };
}
async function checkDoi(doi: string) {
  const clean = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(clean)}`, { headers: UA });
  if (r.status === 404) return { doi: clean, found: false };
  if (!r.ok) return { doi: clean, error: 'crossref unavailable' };
  const x = ((await r.json()) as any).message || {};
  return { doi: clean, found: true, title: x.title?.[0], authors: (x.author || []).map((a: any) => `${a.given || ''} ${a.family || ''}`.trim()), journal: x['container-title']?.[0],
    publisher: x.publisher, year: x.issued?.['date-parts']?.[0]?.[0], volume: x.volume, issue: x.issue, pages: x.page, url: `https://doi.org/${clean}` };
}

/** what the researcher is doing now, in Hebrew, for the reader to follow */
function stepOf(b: any): string | null {
  const i = b.input || {};
  if (b.type === 'mcp_tool_use') {
    const what = i.reference || i.tref || i.query || i.book_name || i.word || i.name || '';
    const n: Record<string, string> = { get_text: 'קורא בספריא', text_search: 'מחפש בספריא', search_in_book: 'מחפש בספר', get_links_between_texts: 'אוסף מפרשים ומקבילות',
      search_in_dictionaries: 'בודק במילונים', get_english_translations: 'משווה תרגומים', get_available_manuscripts: 'בודק כתבי יד', get_manuscript_image: 'מתבונן בכתב היד',
      get_topic_details: 'קורא על הנושא', get_text_catalogue_info: 'בודק בקטלוג' };
    return `${n[b.name] || 'בודק בספריא'}${what ? ': ' + String(what).slice(0, 80) : ''}`;
  }
  if (b.type === 'server_tool_use' && b.name === 'web_search') return `מחפש ברשת: ${String(i.query || '').slice(0, 80)}`;
  if (b.type === 'tool_use' && b.name === 'find_scholarship') return `מחפש מחקרים: ${String(i.query || '').slice(0, 80)}`;
  if (b.type === 'tool_use' && b.name === 'check_doi') return `מאמת DOI: ${String(i.doi || '').slice(0, 60)}`;
  return null;
}

async function viaClaude(ctx: Ctx, ref: string, focus: string | null | undefined, question: string, history: { q: string; a: string }[], step: (t: string) => void = () => {}): Promise<Answer> {
  const c = client(ctx);
  const messages: BetaMessageParam[] = [];
  for (const h of history) messages.push({ role: 'user', content: h.q }, { role: 'assistant', content: h.a });
  messages.push({ role: 'user', content: userText(ref, focus, question) });
  let text = '';
  for (let round = 0; round < 10; round++) {
    const stream = c.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ['mcp-client-2025-11-20', 'server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // the answer as JSON that is valid by construction (Hebrew abbreviations like רד"ק carry quotes that a hand-written JSON breaks on)
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: ANSWER_SCHEMA } },
      system: SYSTEM,
      mcp_servers: [{ type: 'url', url: SEFARIA_MCP, name: 'sefaria' }],
      tools: [{ type: 'mcp_toolset', mcp_server_name: 'sefaria' }, { type: 'web_search_20260209', name: 'web_search', max_uses: 6 }, ...TOOLS],
      messages,
    } as any);
    stream.on('contentBlock', (b: any) => { const t = stepOf(b); if (t) step(t); else if (b.type === 'text' && b.text.trim().startsWith('{')) step('כותב את התשובה'); });
    const res = await stream.finalMessage();
    if (res.stop_reason === 'refusal') throw new HttpError(422, 'refused');
    text = (res.content as BetaContentBlock[]).map((b) => (b.type === 'text' ? b.text : '')).join('') || text;
    if (res.stop_reason === 'tool_use') {
      // our own tools (Semantic Scholar, Crossref): run each, give the results back
      messages.push({ role: 'assistant', content: res.content as any });
      const results = await Promise.all((res.content as any[]).filter((b) => b.type === 'tool_use').map(async (b) => {
        try {
          const out = b.name === 'find_scholarship' ? await findScholarship(String(b.input?.query || ''))
            : b.name === 'check_doi' ? await checkDoi(String(b.input?.doi || '')) : { error: 'unknown tool' };
          return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out).slice(0, 12000) };
        } catch (_) { return { type: 'tool_result', tool_use_id: b.id, content: 'the service did not answer', is_error: true }; }
      }));
      messages.push({ role: 'user', content: results as any });
      continue;
    }
    if (res.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: res.content as any });
  }
  return Answer.parse(jsonIn(text));
}

/** Gemini: the passage itself from Sefaria (Hebrew + English), then a grounded answer */
async function viaGemini(ctx: Ctx, ref: string, focus: string | null | undefined, question: string, history: { q: string; a: string }[], step: (t: string) => void = () => {}): Promise<Answer> {
  step('קורא את הקטע בספריא');
  let passage = '';
  try {
    const r = await fetch(`https://www.sefaria.org/api/v3/texts/${encodeURIComponent(ref)}?version=hebrew&version=english`);
    if (r.ok) {
      const d = (await r.json()) as any;
      const flat = (t: any): string[] => (Array.isArray(t) ? t.flatMap(flat) : [String(t || '')]);
      passage = (d.versions || []).map((v: any) => `[${v.versionTitle}]\n` + flat(v.text).map((s) => s.replace(/<[^>]+>/g, '')).join('\n')).join('\n\n').slice(0, 12000);
    }
  } catch (_) { /* answer without the passage */ }
  const prior = history.map((h) => `Q: ${h.q}\nA: ${h.a}`).join('\n\n');
  const g = await geminiGrounded(ctx.env, {
    system: SYSTEM.replace('Fetch every text you quote with the Sefaria tools (get_text, text_search, search_in_book, get_links_between_texts, search_in_dictionaries, get_available_manuscripts…), and check', 'Quote only from the passage given below or from pages you find with search, and check'),
    prompt: `${prior ? prior + '\n\n' : ''}${userText(ref, focus, question)}\n\nThe passage, from Sefaria:\n${passage}`,
  });
  const a = Answer.parse(jsonIn(g.text));
  // add the pages Gemini actually read, when it gave fewer URLs than it used
  if (!a.sources.some((s) => s.url) && g.sources.length) a.sources = g.sources.slice(0, 6).map((s, i) => ({ n: i + 1, sbl: s.title, url: s.url, kind: 'scholarship' }));
  return a;
}

const keyOf = (ref: string, focus: string | null | undefined, q: string) => `${ref}|${focus || ''}|${q.replace(/\s+/g, ' ').trim().toLowerCase()}`;

async function answer(ctx: Ctx, data: z.infer<typeof Input>, step: (t: string) => void) {
  const { ref, focus, question, history, fresh } = data;
  const key = history.length ? null : keyOf(ref, focus, question);   // follow-ups depend on the conversation: not cached
  if (key && !fresh) {
    const hit = await ctx.env.DB.prepare('SELECT answer, created_at FROM research_answers WHERE key = ?').bind(key).first<{ answer: string; created_at: number }>();
    if (hit && Date.now() - hit.created_at < TTL) return { ...JSON.parse(hit.answer), cached: true };
  }
  let lastErr: unknown;
  for (const via of [ctx.env.ANTHROPIC_API_KEY ? viaClaude : null, ctx.env.GEMINI_API_KEY ? viaGemini : null]) {
    if (!via) continue;
    try {
      if (via === viaGemini && ctx.env.ANTHROPIC_API_KEY) step('Claude לא זמין כרגע – Gemini ממשיך');
      const a = await via(ctx, ref, focus, question, history, step);
      if (!a.answer.trim()) throw new Error('empty answer');
      const out = { ...a, by: via === viaClaude ? 'claude' : 'gemini' };
      if (key) await ctx.env.DB.prepare('INSERT OR REPLACE INTO research_answers (key, answer, created_at) VALUES (?, ?, ?)').bind(key, JSON.stringify(out), Date.now()).run();
      return out;
    } catch (e) {
      lastErr = e;
      console.error('research', via === viaClaude ? 'claude' : 'gemini', e instanceof Error ? e.message : e);
      if (e instanceof HttpError && e.status === 422) break;
    }
  }
  if (!ctx.env.ANTHROPIC_API_KEY && !ctx.env.GEMINI_API_KEY) throw new HttpError(503, 'ai_not_configured');
  throw lastErr instanceof HttpError ? lastErr : new HttpError(502, 'ai_failed');
}

/** POST /api/research/ask – with { stream: true } the answer comes as server-sent events: "step" (what the researcher is
    checking now), then "answer" (the whole answer) or "error" ({ error }). */
export async function ask(ctx: Ctx) {
  requireUser(ctx);
  const raw = (await body(ctx.req)) as any;
  const p = Input.safeParse(raw);
  if (!p.success) throw new HttpError(400, 'Invalid request');
  if (!raw?.stream) return json(await answer(ctx, p.data, () => {}));
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter(), enc = new TextEncoder();
  const send = (event: string, data: unknown) => w.write(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)).catch(() => {});
  ctx.waitUntil((async () => {
    const ping = setInterval(() => { w.write(enc.encode(': ping\n\n')).catch(() => {}); }, 15000);   // keeps a quiet stream open
    try { await send('answer', await answer(ctx, p.data, (t) => { send('step', { text: t }); })); }
    catch (e) { await send('error', { error: e instanceof HttpError ? e.message : 'ai_failed' }); }
    finally { clearInterval(ping); await w.close().catch(() => {}); }
  })());
  return new Response(readable, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform' } });
}

/* חיפוש במקורות – a concordance over the Tanakh, the Mishnah, the Talmud, the Midrash, the halakhah and the rest of Sefaria's
   library, in Hebrew and in the other languages (לע"ז). Every place the words appear, counted per book, in the library's order.
   Sefaria's search, through us (its search API does not allow browsers from other sites). Sefaria indexes several editions of
   each passage, so the hits are folded to one per passage; in the Tanakh only the biblical text itself counts (not the modern
   Hebrew renderings Sefaria also indexes). The result of a search is kept for a month. */
const PARTS = ['Tanakh/', 'Tanakh/Torah', 'Tanakh/Prophets', 'Tanakh/Writings', 'Mishnah', 'Tosefta', 'Talmud', 'Talmud/Bavli', 'Talmud/Yerushalmi',
  'Midrash', 'Halakhah', 'Tanakh/Targum', 'Kabbalah', 'Jewish Thought', 'Liturgy', 'Musar', 'Chasidut', 'Second Temple', ''] as const;
const SearchIn = z.object({
  q: z.string().min(1).max(200),
  part: z.enum(PARTS).default('Tanakh/'),
  lang: z.enum(['all', 'he', 'en']).default('all'),
  exact: z.boolean().default(false),   // the words as written, side by side (no forms, no distance)
  from: z.number().int().min(0).max(10000).default(0),
  size: z.number().int().min(1).max(10000).default(20),   // 10000 = the whole concordance
});
const MAX_HITS = 5000, PAGE = 500;   // at most ten pages of 500 hits (editions included); bigger pages fail on long texts
const BIBLICAL = new Set(['Tanach with Text Only', 'Tanach with Nikkud', "Tanach with Ta'amei Hamikra", 'Miqra according to the Masorah']);
/** "רש״י על בראשית א׳:א׳:א׳" → "רש״י על בראשית", "ברכות ב׳ א:א" → "ברכות": the Hebrew name of the book without the place in it */
function heBookOf(heRef: string) {
  let s = heRef;
  for (let k = 0; k < 3; k++) {
    const m = /\s+(\S+)$/.exec(s);
    if (!m || !/[\d:׳״]/.test(m[1]) || m[1].length > 14) break;
    s = s.slice(0, m.index);
  }
  return s;
}
type Hit = { ref: string; heRef: string; book: string; lang: string; snip: string };
/** POST /api/research/search → { count, capped, books: [{ book, he, n }], hits: [{ ref, heRef, book, lang, snip }], next } */
export async function search(ctx: Ctx) {
  requireUser(ctx);
  const p = SearchIn.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid search');
  const { q, part, lang, exact, from, size } = p.data;
  const key = 'search|' + JSON.stringify([q.trim(), part, lang, exact]);
  let all: Hit[] | null = null, capped = false;
  const hit = await ctx.env.DB.prepare('SELECT answer, created_at FROM research_answers WHERE key = ?').bind(key).first<{ answer: string; created_at: number }>();
  if (hit && Date.now() - hit.created_at < TTL) ({ all, capped } = JSON.parse(hit.answer));
  if (!all) {
    const field = exact ? 'exact' : 'naive_lemmatizer';
    // Sefaria answers big searches in pages (a page of more than about a thousand hits fails): the first, then the rest side by side
    const page = async (start: number) => {
      const r = await fetch('https://www.sefaria.org/api/search-wrapper', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: q, type: 'text', field, source_proj: ['ref', 'heRef', 'version', 'lang', 'path'], slop: exact ? 0 : 10, start, size: PAGE,
          filters: part ? [part] : [], filter_fields: part ? ['path'] : [], aggs: [], sort_method: 'sort', sort_fields: ['order'], sort_reverse: false, sort_score_missing: 0.04 }),
      });
      if (!r.ok) throw new HttpError(502, 'search_failed');
      return (await r.json()) as any;
    };
    const first = await page(0);
    const total = first.hits?.total?.value ?? first.hits?.total ?? 0;
    const starts = [];
    for (let s = PAGE; s < Math.min(total, MAX_HITS); s += PAGE) starts.push(s);
    const rest = await Promise.all(starts.map((s) => page(s).catch(() => ({ hits: { hits: [] } }))));
    const raw = [first, ...rest].flatMap((d) => d.hits?.hits || []);
    capped = total > MAX_HITS;
    const byRef = new Map<string, Hit>();
    const tanakhText = part.startsWith('Tanakh') && part !== 'Tanakh/Targum';
    for (const h of raw) {
      const s = h._source || {};
      if (!s.ref || byRef.has(s.ref + '|' + s.lang)) continue;
      if (lang !== 'all' && s.lang !== lang) continue;
      if (tanakhText && s.lang === 'he' && s.version && !BIBLICAL.has(s.version)) continue;
      const snip = String((h.highlight?.[field] || h.highlight?.naive_lemmatizer || h.highlight?.exact || [''])[0]).replace(/<(?!\/?b>)[^>]*>/g, '');
      const book = String(s.path || '').split('/').pop() || s.ref.replace(/ [\d:ab.-]+$/, '');
      // the language by the letters themselves: Sefaria files some translations (German, English…) under Hebrew
      const plainSnip = snip.replace(/<[^>]+>/g, '');
      const realLang = /[\u0590-\u05FF]/.test(plainSnip) ? 'he' : /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/.test(plainSnip) ? 'en' : (s.lang || 'he');
      if (lang !== 'all' && realLang !== lang) continue;
      byRef.set(s.ref + '|' + s.lang, { ref: s.ref, heRef: s.heRef || s.ref, book, lang: realLang, snip });
    }
    all = [...byRef.values()];
    const out = JSON.stringify({ all, capped });
    if (out.length < 1_800_000) ctx.waitUntil(ctx.env.DB.prepare('INSERT OR REPLACE INTO research_answers (key, answer, created_at) VALUES (?, ?, ?)').bind(key, out, Date.now()).run().then(() => {}));
  }
  const books: { book: string; he: string; n: number }[] = [];
  for (const h of all) {
    const last = books[books.length - 1];
    if (last && last.book === h.book) last.n++;
    else books.push({ book: h.book, he: heBookOf(h.heRef), n: 1 });
  }
  return json({ count: all.length, capped, books, hits: all.slice(from, from + size), next: from + size });
}

/* תרגום: Aramaic, Greek, Latin and Syriac (the Targumim, the Talmud and the Zohar, the Septuagint, the Vulgate, the Peshitta)
   into clear modern Hebrew, with the key words glossed. Gemini first (cheap and quick), Claude when Gemini is unavailable.
   Kept for a month per text. */
const TrIn = z.object({ text: z.string().min(1).max(6000), lang: z.string().max(20).optional().nullable(), ref: z.string().max(160).optional().nullable() });
const TrOut = z.object({
  lang: z.string().default(''),
  translation: z.string().default(''),
  words: z.array(z.object({ word: z.string().default(''), translit: z.string().default(''), gloss: z.string().default('') })).default([]),
  note: z.string().default(''),
});
/** POST /api/research/translate → { lang, translation, words: [{ word, translit, gloss }], note } */
export async function translate(ctx: Ctx) {
  requireUser(ctx);
  const p = TrIn.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid request');
  const { text, lang, ref } = p.data;
  const key = `tr|${lang || ''}|${text.replace(/\s+/g, ' ').trim()}`.slice(0, 1500);
  const hit = await ctx.env.DB.prepare('SELECT answer, created_at FROM research_answers WHERE key = ?').bind(key).first<{ answer: string; created_at: number }>();
  if (hit && Date.now() - hit.created_at < TTL) return json({ ...JSON.parse(hit.answer), cached: true });
  const out = await aiJson(ctx.env, {
    prefer: 'gemini', fast: true, schema: TrOut,
    system: `You translate ancient Jewish and biblical texts into clear modern Hebrew for an educated lay reader: Aramaic (Targum Onkelos, Targum Jonathan, the Jerusalem Targum, the Talmud, the Zohar), Greek (the Septuagint, the New Testament, Josephus, Philo), Latin (the Vulgate) and Syriac (the Peshitta).
Translate faithfully and literally enough to compare with the Hebrew Bible; keep proper names in their usual Hebrew form. If the text mixes Hebrew and Aramaic, translate only what is not Hebrew and keep the Hebrew as it is.
If a word's meaning is uncertain, say so in "note" rather than guess. Pick the 3–8 words most worth knowing (rare or technical) for "words".
Answer with JSON only: {"lang": "the language in Hebrew (ארמית / יוונית / לטינית / סורית / עברית)", "translation": "the Hebrew translation", "words": [{"word": "the word as written", "translit": "transliteration", "gloss": "its meaning in Hebrew"}], "note": "a short note on difficulties, or empty"}`,
    prompt: `${ref ? `Source: ${ref}\n` : ''}${lang ? `Language: ${lang}\n` : ''}Text:\n${text}`,
  });
  await ctx.env.DB.prepare('INSERT OR REPLACE INTO research_answers (key, answer, created_at) VALUES (?, ?, ?)').bind(key, JSON.stringify(out), Date.now()).run();
  return json(out);
}

/* מילה: a word of the verse explained in Hebrew – what it means here, its root and its form – before the English lexicons.
   Gemini (quick and cheap), Claude when Gemini is unavailable; kept for a month per word and verse. */
const WordIn = z.object({ word: z.string().min(1).max(60), verse: z.string().max(1500).default(''), ref: z.string().max(80).default('') });
const WordOut = z.object({ meaning: z.string().default(''), root: z.string().default(''), grammar: z.string().default(''), lang: z.string().default('עברית'), note: z.string().default('') });
/** POST /api/research/word → { meaning, root, grammar, lang, note } */
export async function word(ctx: Ctx) {
  requireUser(ctx);
  const p = WordIn.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid request');
  const { word: w, verse, ref } = p.data;
  const key = `w|${ref}|${w}`;
  const hit = await ctx.env.DB.prepare('SELECT answer, created_at FROM research_answers WHERE key = ?').bind(key).first<{ answer: string; created_at: number }>();
  if (hit && Date.now() - hit.created_at < TTL) return json({ ...JSON.parse(hit.answer), cached: true });
  const out = await aiJson(ctx.env, {
    prefer: 'gemini', fast: true, schema: WordOut,
    system: `You explain one word of a verse of the Hebrew Bible, in Hebrew, for an educated reader – the way a good Hebrew dictionary with a grammar note would.
"meaning": what the word means in this verse, in one or two clear Hebrew sentences (give the plain sense first; mention another sense only if the verse is read both ways).
"root": the root in Hebrew letters with dashes (e.g. ח-ל-ם), or empty for a particle or a name without a clear root.
"grammar": its form in Hebrew grammatical terms (חלק דיבר; for a verb the בניין, the זמן, the גוף; for a noun מין ומספר, נסמך או נפרד; prefixes and suffixes, e.g. "ו׳ ההיפוך + פעל, בניין קל, עבר, נסתר יחיד").
"lang": עברית or ארמית (Biblical Aramaic in Daniel and Ezra, or a single Aramaic word).
"note": a short note only if it adds something (a rare word, a hapax, a ketiv/qere, a known difficulty); otherwise empty.
Answer with JSON only: {"meaning": "", "root": "", "grammar": "", "lang": "", "note": ""}`,
    prompt: `The verse (${ref}): ${verse}\nThe word: ${w}`,
  });
  await ctx.env.DB.prepare('INSERT OR REPLACE INTO research_answers (key, answer, created_at) VALUES (?, ?, ?)').bind(key, JSON.stringify(out), Date.now()).run();
  return json(out);
}
