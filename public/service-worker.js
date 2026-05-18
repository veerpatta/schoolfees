const CACHE_VERSION = "vpps-fee-admin-v1";
const OFFLINE_FALLBACK_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_FALLBACK_URL,
  "/manifest.webmanifest",
  "/branding/icon-192.png",
  "/branding/icon-512.png",
];

function isStaticAssetRequest(request) {
  const url = new URL(request.url);

  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/branding/") ||
      url.pathname === "/manifest.webmanifest")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_FALLBACK_URL)),
    );
    return;
  }

  if (!isStaticAssetRequest(request)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }

        const responseCopy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(new Request(request.url), responseCopy));
        return response;
      });
    }),
  );
});
