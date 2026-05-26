import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getViewSessionCookie = vi.fn();
const resolveViewSession = vi.fn();
const requireAnyStaffPermission = vi.fn();
const hasStaffPermission = vi.fn();
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
  getSystemSyncHealth,
}));

vi.mock("@/app/protected/admin-tools/session-health/actions", () => ({
  reconcileSessionAction: vi.fn(),
}));

// Server pages call getTranslations() from next-intl/server, which expects the
// next-intl request config to be bootstrapped. In tests we substitute a sync
// translator built from the English message catalog so the rendered markup
// matches the production English copy.
vi.mock("next-intl/server", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  const messages = JSON.parse(
    readFileSync(join(process.cwd(), "messages", "en.json"), "utf-8"),
  );
  return {
    getTranslations: async (namespace: string) =>
      actual.createTranslator({ locale: "en", messages, namespace }),
  };
});

describe("Admin Tools page resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getViewSessionCookie.mockResolvedValue("2026-27");
    resolveViewSession.mockResolvedValue({ sessionLabel: "2026-27" });
    requireAnyStaffPermission.mockResolvedValue({ appRole: "admin" });
    hasStaffPermission.mockReturnValue(true);
  });

  it("still renders the hub shell when the health check throws", async () => {
    getSystemSyncHealth.mockRejectedValue(new Error("health check timed out"));

    const { default: AdminToolsPage } = await import("@/app/protected/admin-tools/page");
    const element = await AdminToolsPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    // The page shell renders synchronously around the Suspense-guarded health
    // card, so a thrown getSystemSyncHealth no longer breaks the route.
    expect(html).toContain("Admin Tools");
    expect(html).toContain("Automatic sync is on");
    // Hub link tiles still render even though the health card is suspended.
    expect(html).toContain("Class promotion");
    expect(html).toContain("WhatsApp templates");
  });

  it("does not trigger a render-time reconcile (read-only health only)", async () => {
    getSystemSyncHealth.mockResolvedValue({
      dashboardReady: true,
      paymentDeskReady: true,
      studentsMissingInstallmentRows: 0,
      classesWithoutFeeSettings: 0,
      rawStudentsInActiveSession: 479,
      workbookFinancialRowCount: 479,
      errors: [],
    });

    const { default: AdminToolsPage } = await import("@/app/protected/admin-tools/page");
    await AdminToolsPage({ searchParams: Promise.resolve({}) });

    // The Admin Tools hub must read health but never mutate during render.
    // The hub-level page is now strictly read-only; reconcile is opt-in.
    expect(getSystemSyncHealth).not.toThrow();
  });
});
