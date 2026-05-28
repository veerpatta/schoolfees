import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("DefaulterFilterRehydrator (audit 1.15)", () => {
  const source = readFileSync(
    join(process.cwd(), "components/defaulters/defaulter-filter-rehydrator.tsx"),
    "utf8",
  );

  it("uses sessionStorage (auto-clears on tab close), not localStorage", () => {
    expect(source).toContain('window.sessionStorage.getItem');
    expect(source).toContain('window.sessionStorage.setItem');
    expect(source).toContain('window.sessionStorage.removeItem');
    expect(source).not.toContain('localStorage');
  });

  it("keys storage under a versioned namespace so a schema change can be invalidated", () => {
    expect(source).toContain('vpps.defaulters.filters.v1');
  });

  it("only rehydrates when the URL has zero filter params", () => {
    expect(source).toContain("FILTER_PARAM_NAMES.some");
    expect(source).toContain("if (!hasUrlFilters)");
  });

  it("never persists the all-empty filter state", () => {
    expect(source).toContain("isAllEmpty");
    expect(source).toContain("sessionStorage.removeItem(STORAGE_KEY)");
  });

  it("uses router.replace (not push) so the rehydrate doesn't add a history entry", () => {
    expect(source).toContain("router.replace(");
    expect(source).not.toContain("router.push(");
  });
});

describe("Defaulters page mounts the rehydrator (audit 1.15)", () => {
  const page = readFileSync(
    join(process.cwd(), "app/protected/defaulters/page.tsx"),
    "utf8",
  );

  it("imports and renders DefaulterFilterRehydrator", () => {
    expect(page).toContain("DefaulterFilterRehydrator");
    expect(page).toContain('from "@/components/defaulters/defaulter-filter-rehydrator"');
    expect(page).toContain("<DefaulterFilterRehydrator filters={filters} sessionLabel={viewSession.sessionLabel} />");
  });
});
