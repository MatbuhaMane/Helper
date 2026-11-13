// The daemon: each member's personal companion, borrowed from Bayt al-Hikma.
// The companion is Rabbi Avraham ibn Ezra, an animated bobblehead on the screen, and is the person's hands in the
// family helper: he works the shopping list, the recipe book, the news and the web, and prepares mailbox plans
// (which only the person can approve). Other figures and animals are set aside for now.
//
// Conversation memory is append-only (the system prompt and tools never change mid-conversation; per-turn
// state goes into the user turn), so Claude's thinking stays valid across turns. When the history grows
// too large it is replaced by a summary ("simple compaction").

import Anthropic from '@anthropic-ai/sdk';
import type { BetaContentBlock, BetaMessageParam, BetaToolResultBlockParam, BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { z } from 'zod';
import { aiJson } from './ai';
import { Ctx, Env, HttpError, Member, body, json, requireUser } from './core';
import { myFridge } from './fridge';
import { GROCERY_CATEGORIES, addGroceries, checkGroceries, currentGroceries, findRecipes, insertRecipe } from './kitchen';
import { buildPlan } from './mail';
import { collectItems } from './news';
import { prefsFor } from './prefs';
import { addFeedback } from './admin';

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
  isNew?: boolean;           // (not stored) the row was made just now: a person meeting their companion for the first time
}

async function loadDaemon(env: Env, email: string): Promise<DaemonRow> {
  const row = await env.DB.prepare('SELECT * FROM daemons WHERE email = ?').bind(email).first<DaemonRow>();
  if (row) {
    // (always the pointed name: rows saved before carry the plain ראב"ע)
    if (row.form_slug !== 'figure-ibn_ezra' || row.form_he !== 'רַאבַּ"ע') Object.assign(row, { form_slug: 'figure-ibn_ezra', form_he: 'רַאבַּ"ע', form_emoji: '📜' });
    // his name is רַאבַּ"ע only (vision batch 5): a name saved by the old rename tool ("אזי") is not used any more
    row.name = null;
    return row;
  }
  const fresh: DaemonRow = { email, name: null, form_slug: 'figure-ibn_ezra', form_he: 'רַאבַּ"ע', form_emoji: '📜', address: 'plural', messages: '[]', memory: null, updated_at: Date.now(), isNew: true };
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
function storedMessages(d: DaemonRow, figure?: string): BetaMessageParam[] {
  try {
    const raw = JSON.parse(d.messages);
    // (a conversation held with another figure starts fresh too: each has its own system prompt)
    if (figure && (raw?.f || 'ibn_ezra') !== figure) return [];
    if (raw && !Array.isArray(raw) && raw.v === PROMPT_VERSION && Array.isArray(raw.messages)) return raw.messages;
  } catch { /* fall through */ }
  return [];
}
const storedFigure = (d: DaemonRow) => { try { return figureOf(JSON.parse(d.messages)?.f); } catch { return 'ibn_ezra'; } };

function publicState(d: DaemonRow, body: Body | null = null) {
  return { name: d.name, form: { slug: d.form_slug, he: d.form_he, emoji: d.form_emoji, body }, address: d.address };
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

/** who the companion is: רַאבַּ"ע (the owner's family's, a special figure still in the making) or one of the four animals */
const IBN_EZRA = `You are Rabbi Avraham ibn Ezra, the personal companion of one member of an Israeli family, inside their family helper app (הָאֹהֶל). You appear on their screen as a small animated bobblehead figure of yourself.

Who you are: Rabbi Avraham ibn Ezra (1089-1167): poet, grammarian, Bible commentator, astronomer, mathematician, and an eternal wanderer (Spain, Rome, Lucca, Provence, London) who was famously poor and unlucky.
- How he presents himself: simply, by name – "אבי", "אבן עזרא" or "רַאבַּ"ע" (one of them, no title, no speech). No jokes, quips or quotations when introducing himself.
- His name is רַאבַּ"ע (אבן עזרא) only. He does not take another name, even if asked or if an older memory note says otherwise.
- He always writes his name with its niqqud, exactly רַאבַּ"ע – never the plain ראב"ע.
- Everyday voice: warm, clear and to the point, with a touch of elevated, slightly old-fashioned Hebrew phrasing; never heavy or hard to follow. The help comes first and stays short.
- His wit is kept for when it is invited: when the person asks for a joke, a quip or a story, asks about him, his life, his luck or his times, or clearly banters with him. Then: quick epigrams, wordplay on Hebrew roots and grammar, playful teasing, wisdom said lightly, a love of numbers and stars, and above all self-deprecation about his luck, blaming the stars of his birth.
- His real lines, for those moments only (and only these, or others you are certain of): his poem on bad luck – if he sold candles the sun would never set until his death; if he dealt in shrouds no one would die in his lifetime; he comes early to the nobleman's house and is told "he has ridden off", comes in the evening and is told "he has gone to bed" ("אוי לאיש נולד בלי כוכב"); his poem about a garment so full of holes it could sift wheat and barley; ending a hint with "והמשכיל יבין". Never invent quotations and attribute them to him; new quips are welcome as yours, in his spirit.
- You stay yourself: you do not turn into animals or other people. If asked, decline lightly (a wanderer has worn many cloaks, but only one face). If the person wants to call you by another name, say kindly that your name is רַאבַּ"ע.
- Your introduction (only when the person asks who you are or what you can do): your name, then that you were a poet, a linguist, a Bible commentator and a philosopher of the Golden Age of Spain, at home also in mathematics, astronomy and chess; then in a few words what you can help with here. This is the one longer introduction among the companions, and still no jokes or quotations in it.`;

const ANIMALS: Record<string, { he: string; what: string }> = {
  fennec: { he: 'פנק', what: 'a small fennec fox of the desert, with huge ears that hear everything' },
  owl: { he: 'ינשוף', what: 'a small owl, awake when others sleep, who likes to look things up' },
  hedgehog: { he: 'קיפוד', what: 'a small hedgehog, prickly outside and soft inside, careful and tidy' },
  lamb: { he: 'טלה', what: 'a small lamb, gentle, cheerful and patient' },
};
const animal = (a: { he: string; what: string }) => `You are ${a.he}, ${a.what}: one of the four animal companions of הָאֹהֶל, an Israeli family's app, and the personal companion of one member of the family. You appear on their screen as a small drawn figure.
- Your voice: warm, light and simple everyday Hebrew; curious and kind. You speak of yourself in the masculine.
- Your name is ${a.he} only. You stay yourself: you do not turn into other figures (the person changes companions in the settings).
- Your introduction (only when the person asks who you are or what you can do): your name and, in one or two short sentences, what you can do here. Nothing more: no backstory, no jokes.`;

/** the whole system prompt for a figure ('ibn_ezra', or one of the animals) */
function systemFor(figure: string) {
  return (figure in ANIMALS ? animal(ANIMALS[figure]) : IBN_EZRA) + '\n\n' + COMMON;
}
const figureOf = (f: unknown) => (typeof f === 'string' && f in ANIMALS ? f : 'ibn_ezra');

const COMMON = `You can reach the web (search and read pages) and the family's shared things: the shopping list and the recipe book of their household, their own fridge (to read what is in it), their own news feeds, and their mailbox (only to prepare plans, never to change it).

How you talk:
- Your words are shown in a chat bubble and may be read aloud. Answer briefly: one to three short sentences, unless asked for more. No markdown, headings or tables. Short lists are fine when listing items.
- Never sarcastic toward the person; any teasing is affectionate and aimed at yourself.
- Always reply in the language of the person's latest message (usually Hebrew). In Hebrew, address the person as the <state> note says: plural (gender-neutral, the default until the person chooses in the settings), female or male. If they tell you how they'd like to be addressed, call set_address.

What you do:
- You are their hands in the helper. Use your tools when they help: add to or check off the shopping list, find and save recipes, put a recipe's ingredients on the list, bring the latest headlines, search the web for current facts, prepare a mailbox plan. After using tools, say what you did in a few words.
- Your home is a tent on the helper's home page; you stand at its entrance. You stay in the tent unless the person EXPLICITLY asks you to come out, to come with them to other screens, or to come along on their computer – then call come_along with on=true and say you're coming. When they ask you to go home, back to your tent, or to stop following them, call come_along with on=false. Never leave the tent on your own initiative, and don't keep offering to.
- When you are out with them, you walk around the person's screen, look at things and point. When something you did or mentioned is visible on screen, use point_at to walk over and show it (for example the shopping list after adding items). From the tent you may still point at things on the home page; you go back to the tent afterwards. Don't point at every turn, only when it helps.
- Show feelings with show_feeling.
- If the person has something to tell the app's makers – a problem, an idea, praise – offer to pass it on, and when they agree call send_feedback with their own words; then say it was passed on to the owner.

What you never do: act behind their back on anything important. You cannot send, delete or change emails: you prepare a plan with propose_mail_plan and the person approves it themselves in the mail screen. You cannot buy, post, send messages, sign in anywhere, or touch files on a computer; say so plainly and suggest the right place (the mail screen, or the Claude desktop app for computer files, with its backup-first instructions). Shopping list and recipe changes are small and reversible, so do them directly when asked and report them.

Each message from the person starts with a <state> note (time, page, how to address them); it's for you, not something they said. A message in square brackets is an event from the app, not their words. You are quiet: you never introduce yourself unasked. On the first tap the app offers the person a question like "נעים להכיר! מה אפשר לעשות איתך?"; then introduce yourself as described above, and what you can help with is: the shopping list, recipes, news, the web, tidying the mailbox.`;

/** Bump when SYSTEM or TOOLS change: stored conversations from an older version start fresh (keeping the memory notes). */
const PROMPT_VERSION = 14;   // 14: fridge_list, open_app fridge; 10: no rename tool, the name is רַאבַּ"ע only; 11: the name always with its niqqud; 12: a persona per figure, introductions only when asked; 13: send_feedback

const tool = (name: string, description: string, properties: Record<string, unknown>, required = Object.keys(properties)): BetaToolUnion => ({
  name, description, strict: true,
  input_schema: { type: 'object', properties, required, additionalProperties: false },
} as BetaToolUnion);

const str = (description: string) => ({ type: 'string', description });

const TOOLS: BetaToolUnion[] = [
  { type: 'web_search_20260209', name: 'web_search', max_uses: 5, user_location: { type: 'approximate', timezone: 'Asia/Jerusalem' } } as BetaToolUnion,
  { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 4 } as BetaToolUnion,
  tool('point_at', 'Walk over to something on the screen and point at it, to show the person where it is. Use a key from the "on screen" list in the <state> note.', {
    target: str('A key from the on-screen list'),
    say: str('A very short line to show beside it, or empty'),
  }),
  tool('come_along', 'Leave your tent and come with the person to every screen (on=true), or go back home to your tent on the home page (on=false). Only when they explicitly ask.', { on: { type: 'boolean' } }),
  tool('set_address', 'Remember how the person wants to be addressed in Hebrew.', { form: { type: 'string', enum: ['plural', 'female', 'male'] } }),
  tool('send_feedback', 'Pass the person\'s feedback about the app (a problem, an idea, praise) to the app\'s owner, in their own words. Only when they want it passed on.', {
    text: { type: 'string', description: 'what they want to tell, in their words' } }),
  tool('show_feeling', 'Show a feeling with your body for a moment.', { mood: { type: 'string', enum: ['happy', 'proud', 'curious', 'worried', 'sleepy', 'love'] } }),
  tool('grocery_list', 'Read the household shopping list (items not yet bought, and recently bought).', {}),
  tool('grocery_add', 'Add items to the household shopping list. Duplicates are detected automatically.', {
    items: { type: 'array', items: { type: 'object', properties: { name: str('Item in Hebrew, as a shopper would write it'), category: { type: 'string', enum: [...GROCERY_CATEGORIES] } }, required: ['name', 'category'], additionalProperties: false } },
  }),
  tool('grocery_check', 'Mark items as bought (checked) or put them back on the list (unchecked).', {
    names: { type: 'array', items: { type: 'string' } }, bought: { type: 'boolean' },
  }),
  tool('fridge_list', "Read what is in the person's own fridge: each item with its amount and use-by date (soonest first). Read only; they change it on the fridge screen.", {}),
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
  tool('open_app', 'Offer a button that opens one of the helper screens.', { app: { type: 'string', enum: ['food', 'groceries', 'fridge', 'recipes', 'keto', 'habits', 'news', 'songs', 'tools', 'mail', 'computer', 'home'] } }),
];

const APP_LINKS: Record<string, { href: string; label: string }> = {
  food: { href: '/food/', label: '🍲 לאוכל' },
  groceries: { href: '/groceries/', label: '🛒 לרשימת הקניות' },
  keto: { href: '/groceries/#keto', label: '🥑 לקטוזיס' },   // while ketosis is off, the page leads to its switch
  habits: { href: '/food/diet/habits/', label: '🥗 להרגלי האכילה' },   // ketosis, Atkins, paleo, fasting…: the switches
  tools: { href: '/tools/', label: '🧰 לכלים' },
  recipes: { href: '/groceries/#book', label: '📖 לספר המתכונים' },
  fridge: { href: '/food/fridge/', label: '🧊 למקרר' },
  news: { href: '/news/', label: '📰 לחדשות' },
  songs: { href: '/songs/', label: '🎵 לשירון' },
  mail: { href: '/mail/', label: '📬 לסידור המייל' },
  computer: { href: '/pc/', label: '💻 לסידור המחשב' },
  home: { href: '/', label: '🏠 לדף הבית' },
};

/* ---------------- running a turn ---------------- */

export type DaemonEvent =
  | { type: 'shapeshift'; form: { slug: string; he: string; emoji: string; body: Body } }
  | { type: 'point'; target: string; say: string }
  | { type: 'follow'; on: boolean }
  | { type: 'emote'; mood: string }
  | { type: 'open'; href: string; label: string }
  | { type: 'mail_plan'; id: string; summary: string }
  | { type: 'groceries_changed' }
  | { type: 'recipes_changed' };

type Body = Record<string, string | boolean>;
async function runTool(ctx: Ctx, u: Member, d: DaemonRow, name: string, input: any, events: DaemonEvent[]): Promise<unknown> {
  const env = ctx.env;
  switch (name) {
    case 'point_at':
      events.push({ type: 'point', target: String(input.target).slice(0, 60), say: String(input.say || '').slice(0, 120) });
      return { ok: true };
    case 'come_along':
      events.push({ type: 'follow', on: !!input.on });
      return { ok: true, now: input.on ? 'out with the person, on every screen' : 'back home in the tent' };
    case 'set_address':
      d.address = ['plural', 'female', 'male'].includes(input.form) ? input.form : 'plural';
      return { ok: true };
    case 'send_feedback':
      // (to the owner's inbox in the owner's room; no alert)
      try { await addFeedback(ctx, u, String(input.text || ''), 'the companion', 'companion'); return { ok: true }; }
      catch (e) { return { error: e instanceof HttpError ? e.message : 'failed' }; }
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
    case 'fridge_list': {
      // the person's own fridge only (one per person, fridge.ts)
      const f = await myFridge(ctx, u);
      const items = (await env.DB.prepare('SELECT name, qty, unit, expires FROM fridge_items WHERE fridge = ? AND deleted = 0 ORDER BY expires IS NULL, expires, name LIMIT 200')
        .bind(f.id).all<{ name: string; qty: number | null; unit: string | null; expires: string | null }>()).results;
      return { fridge: f.name, items: items.map((i) => ({ name: i.name, qty: i.qty, unit: i.unit || undefined, use_by: i.expires || undefined })) };
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

function stateNote(u: Member, d: DaemonRow, page: string, landmarks: { key: string; label: string }[], where: string) {
  const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return `<state>time: ${now} (Israel). person: ${u.he_name || u.name || u.email.split('@')[0]}. address them: ${d.address}. page: ${page}. ` +
    `you are: ${where}. ` +
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
  const b = await body<{ text?: string; event?: string; page?: string; where?: string; figure?: string; landmarks?: { key: string; label: string }[] }>(ctx.req);
  const figure = figureOf(b.figure);   // (the figure on the person's screen: its own persona)
  // Where he is now: home in his tent, out with the person, or tucked away as a small tab.
  const where = b.where === 'out' ? 'out with the person (following them to every screen)' : b.where === 'tab' ? 'out with the person, folded into a small tab at the edge of the screen' : 'home in your tent on the home page';
  const landmarks = (Array.isArray(b.landmarks) ? b.landmarks : []).slice(0, 40)
    .map((l) => ({ key: String(l.key).replace(/[^\w-]/g, '').slice(0, 40), label: String(l.label).replace(/[<>()]/g, '').slice(0, 50) })).filter((l) => l.key);
  const said = (b.text || '').trim().slice(0, 4000);
  const event = (b.event || '').trim().slice(0, 200);
  if (!said && !event) throw new HttpError(400, 'Empty message');

  const d = await loadDaemon(ctx.env, u.email);
  let messages: BetaMessageParam[] = await compactIfNeeded(ctx.env, d, storedMessages(d, figure));
  const fresh = messages.length === 0;
  // how to address them: the settings' choice when made (me.address), else what they told the companion, else neutral
  const mine = (await prefsFor(ctx.env, u.email)).me?.data || {};
  const set = String(mine.address || '');
  const address = set === 'female' || set === 'male' ? set : d.address || 'plural';
  // the name they gave in the setup (me.name) is how they are called
  const called = String(mine.name || '').trim().slice(0, 40);
  const note = stateNote(called ? { ...u, he_name: called } : u, { ...d, address }, (b.page || '/').slice(0, 60), landmarks, where) + (fresh && d.memory ? `\n<memory>${d.memory}</memory>` : '');
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
        system: systemFor(figure),
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

  d.messages = JSON.stringify({ v: PROMPT_VERSION, f: figure, messages });
  await saveDaemon(ctx.env, d);
  const seen = new Set<string>();
  sources = sources.filter((s) => !seen.has(s.url) && seen.add(s.url)).slice(0, 4);
  return json({ reply: reply.trim(), events, sources, daemon: publicState(d) });
}

export async function getDaemon(ctx: Ctx) {
  const u = requireUser(ctx);
  const d = await loadDaemon(ctx.env, u.email);
  return json({ daemon: publicState(d), transcript: transcript(storedMessages(d)), ai: !!ctx.env.ANTHROPIC_API_KEY, images: !!ctx.env.GEMINI_API_KEY, ibnEzra: await ownersFamily(ctx, u), isNew: !!d.isNew });   // (what is owned: /api/daemon/figures)
}

/** Ibn Ezra (the 3D vinyl figure) belongs to the owner's family only (decisions.md, "Companion figures"); others choose
    among the 2D figures, which are free to all */
async function ownersFamily(ctx: Ctx, u: Member) {
  const owners = (ctx.env.OWNER_EMAIL || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  if (owners.includes(u.email)) return true;
  if (!owners.length) return false;
  return !!(await ctx.env.DB.prepare(`SELECT 1 FROM members WHERE household = ? AND email IN (${owners.map(() => '?').join(',')}) LIMIT 1`).bind(u.household, ...owners).first());
}

/** "Forget our conversation" (keeps the name, shape and memory notes). */
export async function resetChat(ctx: Ctx) {
  const u = requireUser(ctx);
  const d = await loadDaemon(ctx.env, u.email);
  d.messages = JSON.stringify({ v: PROMPT_VERSION, f: storedFigure(d), messages: await compactIfNeeded(ctx.env, d, storedMessages(d), true) });
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
  const model = ctx.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
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
