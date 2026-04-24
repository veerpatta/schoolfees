import { describe, expect, it, vi, beforeEach } from "vitest";

const insertPayloads: Array<Array<Record<string, unknown>>> = [];
const updateCalls: Array<{
  payload: Record<string, unknown>;
  filters: Array<[string, unknown]>;
}> = [];

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from(table: string) {
      if (table !== "import_rows") {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        insert(payload: Array<Record<string, unknown>>) {
          insertPayloads.push(payload);
          return Promise.resolve({ error: null });
        },
        update(payload: Record<string, unknown>) {
          const entry = {
            payload,
            filters: [] as Array<[string, unknown]>,
          };
          updateCalls.push(entry);

          const builder = {
            eq(column: string, value: unknown) {
              entry.filters.push([column, value]);
              return builder;
            },
            then(resolve: (value: { error: null }) => void) {
              return Promise.resolve({ error: null }).then(resolve);
            },
          };

          return builder;
        },
      };
    },
  })),
}));

beforeEach(() => {
  insertPayloads.length = 0;
  updateCalls.length = 0;
});

describe("import row persistence", () => {
  it("inserts raw rows with batch_id, row_index, and raw_payload", async () => {
    const { insertRawImportRows } = await import("@/lib/import/data");

    await insertRawImportRows("batch-1", "add", [
      {
        rowIndex: 2,
        rawPayload: {
          "Student name": "Asha Sharma",
          Class: "Class 1",
        },
      },
    ]);

    expect(insertPayloads).toHaveLength(1);
    expect(insertPayloads[0]).toEqual([
      expect.objectContaining({
        batch_id: "batch-1",
        row_index: 2,
        raw_payload: {
          "Student name": "Asha Sharma",
          Class: "Class 1",
        },
        status: "pending",
        review_status: "pending",
        normalized_payload: null,
      }),
    ]);
  });

  it("updates validation rows only within the batch", async () => {
    const { updateImportRowsForBatch } = await import("@/lib/import/data");

    await updateImportRowsForBatch("batch-1", [
      {
        id: "row-1",
        normalizedPayload: {
          studentId: null,
          fullName: "Asha Sharma",
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
          feeProfileReason: null,
          overrides: {
            customTuitionFeeAmount: null,
            customTransportFeeAmount: null,
            customBooksFeeAmount: null,
            customAdmissionActivityMiscFeeAmount: null,
            customLateFeeFlatAmount: null,
            discountAmount: 0,
            customOtherFeeHeads: {},
            studentTypeOverride: null,
            transportAppliesOverride: null,
            otherAdjustmentAmount: null,
            otherAdjustmentHead: null,
            lateFeeWaiverAmount: 0,
            hasAnyOverride: false,
          },
        },
        status: "valid",
        reviewStatus: "approved",
        reviewNote: null,
        reviewedAt: null,
        anomalyCategories: [],
        errors: [],
        warnings: ["SR no is blank. A temporary SR no will be generated."],
        duplicateStudentId: null,
        targetStudentId: null,
        importOperation: "create",
        changedFields: [],
        importedStudentId: null,
        importedOverrideId: null,
      },
    ]);

    expect(insertPayloads).toHaveLength(0);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]?.filters).toEqual([
      ["id", "row-1"],
      ["batch_id", "batch-1"],
    ]);
    expect(updateCalls[0]?.payload).toMatchObject({
      status: "valid",
      review_status: "approved",
      warnings: ["SR no is blank. A temporary SR no will be generated."],
      duplicate_student_id: null,
      import_operation: "create",
    });
  });
});
