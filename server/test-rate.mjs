// Tests for counting tries in one statement (server/rate-sql.ts) on real SQLite:   node server/test-rate.mjs
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'rate-test-'));
const build = async (name) => {
  const out = join(dir, name + '.mjs');
  execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), `server/${name}.ts`), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
  return import(pathToFileURL(out).href);
};
const R = await build('rate-sql');
const L = await build('lock-rules');

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error('FAIL', name, 'got', JSON.stringify(got), 'want', JSON.stringify(want)); } };

const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE rate_hits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)');
db.exec('CREATE TABLE user_locks (email TEXT PRIMARY KEY, fails INTEGER, pause_until INTEGER, closed INTEGER)');

/* ---- rate limits ---- */
const hit = (key, now, win = 1000) => db.prepare(R.RATE_HIT_SQL).get(key, now + win, now, now).count;
eq('first hit', hit('a', 0), 1);
eq('second hit', hit('a', 10), 2);
eq('third hit', hit('a', 20), 3);
eq('another key apart', hit('b', 20), 1);
eq('the window keeps its start', db.prepare('SELECT reset_at FROM rate_hits WHERE key = ?').get('a').reset_at, 1000);
eq('a new window starts again at 1', hit('a', 1001), 1);
eq('and gets a new end', db.prepare('SELECT reset_at FROM rate_hits WHERE key = ?').get('a').reset_at, 2001);
// each of many hits sees its own number, so a limit of 5 lets exactly 5 through
let through = 0;
for (let i = 0; i < 50; i++) if (hit('burst', 5) <= 5) through++;
eq('a burst of 50 against a limit of 5', through, 5);

/* ---- the app lock's code ---- */
db.prepare('INSERT INTO user_locks VALUES (?, 0, 0, 0)').run('x@x');
const tryPin = (now) => db.prepare(R.PIN_TRY_SQL).get(L.PAUSE_EVERY, now + L.PAUSE_MS, L.CLOSE_AT, 'x@x', now) || null;
const seen = [];
for (let i = 0; i < 20; i++) { const t = tryPin(100); seen.push(t ? t.fails : null); }
eq('20 tries at once: 5 counted, then the pause holds', seen, [1, 2, 3, 4, 5, ...Array(15).fill(null)]);
eq('the fifth try set the pause', db.prepare('SELECT pause_until FROM user_locks').get().pause_until, 100 + L.PAUSE_MS);
const after = 100 + L.PAUSE_MS;
const seen2 = [];
for (let i = 0; i < 20; i++) { const t = tryPin(after); seen2.push(t ? t.fails : null); }
eq('after the pause: 5 more, and the tenth closes', seen2, [6, 7, 8, 9, 10, ...Array(15).fill(null)]);
eq('closed at 10', db.prepare('SELECT closed FROM user_locks').get().closed, 1);
eq('closed stays closed long after', tryPin(after * 10), null);
eq('a missing row counts nothing', db.prepare(R.PIN_TRY_SQL).get(5, 0, 10, 'nobody', 0) || null, null);

console.log(`rate: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
