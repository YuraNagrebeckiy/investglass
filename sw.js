self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r, { cache: 'no-cache' }).then((res) => { const c = res.clone(); caches.open('ig-shell').then((x) => x.put(r, c)).catch(() => {}); return res; }).catch(() => caches.match(r)));
});
