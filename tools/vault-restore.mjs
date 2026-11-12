#!/usr/bin/env node
// Open the family vault's backups on this computer – no Cloudflare, no internet needed.
//
//   node tools/vault-restore.mjs <backup folder> <output folder>
//
// <backup folder>: a copy of the backups – the NAS folder that Cloud Sync fills (it holds _backup/ and the files), or a
//                  download of the Drive folder "Helper vault (encrypted)". The newest snapshot-*.json in it is used.
// The vault key (VAULT_KEY) is asked for and never shown. Out come the family's documents and pictures, decrypted,
// in a folder per person, plus people.json with the tree and everyone's details.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL, fileURLToPath } from 'node:url';

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('שימוש: node tools/vault-restore.mjs <תיקיית הגיבוי> <תיקיית פלט>'); process.exit(1); }

// the vault's own crypto code, bundled for Node
const root = join(fileURLToPath(import.meta.url), '..', '..');
const dir = mkdtempSync(join(tmpdir(), 'vault-restore-'));
writeFileSync(join(dir, 'entry.ts'), `export * from ${JSON.stringify(join(root, 'server/vault/crypto.ts'))};\n`);
execFileSync(process.execPath, [join(root, 'node_modules/esbuild/bin/esbuild'), join(dir, 'entry.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${join(dir, 'c.mjs')}`, '--log-level=error']);
const C = await import(pathToFileURL(join(dir, 'c.mjs')).href);

function ask(q) {
  return new Promise((res) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(q)) process.stdout.write(s); };   // nothing typed is echoed
    rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); res(a.trim()); });
  });
}
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });

const files = walk(src);
const snaps = files.filter((f) => /snapshot-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort((a, b) => basename(a).localeCompare(basename(b)));
if (!snaps.length) { console.error('לא נמצא קובץ snapshot-*.json בתיקייה.'); process.exit(1); }
const snapFile = snaps.at(-1);
console.log('העותק:', basename(snapFile));

const env = { VAULT_KEY: process.env.VAULT_KEY || await ask('מפתח הכספת (VAULT_KEY): ') };
const snap = JSON.parse(readFileSync(snapFile, 'utf8'));
let data;
try {
  const k = await C.openDataKey(env, snap.dek, snap.id);
  data = JSON.parse(new TextDecoder().decode(await C.decryptFile(k, Uint8Array.from(Buffer.from(snap.data, 'base64')), snap.id)));
} catch { console.error('המפתח לא פותח את העותק. בדקו שזה מפתח הכספת הנכון.'); process.exit(1); }

const safe = (s) => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 80) || 'ללא שם';
const EXT = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx', 'application/msword': '.doc', 'text/plain': '.txt' };
mkdirSync(out, { recursive: true });

const people = {};
for (const p of data.people) {
  people[p.id] = { id: p.id, name: await C.unseal(env, p.name_enc, `person:${p.id}:name`), details: JSON.parse((await C.unseal(env, p.details_enc, `person:${p.id}:details`)) || '{}'),
    parent1: p.parent1, parent2: p.parent2, partner: p.partner, member: p.member_email, deleted: !!p.deleted_at };
}
const byName = new Map(files.map((f) => [basename(f).replace(/\.bin$/, ''), f]));
let ok = 0, missing = 0;
const items = [];
for (const it of data.items) {
  const title = await C.unseal(env, it.title_enc, `item:${it.id}:title`), note = await C.unseal(env, it.note_enc, `item:${it.id}:note`);
  const person = people[it.person_id]?.name || 'לא ידוע';
  items.push({ id: it.id, person, kind: it.kind, title, note, private: !!it.private, by: it.owner_email, created: new Date(it.created_at).toISOString() });
  if (!it.object_key) continue;
  const f = byName.get(it.id) || byName.get(basename(it.object_key));
  if (!f) { missing++; console.warn('חסר הקובץ של:', person, '/', title); continue; }
  const key = await C.openDataKey(env, it.dek, it.id);
  const bytes = await C.decryptFile(key, new Uint8Array(readFileSync(f)), it.id);
  const folder = join(out, safe(person));
  mkdirSync(folder, { recursive: true });
  let name = safe(title).replace(/\.[a-z0-9]{2,5}$/i, '') + (EXT[it.mime] || '');
  if (existsSync(join(folder, name))) name = it.id + '-' + name;
  writeFileSync(join(folder, name), bytes);
  ok++;
}
writeFileSync(join(out, 'people.json'), JSON.stringify({ snapshot: snap.id, people: Object.values(people), items }, null, 2));
console.log(`נפתחו ${ok} קבצים${missing ? `, ${missing} חסרים בתיקיית הגיבוי` : ''}. הכול ב־${out}`);
