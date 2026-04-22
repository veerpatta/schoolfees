import { describe, expect, it } from "vitest";

import {
  getDefaultProtectedHref,
  getVisibleProtectedNavigation,
} from "@/lib/config/navigation";

describe("office navigation", () => {
  it("sends accountants to the payment desk by default", () => {
    expect(getDefaultProtectedHref("accountant")).toBe("/protected/payments");
  });

  it("keeps admins on Start Here by default", () => {
    expect(getDefaultProtectedHref("admin")).toBe("/protected");
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
});
