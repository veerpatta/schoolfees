import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every workspace route shows something while it loads.
 *
 * The root layout is `force-dynamic`, so every navigation is a server round
 * trip. Without a loading.tsx the previous page simply sits there, frozen,
 * until the next one is ready — which reads as the app having ignored the tap.
 *
 * Auto-discovered rather than listed, so a route added next month is covered
 * without anyone remembering this file exists.
 */

const root = process.cwd();
const protectedRoot = join(root, "app", "protected");

/**
 * Routes that legitimately have no loading state. Each needs a reason — this
 * is an escape hatch, not a dumping ground.
 */
const NO_LOADING_NEEDED: Record<string, string> = {
  "app/protected/advanced": "redirect-only shim to admin-tools",
  "app/protected/setup": "redirect-only shim to admin-tools",
  "app/protected/access-denied": "static message, nothing to fetch",
  "app/protected/reports/ledger/[studentId]/print":
    "print surface opened in a new tab; a skeleton would land in the printout",
};

function routeDirs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) routeDirs(full, out);
  }

  if (existsSync(join(dir, "page.tsx"))) out.push(dir);
  return out;
}

const routes = routeDirs(protectedRoot).map((dir) =>
  dir.slice(root.length + 1).split("\\").join("/"),
);

describe("route loading coverage", () => {
  it("finds routes to check", () => {
    // Guard against the walker silently returning nothing and the suite
    // passing vacuously.
    expect(routes.length).toBeGreaterThan(30);
  });

  it("every route either has a loading.tsx or an explicit reason", () => {
    const missing = routes
      .filter((route) => !existsSync(join(root, route, "loading.tsx")))
      .filter((route) => !(route in NO_LOADING_NEEDED))
      .sort();

    expect(missing).toEqual([]);
  });

  it("has no stale exemptions", () => {
    for (const route of Object.keys(NO_LOADING_NEEDED)) {
      expect(existsSync(join(root, route, "page.tsx"))).toBe(true);
    }
  });

  /**
   * Hand-rolled shimmer drifts: every copy picks its own greys, and a bare
   * `anim-shimmer` div misses the aria-hidden that Skeleton supplies, so a
   * screen reader announces a wall of empty boxes.
   *
   * The rule is about raw markup, not about which component is used —
   * delegating to a purpose-built skeleton (PaymentDeskSkeleton) is exactly
   * right, and a page-shaped skeleton beats a generic one.
   */
  it("no loading screen writes its own shimmer markup", () => {
    const offenders = routes
      .filter((route) => existsSync(join(root, route, "loading.tsx")))
      .filter((route) =>
        /className="[^"]*\banim-shimmer\b/.test(
          readFileSync(join(root, route, "loading.tsx"), "utf8"),
        ),
      )
      .sort();

    expect(offenders).toEqual([]);
  });

  it("the inherited fallback does not claim to be loading fee data", () => {
    const source = readFileSync(join(protectedRoot, "loading.tsx"), "utf8");

    // It is inherited by student edit forms, settings, the password page —
    // the copy has to be true on all of them.
    expect(source).not.toContain("Fetching protected fee data");
  });
});
