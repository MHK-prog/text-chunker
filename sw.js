const APP_VERSION = new URL(self.location.href).searchParams.get('v') || '1.8.0';
const CACHE_PREFIX = 'splitter-';
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './fonts/Vazir-Regular.woff2',
  './fonts/Vazir-Bold.woff2'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(response => {
        if (!response.ok) return response;
        return caches.open(CACHE_NAME)
          .then(cache => cache.put(event.request, response.clone()))
          .then(() => response)
          .catch(() => response);
      }).catch(() => caches.match(event.request).then(response => response || caches.match('./index.html')))
    );
    return;
  }
  event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
});
