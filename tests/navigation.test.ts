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

  it("keeps admins on Start Here by default", () => {
    expect(getDefaultProtectedHref("admin")).toBe("/protected");
  });

  it("keeps read-only staff on Start Here by default", () => {
    expect(getDefaultProtectedHref("read_only_staff")).toBe("/protected");
  });

  it("orders accountant navigation around counter work", () => {
    const items = getVisibleProtectedNavigation("accountant");

    expect(items[0]?.href).toBe("/protected/payments");
    expect(items[1]?.href).toBe("/protected/dues");
  });

  it("hides the advanced hub from read-only staff", () => {
    const items = getVisibleProtectedNavigation("read_only_staff");

    expect(items.some((item) => item.href === "/protected/advanced")).toBe(false);
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

  it("keeps reports and imports discoverable through route meta for deep links", () => {
    expect(getProtectedRouteMeta("/protected/reports")).toMatchObject({
      href: "/protected/advanced",
      label: "Reports & Exports",
    });
    expect(getProtectedRouteMeta("/protected/imports")).toMatchObject({
      href: "/protected/students",
      label: "Student Imports",
    });
  });
});
