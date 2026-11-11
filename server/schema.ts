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
