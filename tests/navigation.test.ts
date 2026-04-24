import { describe, expect, it } from "vitest";

import {
  getDefaultProtectedHref,
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

  it("sends read-only staff to Dashboard by default", () => {
    expect(getDefaultProtectedHref("read_only_staff")).toBe("/protected/dashboard");
  });

  it("never sends a role back to the protected routing entry point", () => {
    expect(getDefaultProtectedHref("admin")).not.toBe("/protected");
    expect(getDefaultProtectedHref("accountant")).not.toBe("/protected");
    expect(getDefaultProtectedHref("read_only_staff")).not.toBe("/protected");
  });

  it("orders accountant navigation around counter work", () => {
    const items = getVisibleProtectedNavigation("accountant");

    expect(items[0]?.href).toBe("/protected/payments");
    expect(items[1]?.href).toBe("/protected/dashboard");
    expect(items[2]?.href).toBe("/protected/transactions");
    expect(items[2]?.label).toBe("Transactions");
  });

  it("keeps Dashboard first for admin and read-only staff", () => {
    expect(getVisibleProtectedNavigation("admin")[0]?.href).toBe("/protected/dashboard");
    expect(getVisibleProtectedNavigation("read_only_staff")[0]?.href).toBe(
      "/protected/dashboard",
    );
  });

  it("hides the advanced hub from read-only staff", () => {
    const items = getVisibleProtectedNavigation("read_only_staff");

    expect(items.some((item) => item.href === "/protected/advanced")).toBe(false);
  });

  it("labels the secondary admin hub as Admin Tools", () => {
    const items = getVisibleProtectedNavigation("admin");
    const adminTools = items.find((item) => item.href === "/protected/advanced");

    expect(adminTools?.label).toBe("Admin Tools");
    expect(getProtectedRouteMeta("/protected/advanced")).toMatchObject({
      href: "/protected/advanced",
      label: "Admin Tools",
    });
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
      href: "/protected/students",
      label: "Student Imports",
    });
  });

  it("uses plain admin labels for setup, lists, and settings", () => {
    expect(getProtectedRouteMeta("/protected/setup")).toMatchObject({
      href: "/protected/advanced",
      label: "First-time Setup",
    });
    expect(getProtectedRouteMeta("/protected/master-data")).toMatchObject({
      href: "/protected/advanced",
      label: "School Lists",
    });
    expect(getProtectedRouteMeta("/protected/settings")).toMatchObject({
      href: "/protected/advanced",
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
});
