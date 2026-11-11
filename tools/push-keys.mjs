#!/usr/bin/env node
// Copy the AI keys from .dev.vars (local development) to the live Worker's secrets on Cloudflare,
// so the live site uses the same keys as the local preview. The values are never printed.
//
//   node tools/push-keys.mjs            # ANTHROPIC_API_KEY and GEMINI_API_KEY
//   node tools/push-keys.mjs NAME ...   # any other variables from .dev.vars
//
// Needs `npx wrangler login` once on this computer.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY'];

let vars;
try {
  vars = Object.fromEntries(readFileSync(join(root, '.dev.vars'), 'utf8').split(/\r?\n/)
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
} catch {
  console.error('לא מצאתי את הקובץ .dev.vars בתיקיית הפרויקט.');
  process.exit(1);
}

function put(name, value) {
  return new Promise((resolve) => {
    const child = spawn('npx', ['wrangler', 'secret', 'put', name], { cwd: root, shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.stdin.end(value + '\n');
    child.on('close', (code) => resolve({ ok: code === 0, out }));
  });
}

let failed = 0;
for (const name of names) {
  const value = vars[name];
  if (!value) { console.log(`✗ ${name}: ריק או חסר ב-.dev.vars – דילגתי`); failed++; continue; }
  const r = await put(name, value);
  if (r.ok) console.log(`✓ ${name}: עודכן באתר החי`);
  else {
    failed++;
    // Show wrangler's message (it never contains the value) to explain what went wrong.
    console.log(`✗ ${name}: לא עודכן\n${r.out.split(value).join('***').trim().split('\n').slice(-6).join('\n')}`);
  }
}
process.exit(failed ? 1 : 0);
