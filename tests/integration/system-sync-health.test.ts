import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createClient = vi.fn();
const getFeePolicySummary = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

vi.mock("@/lib/fees/data", () => ({
  getFeePolicySummary,
}));

describe("system sync health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFeePolicySummary.mockResolvedValue({ academicSessionLabel: "2026-27" });
  });

  it("queries active classes by status, not is_active", async () => {
    const classSelect = vi.fn().mockReturnThis();
    const classEq = vi.fn().mockReturnThis();
    const classQuery = {
      select: classSelect,
      eq: classEq,
      then: vi.fn((resolve) => resolve({ data: [], error: null })),
    };

    const studentQuery = {
      select: vi.fn().mockReturnThis(),
      then: vi.fn((resolve) =>
        resolve({
          data: [
            {
              id: "student-1",
              admission_no: "SR-1",
              full_name: "Test Student",
              status: "active",
              class_id: "class-1",
              transport_route_id: null,
              class_ref: {
                id: "class-1",
                session_label: "2026-27",
                status: "active",
                class_name: "Class 1",
                section: null,
                stream_name: null,
              },
            },
          ],
          error: null,
        }),
      ),
    };

    const installmentQuery = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      then: vi.fn((resolve) => resolve({ data: [], error: null })),
    };

    const feeSettingQuery = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn((resolve) => resolve({ data: [], error: null })),
    };

    const routeQuery = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      then: vi.fn((resolve) => resolve({ count: 0, error: null })),
    };

    const academicSessionQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { session_label: "2026-27" },
        error: null,
      }),
    };

    createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "students") return studentQuery;
        if (table === "classes") return classQuery;
        if (table === "installments") return installmentQuery;
        if (table === "fee_settings") return feeSettingQuery;
        if (table === "transport_routes") return routeQuery;
        if (table === "academic_sessions") return academicSessionQuery;
        if (table === "import_batches") {
          return {
            select: vi.fn().mockReturnThis(),
            then: vi.fn((resolve) => resolve({ data: [], error: null })),
          };
        }
        if (table === "v_workbook_student_financials") {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            then: vi.fn((resolve) => resolve({ data: [], count: 0, error: null })),
          };
        }
        if (table === "v_workbook_installment_balances") {
          return {
            select: vi.fn().mockReturnThis(),
            then: vi.fn((resolve) => resolve({ data: [], count: 0, error: null })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc: vi.fn((name: string) => {
        if (name === "preview_workbook_payment_allocation") {
          return Promise.resolve({ data: [], error: null });
        }
        if (name === "post_student_payment") {
          return Promise.resolve({
            data: null,
            error: { message: "Selected student was not found.", code: "P0001" },
          });
        }
        throw new Error(`Unexpected rpc: ${name}`);
      }),
    });

    const { getSystemSyncHealth } = await import("@/lib/system-sync/financial-sync");
    const health = await getSystemSyncHealth();

    expect(classSelect).toHaveBeenCalledWith("id, session_label, class_name, section, stream_name");
    expect(classEq).toHaveBeenCalledWith("status", "active");
    expect(classEq).not.toHaveBeenCalledWith("is_active", true);
    expect(health.activeSession).toBe("2026-27");
    expect(health.sessionsMatch).toBe(true);
    expect(health.paymentPreviewReady).toBe(true);
    expect(health.requiredDatabaseObjectsStatus.previewWorkbookPaymentAllocation.usable).toBe(true);
  });

  it("detects session mismatch, missing dues, and classes missing fee settings", async () => {
    const makeQuery = <T,>(result: { data?: T; count?: number | null; error?: { message: string } | null }) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: Array.isArray(result.data) ? result.data[0] ?? null : result.data ?? null,
        error: result.error ?? null,
      }),
      then: vi.fn((resolve) =>
        resolve({
          data: result.data ?? [],
          count: result.count ?? (Array.isArray(result.data) ? result.data.length : 0),
          error: result.error ?? null,
        }),
      ),
    });

    createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "students") {
          return makeQuery({
            data: [
              {
                id: "student-1",
                admission_no: "SR-1",
                full_name: "Active Student",
                status: "active",
                class_id: "class-1",
                transport_route_id: null,
                class_ref: {
                  id: "class-1",
                  session_label: "2026-27",
                  status: "active",
                  class_name: "Class 1",
                  section: null,
                  stream_name: null,
                },
              },
              {
                id: "student-2",
                admission_no: "SR-2",
                full_name: "Old Session Student",
                status: "active",
                class_id: "class-old",
                transport_route_id: null,
                class_ref: {
                  id: "class-old",
                  session_label: "2025-26",
                  status: "active",
                  class_name: "Class 2",
                  section: null,
                  stream_name: null,
                },
              },
            ],
          });
        }
        if (table === "academic_sessions") {
          return makeQuery({ data: { session_label: "2025-26" } });
        }
        if (table === "classes") {
          return makeQuery({
            data: [
              {
                id: "class-1",
                session_label: "2026-27",
                class_name: "Class 1",
                section: null,
                stream_name: null,
              },
            ],
          });
        }
        if (table === "installments") {
          return makeQuery({ data: [] });
        }
        if (table === "fee_settings") {
          return makeQuery({ data: [] });
        }
        if (table === "import_batches") {
          return makeQuery({ data: [{ target_session_label: "2026-27", status: "completed" }] });
        }
        if (table === "v_workbook_student_financials") {
          return makeQuery({ data: [] });
        }
        if (table === "v_workbook_installment_balances") {
          return makeQuery({ data: [] });
        }
        if (table === "transport_routes") {
          return makeQuery({ data: [], count: 0 });
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc: vi.fn((name: string) => {
        if (name === "preview_workbook_payment_allocation") {
          return Promise.resolve({ data: [], error: null });
        }
        if (name === "post_student_payment") {
          return Promise.resolve({
            data: null,
            error: { message: "Selected student was not found.", code: "P0001" },
          });
        }
        throw new Error(`Unexpected rpc: ${name}`);
      }),
    });

    const { getLiveDataHealth } = await import("@/lib/system-sync/live-data-health");
    const health = await getLiveDataHealth();

    expect(health.activeFeePolicySession).toBe("2026-27");
    expect(health.academicCurrentSession).toBe("2025-26");
    expect(health.sessionMismatch).toBe(true);
    expect(health.studentsMissingInstallments).toHaveLength(1);
    expect(health.classesMissingFeeSettings).toHaveLength(1);
    expect(health.studentsOutsideActiveFeeSession).toHaveLength(1);
    expect(health.importBatchesByTargetSession[0]).toMatchObject({
      targetSessionLabel: "2026-27",
      status: "completed",
      count: 1,
    });
    expect(health.dashboardReady).toBe(false);
    expect(health.paymentDeskReady).toBe(false);
    expect(health.warnings).toContain("Students exist but dues are missing.");
    expect(health.warnings).toContain("Class fees are missing for these classes.");
  });
});
