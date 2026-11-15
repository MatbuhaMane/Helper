// Own storage (vision batch 28; CEO's review 2026-11-15): the rules for connecting a person's NAS and for what may travel.
// Pure, no network; tested in test-storage.mjs. NAS: https WebDAV only, no IP literals, no private / localhost hosts,
// no credentials inside the address, every request capped in size and time.

export const MAX_BYTES = 50 * 1024 * 1024;      // one file through the helper: 50 MB (the free clip size)
export const DRIVE_MAX_BYTES = 25 * 1024 * 1024; // Drive's simple upload is buffered in the Worker: 25 MB
export const TIMEOUT_MS = 15_000;               // one request to the NAS
export const MAX_LIST = 200;                    // entries returned from a folder

const BAD_SUFFIX = ['.localhost', '.local', '.internal', '.lan', '.home', '.home.arpa', '.corp', '.intranet', '.private', '.invalid', '.test', '.example', '.onion'];

export type Checked = { ok: true; url: string; host: string } | { ok: false; why: string };

/** the person's NAS address, checked and normalised (https, no port tricks, no path climbing); or the reason it is refused */
export function nasUrl(input: unknown): Checked {
  const raw = String(input ?? '').trim();
  if (!raw || raw.length > 300) return { ok: false, why: 'bad_address' };
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, why: 'bad_address' }; }
  if (u.protocol !== 'https:') return { ok: false, why: 'https_only' };
  if (u.username || u.password) return { ok: false, why: 'no_credentials_in_address' };
  if (u.search || u.hash) return { ok: false, why: 'bad_address' };
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host.includes(':') || host.startsWith('[')) return { ok: false, why: 'no_ip_address' };       // an IPv6 literal
  // 1.2.3.4, 0x7f.1, 2130706433, 0177.0.0.1: anything whose last label is a number is an address, not a name
  if (/^[0-9.]+$/.test(host) || /^0x[0-9a-f.]*$/i.test(host) || /^[0-9]+$/.test(host.split('.').pop() || '')) return { ok: false, why: 'no_ip_address' };
  if (!host.includes('.')) return { ok: false, why: 'private_host' };                                              // a bare name: "nas", "localhost"
  if (BAD_SUFFIX.some((s) => host.endsWith(s)) || host === 'localhost') return { ok: false, why: 'private_host' };
  if (!/^[a-z0-9.-]+$/.test(host)) return { ok: false, why: 'bad_address' };
  const port = u.port ? Number(u.port) : 443;
  if (!(port === 443 || (port >= 1024 && port <= 65535))) return { ok: false, why: 'bad_port' };
  const path = u.pathname.replace(/\/+/g, '/');
  if (path.split('/').some((s) => s === '..' || s === '.')) return { ok: false, why: 'bad_address' };
  return { ok: true, url: `https://${u.host}${path.endsWith('/') ? path : path + '/'}`, host };
}

/** a file name that is safe to put on a NAS or in Drive: no folders, no control characters, not hidden, cut to 120 */
export function fileName(input: unknown): string | null {
  let n = String(input ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  n = n.replace(/^\.+/, '').slice(0, 120).trim();
  return n || null;
}

/** is a request body within the limit (the declared length must be there and honest) */
export function sizeOk(declared: string | null, max = MAX_BYTES): boolean {
  const n = Number(declared);
  return Number.isFinite(n) && n > 0 && n <= max;
}

/** the files of a PROPFIND answer (207 multistatus): name, size, folder or not; capped; the folder itself left out */
export function parseListing(xml: string, base: string): { name: string; size: number; dir: boolean }[] {
  const out: { name: string; size: number; dir: boolean }[] = [];
  const basePath = (() => { try { return decodeURIComponent(new URL(base).pathname).replace(/\/+$/, ''); } catch { return ''; } })();
  for (const m of xml.matchAll(/<(?:\w+:)?response[ >][\s\S]*?<\/(?:\w+:)?response>/gi)) {
    const block = m[0];
    const href = /<(?:\w+:)?href>([^<]*)<\/(?:\w+:)?href>/i.exec(block)?.[1];
    if (!href) continue;
    let path: string;
    try { path = decodeURIComponent(href.replace(/^https?:\/\/[^/]+/i, '')); } catch { continue; }
    const dir = /<(?:\w+:)?collection\s*\/?>/i.test(block);
    path = path.replace(/\/+$/, '');
    if (path === basePath || !path.startsWith(basePath + '/')) continue;
    const name = fileName(path.slice(basePath.length + 1));
    if (!name || path.slice(basePath.length + 1).includes('/')) continue;
    const size = Number(/<(?:\w+:)?getcontentlength>(\d+)</i.exec(block)?.[1] || 0);
    out.push({ name, size, dir });
    if (out.length >= MAX_LIST) break;
  }
  return out;
}
