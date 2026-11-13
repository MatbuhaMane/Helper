// The speed audit on a slow phone (docs/vision/ready.md, the readiness bar): headless Chrome driven through the DevTools
// Protocol, with no package to install – the Chrome (or Edge) already on this computer and Node's own WebSocket (Node 22+).
// Each page is a real first visit (no HTTP cache, no service worker), measured by tools/perf.js (__perfHere: LCP, FCP,
// CLS, TBT, the longest frame, fps while scrolling), at a phone and a desktop size, on a fast connection and on
// Lighthouse's "mobile" setting (150 ms round trip, 1.6 Mbps, a processor 4× slower). The owner's choice (2026-11-13).
//
//   npm run dev                                   # the local server, with DEV_MODE=1 (the dev sign-in)
//   node tools/perf-cdp.mjs                       # every page, 4 runs (~15 minutes); a table at the end
//   node tools/perf-cdp.mjs --pages /,/news/ --runs "375 4G,1280 4G" --out perf.json
//   node tools/perf-cdp.mjs --shifts --pages /tools/calendar/     # which elements shift (CLS), and by how much
//
// Options: --base <url> (default http://localhost:8788), --as <email> (a local test account, default owner@example.test),
// --chrome <path>, --out <file.json>. Signs in through /api/auth/dev, so only against a local dev server.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const flag = (name) => process.argv.includes('--' + name);
const BASE = arg('base', 'http://localhost:8788').replace(/\/$/, '');
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) { console.error('perf-cdp: only a local dev server (it signs in with the dev sign-in)'); process.exit(2); }
const AS = arg('as', 'owner@example.test');
const PORT = 9300 + Math.floor(Math.random() * 600);
const perfSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'perf.js'), 'utf8');
const BAR = { lcp: 2500, cls: 0.1, tbt: 200, fps: 55 };

const ALL = ['/', '/gather/', '/groceries/', '/food/', '/food/fridge/', '/food/diet/', '/food/diet/hakpada/', '/food/restaurants/', '/family/',
  '/tools/', '/tools/tasks/', '/tools/research/', '/tools/notes/', '/tools/calendar/', '/tools/calc/', '/tools/weather/', '/news/', '/songs/',
  '/parasha/', '/fun/', '/mail/', '/pc/', '/settings/', '/admin/', '/capture/'];
const PAGES = arg('pages') ? arg('pages').split(',') : ALL;
const RUNS = [
  { name: '375 4G', w: 375, h: 812, mobile: true, slow: true },
  { name: '1280 4G', w: 1280, h: 800, mobile: false, slow: true },
  { name: '375 fast', w: 375, h: 812, mobile: true, slow: false },
  { name: '1280 fast', w: 1280, h: 800, mobile: false, slow: false },
].filter((r) => !arg('runs') || arg('runs').split(',').includes(r.name));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- Chrome ---- */
const CHROMES = [arg('chrome'), process.env.CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'), 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
const exe = CHROMES.find((p) => existsSync(p));
if (!exe) { console.error('perf-cdp: no Chrome or Edge found; pass --chrome <path>'); process.exit(2); }
const profile = mkdtempSync(join(tmpdir(), 'perf-cdp-'));
const chrome = spawn(exe, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
const done = () => { try { chrome.kill(); } catch (_) {} setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch (_) {} }, 500); };
process.on('SIGINT', () => { done(); process.exit(130); });

let list;
for (let i = 0; i < 75 && !list; i++) { await wait(200); try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch (_) { /* not up yet */ } }
if (!list) { console.error('perf-cdp: Chrome did not start'); done(); process.exit(1); }

/* ---- the protocol: one page, commands and their events ---- */
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map(), waiters = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); }
  else if (msg.method) for (const w of [...waiters]) if (w.method === msg.method) { waiters.splice(waiters.indexOf(w), 1); w.res(msg.params); }
});
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const once = (method, ms) => new Promise((res) => { const w = { method, res }; waiters.push(w); setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); res(null); } }, ms); });
const go = async (url, ms = 60000) => { const loaded = once('Page.loadEventFired', ms); const t0 = Date.now(); await send('Page.navigate', { url }); await loaded; return Date.now() - t0; };

await send('Page.enable'); await send('Network.enable'); await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: perfSrc });
await go(`${BASE}/api/auth/dev?email=${encodeURIComponent(AS)}&next=/`, 20000); await wait(1500);

/* ---- which elements shift ---- */
const SHIFTS = `new Promise((res) => { const out = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) out.push({ t: Math.round(e.startTime), v: +e.value.toFixed(3),
  src: (e.sources || []).map((s) => { const el = s.node && (s.node.nodeType === 1 ? s.node : s.node.parentElement); if (!el) return '?';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')
      + ' moved ' + Math.round(s.currentRect.y - s.previousRect.y) + 'px'; }) }); }).observe({ type: 'layout-shift', buffered: true }); setTimeout(() => res(out), 200); })`;

const out = {};
for (const run of RUNS) {
  await send('Emulation.setDeviceMetricsOverride', { width: run.w, height: run.h, deviceScaleFactor: run.mobile ? 3 : 1, mobile: run.mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: run.mobile });
  await send('Emulation.setCPUThrottlingRate', { rate: run.slow ? 4 : 1 });
  await send('Network.emulateNetworkConditions', run.slow
    ? { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 }
    : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Network.setBypassServiceWorker', { bypass: true });
  out[run.name] = {};
  for (const p of PAGES) {
    let row;
    try {
      const load = await go(BASE + p);
      await wait(run.slow ? 5000 : 3000);
      const r = await send('Runtime.evaluate', { expression: flag('shifts') ? SHIFTS : '__perfHere()', awaitPromise: true, returnByValue: true, timeout: 30000 });
      row = flag('shifts') ? { shifts: r.result.value } : { ...r.result.value, load };
    } catch (e) { row = { error: String(e).slice(0, 120) }; }
    out[run.name][p] = row;
    if (flag('shifts')) { console.log(`${run.name} ${p}`); for (const s of row.shifts || []) console.log(`  ${s.t}ms ${s.v}  ${s.src.join(' | ')}`); }
    else process.stdout.write(`${run.name.padEnd(9)} ${p.padEnd(22)} ${row.error || `LCP ${row.lcp}ms  CLS ${row.cls}  TBT ${row.tbt}ms  fps ${row.fps}`}\n`);
  }
  if (arg('out')) writeFileSync(arg('out'), JSON.stringify(out, null, 1));
}
ws.close();
done();

/* ---- the table against the bar ---- */
if (!flag('shifts')) {
  const mark = (v, max, f = (x) => x) => (v == null ? '–' : (v <= max ? '' : '✗ ') + f(v));
  for (const [run, pages] of Object.entries(out)) {
    const over = Object.entries(pages).filter(([, r]) => !r.error && (r.lcp > BAR.lcp || r.cls > BAR.cls || r.tbt > BAR.tbt || (r.scrolled && r.fps < BAR.fps)));
    console.log(`\n${run}: ${over.length ? over.length + ' of ' + Object.keys(pages).length + ' pages over the bar' : 'every page within the bar'}`);
    for (const [p, r] of over) console.log(`  ${p.padEnd(22)} LCP ${mark(r.lcp, BAR.lcp, (x) => (x / 1000).toFixed(1) + 's')}  CLS ${mark(r.cls, BAR.cls)}  TBT ${mark(r.tbt, BAR.tbt, (x) => x + 'ms')}  fps ${r.scrolled ? mark(-r.fps, -BAR.fps, (x) => -x) : '–'}  (LCP: ${r.lcpOf || '?'})`);
  }
}
