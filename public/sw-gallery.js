const IMAGE_CACHE = "gallery-images-v3";
const MAX_CACHED_IMAGES = 200;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== IMAGE_CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
    ]),
  );
});

async function trimImageCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_CACHED_IMAGES) {
    return;
  }
  const overflow = keys.length - MAX_CACHED_IMAGES;
  await Promise.all(keys.slice(0, overflow).map((key) => cache.delete(key)));
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") {
    return;
  }

  // Cache ComfyUI image proxy responses only — never /gallery HTML or RSC payloads.
  if (!url.pathname.startsWith("/api/comfyui/view")) {
    return;
  }

  event.respondWith(
    caches.open(IMAGE_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) {
        return cached;
      }
      const response = await fetch(event.request);
      if (response.ok) {
        await cache.put(event.request, response.clone());
        void trimImageCache(cache);
      }
      return response;
    }),
  );
});
