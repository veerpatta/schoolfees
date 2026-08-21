import { describe, expect, it } from "vitest";

import { isMobileTakeoverRoute } from "@/platform/config/navigation";

/**
 * The phone app keeps the tab bar on six screens and replaces the screen
 * entirely for everything else (mobile v2). Getting this classification wrong
 * is not cosmetic: a takeover hides the tab bar, so a route wrongly marked as
 * a takeover becomes a dead end unless the back bar renders, and a route
 * wrongly marked as a tab screen loses 68px it needs.
 */
describe("mobile takeover routes", () => {
  it("keeps the six tab screens out of takeover mode", () => {
    for (const route of [
      "/protected/dashboard",
      "/protected/students",
      "/protected/payments",
      "/protected/defaulters",
      "/protected/transactions",
    ]) {
      expect(isMobileTakeoverRoute(route), `${route} should keep the tab bar`).toBe(false);
    }
  });

  it("treats detail and records screens as takeovers", () => {
    for (const route of [
      "/protected/students/abc-123",
      "/protected/students/new",
      "/protected/receipts",
      "/protected/receipts/r-1",
      "/protected/settings",
      "/protected/settings/glossary",
      "/protected/fee-setup",
      "/protected/exports",
      "/protected/reports",
      "/protected/ledger",
      "/protected/imports",
      "/protected/staff",
      "/protected/master-data",
      "/protected/finance-controls",
      "/protected/admin-tools",
      "/protected/admin-tools/activity",
      "/protected/payments/bulk",
    ]) {
      expect(isMobileTakeoverRoute(route), `${route} should be a takeover`).toBe(true);
    }
  });

  it("separates the students LIST from a student detail", () => {
    // The list is a tab screen; a specific student is a drill-down. The
    // trailing slash in the route table is what keeps these apart, so this
    // guards against someone "tidying" it away.
    expect(isMobileTakeoverRoute("/protected/students")).toBe(false);
    expect(isMobileTakeoverRoute("/protected/students/123")).toBe(true);
  });

  it("separates the Payment Desk from bulk upload", () => {
    expect(isMobileTakeoverRoute("/protected/payments")).toBe(false);
    expect(isMobileTakeoverRoute("/protected/payments/bulk")).toBe(true);
  });
});
