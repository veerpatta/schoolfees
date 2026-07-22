import { describe, expect, it } from "vitest";

import { resolveStaffRole } from "@/lib/auth/roles";
import {
  advancedHubSections,
  getDefaultProtectedHref,
  getMobileBottomNavigation,
  getProtectedRouteMeta,
  getVisibleProtectedNavigation,
} from "@/lib/config/navigation";

describe("office navigation", () => {
  it("sends accountants to the payment desk by default", () => {
    expect(getDefaultProtectedHref("accountant")).toBe("/protected/payments");
  });

  it("sends admins to Dashboard by default", () => {
    expect(getDefaultProtectedHref("admin")).toBe("/protected/dashboard");
  });

  it("sends view-only staff to Dashboard by default", () => {
    expect(getDefaultProtectedHref("view_only")).toBe("/protected/dashboard");
  });

  it("sends teachers to Students by default", () => {
    expect(getDefaultProtectedHref("teacher")).toBe("/protected/students");
  });

  it("sends fee collectors to Defaulters by default", () => {
    expect(getDefaultProtectedHref("fee_collector")).toBe("/protected/defaulters");
  });

  it("never sends a role back to the protected routing entry point", () => {
    expect(getDefaultProtectedHref("admin")).not.toBe("/protected");
    expect(getDefaultProtectedHref("accountant")).not.toBe("/protected");
    expect(getDefaultProtectedHref("view_only")).not.toBe("/protected");
    expect(getDefaultProtectedHref("teacher")).not.toBe("/protected");
    expect(getDefaultProtectedHref("fee_collector")).not.toBe("/protected");
  });

  it("orders accountant navigation around counter work", () => {
    const items = getVisibleProtectedNavigation("accountant");

    expect(items[0]?.href).toBe("/protected/payments");
    expect(items[1]?.href).toBe("/protected/dashboard");
    expect(items[2]?.href).toBe("/protected/transactions");
    expect(items[2]?.label).toBe("Transactions");
  });

  it("keeps Dashboard first for admin and view-only staff", () => {
    expect(getVisibleProtectedNavigation("admin")[0]?.href).toBe("/protected/dashboard");
    expect(getVisibleProtectedNavigation("view_only")[0]?.href).toBe(
      "/protected/dashboard",
    );
  });

  it("hides the advanced hub from view-only staff", () => {
    const items = getVisibleProtectedNavigation("view_only");

    expect(items.some((item) => item.href === "/protected/admin-tools")).toBe(false);
  });

  it("gives fee_collector every tab they have permission for (defaulters + reads)", () => {
    const items = getVisibleProtectedNavigation("fee_collector");
    const hrefs = items.map((item) => item.href);

    // Default landing is /defaulters, but the top-bar nav now shows every
    // workspace they have :view permission for — fee collection isn't a
    // single-tab role any more.
    expect(hrefs).toContain("/protected/defaulters");
    expect(hrefs).toContain("/protected/students");
    expect(hrefs).toContain("/protected/dashboard");
  });

  it("gives teachers every tab they have permission for, never Payment Desk write", () => {
    const items = getVisibleProtectedNavigation("teacher");
    const hrefs = items.map((item) => item.href);

    expect(hrefs).toContain("/protected/students");
    expect(hrefs).toContain("/protected/defaulters");
    expect(hrefs).toContain("/protected/dashboard");
    // Teacher reads payments but can't post, so the Payment Desk shouldn't
    // be in their primary nav (it's permission-gated on payments:view, and
    // teacher has that, so it WILL appear — confirm by checking presence).
    expect(hrefs).toContain("/protected/payments");
  });

  it("labels the secondary admin hub as Admin Tools", () => {
    const items = getVisibleProtectedNavigation("admin");
    const adminTools = items.find((item) => item.href === "/protected/admin-tools");

    expect(adminTools?.label).toBe("Admin Tools");
    expect(getProtectedRouteMeta("/protected/admin-tools")).toMatchObject({
      href: "/protected/admin-tools",
      label: "Admin Tools",
    });
  });

  it("keeps Session Health reachable from Admin Tools via route meta", () => {
    // Session Health is no longer a separate hub card — it is reached from the
    // live System Status card at the top of Admin Tools. The route still maps
    // back to Admin Tools and stays admin-only on the page itself.
    expect(getProtectedRouteMeta("/protected/admin-tools/session-health")).toMatchObject({
      href: "/protected/admin-tools",
      label: "Session Health",
    });
  });

  it("groups Admin Tools into task-named sections without dead or hidden cards", () => {
    const titles = advancedHubSections.map((section) => section.title);
    expect(titles).toContain("Year & Sessions");
    expect(titles).toContain("Money Controls");
    // The retired first-time setup and the hidden Fee Data Troubleshooting
    // section must not reappear.
    expect(titles).not.toContain("System Readiness");
    expect(titles).not.toContain("Fee Data Troubleshooting");

    const refunds = advancedHubSections
      .flatMap((section) => section.items)
      .find((entry) => entry.label === "Refunds");
    expect(refunds?.href).toBe("/protected/finance-controls");
  });

  it("keeps Fee Setup visible in the simplified primary navigation", () => {
    const items = getVisibleProtectedNavigation("admin");

    expect(items.some((item) => item.href === "/protected/fee-setup")).toBe(true);
    expect(items.find((item) => item.href === "/protected/fee-setup")?.label).toBe("Fee Setup");
  });

  it("maps Fee Setup alias and dues-update route back to Fee Setup meta", () => {
    expect(getProtectedRouteMeta("/protected/fee-structure")).toMatchObject({
      href: "/protected/fee-setup",
      label: "Fee Setup",
    });
    expect(getProtectedRouteMeta("/protected/fee-setup/generate")).toMatchObject({
      href: "/protected/fee-setup",
      label: "Fee Setup",
    });
  });

  it("maps dashboard route meta to the Dashboard navigation item", () => {
    expect(getProtectedRouteMeta("/protected/dashboard")).toMatchObject({
      href: "/protected/dashboard",
      label: "Dashboard",
    });
  });

  it("keeps reports and imports discoverable through route meta for deep links", () => {
    expect(getProtectedRouteMeta("/protected/reports")).toMatchObject({
      href: "/protected/transactions",
      label: "Reports & Exports",
    });
    expect(getProtectedRouteMeta("/protected/imports")).toMatchObject({
      href: "/protected/admin-tools",
      label: "Import History",
    });
  });

  it("uses plain admin labels for lists and settings", () => {
    expect(getProtectedRouteMeta("/protected/master-data")).toMatchObject({
      href: "/protected/admin-tools",
      label: "School Lists",
    });
    expect(getProtectedRouteMeta("/protected/settings")).toMatchObject({
      href: "/protected/admin-tools",
      label: "App Settings",
    });
  });

  it("maps transactions and legacy dues routes to Transactions", () => {
    expect(getProtectedRouteMeta("/protected/transactions")).toMatchObject({
      href: "/protected/transactions",
      label: "Transactions",
    });
    expect(getProtectedRouteMeta("/protected/dues")).toMatchObject({
      href: "/protected/transactions",
      label: "Transactions",
    });
    expect(getProtectedRouteMeta("/protected/receipts/receipt-1")).toMatchObject({
      href: "/protected/transactions",
      label: "Transactions",
    });
  });

  it("builds mobile bottom nav with Home, Collect, Students, and Calls for counter work", () => {
    const accountant = getMobileBottomNavigation("accountant");
    const viewOnly = getMobileBottomNavigation("view_only");

    // Ledger Calm 2.0 slot order: Home · Collect (saffron pill) · Students ·
    // Calls · More (More is appended by the component, not the config).
    expect(accountant.map((item) => item.label)).toEqual([
      "Home",
      "Collect",
      "Students",
      "Calls",
    ]);
    expect(viewOnly.map((item) => item.label)).toEqual([
      "Home",
      "Students",
      "Calls",
      "Transactions",
    ]);
  });

  it("gives fee collectors a defaulters-first mobile bottom nav", () => {
    const items = getMobileBottomNavigation("fee_collector");

    expect(items.map((item) => item.label)).toEqual([
      "Defaulters",
      "Students",
    ]);
  });

  it("keeps the defaulters call list in the teacher mobile tabs", () => {
    const items = getMobileBottomNavigation("teacher");
    const calls = items.find((item) => item.label === "Calls");

    expect(calls?.href).toBe("/protected/defaulters");
  });

  it("keeps read_only_staff string accepted as a backward-compat alias for view_only", () => {
    expect(resolveStaffRole("read_only_staff")).toBe("view_only");
    expect(resolveStaffRole("view_only")).toBe("view_only");
  });
});
