self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/gallery") || url.pathname.startsWith("/api/comfyui/view")) {
    event.respondWith(
      caches.open("gallery-read-v1").then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) {
          return cached;
        }
        const response = await fetch(event.request);
        if (response.ok && event.request.method === "GET") {
          void cache.put(event.request, response.clone());
        }
        return response;
      }),
    );
  }
});
