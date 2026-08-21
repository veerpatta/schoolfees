import { describe, expect, it } from "vitest";

import {
  COLLECTION_WINDOWS,
  DASHBOARD_VIEWS,
  resolveCollectionWindow,
  resolveDashboardView,
} from "@/modules/dashboard/data/analytics";

/**
 * `?view=` and `?days=` are the whole state model for the boards — on the desk
 * and, since the phone gained the switcher, there too. Both resolvers have to
 * survive whatever a link or a hand-typed URL hands them.
 */
describe("resolveDashboardView", () => {
  it("accepts every board name the switcher can produce", () => {
    for (const view of DASHBOARD_VIEWS) {
      expect(resolveDashboardView(view)).toBe(view);
    }
  });

  it("falls back to overview for nothing, junk, or a name that no longer exists", () => {
    expect(resolveDashboardView(undefined)).toBe("overview");
    expect(resolveDashboardView("")).toBe("overview");
    expect(resolveDashboardView("dues")).toBe("overview");
  });

  it("takes the first value when the key repeats", () => {
    // searchParams hands back string[] on a repeated key. Stringifying would
    // give "collection,recovery", which silently falls through to the default
    // and hides the bad link.
    expect(resolveDashboardView(["recovery", "classes"])).toBe("recovery");
    expect(resolveDashboardView([])).toBe("overview");
  });
});

describe("resolveCollectionWindow", () => {
  it("accepts the two windows the Collection board offers", () => {
    expect(COLLECTION_WINDOWS).toEqual([14, 30]);
    expect(resolveCollectionWindow("14")).toBe(14);
    expect(resolveCollectionWindow("30")).toBe(30);
  });

  it("defaults to 14 days for nothing, junk, or a window nobody offers", () => {
    expect(resolveCollectionWindow(undefined)).toBe(14);
    expect(resolveCollectionWindow("")).toBe(14);
    expect(resolveCollectionWindow("7")).toBe(14);
    expect(resolveCollectionWindow("365")).toBe(14);
    expect(resolveCollectionWindow("thirty")).toBe(14);
    // Number("") is 0 and Number(null) is 0 — neither may pass as a window.
    expect(resolveCollectionWindow("0")).toBe(14);
  });

  it("takes the first value when the key repeats", () => {
    expect(resolveCollectionWindow(["30", "14"])).toBe(30);
    expect(resolveCollectionWindow([])).toBe(14);
  });
});
