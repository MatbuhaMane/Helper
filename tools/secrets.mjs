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
// Needs `npx wrangler login` once on this computer.

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
  { name: 'VAULT_KEY', kind: 'make', to: ['live'], what: 'מפתח הכספת המשפחתית. בלעדיו אי אפשר לפתוח אף מסמך, גם לא מהגיבויים.',
    warn: 'להחליף רק כל עוד אין עדיין מסמכים בכספת. אם כבר יש, צריך קודם להעביר את המפתח הישן ל־VAULT_KEY_OLD.', keep: true },
  { name: 'TOKEN_KEY', kind: 'make', to: ['live'], what: 'מצפין את חיבורי Gmail ו־Google Drive שנשמרים בשרת.',
    warn: 'אחרי ההחלפה צריך לחבר מחדש את Gmail (סידור המייל) ואת Google Drive (גיבויי הכספת), פעם אחת.', keep: true },
  { name: 'GOOGLE_CLIENT_SECRET', kind: 'paste', to: ['live', 'previews', 'dev'], what: 'הסוד של הכניסה עם Google.',
    where: 'https://console.cloud.google.com/apis/credentials?project=family-helper-514321 → OAuth 2.0 Client → Add secret. אחרי שהאתר עובד עם החדש, השביתו את הישן.' },
  { name: 'ANTHROPIC_API_KEY', kind: 'paste', to: ['live', 'previews', 'dev'], what: 'Claude: החוקר, ראב"ע, ומה שדורש שיקול דעת.',
    where: 'https://console.anthropic.com/settings/keys → Create Key. אחרי שהאתר עובד, מחקו את הישן.' },
  { name: 'GEMINI_API_KEY', kind: 'paste', to: ['live', 'previews', 'dev'], what: 'Gemini: הקול של ראב"ע, חיפוש, ומשימות רבות וזולות.',
    where: 'https://aistudio.google.com/apikey → Create API key. אחרי שהאתר עובד, מחקו את הישן.' },
  { name: 'YOUTUBE_API_KEY', kind: 'paste', to: ['live', 'previews', 'dev'], what: 'YouTube: הפיד המצחיק והחיפוש במוזיקה.',
    where: 'https://console.cloud.google.com/apis/credentials?project=family-helper-514321 → Create credentials → API key, מוגבל ל־YouTube Data API v3.' },
  { name: 'PREVIEW_HANDOFF_KEY', kind: 'random', to: ['live', 'previews'], what: 'חותם את כרטיסי הכניסה שהאתר החי שולח לתצוגות המקדימות. אין צורך לשמור אותו.' },
  // the previews' own: a vault key and a token key of their own (their data is test data), and the owner's email
  { name: 'VAULT_KEY', kind: 'random', to: ['previews'], what: 'מפתח כספת נפרד לתצוגות המקדימות (נתוני בדיקה). אין צורך לשמור אותו.', label: 'VAULT_KEY (previews)' },
  { name: 'TOKEN_KEY', kind: 'random', to: ['previews'], what: 'מפתח נפרד לתצוגות המקדימות. אין צורך לשמור אותו.', label: 'TOKEN_KEY (previews)' },
  { name: 'OWNER_EMAIL', kind: 'plain', to: ['previews'], what: 'כתובת ה־Gmail של מנהל המשפחה, כדי שיוכל להיכנס לתצוגות המקדימות.' },
];

const only = process.argv.slice(2);
const list = only.length ? CATALOG.filter((c) => only.includes(c.name) || only.includes(c.label)) : CATALOG;

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let hidden = false;
rl._writeToOutput = function (s) { if (!hidden || s.includes('\n') || s.includes('\r')) rl.output.write(hidden ? s.replace(/[^\r\n]/g, '') : s); };
const ask = (q, hide = false) => new Promise((res) => { rl.output.write(q); hidden = hide; rl.question('', (a) => { hidden = false; if (hide) rl.output.write('\n'); res(a.trim()); }); });

function wrangler(args, value) {
  return new Promise((resolve) => {
    const child = spawn('npx', ['wrangler', ...args], { cwd: root, shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
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
    if (!r.ok) { console.log(`  ✗ לא הצלחתי לשמור ב־${t === 'live' ? 'אתר החי' : 'תצוגות המקדימות'}:`); console.log('   ' + r.out.split('\n').filter((l) => /error|✘|X /i.test(l)).slice(0, 3).join('\n   ')); continue; }
    done.push(t === 'live' ? 'האתר החי' : 'התצוגות המקדימות');
  }
  console.log(done.length ? `  ✓ נשמר: ${done.join(', ')}` : '  ✗ לא נשמר בשום מקום');
}

console.log('\nהגדרת הסודות של העוזר המשפחתי. שום ערך לא יוצג על המסך.\n');
const who = spawnSync('npx', ['wrangler', 'whoami'], { cwd: root, shell: true, encoding: 'utf8' });
if (!/associated with the email|You are logged in/i.test(who.stdout + who.stderr)) { console.log('קודם צריך: npx wrangler login'); process.exit(1); }

for (const c of list) {
  console.log(`\n━━ ${c.label || c.name}  →  ${c.to.map((t) => ({ live: 'האתר החי', previews: 'תצוגות מקדימות', dev: 'פיתוח מקומי' })[t]).join(', ')}`);
  console.log('  ' + c.what);
  if (c.warn) console.log('  ⚠ ' + c.warn);
  if (c.where) console.log('  איפה יוצרים חדש: ' + c.where);
  const go = (await ask('  להגדיר עכשיו? (כ = כן, Enter = לדלג) ')).toLowerCase();
  if (!['כ', 'y', 'yes', 'כן'].includes(go)) { console.log('  דילגתי.'); continue; }
  let value;
  if (c.kind === 'paste') {
    value = await ask('  הדביקו את המפתח (לא יוצג): ', true);
    if (!value) { console.log('  ריק – דילגתי.'); continue; }
  } else if (c.kind === 'plain') {
    value = await ask('  הכתובת: ');
    if (!value) { console.log('  ריק – דילגתי.'); continue; }
  } else if (c.kind === 'make') {
    value = gen();
    if (!clipboard(value)) { console.log('  לא הצלחתי להעתיק ללוח. דילגתי (שום דבר לא השתנה).'); continue; }
    console.log('  נוצר מפתח חדש והועתק ללוח.');
    await ask(`  הדביקו אותו עכשיו במנהל הסיסמאות, בשם "Helper ${c.name}", ואז Enter… `);
    clipboard(' ');   // the clipboard does not keep it
  } else value = gen();
  await send(c, value);
}
console.log('\nסיימנו. אחרי שהאתר עובד עם המפתחות החדשים, מחקו את הישנים אצל Anthropic, Google ו־YouTube.\n');
rl.close();
