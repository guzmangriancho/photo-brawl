/* PHOTO BRAWL: cache only the game's shell, never Gemini requests or user photos. */
const CACHE_NAME = 'pb-shell-v12-1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './arcade-gym.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(names => Promise.all(names.filter(name => name.startsWith('pb-shell-') && name !== CACHE_NAME).map(name => caches.delete(name)))),
    self.clients.claim(),
  ]));
});
self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_APP_ASSETS' || !Array.isArray(event.data.urls)) return;
  const sameOrigin = event.data.urls.filter(url => {
    try { return new URL(url, self.location.origin).origin === self.location.origin; } catch { return false; }
  });
  event.waitUntil(caches.open(CACHE_NAME).then(cache => Promise.allSettled(sameOrigin.map(url => cache.add(url)))));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // Don't cache external Gemini, fonts, APIs.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) { const clone = response.clone(); void caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)); }
      return response;
    }).catch(async () => (await caches.match(event.request)) || (await caches.match('./index.html')) || Response.error()));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok && (url.pathname.includes('/assets/') || /\.(js|css|svg|png|webp|woff2?)$/i.test(url.pathname))) {
      const clone = response.clone();
      void caches.open(CACHE_NAME).then(cache => cache.put(event.request,clone));
    }
    return response;
  })));
});
