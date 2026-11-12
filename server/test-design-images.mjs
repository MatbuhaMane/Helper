// Tests for design's image tool (server/design-images-rules.ts):   node server/test-design-images.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'design-img-test-'));
const out = join(dir, 'd.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/design-images-rules.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const D = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.error('FAIL', name); } };
const eq = (name, got, want) => ok(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want));
const throws = (name, fn, code) => { try { fn(); fail++; console.error('FAIL (no error)', name); } catch (e) { ok(`${name} → ${e.message}`, e.message === code); } };

/* ---- what may be asked ---- */
eq('a request', D.cleanAsk({ prompt: ' a campfire at dusk ', refs: ['/assets/tent.webp', '/figures/ibn_ezra.png'], aspect: '3:2', n: 4 }),
  { prompt: 'a campfire at dusk', refs: ['/assets/tent.webp', '/figures/ibn_ezra.png'], aspect: '3:2', n: 4 });
eq('defaults: no refs, square, one', D.cleanAsk({ prompt: 'x' }), { prompt: 'x', refs: [], aspect: '1:1', n: 1 });
eq('the same reference twice counts once', D.cleanAsk({ prompt: 'x', refs: ['/assets/a.png', '/assets/a.png'] }).refs, ['/assets/a.png']);
throws('no prompt', () => D.cleanAsk({ prompt: '  ' }), 'prompt_required');
throws('a prompt too long', () => D.cleanAsk({ prompt: 'x'.repeat(4001) }), 'prompt_too_long');
throws('an outside address', () => D.cleanAsk({ prompt: 'x', refs: ['https://evil.example/a.png'] }), 'bad_ref');
throws('a protocol-relative address', () => D.cleanAsk({ prompt: 'x', refs: ['//evil.example/assets/a.png'] }), 'bad_ref');
throws('a way up the tree', () => D.cleanAsk({ prompt: 'x', refs: ['/assets/../../.dev.vars.png'] }), 'bad_ref');
throws('not a picture', () => D.cleanAsk({ prompt: 'x', refs: ['/assets/common.js'] }), 'bad_ref');
throws('outside the picture folders', () => D.cleanAsk({ prompt: 'x', refs: ['/api/vault/items/x/file.png'] }), 'bad_ref');
throws('too many references', () => D.cleanAsk({ prompt: 'x', refs: Array.from({ length: 7 }, (_, i) => `/assets/a${i}.png`) }), 'bad_refs');
throws('refs not a list', () => D.cleanAsk({ prompt: 'x', refs: '/assets/a.png' }), 'bad_refs');
throws('an unknown aspect', () => D.cleanAsk({ prompt: 'x', aspect: '7:3' }), 'bad_aspect');
throws('zero images', () => D.cleanAsk({ prompt: 'x', n: 0 }), 'bad_n');
throws('five images', () => D.cleanAsk({ prompt: 'x', n: 5 }), 'bad_n');
throws('a fraction', () => D.cleanAsk({ prompt: 'x', n: 2.5 }), 'bad_n');

/* ---- the daily cap ---- */
eq('room for four', D.allowedNow(40, 30, 4), 6);
eq('exactly at the cap', D.allowedNow(40, 36, 4), 0);
throws('more than is left', () => D.allowedNow(40, 38, 4), 'cap_partly');
throws('nothing left', () => D.allowedNow(40, 40, 1), 'cap_reached');

/* ---- batches ---- */
eq('a batch name', D.batchName('2026-11-12', 'K3x-9Q2zz'), '2026-11-12-k3x9q2zz');
ok('a batch name is recognised', D.isBatch('2026-11-12-k3x9q2zz') && !D.isBatch('../x') && !D.isBatch('2026-11-12'));

/* ---- the picture in the answer ---- */
eq('an image part', D.imageOf({ candidates: [{ content: { parts: [{ text: 'here' }, { inlineData: { data: 'AAAA', mimeType: 'image/png' } }] } }] }), { b64: 'AAAA', mime: 'image/png' });
eq('snake case too', D.imageOf({ candidates: [{ content: { parts: [{ inline_data: { data: 'BBBB', mime_type: 'image/jpeg' } }] } }] }), { b64: 'BBBB', mime: 'image/jpeg' });
eq('an odd type becomes png', D.imageOf({ candidates: [{ content: { parts: [{ inlineData: { data: 'C', mimeType: 'image/svg+xml' } }] } }] }).mime, 'image/png');
eq('blocked', D.imageOf({ promptFeedback: { blockReason: 'SAFETY' } }), { why: 'SAFETY' });
eq('no image', D.imageOf({ candidates: [{ content: { parts: [{ text: 'sorry' }] }, finishReason: 'STOP' }] }), { why: 'STOP' });
eq('extensions', [D.extOf('image/png'), D.extOf('image/jpeg'), D.extOf('image/webp')], ['png', 'jpg', 'webp']);

/* ---- a batch's own cost ---- */
const u = D.usageOf('img-model', 5, { modelVersion: 'gemini-x-image', usageMetadata: { promptTokenCount: 1300, candidatesTokenCount: 1290, candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: 1290 }] } });
eq('usage: the image tokens apart', [u.model, u.input, u.output, u.image_out, u.at], ['gemini-x-image', 1300, 0, 1290, 5]);
eq('usage: thinking counts as output', D.usageOf('m', 1, { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1300, thoughtsTokenCount: 50, candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: 1290 }] } }).output, 60);
eq('usage: an empty answer', D.usageOf('m', 1, {}).input, 0);
const starts = [{ batch: 'a', start: 100 }, { batch: 'b', start: 130 }, { batch: 'c', start: 200 }];
eq('a call goes to the batch that had started last', [D.batchOf(110, starts), D.batchOf(135, starts), D.batchOf(500, starts)], ['a', 'b', 'c']);
eq('never to two batches, never before the first', [D.batchOf(130, starts), D.batchOf(99, starts)], ['b', null]);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
