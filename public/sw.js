/* Service worker: app shell works offline (the grocery list keeps its own offline copy). API calls always go to the network. */
const CACHE = 'helper-v6';
const ASSETS = ['/', '/assets/base.css', '/assets/common.js', '/assets/sheet.css', '/assets/sheet.js', '/groceries/', '/groceries/style.css', '/groceries/data.js', '/groceries/foods.js', '/groceries/keto.js', '/groceries/fix.js', '/groceries/app.js', '/manifest.json', '/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request))
  );
});
