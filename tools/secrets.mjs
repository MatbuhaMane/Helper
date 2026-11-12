#!/usr/bin/env node
// Set up (or replace) every secret of the family helper, in one orderly pass – nothing is ever printed on the screen.
//
//   node tools/secrets.mjs            # all of them, one by one (each can be skipped)
//   node tools/secrets.mjs NAME ...   # only these
//
// For each secret it says what it is and where a new one is made; then:
//   * a key from a service (Anthropic, Gemini, Google): paste it (the typing is hidden)
//   * a key the helper makes itself (the vault key and the like): it is made here and copied to the clipboard,
//     so it goes into the password manager first – and only then to Cloudflare
// and it goes where it belongs: the live site, the previews (their shared base config) and .dev.vars (local development).
// Needs `npx wrangler login` once on this computer (in PowerShell: `npx.cmd wrangler login`).
// The messages are in English: the Windows console shows neither Hebrew letters nor right-to-left text properly.

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const devVars = join(root, '.dev.vars');
const gen = () => randomBytes(32).toString('base64');

// to: where it goes – live, previews, dev. kind: paste (from a service) | make (made here, to keep) | random (made here, nobody needs to keep it)
const CATALOG = [
  { name: 'VAULT_KEY', kind: 'make', to: ['live'], what: 'The family vault master key. Without it no document can be opened - not even from the backups.',
    warn: 'Replace it only while the vault has no documents yet. If it already has some, the old key must first move to VAULT_KEY_OLD.', keep: true },
  { name: 'TOKEN_KEY', kind: 'make', to: ['live'], what: 'Encrypts the Gmail and Google Drive connections kept on the server.',
    warn: 'After replacing it, Gmail (the mail organizer) and Google Drive (the vault backups) must be connected again, once.', keep: true },
  { name: 'GOOGLE_CLIENT_SECRET', kind: 'paste', to: ['live', 'previews', 'dev'], what: 'The secret of the Google sign-in.',
    where: 'https://console.cloud.google.com/apis/credentials?project=family-helper-514321 -> OAuth 2.0 Client -> Add secret. Once the site works with the new one, disable the old one.' },
  { name: 'ANTHROPIC_API_KEY', kind: 'paste', to: ['live', 'previews', 'dev'], what: 'Claude: the researcher, Ibn Ezra, and the judgment-heavy work.',
    where: 'https://console.anthropic.com/settings/keys -> Create Key. Once the site works, delete the old one.' },
  { name: 'GEMINI_API_KEY', kind: 'paste', to: ['live', 'previews', 'dev'], what: "Gemini: Ibn Ezra's voice, search, and many cheap tasks.",
    where: 'https://aistudio.google.com/apikey -> Create API key. Once the site works, delete the old one.' },
  { name: 'YOUTUBE_API_KEY', kind: 'paste', to: ['live', 'previews', 'dev'], what: 'YouTube: the funny feed and music search.',
    where: 'https://console.cloud.google.com/apis/credentials?project=family-helper-514321 -> Create credentials -> API key, restricted to YouTube Data API v3.' },
  { name: 'PREVIEW_HANDOFF_KEY', kind: 'random', to: ['live', 'previews'], what: 'Signs the sign-in tickets the live site sends to previews. No need to keep it.' },
  // the previews' own: a vault key and a token key of their own (their data is test data), and the owner's email
  { name: 'VAULT_KEY', kind: 'random', to: ['previews'], what: 'A separate vault key for the previews (test data). No need to keep it.', label: 'VAULT_KEY (previews)' },
  { name: 'TOKEN_KEY', kind: 'random', to: ['previews'], what: 'A separate token key for the previews. No need to keep it.', label: 'TOKEN_KEY (previews)' },
  { name: 'OWNER_EMAIL', kind: 'plain', to: ['previews'], what: "The family owner's Gmail address, so the owner can sign in to previews." },
];

const only = process.argv.slice(2);
const list = only.length ? CATALOG.filter((c) => only.includes(c.name) || only.includes(c.label)) : CATALOG;

/** A question; with hide, what is typed is not shown (the question itself is – readline draws it as the prompt). */
function ask(q, hide = false) {
  return new Promise((res) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
    if (hide) rl._writeToOutput = (s) => { if (s.startsWith(q)) rl.output.write(q); else if (/[\r\n]/.test(s)) rl.output.write('\n'); };
    rl.question(q, (a) => { rl.close(); res(a.trim()); });
  });
}

function wrangler(args, value) {
  return new Promise((resolve) => {
    // one command string (the arguments are fixed names, never values: the value goes in through stdin)
    const child = spawn(`npx wrangler ${args.join(' ')}`, { cwd: root, shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.stdin.end(value + '\n');
    child.on('close', (code) => resolve({ ok: code === 0, out }));
  });
}
function clipboard(value) {
  const cmd = process.platform === 'win32' ? ['clip'] : process.platform === 'darwin' ? ['pbcopy'] : ['xclip', '-selection', 'clipboard'];
  return spawnSync(cmd[0], cmd.slice(1), { input: value }).status === 0;
}
function setDevVar(name, value) {
  const lines = existsSync(devVars) ? readFileSync(devVars, 'utf8').split(/\r?\n/) : [];
  const i = lines.findIndex((l) => l.trim().startsWith(name + '='));
  if (i >= 0) lines[i] = `${name}=${value}`; else lines.push(`${name}=${value}`);
  writeFileSync(devVars, lines.join('\n').replace(/\n*$/, '\n'));
}
async function send(c, value) {
  const done = [];
  for (const t of c.to) {
    if (t === 'dev') { setDevVar(c.name, value); done.push('.dev.vars'); continue; }
    const r = await wrangler(t === 'live' ? ['secret', 'put', c.name] : ['preview', 'base-config', 'secret', 'put', c.name], value);
    if (!r.ok) { console.log(`  x could not save it on ${t === 'live' ? 'the live site' : 'the previews'}:`); console.log('   ' + r.out.split('\n').filter((l) => /error|✘|X /i.test(l)).slice(0, 3).join('\n   ')); continue; }
    done.push(t === 'live' ? 'the live site' : 'the previews');
  }
  console.log(done.length ? `  saved: ${done.join(', ')}` : '  x not saved anywhere');
}

console.log('\nThe family helper\'s secrets. No value is ever shown on the screen.\n');
const who = spawnSync('npx wrangler whoami', { cwd: root, shell: true, encoding: 'utf8' });
if (!/associated with the email|You are logged in/i.test(who.stdout + who.stderr)) {
  console.log('Cloudflare does not know this window yet. Sign in once:');
  console.log('    npx.cmd wrangler login        (in PowerShell; npx alone is blocked by its script policy)');
  console.log('Then run this again. Use a normal window, not "Run as administrator": an administrator window may be another Windows');
  console.log('profile, where the sign-in is not kept.');
  const why = (who.stdout + who.stderr).split('\n').filter((l) => /not authenticated|error|failed/i.test(l)).slice(0, 2).join('\n    ');
  if (why) console.log('    (wrangler said: ' + why + ')');
  process.exit(1);
}

for (const c of list) {
  console.log(`\n== ${c.label || c.name}  ->  ${c.to.map((t) => ({ live: 'live site', previews: 'previews', dev: 'local development' })[t]).join(', ')}`);
  console.log('  ' + c.what);
  if (c.warn) console.log('  ! ' + c.warn);
  if (c.where) console.log('  Where to make a new one: ' + c.where);
  const go = (await ask('  Set it now? (y = yes, Enter = skip) ')).toLowerCase();
  if (!['y', 'yes'].includes(go)) { console.log('  skipped.'); continue; }
  let value;
  if (c.kind === 'paste') {
    value = await ask('  Paste the key (it will not be shown): ', true);
    if (!value) { console.log('  empty - skipped.'); continue; }
  } else if (c.kind === 'plain') {
    value = await ask('  The address: ');
    if (!value) { console.log('  empty - skipped.'); continue; }
  } else if (c.kind === 'make') {
    value = gen();
    if (!clipboard(value)) { console.log('  could not copy to the clipboard - skipped (nothing changed).'); continue; }
    console.log('  A new key was made and copied to the clipboard.');
    await ask(`  Paste it into your password manager now, named "Helper ${c.name}", then press Enter... `);
    clipboard(' ');   // the clipboard does not keep it
  } else value = gen();
  await send(c, value);
}
console.log('\nDone. Once the site works with the new keys, delete the old ones at Anthropic, Google and YouTube.\n');
