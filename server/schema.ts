// Creates the database tables on first use (every statement is CREATE ... IF NOT EXISTS), so a fresh D1
// database needs no manual setup. Runs once per Worker instance.
// @ts-ignore - bundled as text by the [[rules]] entry in wrangler.toml
import SCHEMA from '../schema.sql';
import type { Env } from './core';

// Columns added after a table first shipped. SQLite has no "ADD COLUMN IF NOT EXISTS", so each one is tried
// on its own and a "duplicate column" error just means it is already there.
const COLUMNS: [table: string, column: string, type: string][] = [
  ['recipes', 'subtitle', 'TEXT'],   // where the recipe came from, shown under the title
  ['recipes', 'meta', 'TEXT'],       // JSON {site, original_title, lang, country, servings, time}
  ['feeds', 'lang', 'TEXT'],         // he | ar | en | ...
  ['feeds', 'country', 'TEXT'],      // Hebrew name of the source's country
  ['feeds', 'kind', 'TEXT'],         // web | telegram | facebook | ...
  ['feeds', 'quality', 'INTEGER'],   // 1-5, quality and reliability (our default, the person can change it)
  ['feeds', 'category', 'TEXT'],     // editorial | official | journalist | aggregator | activist
  ['news_state', 'hidden', 'INTEGER'], // the person hid this article
  ['news_state', 'rating', 'INTEGER'], // the person's own reliability rating for this article (1-5)
  ['news_state', 'folder', 'TEXT'],    // the folder of a saved article (the folders themselves are in the person's prefs)
  ['music_tokens', 'scope', 'TEXT'],   // what the person allowed (streaming = the helper can play Spotify itself)
  ['members', 'he_name', 'TEXT'],      // the Hebrew name the helper calls the person by (Google gives names in English)
  ['sessions', 'created_at', 'INTEGER'], // when the session began (the vault wants a fresh sign-in for some steps)
  ['family_events', 'household', 'TEXT'], // whose calendar (older rows: the family's)
  ['fridges', 'household', 'TEXT'],       // whose fridge (older rows: the family's)
  ['family_people', 'privacy', 'TEXT'],      // JSON {identity, dates, notes, files}: private | household | linked | forest
  ['family_people', 'anonymous', 'INTEGER'], // 1: outside the household only "קרוב/ת משפחה"
  ['ai_usage', 'own_key', 'INTEGER'],        // 1: sent with the person's own key (costs the owner nothing, needs no credit)
  ['admin_entries', 'stay', 'INTEGER'],      // 1: "stay unlocked" – the room's idle limit lifted (own account only)
  ['admin_messages', 'to_email', 'TEXT'],    // a message for one person (a gift's note); empty: for everyone
  ['design_images', 'usd', 'REAL'],          // what this picture cost (from Gemini's answer, priced as the meter prices it)
  ['design_images', 'started_at', 'INTEGER'], // when its batch started (the same for each picture of a batch)
  ['sessions', 'vault_trust_until', 'INTEGER'], // the family tree opens on this device with no unlock until then (30 days from its last use)
  ['sessions', 'vault_trust_since', 'INTEGER'], // when this device became trusted
  ['sessions', 'vault_trust_used', 'INTEGER'],  // when it last opened the tree
  ['sessions', 'vault_trust_label', 'TEXT'],    // a coarse name for the list ("Chrome · Windows"), never the whole User-Agent
  ['notes', 'starred', 'INTEGER'],              // 1: the person starred this note (shown first)
  ['notes', 'drive_id', 'TEXT'],                // the Google Doc this note was saved as, in the person's own Drive
  ['notes', 'drive_at', 'INTEGER'],             // when it was last saved there
  ['notes', 'inbox', 'INTEGER'],                // 1: captured from anywhere (/capture/), waiting to be sorted into a research
  ['notes', 'rich', 'TEXT'],                    // the note with its formatting (allowlist HTML, notes-rich.ts); null: plain text
  ['grocery_items', 'list', 'TEXT'],            // a named list (grocery_lists); null: the household's main list
  ['researches', 'goal_id', 'TEXT'],           // the goal it became (the goals engine: its steps come to "היום")
  ['researches', 'done_at', 'INTEGER'],         // finished ("גשש")
  ["members", "birth_year", "INTEGER"],         // private: only the owner sees it (the room); under 12 hides horror figures and keeps a child in the family
  ["members", "first_seen", "INTEGER"],         // their first sign-in (the owner is told, core.ts firstSignIn)
  ["members", "approved_at", "INTEGER"],        // the owner approved them in the room: full access, every special feature
  ["sessions", "app_locked", "INTEGER"],       // 1: the app is locked in this session (server/lock.ts)
  ["sessions", "last_active", "INTEGER"],      // the app lock's clock of "left alone"
  ["sessions", "tree_open_until", "INTEGER"],  // the family tree opened by its lock, until
  ['goals', 'shared', 'INTEGER'],              // 1: the person shares this goal's progress with the household (goal-social.ts)
  ["sessions", "lock_proof_at", "INTEGER"],    // the last code, passkey or sign-in: changes to the locks need one from the last 5 minutes
  ['research_notes', 'note_email', 'TEXT'],     // shared research: whose note it is (empty: the research's owner)
  ['research_notes', 'shared', 'INTEGER'],      // 0: a private note – the others see only that there is one
  ['research_threads', 'created_by', 'TEXT'],   // who wrote it (empty: the owner)
  ['research_sources', 'created_by', 'TEXT'],   // who added it (empty: the owner)
  ['research_drafts', 'created_by', 'TEXT'],    // who started it (empty: the owner)
  ['goals', 'repeat', 'TEXT'],                  // a recurring goal: JSON {every: day|week|month|days, n?} (goals-logic.ts)
];

let ready: Promise<void> | null = null;

export function ensureSchema(env: Env): Promise<void> {
  ready ||= (async () => {
    const statements = (SCHEMA as string)
      .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
      .split(';').map((s) => s.trim()).filter(Boolean);
    await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
    for (const [table, column, type] of COLUMNS) {
      try {
        await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
      } catch (err) {
        if (!/duplicate column/i.test(String(err instanceof Error ? err.message : err))) throw err;
      }
    }
  })().catch((err) => { ready = null; throw err; });
  return ready;
}
