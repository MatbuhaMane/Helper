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
