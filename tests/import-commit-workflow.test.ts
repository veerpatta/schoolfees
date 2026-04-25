import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const generateSessionLedgersAction = vi.fn();
const getFeePolicySummary = vi.fn();
const createStudent = vi.fn();
const updateStudent = vi.fn();
const getStudentDetail = vi.fn();

const batchRow = {
  id: "batch-1",
  import_mode: "add" as const,
  target_session_label: "2026-27",
  filename: "students.csv",
  source_format: "csv" as const,
  worksheet_name: null,
  status: "validated",
  detected_headers: [],
  column_mapping: {},
  total_rows: 1,
  valid_rows: 1,
  invalid_rows: 0,
  duplicate_rows: 0,
  imported_rows: 0,
  skipped_rows: 0,
  failed_rows: 0,
  validation_completed_at: "2026-04-24T00:00:00.000Z",
  import_completed_at: null,
  error_message: null,
  created_at: "2026-04-24T00:00:00.000Z",
  updated_at: "2026-04-24T00:00:00.000Z",
};

const rowRecord = {
  id: "row-1",
  batch_id: "batch-1",
  row_index: 2,
  raw_payload: {
    "Student name": "Test Student 001",
    Class: "Class 1",
  },
  normalized_payload: {
    studentId: null,
    fullName: "Test Student 001",
    classId: "class-1",
    classLabel: "Class 1",
    admissionNo: "",
    dateOfBirth: null,
    fatherName: null,
    motherName: null,
    fatherPhone: null,
    motherPhone: null,
    address: null,
    transportRouteId: null,
    transportRouteLabel: null,
    status: "active",
    notes: null,
    feeProfileReason: "Import",
    overrides: {
      customTuitionFeeAmount: null,
      customTransportFeeAmount: null,
      customBooksFeeAmount: null,
      customAdmissionActivityMiscFeeAmount: null,
      customOtherFeeHeads: {},
      customLateFeeFlatAmount: null,
      discountAmount: 0,
      studentTypeOverride: null,
      transportAppliesOverride: null,
      otherAdjustmentHead: null,
      otherAdjustmentAmount: null,
      lateFeeWaiverAmount: 0,
      hasAnyOverride: false,
    },
  },
  status: "valid",
  review_status: "approved",
  review_note: null,
  reviewed_at: null,
  anomaly_categories: [],
  errors: [],
  warnings: [],
  duplicate_student_id: null,
  target_student_id: null,
  import_operation: "create" as const,
  changed_fields: [],
  imported_student_id: null,
  imported_override_id: null,
};

function makeQueryBuilder<T>(result: { data: T; error: null }) {
  return {
    eq() {
      return this;
    },
    in() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    neq() {
      return this;
    },
    maybeSingle: async () => result,
    then(resolve: (value: { data: T; error: null }) => void) {
      return Promise.resolve(result).then(resolve);
    },
  };
}

vi.mock("@/lib/fees/data", () => ({
  getFeePolicySummary,
}));

vi.mock("@/lib/fees/generator", () => ({
  generateSessionLedgersAction,
}));

vi.mock("@/lib/system-sync/finance-sync", () => ({
  hasPreparedDues: vi.fn((result) => result.affectedStudents > 0 || result.installmentsToInsert > 0),
  summarizeDuesPreparationIssues: vi.fn(() => ""),
  syncAfterBulkStudentImport: vi.fn(async (studentIds: string[]) => {
    await generateSessionLedgersAction({ scopedStudentIds: studentIds });
    return {
      affectedStudents: studentIds.length,
      installmentsToInsert: 4,
      installmentsToUpdate: 0,
      installmentsToCancel: 0,
      lockedInstallments: 0,
    };
  }),
}));

vi.mock("@/lib/students/data", () => ({
  createStudent,
  getStudentDetail,
  updateStudent,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from(table: string) {
      if (table === "import_batches") {
        return {
          select() {
            return makeQueryBuilder({ data: batchRow, error: null });
          },
          update() {
            return makeQueryBuilder({ data: null, error: null });
          },
        };
      }

      if (table === "import_rows") {
        return {
          select() {
            return makeQueryBuilder({ data: [rowRecord], error: null });
          },
          update() {
            return makeQueryBuilder({ data: null, error: null });
          },
        };
      }

      if (table === "student_fee_overrides") {
        return {
          select() {
            return makeQueryBuilder({ data: null, error: null });
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  })),
}));

describe("student import commit workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFeePolicySummary.mockResolvedValue({
      academicSessionLabel: "2026-27",
    });
    createStudent.mockResolvedValue("student-1");
    updateStudent.mockResolvedValue("student-1");
    getStudentDetail.mockResolvedValue(null);
    generateSessionLedgersAction.mockResolvedValue({
      affectedStudents: 1,
      installmentsToInsert: 4,
      installmentsToUpdate: 0,
      installmentsToCancel: 0,
      lockedInstallments: 0,
    });
  });

  it("creates students and triggers scoped ledger generation for imported rows", async () => {
    const { commitStudentImportBatch } = await import("@/lib/import/data");

    const result = await commitStudentImportBatch("batch-1");

    expect(createStudent).toHaveBeenCalledTimes(1);
    expect(generateSessionLedgersAction).toHaveBeenCalledWith({
      scopedStudentIds: ["student-1"],
    });
    expect(result.affectedStudentIds).toEqual(["student-1"]);
    expect(result.status).toBe("completed");
    expect(result.duesReadyCount).toBe(1);
    expect(result.duesAttentionCount).toBe(0);
  });
});
