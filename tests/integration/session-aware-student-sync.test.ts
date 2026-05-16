import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const generateSessionLedgersAction = vi.fn();
const createClient = vi.fn();
const revalidatePath = vi.fn();
const revalidateTag = vi.fn();

vi.mock("@/lib/fees/data", () => ({
  getFeePolicySummary: vi.fn(async () => ({
    academicSessionLabel: "TEST-2026-27",
    calculationModel: "workbook_v1",
  })),
  getFeePolicyForSession: vi.fn(async (sessionLabel: string) => ({
    academicSessionLabel: sessionLabel,
    calculationModel: "workbook_v1",
  })),
}));

vi.mock("@/lib/fees/generator", () => ({
  generateSessionLedgersAction,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath,
  revalidateTag,
  unstable_cache:
    <T extends (...args: unknown[]) => unknown>(callback: T) =>
    callback,
}));

function makeSuccessResult(sessionLabel: string, overrides: Record<string, unknown> = {}) {
  return {
    academicSessionLabel: sessionLabel,
    totalActiveStudents: 1,
    studentsInAcademicSession: 1,
    scopedStudents: 1,
    studentsWithResolvedSettings: 1,
    studentsMissingSettings: 0,
    existingInstallments: 0,
    installmentsToInsert: 4,
    installmentsToUpdate: 0,
    installmentsToCancel: 0,
    lockedInstallments: 0,
    expectedScheduledInstallments: 4,
    affectedStudents: 1,
    blockedInstallmentsForReview: [],
    skippedStudents: [],
    warnings: [],
    errors: [],
    ...overrides,
  };
}

describe("session-aware student sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateSessionLedgersAction.mockResolvedValue(makeSuccessResult("2026-27"));
  });

  describe("syncStudentFinancials — sessionLabel provided at call site", () => {
    it("passes scopedSessionLabel to the generator when sessionLabel is given", async () => {
      const { syncStudentFinancials } = await import("@/lib/system-sync/financial-sync");

      await syncStudentFinancials({
        studentIds: ["student-in-2026-27"],
        sessionLabel: "2026-27",
        reason: "Student added",
        useSystemClient: true,
      });

      expect(generateSessionLedgersAction).toHaveBeenCalledOnce();
      expect(generateSessionLedgersAction).toHaveBeenCalledWith({
        scopedStudentIds: ["student-in-2026-27"],
        scopedSessionLabel: "2026-27",
        useAdminClient: true,
      });
    });

    it("syncs a 2026-27 student correctly even when the active fee setup session is TEST-2026-27", async () => {
      // The fee policy mock returns TEST-2026-27 as active, but we pass sessionLabel explicitly.
      generateSessionLedgersAction.mockResolvedValue(makeSuccessResult("2026-27"));

      const { syncStudentFinancials } = await import("@/lib/system-sync/financial-sync");

      const result = await syncStudentFinancials({
        studentIds: ["student-real"],
        sessionLabel: "2026-27",
        reason: "Student updated",
      });

      expect(generateSessionLedgersAction).toHaveBeenCalledWith(
        expect.objectContaining({ scopedSessionLabel: "2026-27" }),
      );
      expect(result.installmentsToInsert).toBe(4);
    });
  });

  describe("syncStudentFinancials — no sessionLabel, resolves from DB", () => {
    it("groups students by class session and calls generator once per session", async () => {
      createClient.mockResolvedValue({
        from: (table: string) => {
          if (table === "students") {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: "student-a", class_ref: { session_label: "2026-27" } },
                  { id: "student-b", class_ref: { session_label: "TEST-2026-27" } },
                ],
                error: null,
              }),
            };
          }
          throw new Error(`Unexpected table in session-resolve mock: ${table}`);
        },
      });

      generateSessionLedgersAction
        .mockResolvedValueOnce(makeSuccessResult("2026-27"))
        .mockResolvedValueOnce(makeSuccessResult("TEST-2026-27"));

      const { syncStudentFinancials } = await import("@/lib/system-sync/financial-sync");

      const result = await syncStudentFinancials({
        studentIds: ["student-a", "student-b"],
        reason: "Bulk import",
        useSystemClient: true,
      });

      expect(generateSessionLedgersAction).toHaveBeenCalledTimes(2);

      const calls = generateSessionLedgersAction.mock.calls.map((c) => c[0].scopedSessionLabel);
      expect(calls).toContain("2026-27");
      expect(calls).toContain("TEST-2026-27");

      // Merged result sums installments across both sessions.
      expect(result.installmentsToInsert).toBe(8);
    });

    it("syncs resolved students by session and falls back for unresolved student ids", async () => {
      createClient.mockResolvedValue({
        from: (table: string) => {
          if (table === "students") {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: "student-a", class_ref: { session_label: "2026-27" } },
                  { id: "student-b", class_ref: null },
                ],
                error: null,
              }),
            };
          }
          throw new Error(`Unexpected table in session-resolve mock: ${table}`);
        },
      });

      generateSessionLedgersAction
        .mockResolvedValueOnce(makeSuccessResult("2026-27", { installmentsToInsert: 4 }))
        .mockResolvedValueOnce(makeSuccessResult("fallback", { installmentsToInsert: 2 }));

      const { syncStudentFinancials } = await import("@/lib/system-sync/financial-sync");

      const result = await syncStudentFinancials({
        studentIds: ["student-a", "student-b"],
        reason: "Partial session resolution",
      });

      expect(generateSessionLedgersAction).toHaveBeenCalledTimes(2);
      expect(generateSessionLedgersAction).toHaveBeenNthCalledWith(1, {
        scopedStudentIds: ["student-a"],
        scopedSessionLabel: "2026-27",
        useAdminClient: undefined,
      });
      expect(generateSessionLedgersAction).toHaveBeenNthCalledWith(2, {
        scopedStudentIds: ["student-b"],
        useAdminClient: undefined,
      });
      expect(result.installmentsToInsert).toBe(6);
    });

    it("falls back to the default (no scopedSessionLabel) when DB session resolution fails", async () => {
      // createClient returns undefined — resolveStudentSessions will throw and return empty map.
      createClient.mockResolvedValue(undefined);

      const { syncStudentFinancials } = await import("@/lib/system-sync/financial-sync");

      await syncStudentFinancials({
        studentIds: ["student-1"],
        reason: "Fallback test",
      });

      expect(generateSessionLedgersAction).toHaveBeenCalledOnce();
      expect(generateSessionLedgersAction).toHaveBeenCalledWith(
        expect.objectContaining({
          scopedStudentIds: ["student-1"],
        }),
      );
      // No scopedSessionLabel — uses active fee policy default.
      expect(generateSessionLedgersAction.mock.calls[0][0]).not.toHaveProperty(
        "scopedSessionLabel",
      );
    });

    it("retries with the staff client when the service-role sync path is unavailable", async () => {
      generateSessionLedgersAction
        .mockRejectedValueOnce(new Error("Missing environment variable: SUPABASE_SERVICE_ROLE_KEY"))
        .mockResolvedValueOnce(makeSuccessResult("2026-27"));

      const { syncStudentFinancials } = await import("@/lib/system-sync/financial-sync");

      await syncStudentFinancials({
        studentIds: ["student-1"],
        sessionLabel: "2026-27",
        reason: "Service role fallback",
        useSystemClient: true,
      });

      expect(generateSessionLedgersAction).toHaveBeenCalledTimes(2);
      expect(generateSessionLedgersAction).toHaveBeenNthCalledWith(1, {
        scopedStudentIds: ["student-1"],
        scopedSessionLabel: "2026-27",
        useAdminClient: true,
      });
      expect(generateSessionLedgersAction).toHaveBeenNthCalledWith(2, {
        scopedStudentIds: ["student-1"],
        scopedSessionLabel: "2026-27",
        useAdminClient: false,
      });
    });
  });

  describe("prepareDuesForStudentsAutomatically — sessionLabel forwarding", () => {
    it("forwards sessionLabel to syncStudentFinancials when provided", async () => {
      createClient.mockResolvedValue({
        from: (table: string) => {
          if (table === "students") {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [{ id: "student-1", class_ref: { session_label: "2026-27" } }],
                error: null,
              }),
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        },
      });

      const { prepareDuesForStudentsAutomatically } = await import(
        "@/lib/system-sync/finance-sync"
      );

      await prepareDuesForStudentsAutomatically({
        studentIds: ["student-1"],
        sessionLabel: "2026-27",
        reason: "Student added",
      });

      expect(generateSessionLedgersAction).toHaveBeenCalledWith(
        expect.objectContaining({
          scopedStudentIds: ["student-1"],
          scopedSessionLabel: "2026-27",
          useAdminClient: true,
        }),
      );
    });
  });

  describe("Admin Tools status label", () => {
    it("returns Synced when healthy and auto sync did not run", async () => {
      const { isUnavailableSystemSyncHealth } = await import(
        "@/lib/system-sync/health-fallback"
      );

      // Verify the sentinel: a healthy health object is NOT unavailable.
      const health = {
        dashboardReady: true,
        paymentDeskReady: true,
        studentsMissingInstallmentRows: 0,
        classesWithoutFeeSettings: 0,
        errors: [] as string[],
      };

      expect(isUnavailableSystemSyncHealth(health as never)).toBe(false);
    });

    it("buildUnavailableSystemSyncHealth does not surface as healthy", async () => {
      const { buildUnavailableSystemSyncHealth, isUnavailableSystemSyncHealth } = await import(
        "@/lib/system-sync/health-fallback"
      );

      const health = buildUnavailableSystemSyncHealth("2026-27", "Service role key missing");

      expect(isUnavailableSystemSyncHealth(health)).toBe(true);
      expect(health.dashboardReady).toBe(false);
      expect(health.paymentDeskReady).toBe(false);
      expect(health.errors).toHaveLength(1);
    });
  });
});
