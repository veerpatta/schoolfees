// VPPS Fee Admin offline shell.
//
// Scope is deliberately narrow, and two rules hold it there:
//
//   1. Non-GET requests are never touched. A payment is append-only and
//      financially binding; nothing here queues, replays or retries one.
//   2. Protected page bodies are never cached. A staff screen served from
//      Cache Storage would be a role-blind copy of somebody else's data --
//      Cache Storage has no notion of who was signed in when it was written.
//
// tests/unit/offline-shell-policy.test.ts pins both.

// v2 (was v1): the previous version cached /api/manifest, which is per-role
// and `private, no-store`. Cache Storage ignores Cache-Control, so on a shared
// counter device one staffer's manifest was served to the next for up to half
// an hour. Bumping every name is what actually evicts that from devices already
// in the field -- the activate handler below deletes anything not on the list.
//
// v3 (was v2): the build-output bucket is trimmed. Every deploy ships a fresh
// set of content-hashed chunks and the old ones never left, so a phone that
// had used the app across a few months of deploys carried every chunk it had
// ever loaded. The bump evicts that backlog once; the cap keeps it from
// growing back.
const RUNTIME_CACHE_VERSION = "v3";
const CACHE_VERSION = `vpps-fee-admin-${RUNTIME_CACHE_VERSION}`;
const NAVIGATION_DATA_CACHE = "vpps-navigation-data-v3";
const STUDENT_INDEX_CACHE = "vpps-student-index-v3";
// Roughly two deploys' worth of chunks for the routes the office visits.
const STATIC_CACHE_MAX_ENTRIES = 200;
// Trimming lists every key, so it runs every so many writes, not on each one.
const STATIC_CACHE_TRIM_EVERY = 25;
let staticCachePuts = 0;
const STALE_WHILE_REVALIDATE_TTL_MS = 30 * 60 * 1000;
const OFFLINE_FALLBACK_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_FALLBACK_URL,
  "/manifest.webmanifest",
  "/branding/icon-192.png",
  "/branding/icon-512.png",
];
const KEEPABLE_CACHES = [CACHE_VERSION, NAVIGATION_DATA_CACHE, STUDENT_INDEX_CACHE];

function isStaticAssetRequest(request) {
  const url = new URL(request.url);

  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/branding/") ||
      url.pathname === "/manifest.webmanifest")
  );
}

function staticCacheFor(request) {
  // Two buckets, because they age differently. Build output is content-hashed
  // and gains a fresh set of names on every deploy, so it belongs in the
  // versioned bucket. The navigation shell -- offline page, manifest, icons --
  // is four small files that outlive deploys, and it is what /offline.html has
  // to be able to draw itself from when the network is gone.
  return new URL(request.url).pathname.startsWith("/_next/static/")
    ? CACHE_VERSION
    : NAVIGATION_DATA_CACHE;
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

  // /api/manifest used to land here. It does not any more: it is role-aware and
  // no-store, and this cache cannot tell one signed-in staffer from the next.

  return null;
}

/**
 * Drops the oldest entries once a cache is over its cap. cache.keys() returns
 * entries in insertion order, so the front of the list is what was fetched
 * longest ago -- the chunks of a build that is no longer deployed.
 */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) {
    return;
  }
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

async function offlineFallback() {
  // caches.match resolves undefined on a miss, and respondWith rejects on
  // undefined -- which showed Chrome's own error page instead of ours.
  const fallback = await caches.match(OFFLINE_FALLBACK_URL);
  return fallback ?? Response.error();
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

  return fetchAndCache.catch(async () => cached ?? (await offlineFallback()));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(NAVIGATION_DATA_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Navigation preload is the whole reason this worker is worth its keep.
      // Chrome kills an idle worker after about thirty seconds, and the fetch
      // handler below claims every navigation -- so without preload, each cold
      // navigation waits for the worker to boot before the request is even
      // issued. With it, the browser starts the network request in parallel and
      // hands us the response.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }

      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !KEEPABLE_CACHES.includes(key)).map((key) => caches.delete(key)),
      );
      await trimCache(CACHE_VERSION, STATIC_CACHE_MAX_ENTRIES);

      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preloaded = await event.preloadResponse;
          if (preloaded) {
            return preloaded;
          }

          return await fetch(request);
        } catch {
          return await offlineFallback();
        }
      })(),
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
        const cacheName = staticCacheFor(request);
        caches
          .open(cacheName)
          .then((cache) => cache.put(new Request(request.url), responseCopy))
          .then(() => {
            if (cacheName === CACHE_VERSION && ++staticCachePuts % STATIC_CACHE_TRIM_EVERY === 0) {
              return trimCache(CACHE_VERSION, STATIC_CACHE_MAX_ENTRIES);
            }
            return undefined;
          })
          .catch(() => undefined);
        return response;
      });
    }),
  );
});
