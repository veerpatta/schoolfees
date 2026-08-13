import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ALL_NAMESPACES,
  namespacesForPath,
  pickNamespaces,
  type MessageNamespace,
} from "@/lib/locale/message-namespaces";

const repoRoot = process.cwd();

const catalog = JSON.parse(
  readFileSync(join(repoRoot, "messages/en.json"), "utf8"),
) as Record<string, unknown>;

describe("message namespaces", () => {
  it("lists exactly the namespaces the catalog actually has", () => {
    // A namespace named here but absent from the catalog is dead weight; one in
    // the catalog but missing here can never be shipped to any route.
    expect([...ALL_NAMESPACES].sort()).toEqual(Object.keys(catalog).sort());
  });

  it("sends the signed-out pages a small core, not the whole catalog", () => {
    for (const path of ["/", "/auth/login", "/auth/forgot-password", "/r/ABC123"]) {
      const namespaces = namespacesForPath(path);
      expect(namespaces, path).toContain("Common");
      // The heavy module namespaces have no business on a login screen.
      expect(namespaces, path).not.toContain("Defaulters");
      expect(namespaces, path).not.toContain("FeeSetup");
      expect(namespaces, path).not.toContain("AdminTools");
      expect(namespaces, path).not.toContain("Dashboard");
    }
  });

  it("gives each daily workspace its own namespace plus the shell", () => {
    const cases: Array<[string, MessageNamespace]> = [
      ["/protected/dashboard", "Dashboard"],
      ["/protected/students", "Students"],
      ["/protected/payments", "Payments"],
      ["/protected/transactions", "Transactions"],
      ["/protected/defaulters", "Defaulters"],
      ["/protected/fee-setup", "FeeSetup"],
      ["/protected/exports", "Exports"],
    ];

    for (const [path, own] of cases) {
      const namespaces = namespacesForPath(path);
      expect(namespaces, path).toContain(own);
      // The shell renders on every signed-in screen.
      expect(namespaces, path).toContain("Navigation");
      expect(namespaces, path).toContain("MobileApp");
      expect(namespaces, path).toContain("Common");
    }
  });

  it("matches nested routes to their parent workspace", () => {
    expect(namespacesForPath("/protected/students/bulk-update")).toContain("Students");
    expect(namespacesForPath("/protected/students/abc-123/edit")).toContain("Students");
    expect(namespacesForPath("/protected/fee-setup/generate")).toContain("FeeSetup");
    expect(namespacesForPath("/protected/payments/bulk")).toContain("Payments");
  });

  it("prefers the longest matching prefix", () => {
    // /protected/settings/glossary is listed separately from /protected/settings,
    // which is not listed at all and therefore falls back to everything.
    expect(namespacesForPath("/protected/settings/glossary")).toContain("Dashboard");
    expect(namespacesForPath("/protected/settings/glossary")).not.toContain("AdminTools");
  });

  // The failure mode this guards is visible to office staff: a namespace the
  // route needs but does not carry renders the raw key, e.g. "Defaulters.title".
  it("falls back to the whole catalog for anything unlisted", () => {
    for (const path of [
      "/protected/admin-tools",
      "/protected/master-data",
      "/protected/staff",
      "/protected/settings",
      "/protected/some-route-added-next-year",
    ]) {
      expect(namespacesForPath(path), path).toEqual([...ALL_NAMESPACES]);
    }
  });

  it("falls back to the whole catalog when the pathname header is absent", () => {
    // Middleware sets the header; anything that bypasses it must still work.
    expect(namespacesForPath(null)).toEqual([...ALL_NAMESPACES]);
    expect(namespacesForPath(undefined)).toEqual([...ALL_NAMESPACES]);
    expect(namespacesForPath("")).toEqual([...ALL_NAMESPACES]);
  });

  it("copies only the requested namespaces and ignores unknown ones", () => {
    const picked = pickNamespaces(catalog, ["Common", "Dashboard"]);
    expect(Object.keys(picked).sort()).toEqual(["Common", "Dashboard"]);
    expect(picked.Dashboard).toEqual(catalog.Dashboard);

    expect(pickNamespaces(catalog, ["NotAThing" as MessageNamespace])).toEqual({});
  });

  it("cuts the login payload by most of the catalog", () => {
    const full = JSON.stringify(catalog).length;
    const login = JSON.stringify(pickNamespaces(catalog, namespacesForPath("/auth/login"))).length;

    // Measured at ~4 KB of ~100 KB when this was written. The guardrail is the
    // order of magnitude, not the exact figure.
    expect(login).toBeLessThan(full * 0.15);
  });

  it("is wired into the root layout and fed by the middleware", () => {
    const layout = readFileSync(join(repoRoot, "app/layout.tsx"), "utf8");
    const middleware = readFileSync(join(repoRoot, "lib/supabase/middleware.ts"), "utf8");

    expect(layout).toContain("namespacesForPath");
    expect(layout).toContain("PATHNAME_HEADER");
    expect(middleware).toContain("PATHNAME_HEADER");
    // The forwarded headers must be rebuilt after Supabase writes refreshed
    // auth cookies, or every staff member is signed out.
    expect(middleware).toContain("supabaseResponse = nextWithPathname(request)");
  });
});
