/* Service worker: app shell works offline (the grocery list keeps its own offline copy). API calls go to the network,
   except the sources of the study room: Sefaria's texts (through /api/sefaria/), the concordance and the textual witnesses
   are kept on the device in a cache of their own that a new version of the app does not clear – once read, always there. */
const CACHE = 'helper-v49';
const SOURCES = 'helper-sources-v1';
// the companion's 3D engine and figures (about 6.5 MB): served from the device at once, refreshed quietly in the background
const MODELS = 'helper-models-v2';
const isModel = (p) => p.startsWith('/figures/') || p.startsWith('/vendor/');
const isSource = (p) => p.startsWith('/api/sefaria/') || p.startsWith('/concordance/') || p.startsWith('/witnesses/');
const ASSETS = ['/', '/assets/base.css', '/assets/common.js', '/assets/sheet.css', '/assets/sheet.js', '/groceries/', '/groceries/style.css', '/groceries/data.js', '/groceries/foods.js', '/groceries/keto.js', '/groceries/fix.js', '/groceries/app.js', '/manifest.json', '/icon.svg', '/assets/logo.svg', '/assets/tent.webp', '/assets/ibn-ezra-face.webp', '/assets/stump-guitar.webp', '/assets/campfire.css', '/assets/campfire.js', '/assets/campfire/base.webp', '/assets/campfire/flame-1.webp', '/assets/campfire/flame-2.webp', '/assets/campfire/flame-3.webp', '/assets/campfire/flame-4.webp', '/assets/sun-core.webp', '/assets/moon.webp', '/assets/launcher.js', '/assets/apps.js', '/assets/launcher.css', '/food/', '/food/diet/', '/food/fridge/', '/tools/notes/', '/parasha/', '/tools/calc/', '/assets/capture.js', '/food/diet/hakpada/', '/tools/', '/assets/music.js', '/assets/music.css'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== SOURCES && k !== MODELS).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'GET' && url.origin === location.origin && isSource(url.pathname)) {
    // a source: from the device if it is there, else fetched once and kept
    e.respondWith(caches.open(SOURCES).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  if (e.request.method === 'GET' && url.origin === location.origin && isModel(url.pathname)) {
    e.respondWith(caches.open(MODELS).then(async (c) => {
      const hit = await c.match(e.request);
      const refresh = () => fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; });
      if (!hit) return refresh();
      // checked again at most once a day (a figure changes rarely, and it weighs megabytes)
      if (Date.now() - (Date.parse(hit.headers.get('date') || '') || 0) > 864e5) e.waitUntil(refresh().catch(() => {}));
      return hit;
    }));
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request))
  );
});
