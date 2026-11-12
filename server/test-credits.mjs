// Tests for the AI allowance (server/credits-rules.ts):   node server/test-credits.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'credits-test-'));
const out = join(dir, 'credits.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/credits-rules.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const C = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.error('FAIL', name); } };
const eq = (name, got, want) => ok(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want));
const r2 = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 1e6) / 1e6]));

/* ---- what is left, and in which order it is spent ---- */
const g = [{ source: 'trial', usd: 0.4, at: 1 }, { source: 'gift', usd: 0.2, at: 2 }, { source: 'purchase', usd: 1, at: 3 }];
eq('nothing spent', r2(C.remaining(g, 0)), { gift: 0.2, trial: 0.4, purchase: 1, total: 1.6, granted: 1.6, over: 0 });
eq('gifts first', r2(C.remaining(g, 0.15)), { gift: 0.05, trial: 0.4, purchase: 1, total: 1.45, granted: 1.6, over: 0 });
eq('then the trial', r2(C.remaining(g, 0.5)), { gift: 0, trial: 0.1, purchase: 1, total: 1.1, granted: 1.6, over: 0 });
eq('what was bought lasts longest', r2(C.remaining(g, 1.2)), { gift: 0, trial: 0, purchase: 0.4, total: 0.4, granted: 1.6, over: 0 });
eq('spent past everything', r2(C.remaining(g, 2)), { gift: 0, trial: 0, purchase: 0, total: 0, granted: 1.6, over: 0.4 });
eq('two gifts add up', r2(C.remaining([{ source: 'gift', usd: 0.1, at: 1 }, { source: 'gift', usd: 0.1, at: 2 }], 0.05)).gift, 0.15);
eq('an unknown source or a negative grant counts for nothing', C.remaining([{ source: 'free', usd: 5, at: 1 }, { source: 'gift', usd: -1, at: 2 }], 0).total, 0);
eq('no grants', C.remaining([], 0.3).total, 0);

/* ---- may they use the AI now ---- */
ok('family: always', C.mayUse(false, 0, false));
ok('a new account with something left', C.mayUse(true, 0.01, false));
ok('a new account with nothing left: no', !C.mayUse(true, 0, false));
ok('their own key: always', C.mayUse(true, 0, true));

/* ---- the trial ---- */
eq('₪1.5 at 3.75 = $0.4', C.trialUsd(1.5, 3.75), 0.4);

/* ---- which requests are AI ---- */
eq('Claude', C.providerOf('https://api.anthropic.com/v1/messages'), 'claude');
eq('Claude: counting tokens is not a call', C.providerOf('https://api.anthropic.com/v1/messages/count_tokens'), null);
eq('Gemini', C.providerOf('https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent?key=k'), 'gemini');
eq('Gemini streaming', C.providerOf('https://generativelanguage.googleapis.com/v1beta/models/gemini-x:streamGenerateContent?alt=sse'), 'gemini');
eq('Gemini: listing models is not a call', C.providerOf('https://generativelanguage.googleapis.com/v1beta/models?key=k'), null);
eq('anything else', C.providerOf('https://www.hebcal.com/hebcal'), null);

/* ---- keys ---- */
ok('a Claude key', C.cleanKey('claude', ' sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789 ') === 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789');
ok('a Gemini key', C.cleanKey('gemini', 'AIzaSyA1234567890abcdefghijklmnopqrstuv') === 'AIzaSyA1234567890abcdefghijklmnopqrstuv');
ok('a key of the wrong shape', C.cleanKey('claude', 'AIzaSyA1234567890abcdefghijklmnopqrstuv') === null && C.cleanKey('gemini', 'hello') === null);
ok('an unknown provider', C.cleanKey('openai', 'sk-abc') === null);
eq('the hint shows only the end', C.keyHint('sk-ant-api03-secretsecret1234'), '…1234');

/* ---- a request sent with the person's own key ---- */
{
  const [url, init] = C.withKey('claude', 'https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': 'APP-KEY', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: '{"a":1}' }, 'sk-ant-mine');
  const h = new Headers(init.headers);
  eq('Claude: the address is the same', url, 'https://api.anthropic.com/v1/messages');
  eq('Claude: their key, not the app\'s', h.get('x-api-key'), 'sk-ant-mine');
  ok('Claude: the rest of the request is kept', h.get('anthropic-version') === '2023-06-01' && init.body === '{"a":1}' && init.method === 'POST');
  ok('Claude: no other credential left', !h.has('authorization'));
  const [u2, i2] = C.withKey('gemini', 'https://generativelanguage.googleapis.com/v1beta/models/g:generateContent?key=APP-KEY&alt=sse', { headers: { 'x-goog-api-key': 'APP-KEY' } }, 'AIza-mine');
  ok('Gemini: the app\'s key is out of the address', !u2.includes('APP-KEY') && u2.includes('alt=sse'));
  eq('Gemini: their key in the header', new Headers(i2.headers).get('x-goog-api-key'), 'AIza-mine');
  const [, i3] = C.withKey('gemini', 'https://generativelanguage.googleapis.com/v1beta/models/g:generateContent', undefined, 'AIza-mine');
  eq('Gemini: a request with no headers gets one', new Headers(i3.headers).get('x-goog-api-key'), 'AIza-mine');
}

/* ---- the same with a Request object ---- */
{
  const req = new Request('https://generativelanguage.googleapis.com/v1beta/models/g:generateContent?key=APP-KEY', { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': 'APP-KEY' }, body: '{"q":1}' });
  const r = C.requestWithKey('gemini', req, 'AIza-mine');
  ok('a Request: their key, the app\'s gone from the address', r.headers.get('x-goog-api-key') === 'AIza-mine' && !r.url.includes('APP-KEY'));
  ok('a Request: method and body kept', r.method === 'POST' && (await r.text()) === '{"q":1}' && r.headers.get('content-type') === 'application/json');
  const c = C.requestWithKey('claude', new Request('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': 'APP-KEY' }, body: '{}' }), 'sk-ant-mine');
  eq('a Request to Claude: their key', c.headers.get('x-api-key'), 'sk-ant-mine');
}

/* ---- who sees amounts ---- */
ok('the trial alone: no amounts', !C.showsAmounts([{ source: 'trial' }]));
ok('after a gift: amounts', C.showsAmounts([{ source: 'trial' }, { source: 'gift' }]));
ok('after a purchase: amounts', C.showsAmounts([{ source: 'purchase' }]));
ok('no grants: no amounts', !C.showsAmounts([]));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
