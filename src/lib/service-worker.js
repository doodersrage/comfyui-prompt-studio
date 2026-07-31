const CACHE_NAME = 'comfyui-prompt-studio-v1';
const urlsToCache = [
  '/',
  '/dashboard',
  '/workflow-editor',
  '/history',
  '/static/css/main.css',
  '/static/js/main.js',
  '/icons/icon-192x192.png',
  '/fonts/inter.woff2',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
