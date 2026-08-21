import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The behaviours below are unchanged; three of them simply moved.
 *
 * Defaulters used to carry its own sessionStorage rehydrator while Students,
 * Receipts and Transactions each solved filter persistence a different way —
 * and two of those three lost the filters entirely on a back-navigation. They
 * now share `src/ui/hooks/use-url-filter-state.ts`, so the storage rules are asserted
 * against the hook and the screen-specific ones against the component.
 *
 * The live behaviour is pinned by tests/ui/interaction/url-filter-state.test.tsx,
 * which actually runs it. These are the source-level guards.
 */

const rehydrator = readFileSync(
  join(process.cwd(), "src/modules/defaulters/ui/defaulter-filter-rehydrator.tsx"),
  "utf8",
);
const hook = readFileSync(join(process.cwd(), "src/ui/hooks/use-url-filter-state.ts"), "utf8");

describe("DefaulterFilterRehydrator (audit 1.15)", () => {
  it("uses sessionStorage (auto-clears on tab close), not localStorage", () => {
    // sessionStorage is what keeps this out of lib/cache/signed-out-purge.ts:
    // a tab-scoped store clears itself when the staff session ends, so class
    // and student ids never outlive a sign-out on a shared counter device.
    expect(hook).toContain("window.sessionStorage.getItem");
    expect(hook).toContain("window.sessionStorage.setItem");
    expect(hook).toContain("window.sessionStorage.removeItem");
    expect(hook).not.toContain("localStorage");
    expect(rehydrator).not.toContain("localStorage");
  });

  it("keys storage under a versioned namespace so a schema change can be invalidated", () => {
    expect(rehydrator).toContain("vpps.defaulters.filters.v1");
  });

  it("only rehydrates when the URL has zero filter params", () => {
    // In the hook: the stored set is read only on the `!urlQuery` branch, so a
    // URL that carries filters always wins over one that was remembered.
    expect(hook).toContain("if (!urlQuery) {");
    expect(hook).toContain("const stored = readSticky(stickyRef.current);");
  });

  it("never persists the all-empty filter state", () => {
    expect(hook).toContain("if (!query) {");
    expect(hook).toContain("window.sessionStorage.removeItem(sticky.key);");
  });

  it("uses router.replace (not push) so the rehydrate doesn't add a history entry", () => {
    expect(rehydrator).toContain("router.replace(");
    expect(rehydrator).not.toContain("router.push(");
    expect(hook).not.toContain("router.push(");
  });

  it("discards a set stored against a different academic session", () => {
    // Switching session strips the query string, which looks exactly like a
    // fresh arrival — so without this guard the old year's class id was
    // replayed into the new one, and the list quietly described the wrong year.
    expect(hook).toContain("if (parsed.session !== sticky.sessionLabel) return null;");
  });

  it("leaves the address bar to the filter form it belongs to", () => {
    // This screen's filters are a server-rendered form; submitting it is
    // already a navigation. The hook must not also write the URL here.
    expect(rehydrator).toContain('commit: "none"');
  });
});

describe("Defaulters page mounts the rehydrator (audit 1.15)", () => {
  const page = readFileSync(
    join(process.cwd(), "src/app/protected/defaulters/page.tsx"),
    "utf8",
  );

  it("imports and renders DefaulterFilterRehydrator", () => {
    expect(page).toContain("DefaulterFilterRehydrator");
    expect(page).toContain('from "@/modules/defaulters/ui/defaulter-filter-rehydrator"');
    expect(page).toContain("<DefaulterFilterRehydrator filters={filters} sessionLabel={viewSession.sessionLabel} />");
  });
});
