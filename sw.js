const CACHE_NAME = 'monitor-postural-v1';
const ASSETS = [
  '/index.html',
  '/css/estilos.css',
  '/js/app.js',
  '/js/bluetooth.js',
  '/js/camara.js',
  '/js/alertas.js',
  '/js/historial.js',
  '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
