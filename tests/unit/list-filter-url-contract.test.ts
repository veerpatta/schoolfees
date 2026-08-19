import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Four list screens, one rule: the URL is the state model.
 *
 * They used to solve this three different ways, and two of the three lost the
 * filters when you pressed back. The failure was not the persistence strategy
 * but the direction of travel — each screen WROTE the address bar from an
 * unguarded mount effect and never READ it. So a remount from a cached payload
 * seeded stale filters, then overwrote the real ones still in the URL, then
 * refetched.
 *
 * These are the source-level guards. The behaviour itself is exercised in
 * tests/ui/interaction/url-filter-state.test.tsx.
 */

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const SCREENS = [
  {
    name: "Students",
    path: "components/students/student-quick-load.tsx",
    pathname: "/protected/students",
  },
  {
    name: "Receipts",
    path: "components/receipts/receipts-quick-load.tsx",
    pathname: "/protected/receipts",
  },
  {
    name: "Transactions",
    path: "components/transactions/transactions-client-shell.tsx",
    pathname: "/protected/transactions",
  },
  {
    name: "Defaulters",
    path: "components/defaulters/defaulter-filter-rehydrator.tsx",
    pathname: "/protected/defaulters",
  },
] as const;

describe("list filters and the address bar", () => {
  for (const screen of SCREENS) {
    describe(screen.name, () => {
      const source = read(screen.path);

      it("routes its filters through the shared hook", () => {
        expect(source).toContain("useUrlFilterState");
        expect(source).toContain(`pathname: "${screen.pathname}"`);
      });

      it("declares both directions of the round trip", () => {
        // A screen that can serialize but not parse cannot restore itself, and
        // that asymmetry IS the bug this suite exists for.
        expect(source).toContain("toParams");
        expect(source).toContain("fromParams");
      });

      it("does not mirror the address bar behind the hook's back", () => {
        // The hook holds the first-render gate. A second mirror reintroduces
        // the race it was built to end: a mount effect writing stale props
        // over the filters the user can still see.
        expect(source).not.toContain("window.history.replaceState");
      });
    });
  }

  it("keeps pushState for destinations only", () => {
    // Transactions is allowed exactly two: switching board and applying a
    // saved view are places you can go back FROM. A filter change is not, and
    // an entry per keystroke would also compete with the single history entry
    // components/ui/sheet.tsx pushes per open.
    const shell = read("components/transactions/transactions-client-shell.tsx");
    const pushes = shell.match(/window\.history\.pushState/g)?.length ?? 0;

    expect(pushes).toBe(2);
    expect(shell).toContain("window.history.pushState(null, \"\", buildPageUrl(view, nextFilters));");
    expect(shell).toContain(
      "window.history.pushState(null, \"\", buildPageUrl(view.state.view, nextFilters));",
    );
  });

  it("keeps a filter change out of the history stack", () => {
    // Typing into a search box must not become a step the back button walks
    // backwards through, and it must not compete with the one history entry
    // components/ui/sheet.tsx pushes per open.
    const hook = read("hooks/use-url-filter-state.ts");

    expect(hook).toContain("window.history.replaceState");
    expect(hook).not.toContain("window.history.pushState");
    expect(hook).not.toContain("router.push(");
  });

  it("lets the address bar win over the props on a back-navigation", () => {
    const hook = read("hooks/use-url-filter-state.ts");

    expect(hook).toContain("if (urlQuery && urlQuery !== propsQuery)");
    expect(hook).toContain('"url"');
  });

  it("only Defaulters remembers filters past the URL", () => {
    // The owner's decision: going back restores what you left, but clicking
    // the nav item gives a clean list. Defaulters is the deliberate exception
    // — a fee collector works one class for a morning.
    for (const screen of SCREENS) {
      const source = read(screen.path);
      const isSticky = source.includes("sticky:");
      expect(isSticky).toBe(screen.name === "Defaulters");
    }
  });
});

describe("where Back goes", () => {
  it("accepts any workspace path, from one guard", () => {
    // Three pages each hardcoded the parent they expected, so a student opened
    // from Transactions failed the check and Back fell through to a bare list.
    const guard = read("lib/navigation/return-to.ts");

    expect(guard).toContain('const WORKSPACE_PREFIX = "/protected/"');
    // An unchecked returnTo is an open redirect wearing a Back button.
    expect(guard).toContain('raw.startsWith("//")');
    expect(guard).toContain("/^[a-z][a-z0-9+.-]*:/i");

    for (const page of [
      "app/protected/students/[studentId]/page.tsx",
      "app/protected/students/[studentId]/edit/page.tsx",
      "app/protected/receipts/[receiptId]/page.tsx",
    ]) {
      const source = read(page);
      expect(source).toContain("safeReturnTo(");
      expect(source).not.toContain('returnTo?.startsWith("/protected/');
    }
  });

  it("gives every Transactions student row somewhere to come back to", () => {
    const tables = read("components/transactions/transactions-lazy-tables.tsx");
    const shell = read("components/transactions/transactions-client-shell.tsx");

    expect(tables).toContain("function studentLinkFactory(sessionLabel: string, returnTo?: string)");
    expect(tables).toContain('href.startsWith("/protected/students/")');
    // All four student tables, or the one left out is the one that loses it.
    expect(shell.match(/returnTo=\{returnTo\}/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});
