import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getViewSessionCookie = vi.fn();
const resolveViewSession = vi.fn();
const requireAnyStaffPermission = vi.fn();
const hasStaffPermission = vi.fn();
const autoReconcileSessionIfSafe = vi.fn();
const getSystemSyncHealth = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/session/cookie", () => ({
  getViewSessionCookie,
}));

vi.mock("@/lib/session/resolver", () => ({
  resolveViewSession,
}));

vi.mock("@/lib/supabase/session", () => ({
  requireAnyStaffPermission,
  hasStaffPermission,
}));

vi.mock("@/lib/system-sync/finance-sync", () => ({
  autoReconcileSessionIfSafe,
  getSystemSyncHealth,
}));

describe("Admin Tools page resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getViewSessionCookie.mockResolvedValue("2026-27");
    resolveViewSession.mockResolvedValue({ sessionLabel: "2026-27" });
    requireAnyStaffPermission.mockResolvedValue({ appRole: "admin" });
    hasStaffPermission.mockReturnValue(true);
    autoReconcileSessionIfSafe.mockRejectedValue(new Error("health check timed out"));
  });

  it("still opens when automatic sync health cannot load", async () => {
    const { default: AdminToolsPage } = await import("@/app/protected/admin-tools/page");

    const element = await AdminToolsPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain("Admin Tools");
    expect(html).toContain("Health check unavailable");
    expect(html).toContain("Admin Tools opened, but the automatic health check could not finish.");
    expect(html).toContain("health check timed out");
  });
});
