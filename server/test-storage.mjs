// Tests for own-storage rules (server/storage-rules.ts).   node server/test-storage.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = mkdtempSync(join(tmpdir(), 'storage-test-'));
const out = join(dir, 'r.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/storage-rules.ts'), '--bundle', '--format=esm', '--platform=node', '--outfile=' + out], { stdio: 'pipe' });
const R = await import(pathToFileURL(out).href);
let pass = 0, fail = 0;
const eq = (n, g, w) => { if (JSON.stringify(g) === JSON.stringify(w)) pass++; else { fail++; console.error('FAIL', n, JSON.stringify(g), 'want', JSON.stringify(w)); } };
const why = (u) => { const r = R.nasUrl(u); return r.ok ? 'ok' : r.why; };
eq('plain https', why('https://nas.example.com'), 'ok');
eq('synology port', why('https://home.example.org:5006/webdav'), 'ok');
eq('normalised', R.nasUrl('https://nas.example.com/dav').url, 'https://nas.example.com/dav/');
eq('http refused', why('http://nas.example.com'), 'https_only');
eq('ftp refused', why('ftp://nas.example.com'), 'https_only');
for (const ip of ['https://192.168.1.5', 'https://10.0.0.1/dav', 'https://127.0.0.1', 'https://[::1]/', 'https://[fd00::1]', 'https://2130706433', 'https://0x7f000001', 'https://0177.0.0.1', 'https://8.8.8.8'])
  eq('ip ' + ip, why(ip), 'no_ip_address');
for (const h of ['https://localhost', 'https://nas', 'https://nas.local', 'https://x.localhost', 'https://box.lan', 'https://a.internal', 'https://router.home.arpa', 'https://localhost.'])
  eq('private ' + h, why(h), 'private_host');
eq('credentials in address', why('https://u:p@nas.example.com'), 'no_credentials_in_address');
eq('query refused', why('https://nas.example.com/?a=1'), 'bad_address');
eq('low port refused', why('https://nas.example.com:22'), 'bad_port');
eq('empty', why(''), 'bad_address');
eq('junk', why('not a url'), 'bad_address');
eq('very long', why('https://nas.example.com/' + 'a'.repeat(400)), 'bad_address');
eq('file name', R.fileName('../../etc/passwd'), '.. etc passwd');
eq('file name hidden', R.fileName('.env'), 'env');
eq('file name empty', R.fileName('///'), null);
eq('file name hebrew', R.fileName('תמונה משפחתית.jpg'), 'תמונה משפחתית.jpg');
eq('size ok', R.sizeOk('1000'), true);
eq('size none', R.sizeOk(null), false);
eq('size zero', R.sizeOk('0'), false);
eq('size too big', R.sizeOk(String(R.MAX_BYTES + 1)), false);
eq('size nan', R.sizeOk('abc'), false);
const xml = '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">'
  + '<d:response><d:href>/dav/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>'
  + '<d:response><d:href>/dav/a%20b.jpg</d:href><d:propstat><d:prop><d:getcontentlength>1234</d:getcontentlength><d:resourcetype/></d:prop></d:propstat></d:response>'
  + '<d:response><d:href>/dav/sub/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>'
  + '<d:response><d:href>/dav/sub/deep.txt</d:href></d:response><d:response><d:href>/other/x.txt</d:href></d:response></d:multistatus>';
eq('listing', R.parseListing(xml, 'https://nas.example.com/dav/'), [{ name: 'a b.jpg', size: 1234, dir: false }, { name: 'sub', size: 0, dir: true }]);
console.log(`storage: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
