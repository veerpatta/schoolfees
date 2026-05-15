import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const getSystemSyncHealth = vi.fn();
const autoReconcileSessionIfSafe = vi.fn();
const requireStaffPermission = vi.fn();
const hasStaffPermission = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

vi.mock("@/lib/supabase/session", () => ({
  requireStaffPermission,
  hasStaffPermission,
}));

vi.mock("@/lib/system-sync/finance-sync", () => ({
  getSystemSyncHealth,
  autoReconcileSessionIfSafe,
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
    hasStaffPermission.mockReturnValue(true);

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
    autoReconcileSessionIfSafe.mockImplementation(async (sessionLabel: string) => ({
      health:
        sessionLabel === "2026-27"
          ? health({ students: 315, prepared: 315, missing: 0, missingClasses: 0 })
          : await getSystemSyncHealth(sessionLabel),
      ran: sessionLabel === "2026-27",
      reason:
        sessionLabel === "2026-27"
          ? "Missing dues were prepared automatically."
          : "No missing dues found.",
    }));
  });

  it("renders one card per academic session with different health states", async () => {
    const { default: SessionHealthPage } = await import(
      "@/app/protected/admin-tools/session-health/page"
    );
    const element = await SessionHealthPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(requireStaffPermission).toHaveBeenCalledWith("fees:view", {
      onDenied: "redirect",
    });
    expect(html).toContain("1 session auto-synced");
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
    expect(html).toContain("Manual fallback");
    expect(html).toContain("Open Fee Setup");
    expect(html.match(/<button type="submit">Reconcile this session/g) ?? []).toHaveLength(0);
  });
});
