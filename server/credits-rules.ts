// The AI allowance (docs/decisions.md, the owner's decision): the pure rules, tested alone (node server/test-credits.mjs).
// The owner's family uses the AI with no limit, at the owner's cost. A new account (one that came through an invitation)
// gets a one-time trial grant and simply uses it – no notice while something is left; when it runs out, the AI's
// buttons invite them to connect their own service or get credits. Grants have a source (trial, purchase, gift), never
// expire, and are spent in this order: gifts first, then the trial, then what was bought (so what was paid for lasts).
// Amounts are in dollars of real AI cost (prices.ts costOf), the same measure as the meter.

export type Source = 'gift' | 'trial' | 'purchase';
export const ORDER: Source[] = ['gift', 'trial', 'purchase'];
export interface Grant { source: Source; usd: number; at: number }

/** what is left of each source after `spent` dollars, spending them in ORDER */
export function remaining(grants: Grant[], spent: number) {
  const by: Record<Source, number> = { gift: 0, trial: 0, purchase: 0 };
  for (const g of grants) if (g.usd > 0 && ORDER.includes(g.source)) by[g.source] += g.usd;
  let left = Math.max(0, spent);
  const out: Record<Source, number> = { gift: 0, trial: 0, purchase: 0 };
  for (const s of ORDER) { const used = Math.min(by[s], left); out[s] = by[s] - used; left -= used; }
  const total = out.gift + out.trial + out.purchase;
  return { ...out, total, granted: by.gift + by.trial + by.purchase, over: left };      // over: spent beyond every grant
}

/** may a limited account call the AI now? (yes while anything is left; their own key never needs credit) */
export const mayUse = (limited: boolean, left: number, ownKey: boolean) => !limited || ownKey || left > 0;

/** the trial in dollars of AI cost, from the owner's setting in shekels */
export const trialUsd = (ils: number, usdIls: number) => Math.round((ils / usdIls) * 1e6) / 1e6;

/** the AI provider a request goes to, as the meter sees it; null for anything else */
export function providerOf(url: string): 'claude' | 'gemini' | null {
  if (url.startsWith('https://api.anthropic.com/v1/messages') && !url.includes('count_tokens')) return 'claude';
  if (url.startsWith('https://generativelanguage.googleapis.com/') && /:(stream)?[gG]enerateContent/.test(url)) return 'gemini';
  return null;
}

/** an API key as a person pasted it: the right shape for its provider, or null */
export function cleanKey(provider: string, key: unknown): string | null {
  const k = String(key ?? '').trim();
  if (provider === 'claude') return /^sk-ant-[A-Za-z0-9_-]{20,200}$/.test(k) ? k : null;
  if (provider === 'gemini') return /^AIza[A-Za-z0-9_-]{30,60}$/.test(k) ? k : null;
  return null;
}
/** the last characters of a key, to show which one is connected without showing it */
export const keyHint = (k: string) => '…' + k.slice(-4);

/** a request sent with the person's own key instead of the app's: Claude takes it in x-api-key; Gemini in
    x-goog-api-key, with any ?key= (the app's) taken out of the address. Nothing else of the request changes. */
export function withKey(provider: 'claude' | 'gemini', url: string, init: RequestInit | undefined, key: string): [string, RequestInit] {
  const h = new Headers(init?.headers);
  if (provider === 'claude') { h.set('x-api-key', key); h.delete('authorization'); return [url, { ...init, headers: h }]; }
  const u = new URL(url);
  u.searchParams.delete('key');
  h.set('x-goog-api-key', key);
  return [u.href, { ...init, headers: h }];
}

/** the same for a call made with a Request object: a new Request with the person's key, the rest kept */
export function requestWithKey(provider: 'claude' | 'gemini', req: Request, key: string): Request {
  const [url, init] = withKey(provider, req.url, { headers: req.headers }, key);
  return new Request(url, new Request(req, { headers: init.headers }));
}
