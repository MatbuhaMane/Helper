// Creates the database tables on first use (every statement is CREATE ... IF NOT EXISTS), so a fresh D1
// database needs no manual setup. Runs once per Worker instance.
// @ts-ignore - bundled as text by the [[rules]] entry in wrangler.toml
import SCHEMA from '../schema.sql';
import type { Env } from './core';

let ready: Promise<void> | null = null;

export function ensureSchema(env: Env): Promise<void> {
  ready ||= (async () => {
    const statements = (SCHEMA as string)
      .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
      .split(';').map((s) => s.trim()).filter(Boolean);
    await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
  })().catch((err) => { ready = null; throw err; });
  return ready;
}
