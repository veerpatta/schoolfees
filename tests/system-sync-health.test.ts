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
        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    const { getSystemSyncHealth } = await import("@/lib/system-sync/financial-sync");
    const health = await getSystemSyncHealth();

    expect(classSelect).toHaveBeenCalledWith("id, session_label, class_name, section, stream_name");
    expect(classEq).toHaveBeenCalledWith("status", "active");
    expect(classEq).not.toHaveBeenCalledWith("is_active", true);
    expect(health.activeSession).toBe("2026-27");
    expect(health.sessionsMatch).toBe(true);
  });
});
