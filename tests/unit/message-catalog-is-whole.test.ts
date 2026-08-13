import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

/**
 * The browser gets the whole message catalogue, always.
 *
 * On 2026-08-13 the catalogue was split so each route shipped only the
 * namespaces it renders — 100 KB down to a few — and it put raw keys on screen
 * across the live app: `Students.title`, `Defaulters.callQueueTitle`,
 * `Transactions.title`. It was reverted the same evening.
 *
 * What makes this worth a test rather than a note: **every check passed.** The
 * 150-route permission sweep, a per-route probe for missing messages, and a
 * click-through of the sidebar all came back clean, on production and on a local
 * production build, at desktop and mobile widths. The failure was real and
 * visible on staff devices and still did not reproduce under any of them.
 *
 * So the rule here is not "make the split correct". It is: the shipped
 * catalogue must not depend on which route is rendering, because when that
 * assumption breaks there is no cheap way to find out before staff do.
 *
 * Splitting it is still a legitimate idea. It needs the provider to live below
 * the router, where it re-renders per route, not above it — and it needs a way
 * to reproduce the failure first.
 */
describe("client message catalogue", () => {
  const layout = readRepoFile("app/layout.tsx");
  const provider = readRepoFile("lib/locale/language-provider.tsx");

  it("hands the provider a whole locale catalogue, unsliced", () => {
    // The import is the whole file for the active locale...
    expect(layout).toContain('await import("@/messages/en.json")');
    expect(layout).toContain('await import("@/messages/hi.json")');
    expect(layout).toContain('await import("@/messages/hi-en.json")');

    // ...and nothing narrows it on the way to the client provider.
    expect(layout).not.toMatch(/pickNamespaces|namespacesForPath|messageNamespaces/i);
    expect(provider).not.toMatch(/pickNamespaces|namespacesForPath/i);
  });

  it("does not decide the catalogue from the request path", () => {
    // A root layout renders once per document load, not per client-side
    // navigation, so anything path-dependent up there goes stale the moment a
    // staff member clicks instead of reloading.
    expect(layout).not.toContain("x-vpps-pathname");
    expect(layout).not.toMatch(/headers\(\)/);
    expect(readRepoFile("lib/supabase/middleware.ts")).not.toContain("x-vpps-pathname");
  });

  it("keeps shipping only the active locale, which is a different saving", () => {
    // This part was never the problem: one locale instead of three is decided
    // by the cookie, not the route, so it survives client navigation.
    expect(layout).toContain("loadActiveCatalog");
    expect(provider).toContain("importCatalog");
  });
});
