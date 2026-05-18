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
});
