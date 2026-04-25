import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const generateSessionLedgersAction = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/fees/data", () => ({
  getFeePolicySummary: vi.fn(async () => ({
    academicSessionLabel: "2026-27",
    calculationModel: "workbook_v1",
  })),
}));

vi.mock("@/lib/fees/generator", () => ({
  generateSessionLedgersAction,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

describe("automatic dues preparation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("add_student_prepares_dues_automatically through the system path", async () => {
    generateSessionLedgersAction.mockResolvedValue({
      academicSessionLabel: "2026-27",
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
    });

    const { prepareDuesForStudentsAutomatically } = await import("@/lib/system-sync/finance-sync");
    const result = await prepareDuesForStudentsAutomatically({
      studentIds: ["student-1"],
      reason: "Student added",
    });

    expect(generateSessionLedgersAction).toHaveBeenCalledWith({
      scopedStudentIds: ["student-1"],
      useAdminClient: true,
    });
    expect(result.readyForPaymentCount).toBe(1);
    expect(result.duesNeedAttentionCount).toBe(0);
    expect(result.officeSummary).toContain("Dues prepared for 1 student");
  });

  it("add_student_missing_class_fee_shows_reason", async () => {
    generateSessionLedgersAction.mockResolvedValue({
      academicSessionLabel: "2026-27",
      totalActiveStudents: 1,
      studentsInAcademicSession: 1,
      scopedStudents: 1,
      studentsWithResolvedSettings: 0,
      studentsMissingSettings: 1,
      existingInstallments: 0,
      installmentsToInsert: 0,
      installmentsToUpdate: 0,
      installmentsToCancel: 0,
      lockedInstallments: 0,
      expectedScheduledInstallments: 0,
      affectedStudents: 0,
      blockedInstallmentsForReview: [],
      skippedStudents: [
        {
          studentId: "student-1",
          admissionNo: "PENDING-SR-0001",
          fullName: "Test Student",
          classLabel: "Class 1",
          sessionLabel: "2026-27",
          reasonCode: "CLASS_FEE_MISSING",
          reasonMessage: "Class 1 does not have a fee amount in Fee Setup for 2026-27.",
        },
      ],
      warnings: [],
      errors: [],
    });

    const { prepareDuesForStudentsAutomatically } = await import("@/lib/system-sync/finance-sync");
    const result = await prepareDuesForStudentsAutomatically({
      studentIds: ["student-1"],
      reason: "Student added",
    });

    expect(result.readyForPaymentCount).toBe(0);
    expect(result.duesNeedAttentionCount).toBe(1);
    expect(result.reasonSummary).toBe(
      "Class 1 does not have a fee amount in Fee Setup for 2026-27.",
    );
    expect(result.officeSummary).toContain("1 need attention");
  });
});
