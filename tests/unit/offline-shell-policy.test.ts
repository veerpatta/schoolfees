import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("offline shell policy", () => {
  const serviceWorker = () => readFileSync("public/service-worker.js", "utf8");
  const fallback = () => readFileSync("public/offline.html", "utf8");

  it("keeps the offline fallback read-only and staff-safe", () => {
    expect(fallback()).toContain("Payments and receipts need the school server");
    expect(fallback()).toContain("Reconnect");
    expect(fallback()).not.toContain("posted");
    expect(fallback()).not.toContain("receipt saved");
  });

  it("does not cache financial writes or protected page bodies", () => {
    const worker = serviceWorker();

    expect(worker).toContain('request.method !== "GET"');
    expect(worker).toContain("OFFLINE_FALLBACK_URL");
    expect(worker).toContain("request.mode === \"navigate\"");
    expect(worker).toContain("isStaticAssetRequest(request)");
    expect(worker).not.toContain("request.method === \"POST\"");
    expect(worker).not.toContain("cache.put(request, response.clone())");
  });

  it("gets out of the way of navigations instead of standing in front of them", () => {
    const worker = serviceWorker();

    // The fetch handler claims every navigation. Chrome kills an idle worker
    // after about thirty seconds, so without navigation preload each cold
    // navigation waits for the worker to boot before the request is issued —
    // latency this file adds rather than removes. Preload lets the browser
    // start the request in parallel and hand us the response.
    expect(worker).toContain("navigationPreload.enable()");
    expect(worker).toContain("event.preloadResponse");

    // caches.match resolves undefined on a miss, and respondWith rejects on
    // undefined — which showed Chrome's own error page instead of ours.
    expect(worker).toContain("Response.error()");
  });

  it("hands the offline shell back when the signed-out purge has run", () => {
    // The login screen wipes every vpps- cache (a shared counter device must
    // not keep the previous staffer's student data). Anything the worker needs
    // in order to still function has to be precached on the next activation,
    // never assumed present.
    const worker = serviceWorker();

    expect(worker).toContain("const PRECACHE_URLS");
    expect(worker).toContain("cache.addAll(PRECACHE_URLS)");
  });
});
