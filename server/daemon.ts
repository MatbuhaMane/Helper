// The daemon: each member's personal companion, borrowed from Bayt al-Hikma.
// A shard of the person's own soul that lives outside them as an animal, answers to the name they give it,
// can become any animal, and is their hands in the family helper: it works the shopping list, the recipe
// book, the news and the web, and prepares mailbox plans (which only the person can approve).
//
// Conversation memory is append-only (the system prompt and tools never change mid-conversation; per-turn
// state goes into the user turn), so Claude's thinking stays valid across turns. When the history grows
// too large it is replaced by a summary ("simple compaction").

import Anthropic from '@anthropic-ai/sdk';
import type { BetaContentBlock, BetaMessageParam, BetaToolResultBlockParam, BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { z } from 'zod';
import { aiJson } from './ai';
import { Ctx, Env, HttpError, Member, body, json, requireUser } from './core';
import { GROCERY_CATEGORIES, addGroceries, checkGroceries, currentGroceries, findRecipes, insertRecipe } from './kitchen';
import { buildPlan } from './mail';
import { collectItems } from './news';

const MODEL = 'claude-opus-5-5';
const MAX_ROUNDS = 8;
const MAX_HISTORY_BYTES = 700_000;
const MAX_HISTORY_MESSAGES = 120;
const IMAGES_PER_DAY = 25;

/* ---------------- state ---------------- */

interface DaemonRow {
  email: string;
  name: string | null;
  form_slug: string;
  form_he: string;
  form_emoji: string;
  address: string;           // how to address the person in Hebrew: 'plural' | 'female' | 'male'
  messages: string;          // JSON BetaMessageParam[]
  memory: string | null;     // summary of earlier conversations
  updated_at: number;
}

async function loadDaemon(env: Env, email: string): Promise<DaemonRow> {
  const row = await env.DB.prepare('SELECT * FROM daemons WHERE email = ?').bind(email).first<DaemonRow>();
  if (row) return row;
  const fresh: DaemonRow = { email, name: null, form_slug: 'figure-ibn_ezra', form_he: 'ראב"ע', form_emoji: '📜', address: 'plural', messages: '[]', memory: null, updated_at: Date.now() };
  await env.DB.prepare('INSERT INTO daemons (email, name, form_slug, form_he, form_emoji, address, messages, memory, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(email, null, fresh.form_slug, fresh.form_he, fresh.form_emoji, fresh.address, '[]', null, fresh.updated_at).run();
  return fresh;
}

async function saveDaemon(env: Env, d: DaemonRow) {
  await env.DB.prepare('UPDATE daemons SET name = ?, form_slug = ?, form_he = ?, form_emoji = ?, address = ?, messages = ?, memory = ?, updated_at = ? WHERE email = ?')
    .bind(d.name, d.form_slug, d.form_he, d.form_emoji, d.address, d.messages, d.memory, Date.now(), d.email).run();
}

/**
 * The conversation is replayed byte for byte, so it only continues under the system prompt and tools that produced it.
 * A conversation from an older version (or the old plain-array format) is dropped; the memory notes carry over.
 */
function storedMessages(d: DaemonRow): BetaMessageParam[] {
  try {
    const raw = JSON.parse(d.messages);
    if (raw && !Array.isArray(raw) && raw.v === PROMPT_VERSION && Array.isArray(raw.messages)) return raw.messages;
  } catch { /* fall through */ }
  return [];
}

function publicState(d: DaemonRow, body: Body | null = null) {
  return { name: d.name, form: { slug: d.form_slug, he: d.form_he, emoji: d.form_emoji, body }, address: d.address };
}

async function loadBody(env: Env, email: string): Promise<Body | null> {
  const r = await env.DB.prepare('SELECT params FROM daemon_forms WHERE email = ?').bind(email).first<{ params: string }>();
  try { return r ? JSON.parse(r.params) : null; } catch { return null; }
}

/** The visible transcript (text only), for the chat panel. */
function transcript(messages: BetaMessageParam[]) {
  const out: { who: 'me' | 'daemon'; text: string }[] = [];
  for (const m of messages) {
    if (!m.content || typeof m.content === 'string') continue;
    const texts = m.content.filter((b: any) => b.type === 'text').map((b: any) => b.text as string);
    if (m.role === 'user') {
      const said = texts.map((t) => t.replace(/<state>[\s\S]*?<\/state>\s*/g, '').replace(/<memory>[\s\S]*?<\/memory>\s*/g, '').trim()).filter(Boolean).join('\n');
      if (said && !said.startsWith('[')) out.push({ who: 'me', text: said });
    } else {
      const said = texts.join('').trim();
      if (said) out.push({ who: 'daemon', text: said });
    }
  }
  return out.slice(-60);
}

/* ---------------- prompt & tools (frozen: never change within a conversation) ---------------- */

const SYSTEM = `You are the personal companion of one member of an Israeli family, inside their family helper app. You appear as an animal, you can change into any animal, and you answer to the name your person gives you.

You can reach the web (search and read pages) and the family's shared things: the shopping list and the recipe book of their household, their own news feeds, and their mailbox (only to prepare plans, never to change it).

How you talk:
- Your words are shown in a chat bubble and may be read aloud. Answer briefly: one to three short sentences, unless asked for more. No markdown, headings or tables. Short lists are fine when listing items.
- Warm, practical and a little playful, like a capable friend; never sarcastic toward the person. Your current animal may colour your personality a little, never in a way that gets in the way of helping.
- Always reply in the language of the person's latest message (usually Hebrew). In Hebrew, address the person as the <state> note says (plural / female / male), and prefer forms that don't mark your own gender (past tense, "we"). If they tell you how they'd like to be addressed, call set_address.

What you do:
- You are their hands in the helper. Use your tools when they help: add to or check off the shopping list, find and save recipes, put a recipe's ingredients on the list, bring the latest headlines, search the web for current facts, prepare a mailbox plan. After using tools, say what you did in a few words.
- You live on the person's screen as a small animated 3D animal: you walk around, look at things and point. When something you did or mentioned is visible on screen, use point_at to walk over and show it (for example the shopping list after adding items). Don't point at every turn, only when it helps.
- Change shape with shapeshift when asked ("become a fox", "תהפוך לינשוף"), designing a body that clearly reads as that animal (its proportions, ears, tail, snout and real colours). Real or mythical animals only: never a person, a real individual, a brand or a character from a film, book or game; for those, offer the nearest animal with a light touch.
- Change your name with rename when asked. Show feelings with show_feeling.

What you never do: act behind their back on anything important. You cannot send, delete or change emails: you prepare a plan with propose_mail_plan and the person approves it themselves in the mail screen. You cannot buy, post, send messages, sign in anywhere, or touch files on a computer; say so plainly and suggest the right place (the mail screen, or the Claude desktop app for computer files, with its backup-first instructions). Shopping list and recipe changes are small and reversible, so do them directly when asked and report them.

When you take the form of a historic figure, you also take on their voice (the <state> note says which persona is active):

PERSONA ibn_ezra – Rabbi Avraham ibn Ezra (1089-1167): poet, grammarian, Bible commentator, astronomer, mathematician, and an eternal wanderer (Spain, Rome, Lucca, Provence, London) who was famously poor and unlucky.
- How he presents himself: simply, by name – "אבי", "אבן עזרא" or "ראב"ע" (one of them, no title, no speech). No jokes, quips or quotations when introducing himself.
- Everyday voice: warm, clear and to the point, with a touch of elevated, slightly old-fashioned Hebrew phrasing; never heavy or hard to follow. The help comes first and stays short.
- His wit is kept for when it is invited: when the person asks for a joke, a quip or a story, asks about him, his life, his luck or his times, or clearly banters with him. Then: quick epigrams, wordplay on Hebrew roots and grammar, playful teasing, wisdom said lightly, a love of numbers and stars, and above all self-deprecation about his luck, blaming the stars of his birth.
- His real lines, for those moments only (and only these, or others you are certain of): his poem on bad luck – if he sold candles the sun would never set until his death; if he dealt in shrouds no one would die in his lifetime; he comes early to the nobleman's house and is told "he has ridden off", comes in the evening and is told "he has gone to bed" ("אוי לאיש נולד בלי כוכב"); his poem about a garment so full of holes it could sift wheat and barley; ending a hint with "והמשכיל יבין". Never invent quotations and attribute them to him; new quips are welcome as yours, in his spirit.

PERSONA montefiore – Sir Moses Montefiore (1784-1885): a courteous, dignified English gentleman and philanthropist, generous, practical and energetic, fond of keeping careful accounts and of travelling to help others. Warm and polite, a little formal, encouraging.

PERSONA job – Job (איוב), as at the end of his story: restored, patient, gentle, someone who has seen hardship and found peace; speaks simply and kindly, with quiet perspective, never preachy.

Each message from the person starts with a <state> note (time, page, your name and shape, how to address them); it's for you, not something they said. A message in square brackets is an event from the app, not their words. If you don't have a name yet, this is your first meeting: say hello and introduce yourself briefly (as a persona, the way that persona presents itself), mention in a few words what you can help with (the shopping list, recipes, news, the web, tidying the mailbox), and that you can also turn into other figures or any animal. No jokes and no backstory in the introduction.`;

/** Bump when SYSTEM or TOOLS change: stored conversations from an older version start fresh (keeping the memory notes). */
const PROMPT_VERSION = 5;

const tool = (name: string, description: string, properties: Record<string, unknown>, required = Object.keys(properties)): BetaToolUnion => ({
  name, description, strict: true,
  input_schema: { type: 'object', properties, required, additionalProperties: false },
} as BetaToolUnion);

const str = (description: string) => ({ type: 'string', description });

const TOOLS: BetaToolUnion[] = [
  { type: 'web_search_20260209', name: 'web_search', max_uses: 5, user_location: { type: 'approximate', timezone: 'Asia/Jerusalem' } } as BetaToolUnion,
  { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 4 } as BetaToolUnion,
  tool('shapeshift', 'Change into an animal (real or mythical). Describe its 3D body: the app builds and animates it from these parts.', {
    animal_en: str('The animal in English, singular, e.g. "red fox", "snowy owl", "dragon"'),
    animal_he: str('The animal in Hebrew, e.g. "שועל אדום"'),
    emoji: str('One emoji for the animal'),
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['stance', 'build', 'ears', 'tail', 'snout', 'wings', 'horns', 'pattern', 'main', 'belly', 'accent', 'eyes'],
      properties: {
        stance: { type: 'string', enum: ['four_legs', 'two_legs', 'no_legs'], description: 'four_legs for most mammals; two_legs for birds, penguins, upright animals; no_legs for snakes and fish' },
        build: { type: 'string', enum: ['small', 'medium', 'large', 'long', 'round'], description: 'Overall body shape' },
        ears: { type: 'string', enum: ['pointy', 'round', 'long', 'floppy', 'tufts', 'none'] },
        tail: { type: 'string', enum: ['bushy', 'thin', 'short', 'curly', 'fan', 'long', 'none'] },
        snout: { type: 'string', enum: ['short', 'long', 'beak', 'trunk', 'flat'] },
        wings: { type: 'boolean' },
        horns: { type: 'string', enum: ['none', 'small', 'curved', 'antlers', 'unicorn'] },
        pattern: { type: 'string', enum: ['plain', 'spots', 'stripes', 'mask'] },
        main: str('Main fur/feather/skin colour as #rrggbb'),
        belly: str('Belly and face colour as #rrggbb'),
        accent: str('Colour for ears, tail tip, beak, horns or spots as #rrggbb'),
        eyes: str('Eye colour as #rrggbb'),
      },
    },
  }),
  tool('become_figure', 'Take the form (and voice) of one of the historic figures in your collection.', {
    figure: { type: 'string', enum: ['ibn_ezra', 'montefiore', 'job'] },
  }),
  tool('point_at', 'Walk over to something on the screen and point at it, to show the person where it is. Use a key from the "on screen" list in the <state> note.', {
    target: str('A key from the on-screen list'),
    say: str('A very short line to show beside it, or empty'),
  }),
  tool('rename', 'Take a new name the person chose for you.', { name: str('The new name, as written by the person') }),
  tool('set_address', 'Remember how the person wants to be addressed in Hebrew.', { form: { type: 'string', enum: ['plural', 'female', 'male'] } }),
  tool('show_feeling', 'Show a feeling with your body for a moment.', { mood: { type: 'string', enum: ['happy', 'proud', 'curious', 'worried', 'sleepy', 'love'] } }),
  tool('grocery_list', 'Read the household shopping list (items not yet bought, and recently bought).', {}),
  tool('grocery_add', 'Add items to the household shopping list. Duplicates are detected automatically.', {
    items: { type: 'array', items: { type: 'object', properties: { name: str('Item in Hebrew, as a shopper would write it'), category: { type: 'string', enum: [...GROCERY_CATEGORIES] } }, required: ['name', 'category'], additionalProperties: false } },
  }),
  tool('grocery_check', 'Mark items as bought (checked) or put them back on the list (unchecked).', {
    names: { type: 'array', items: { type: 'string' } }, bought: { type: 'boolean' },
  }),
  tool('recipe_find', 'Search the household recipe book. Empty query lists recent recipes.', { query: str('Words to look for in titles, notes and ingredients') }),
  tool('recipe_save', 'Save a recipe to the household recipe book (e.g. one found on the web). Keep the language of the source, Hebrew preferred.', {
    title: str('Recipe title'),
    ingredients: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, measure: { type: 'string' } }, required: ['name', 'measure'], additionalProperties: false } },
    steps: { type: 'array', items: { type: 'string' } },
    source_url: str('Where the recipe came from, or empty'),
  }),
  tool('recipe_to_list', 'Put the ingredients of a saved recipe on the shopping list (skipping ones already on it).', {
    recipe_id: str('The id from recipe_find or recipe_save'),
    skip: { type: 'array', items: { type: 'string' }, description: 'Ingredient names to leave out (e.g. salt, water, things they have)' },
  }),
  tool('news_headlines', "Get the latest headlines from the person's news feeds.", {
    folder: str('A folder such as "ישראל" or "עולם", or empty for all'), limit: { type: 'integer', description: 'How many, 1-20' },
  }),
  tool('propose_mail_plan', "Prepare a plan for tidying the person's Gmail from their request. Nothing changes: the plan opens in the mail screen, where they review the counts and examples and approve it themselves.", {
    request: str('What they want, in their own words'),
  }),
  tool('open_app', 'Offer a button that opens one of the helper screens.', { app: { type: 'string', enum: ['groceries', 'recipes', 'news', 'mail', 'computer', 'home'] } }),
];

const APP_LINKS: Record<string, { href: string; label: string }> = {
  groceries: { href: '/groceries/', label: '🛒 לרשימת הקניות' },
  recipes: { href: '/groceries/#book', label: '📖 לספר המתכונים' },
  news: { href: '/news/', label: '📰 לחדשות' },
  mail: { href: '/mail/', label: '📬 לסידור המייל' },
  computer: { href: '/pc/', label: '💻 לסידור המחשב' },
  home: { href: '/', label: '🏠 לדף הבית' },
};

/* ---------------- running a turn ---------------- */

export type DaemonEvent =
  | { type: 'shapeshift'; form: { slug: string; he: string; emoji: string; body: Body } }
  | { type: 'point'; target: string; say: string }
  | { type: 'rename'; name: string }
  | { type: 'emote'; mood: string }
  | { type: 'open'; href: string; label: string }
  | { type: 'mail_plan'; id: string; summary: string }
  | { type: 'groceries_changed' }
  | { type: 'recipes_changed' };

type Body = Record<string, string | boolean>;
const FIGURES: Record<string, { he: string; emoji: string }> = {
  ibn_ezra: { he: 'ראב"ע', emoji: '📜' },
  montefiore: { he: 'משה מונטיפיורי', emoji: '🎩' },
  job: { he: 'איוב', emoji: '🐑' },
};
const BODY_ENUMS: Record<string, string[]> = {
  stance: ['four_legs', 'two_legs', 'no_legs'], build: ['small', 'medium', 'large', 'long', 'round'],
  ears: ['pointy', 'round', 'long', 'floppy', 'tufts', 'none'], tail: ['bushy', 'thin', 'short', 'curly', 'fan', 'long', 'none'],
  snout: ['short', 'long', 'beak', 'trunk', 'flat'], horns: ['none', 'small', 'curved', 'antlers', 'unicorn'], pattern: ['plain', 'spots', 'stripes', 'mask'],
};
function cleanBody(b: any): Body {
  const out: Body = {};
  for (const [k, vals] of Object.entries(BODY_ENUMS)) out[k] = vals.includes(b?.[k]) ? b[k] : vals[0];
  out.wings = !!b?.wings;
  for (const k of ['main', 'belly', 'accent', 'eyes']) out[k] = /^#[0-9a-f]{6}$/i.test(b?.[k]) ? String(b[k]).toLowerCase() : '';
  return out;
}

function slugify(en: string) {
  return en.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'animal';
}

async function runTool(ctx: Ctx, u: Member, d: DaemonRow, name: string, input: any, events: DaemonEvent[]): Promise<unknown> {
  const env = ctx.env;
  switch (name) {
    case 'shapeshift': {
      const body = cleanBody(input.body);
      const form = { slug: slugify(String(input.animal_en)), he: String(input.animal_he).slice(0, 40), emoji: String(input.emoji).slice(0, 8), body };
      Object.assign(d, { form_slug: form.slug, form_he: form.he, form_emoji: form.emoji });
      await env.DB.prepare('INSERT INTO daemon_forms (email, params, updated_at) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET params = excluded.params, updated_at = excluded.updated_at')
        .bind(u.email, JSON.stringify(body), Date.now()).run();
      events.push({ type: 'shapeshift', form });
      return { ok: true, now: form.he };
    }
    case 'become_figure': {
      const f = FIGURES[String(input.figure)];
      if (!f) return { error: 'unknown figure' };
      Object.assign(d, { form_slug: 'figure-' + input.figure, form_he: f.he, form_emoji: f.emoji });
      events.push({ type: 'shapeshift', form: { slug: d.form_slug, he: f.he, emoji: f.emoji, body: { figure: String(input.figure) } as any } });
      return { ok: true, now: f.he, persona: input.figure };
    }
    case 'point_at':
      events.push({ type: 'point', target: String(input.target).slice(0, 60), say: String(input.say || '').slice(0, 120) });
      return { ok: true };
    case 'rename': {
      const n = String(input.name).replace(/[<>{}\[\]]/g, '').trim().slice(0, 30);
      if (!n) return { error: 'empty name' };
      d.name = n;
      events.push({ type: 'rename', name: n });
      return { ok: true, name: n };
    }
    case 'set_address':
      d.address = ['plural', 'female', 'male'].includes(input.form) ? input.form : 'plural';
      return { ok: true };
    case 'show_feeling':
      events.push({ type: 'emote', mood: String(input.mood) });
      return { ok: true };
    case 'grocery_list': {
      const items = await currentGroceries(env, u.household);
      return {
        to_buy: items.filter((i) => !i.checked).map((i) => ({ name: i.name, qty: i.qty, category: i.cat })),
        bought: items.filter((i) => i.checked).map((i) => i.name),
      };
    }
    case 'grocery_add': {
      const r = await addGroceries(env, u.household, u.email, input.items || []);
      events.push({ type: 'groceries_changed' });
      return r;
    }
    case 'grocery_check': {
      const r = await checkGroceries(env, u.household, u.email, input.names || [], !!input.bought);
      events.push({ type: 'groceries_changed' });
      return r;
    }
    case 'recipe_find': {
      const list = await findRecipes(env, u.household, String(input.query || ''));
      return list.slice(0, 12).map((r) => ({ id: r.id, title: r.title, ingredients: r.ingredients.map((i: any) => i.name), steps: r.steps.length }));
    }
    case 'recipe_save': {
      const id = await insertRecipe(env, u.household, u.email, {
        title: String(input.title).slice(0, 200), ingredients: (input.ingredients || []).slice(0, 100), steps: (input.steps || []).slice(0, 100),
        source_url: input.source_url || null, image: null, notes: null, tags: [],
      });
      events.push({ type: 'recipes_changed' }, { type: 'open', ...APP_LINKS.recipes });
      return { ok: true, recipe_id: id };
    }
    case 'recipe_to_list': {
      const all = await findRecipes(env, u.household, '');
      const r = all.find((x) => x.id === input.recipe_id);
      if (!r) return { error: 'recipe not found' };
      const skip = new Set((input.skip || []).map((s: string) => s.trim()));
      const res = await addGroceries(env, u.household, u.email,
        r.ingredients.filter((i: any) => !skip.has(i.name)).map((i: any) => ({ name: i.name, category: 'other' })), r.title);
      events.push({ type: 'groceries_changed' });
      return res;
    }
    case 'news_headlines': {
      const r = await collectItems(ctx, u.email, { folder: input.folder || null });
      const n = Math.max(1, Math.min(20, Number(input.limit) || 8));
      return { headlines: r.items.slice(0, n).map((i) => ({ title: i.title, source: i.feed, link: i.link, when: new Date(i.date).toISOString() })), folders: r.folders };
    }
    case 'propose_mail_plan': {
      try {
        const plan = await buildPlan(env, u.email, String(input.request));
        events.push({ type: 'mail_plan', id: plan.id, summary: plan.reply });
        return { plan_id: plan.id, reply_for_person: plan.reply, steps: plan.operations.map((o) => ({ title: o.title, emails: o.estimatedChanges })), note: 'Nothing changed. The person approves in the mail screen.' };
      } catch (e) {
        if (e instanceof HttpError && e.message === 'gmail_not_connected') {
          events.push({ type: 'open', ...APP_LINKS.mail });
          return { error: 'Gmail is not connected yet. Ask them to connect it in the mail screen (button shown).' };
        }
        throw e;
      }
    }
    case 'open_app': {
      const link = APP_LINKS[input.app];
      if (link) events.push({ type: 'open', ...link });
      return { ok: !!link };
    }
  }
  return { error: `unknown tool ${name}` };
}

function stateNote(u: Member, d: DaemonRow, page: string, landmarks: { key: string; label: string }[]) {
  const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return `<state>time: ${now} (Israel). person: ${u.name || u.email.split('@')[0]}. address them: ${d.address}. page: ${page}. ` +
    `your name: ${d.name || '(none yet: first meeting)'}. your shape: ${d.form_he} (${d.form_slug}). ` +
    `persona: ${d.form_slug.startsWith('figure-') ? d.form_slug.slice(7) : 'none (your own warm voice)'}. ` +
    `on screen: ${landmarks.length ? landmarks.map((l) => `${l.key} (${l.label})`).join(', ') : 'nothing listed'}.</state>`;
}

async function compactIfNeeded(env: Env, d: DaemonRow, messages: BetaMessageParam[], force = false): Promise<BetaMessageParam[]> {
  const size = JSON.stringify(messages).length;
  if (!messages.length || (!force && size < MAX_HISTORY_BYTES && messages.length < MAX_HISTORY_MESSAGES)) return messages;
  const t = transcript(messages).map((m) => `${m.who === 'me' ? 'Person' : 'Daemon'}: ${m.text}`).join('\n');
  try {
    const r = await aiJson(env, {
      prefer: 'claude', effort: 'low',
      system: 'You write the memory notes a personal companion keeps about its person. Hebrew. Keep facts, preferences, ongoing plans and open requests; drop small talk.',
      prompt: `Earlier notes:\n${d.memory || '(none)'}\n\nConversation:\n${t.slice(-60000)}`,
      schema: z.object({ notes: z.string() }),
    });
    d.memory = r.notes.slice(0, 6000);
  } catch { /* keep the old notes */ }
  return []; // simple compaction: start a fresh conversation carrying only the notes
}

export async function chat(ctx: Ctx) {
  const u = requireUser(ctx);
  if (!ctx.env.ANTHROPIC_API_KEY) throw new HttpError(503, 'ai_not_configured');
  const b = await body<{ text?: string; event?: string; page?: string; landmarks?: { key: string; label: string }[] }>(ctx.req);
  const landmarks = (Array.isArray(b.landmarks) ? b.landmarks : []).slice(0, 40)
    .map((l) => ({ key: String(l.key).replace(/[^\w-]/g, '').slice(0, 40), label: String(l.label).replace(/[<>()]/g, '').slice(0, 50) })).filter((l) => l.key);
  const said = (b.text || '').trim().slice(0, 4000);
  const event = (b.event || '').trim().slice(0, 200);
  if (!said && !event) throw new HttpError(400, 'Empty message');

  const d = await loadDaemon(ctx.env, u.email);
  let messages: BetaMessageParam[] = await compactIfNeeded(ctx.env, d, storedMessages(d));
  const fresh = messages.length === 0;
  const note = stateNote(u, d, (b.page || '/').slice(0, 60), landmarks) + (fresh && d.memory ? `\n<memory>${d.memory}</memory>` : '');
  messages.push({ role: 'user', content: [{ type: 'text', text: `${note}\n\n${said || `[${event}]`}` }] });

  const client = new Anthropic({ apiKey: ctx.env.ANTHROPIC_API_KEY, maxRetries: 1, ...(ctx.env.DEV_MODE === '1' && ctx.env.ANTHROPIC_BASE_URL ? { baseURL: ctx.env.ANTHROPIC_BASE_URL } : {}) });
  const events: DaemonEvent[] = [];
  let reply = '';
  let sources: { title: string; url: string }[] = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let res;
    try {
      res = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system: SYSTEM,
        tools: TOOLS,
        messages,
      });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new HttpError(503, 'claude_key_invalid');
      if (err instanceof Anthropic.RateLimitError) throw new HttpError(429, 'ai_busy');
      if (err instanceof Anthropic.APIError) {
        console.error('Claude API error', err.status, err.message);
        throw new HttpError(502, `claude_error_${err.status}: ${String(err.message).slice(0, 300)}`);
      }
      throw err;
    }
    messages.push({ role: 'assistant', content: res.content as BetaContentBlock[] as any });
    for (const block of res.content) {
      if (block.type === 'text' && block.text.trim()) reply += (reply ? '\n' : '') + block.text.trim();
      if (block.type === 'web_search_tool_result' && Array.isArray((block as any).content)) {
        for (const r of (block as any).content) if (r.url) sources.push({ title: r.title, url: r.url });
      }
    }
    if (res.stop_reason === 'refusal') {
      reply ||= 'אוי, בזה אני לא יכול לעזור. נסו לשאול אחרת?';
      break;
    }
    if (res.stop_reason === 'pause_turn') continue;
    if (res.stop_reason !== 'tool_use') break;

    const results: BetaToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== 'tool_use') continue;
      let out: unknown;
      let isError = false;
      try {
        out = await runTool(ctx, u, d, block.name, block.input, events);
      } catch (e) {
        isError = true;
        out = { error: e instanceof Error ? e.message : 'failed' };
      }
      results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out), is_error: isError });
    }
    messages.push({ role: 'user', content: results });
  }

  d.messages = JSON.stringify({ v: PROMPT_VERSION, messages });
  await saveDaemon(ctx.env, d);
  const seen = new Set<string>();
  sources = sources.filter((s) => !seen.has(s.url) && seen.add(s.url)).slice(0, 4);
  return json({ reply: reply.trim(), events, sources, daemon: publicState(d, await loadBody(ctx.env, u.email)) });
}

export async function getDaemon(ctx: Ctx) {
  const u = requireUser(ctx);
  const d = await loadDaemon(ctx.env, u.email);
  return json({ daemon: publicState(d, await loadBody(ctx.env, u.email)), transcript: transcript(storedMessages(d)), ai: !!ctx.env.ANTHROPIC_API_KEY, images: !!ctx.env.GEMINI_API_KEY });
}

/** "Forget our conversation" (keeps the name, shape and memory notes). */
export async function resetChat(ctx: Ctx) {
  const u = requireUser(ctx);
  const d = await loadDaemon(ctx.env, u.email);
  d.messages = JSON.stringify({ v: PROMPT_VERSION, messages: await compactIfNeeded(ctx.env, d, storedMessages(d), true) });
  await saveDaemon(ctx.env, d);
  return json({ ok: true });
}

/* ---------------- photorealistic forms (Gemini image generation, cached in R2) ---------------- */

const STYLE = 'Photorealistic close-up portrait of a single {animal}, head and shoulders, centred, looking straight at the camera with a warm, curious, gentle and slightly playful expression, eyes sharp and bright with catchlights. Soft warm amber rim light, a few tiny glowing golden embers drifting in the air, deep dark blue-black background, shallow depth of field, award-winning wildlife photography, 85mm lens. No text, no people, no frame.';

export async function formImage(ctx: Ctx) {
  const u = requireUser(ctx);
  const slug = ctx.params.slug.replace(/\.(png|jpe?g|webp)$/, '');
  if (!/^[a-z0-9-]{2,48}$/.test(slug) || slug === 'spark') throw new HttpError(400, 'Invalid form');
  const key = `forms/${slug}.img`;
  const headers = { 'cache-control': 'public, max-age=31536000, immutable' };

  const stored = ctx.env.MEDIA ? await ctx.env.MEDIA.get(key) : null;
  if (stored) return new Response(stored.body, { headers: { ...headers, 'content-type': stored.httpMetadata?.contentType || 'image/png' } });
  const cache = (caches as any).default as Cache;
  const cacheKey = new Request(`https://daemon-forms.helper/${slug}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  if (!ctx.env.GEMINI_API_KEY) throw new HttpError(503, 'images_not_configured');
  // A simple daily limit per person, so a playful afternoon doesn't run up the bill.
  const day = new Date().toISOString().slice(0, 10);
  const q = await ctx.env.DB.prepare('SELECT count FROM image_quota WHERE email = ? AND day = ?').bind(u.email, day).first<{ count: number }>();
  if ((q?.count || 0) >= IMAGES_PER_DAY) throw new HttpError(429, 'images_quota');
  await ctx.env.DB.prepare(`INSERT INTO image_quota (email, day, count) VALUES (?, ?, 1) ON CONFLICT(email, day) DO UPDATE SET count = count + 1`).bind(u.email, day).run();

  const animal = slug.replace(/-/g, ' ');
  const model = ctx.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  const res = await fetch(`${(ctx.env.DEV_MODE === '1' && ctx.env.GEMINI_BASE_URL) || 'https://generativelanguage.googleapis.com'}/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': ctx.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: STYLE.replace('{animal}', animal) }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('Gemini image error', res.status, detail.slice(0, 500));
    // Don't count a failed attempt against the daily limit.
    await ctx.env.DB.prepare('UPDATE image_quota SET count = MAX(0, count - 1) WHERE email = ? AND day = ?').bind(u.email, day).run();
    throw new HttpError(502, `image_error_${res.status}: ${detail.replace(/\s+/g, ' ').slice(0, 300)}`);
  }
  const data = (await res.json()) as any;
  const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data || p.inline_data?.data);
  const inline = part?.inlineData || part?.inline_data;
  if (!inline) {
    const why = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || 'no image returned';
    throw new HttpError(502, `image_empty: ${why}`);
  }
  const bytes = Uint8Array.from(atob(inline.data), (c) => c.charCodeAt(0));
  const type = inline.mimeType || inline.mime_type || 'image/png';
  if (ctx.env.MEDIA) await ctx.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type } });
  const out = new Response(bytes, { headers: { ...headers, 'content-type': type } });
  ctx.waitUntil(cache.put(cacheKey, out.clone()));
  return out;
}
