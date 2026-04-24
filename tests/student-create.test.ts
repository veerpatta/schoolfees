import { describe, expect, it, vi } from "vitest";

const insertPayloads: Array<Record<string, unknown>> = [];
const upsertStudentFeeOverride = vi.fn(async () => undefined);

vi.mock("server-only", () => ({}));

vi.mock("@/lib/fees/data", () => ({
  getFeePolicySummary: vi.fn(async () => ({ customFeeHeads: [] })),
  upsertStudentFeeOverride,
}));

vi.mock("@/lib/master-data/data", () => ({
  getMasterDataOptions: vi.fn(async () => ({ classOptions: [], routeOptions: [] })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from(table: string) {
      if (table !== "students") {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        select(columns: string) {
          if (columns !== "admission_no") {
            throw new Error(`Unexpected select ${columns}`);
          }

          return {
            ilike: vi.fn(async () => ({
              data: [{ admission_no: "PENDING-SR-0001" }],
              error: null,
            })),
          };
        },
        insert(payload: Record<string, unknown>) {
          insertPayloads.push(payload);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: "student-1" },
                error: null,
              })),
            })),
          };
        },
      };
    },
  })),
}));

describe("createStudent", () => {
  it("generates a temporary SR no when admissionNo is blank", async () => {
    const { createStudent } = await import("@/lib/students/data");

    const studentId = await createStudent({
      fullName: "Asha Sharma",
      classId: "class-1",
      admissionNo: "",
      dateOfBirth: null,
      fatherName: null,
      motherName: null,
      fatherPhone: null,
      motherPhone: null,
      address: null,
      transportRouteId: null,
      status: "active",
      studentTypeOverride: "existing",
      tuitionOverride: null,
      transportOverride: null,
      discountAmount: 0,
      lateFeeWaiverAmount: 0,
      otherAdjustmentHead: null,
      otherAdjustmentAmount: null,
      feeProfileReason: "Import",
      feeProfileNotes: null,
      notes: null,
    });

    expect(studentId).toBe("student-1");
    expect(insertPayloads.at(-1)?.admission_no).toBe("PENDING-SR-0002");
    expect(upsertStudentFeeOverride).not.toHaveBeenCalled();
  });
});
