const CACHE = 'dimension-lab-database-shell-v5';
const ASSETS = ['/database.html', '/database.css', '/database.js', '/csv-parser.js', '/database.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('dimension-lab-database-shell-') && key !== CACHE)
      .map((key) => caches.delete(key)),
  )));
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (!ASSETS.includes(url.pathname)) return;
  const cacheKey = new Request(url.origin + url.pathname);
  event.respondWith(fetch(request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(cacheKey, response.clone()));
    return response;
  }).catch(() => caches.match(cacheKey).then((cached) => {
    if (cached) return cached;
    return Response.error();
  })));
});

