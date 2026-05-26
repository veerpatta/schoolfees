import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const getSystemSyncHealth = vi.fn();
const requireStaffPermission = vi.fn();

vi.mock("server-only", () => ({}));

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

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

vi.mock("@/lib/supabase/session", () => ({
  requireStaffPermission,
}));

vi.mock("@/lib/system-sync/finance-sync", () => ({
  getSystemSyncHealth,
}));

vi.mock("@/components/admin/pending-submit-button", () => ({
  PendingSubmitButton: ({ idleLabel }: { idleLabel: string }) =>
    React.createElement("button", { type: "submit" }, idleLabel),
}));

vi.mock("@/app/protected/admin-tools/session-health/actions", () => ({
  reconcileSessionAction: vi.fn(),
}));

function health(overrides: {
  students: number;
  prepared: number;
  missing: number;
  missingClasses: number;
}) {
  return {
    dashboardReady: true,
    paymentDeskReady: true,
    rawStudentsInActiveSession: overrides.students,
    workbookFinancialRowCount: overrides.prepared,
    studentsMissingInstallmentRows: overrides.missing,
    classesWithoutFeeSettings: overrides.missingClasses,
    errors: [],
  };
}

describe("Session Health page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireStaffPermission.mockResolvedValue({ appRole: "admin" });

    const sessionsQuery = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          { session_label: "2025-26", status: "inactive", is_current: false },
          { session_label: "2026-27", status: "active", is_current: true },
          { session_label: "TEST", status: "active", is_current: false },
        ],
        error: null,
      }),
    };
    const logsQuery = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          { session_label: "2026-27", finished_at: "2026-05-15T08:30:00.000Z" },
        ],
        error: null,
      }),
    };

    createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "academic_sessions") return sessionsQuery;
        if (table === "session_reconcile_log") return logsQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    getSystemSyncHealth.mockImplementation(async (sessionLabel: string) => {
      if (sessionLabel === "2025-26") {
        return health({ students: 42, prepared: 42, missing: 0, missingClasses: 0 });
      }

      if (sessionLabel === "2026-27") {
        return health({ students: 315, prepared: 300, missing: 15, missingClasses: 0 });
      }

      return health({ students: 3, prepared: 0, missing: 3, missingClasses: 1 });
    });
  });

  it("renders one card per academic session with different health states", async () => {
    const { SessionHealthGrid } = await import(
      "@/app/protected/admin-tools/session-health/page"
    );
    const { createTranslator } = await vi.importActual<typeof import("next-intl")>(
      "next-intl",
    );
    const messages = JSON.parse(
      readFileSync(join(process.cwd(), "messages", "en.json"), "utf-8"),
    );
    const t = createTranslator({
      locale: "en",
      messages,
      namespace: "AdminTools",
    }) as Parameters<typeof SessionHealthGrid>[0]["t"];

    const element = await SessionHealthGrid({ t });
    const html = renderToStaticMarkup(element as React.ReactElement);

    // No auto-sync banner anymore — only attention vs. healthy.
    expect(html).toContain("sessions need setup review");
    expect(html).toContain("2025-26");
    expect(html).toContain("Archived");
    expect(html).toContain("2026-27");
    expect(html).toContain("Active");
    expect(html).toContain("TEST");
    expect(html).toContain("Test");
    expect(html).toContain("Active students");
    expect(html).toContain("315");
    expect(html).toContain("Dues missing");
    expect(html).toContain("15");
    expect(html).toContain("Classes missing fees");
    // 2026-27 has missing dues but no class-fee gaps → manual reconcile button.
    expect(html).toContain("Reconcile this session");
    // TEST session has classes missing fees → routed to Fee Setup instead.
    expect(html).toContain("Open Fee Setup");
  });

  it("does not crash when one session's health probe throws", async () => {
    getSystemSyncHealth.mockImplementation(async (sessionLabel: string) => {
      if (sessionLabel === "2026-27") {
        throw new Error("simulated probe failure");
      }
      return health({ students: 1, prepared: 1, missing: 0, missingClasses: 0 });
    });

    const { SessionHealthGrid } = await import(
      "@/app/protected/admin-tools/session-health/page"
    );
    const { createTranslator } = await vi.importActual<typeof import("next-intl")>(
      "next-intl",
    );
    const messages = JSON.parse(
      readFileSync(join(process.cwd(), "messages", "en.json"), "utf-8"),
    );
    const t = createTranslator({
      locale: "en",
      messages,
      namespace: "AdminTools",
    }) as Parameters<typeof SessionHealthGrid>[0]["t"];

    const element = await SessionHealthGrid({ t });
    const html = renderToStaticMarkup(element as React.ReactElement);

    // Render still completes and shows all three session cards.
    expect(html).toContain("2025-26");
    expect(html).toContain("2026-27");
    expect(html).toContain("TEST");
  });
});
