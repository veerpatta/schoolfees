const RUNTIME_CACHE_VERSION = "v1";
const CACHE_VERSION = `vpps-fee-admin-${RUNTIME_CACHE_VERSION}`;
const NAVIGATION_DATA_CACHE = "vpps-navigation-data-v1";
const STUDENT_INDEX_CACHE = "vpps-student-index-v1";
const STALE_WHILE_REVALIDATE_TTL_MS = 30 * 60 * 1000;
const OFFLINE_FALLBACK_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_FALLBACK_URL,
  "/manifest.webmanifest",
  "/api/manifest",
  "/branding/icon-192.png",
  "/branding/icon-512.png",
];

function isStaticAssetRequest(request) {
  const url = new URL(request.url);

  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/branding/") ||
      url.pathname === "/manifest.webmanifest" ||
      url.pathname === "/api/manifest")
  );
}

function isRuntimeCacheRequest(request) {
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return null;
  }

  if (
    url.pathname === "/protected/students/index" ||
    url.pathname === "/protected/payments/student-summary"
  ) {
    return STUDENT_INDEX_CACHE;
  }

  if (
    url.pathname === "/api/manifest"
  ) {
    return NAVIGATION_DATA_CACHE;
  }

  return null;
}

async function staleWhileRevalidate(request, cacheName, event) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const cachedAt = cached ? Number(cached.headers.get("sw-cache-time") ?? "0") : 0;
  const isFresh = cachedAt && Date.now() - cachedAt < STALE_WHILE_REVALIDATE_TTL_MS;
  const fetchAndCache = fetch(request).then((response) => {
    if (!response || response.status !== 200 || response.type !== "basic") {
      return response;
    }

    const headers = new Headers(response.headers);
    headers.set("sw-cache-time", String(Date.now()));
    const cachedResponse = new Response(response.clone().body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
    cache.put(new Request(request.url), cachedResponse);
    return response;
  });

  if (cached && isFresh) {
    event.waitUntil(fetchAndCache.catch(() => undefined));
    return cached;
  }

  return fetchAndCache.catch(() => cached ?? caches.match(OFFLINE_FALLBACK_URL));
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
        Promise.all(
          keys
            .filter(
              (key) =>
                key !== CACHE_VERSION &&
                key !== NAVIGATION_DATA_CACHE &&
                key !== STUDENT_INDEX_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
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

  const runtimeCache = isRuntimeCacheRequest(request);
  if (runtimeCache) {
    event.respondWith(staleWhileRevalidate(request, runtimeCache, event));
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
