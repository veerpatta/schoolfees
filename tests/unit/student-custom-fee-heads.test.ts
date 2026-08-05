import { describe, expect, it, vi } from "vitest";

import { resolveStudentPolicyBreakdown } from "@/lib/fees/policy";
import type {
  ClassFeeDefault,
  FeePolicySummary,
  SchoolFeeDefault,
  StudentConventionalDiscountAssignment,
  StudentFeeOverride,
} from "@/lib/fees/types";

vi.mock("server-only", () => ({}));

const POLICY: FeePolicySummary = {
  id: "policy-1",
  academicSessionLabel: "TEST-2026-27",
  calculationModel: "workbook_v1",
  installmentCount: 4,
  installmentSchedule: [
    { label: "Installment 1", dueDate: "2026-04-20", dueDateLabel: "20 April" },
    { label: "Installment 2", dueDate: "2026-07-20", dueDateLabel: "20 July" },
    { label: "Installment 3", dueDate: "2026-10-20", dueDateLabel: "20 October" },
    { label: "Installment 4", dueDate: "2027-01-20", dueDateLabel: "20 January" },
  ],
  lateFeeFlatAmount: 1000,
  lateFeeLabel: "Late fee",
  newStudentAcademicFeeAmount: 1100,
  oldStudentAcademicFeeAmount: 500,
  academicFeeDistribution: "first_only",
  acceptedPaymentModes: [],
  receiptPrefix: "SVP",
  customFeeHeads: [],
  notes: null,
};

const SCHOOL_DEFAULT: SchoolFeeDefault = {
  id: "school-1",
  tuitionFee: 10000,
  transportFee: 0,
  booksFee: 0,
  admissionActivityMiscFee: 0,
  customFeeHeadAmounts: {},
  studentTypeDefault: "existing",
  transportAppliesDefault: false,
  notes: null,
  updatedAt: null,
};

/** The user's worked example: a Class 3 student on ₹16,000 tuition. */
const CLASS_DEFAULT: ClassFeeDefault = {
  id: "fee-setting-3",
  classId: "class-3",
  classLabel: "Class 3",
  sessionLabel: "TEST-2026-27",
  tuitionFee: 16000,
  transportFee: 0,
  booksFee: 0,
  admissionActivityMiscFee: 0,
  customFeeHeadAmounts: {},
  annualTotal: 16000,
  studentTypeDefault: "existing",
  transportAppliesDefault: false,
  notes: null,
  updatedAt: "2026-04-01T00:00:00.000Z",
};

function buildOverride(
  partial: Partial<StudentFeeOverride> = {},
): StudentFeeOverride {
  return {
    id: "override-1",
    studentId: "student-1",
    studentLabel: "Test Student",
    classLabel: "Class 3",
    feeSettingId: "fee-setting-3",
    customTuitionFeeAmount: null,
    customTransportFeeAmount: null,
    customBooksFeeAmount: null,
    customAdmissionActivityMiscFeeAmount: null,
    customFeeHeadAmounts: {},
    customOtherFeeHeadLabels: {},
    customLateFeeFlatAmount: null,
    otherAdjustmentHead: null,
    otherAdjustmentAmount: null,
    lateFeeWaiverAmount: 0,
    discountAmount: 0,
    studentTypeOverride: null,
    transportAppliesOverride: null,
    reason: "Test",
    notes: null,
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...partial,
  };
}

/** Staff Child: tuition halved. */
const STAFF_CHILD_ASSIGNMENT = {
  policy: {
    id: "policy-staff",
    academicSessionLabel: "TEST-2026-27",
    code: "staff_child",
    displayName: "Staff Child",
    calculationType: "tuition_percentage" as const,
    fixedTuitionAmount: null,
    percentage: 50,
    isActive: true,
    isBuiltin: true,
    sortOrder: 2,
    updatedAt: null,
  },
} as StudentConventionalDiscountAssignment;

function resolve(
  studentOverride: StudentFeeOverride | null,
  assignments: StudentConventionalDiscountAssignment[] = [],
) {
  return resolveStudentPolicyBreakdown({
    policy: POLICY,
    schoolDefault: SCHOOL_DEFAULT,
    classDefault: CLASS_DEFAULT,
    routeDefault: null,
    studentOverride,
    conventionalDiscountAssignments: assignments,
    hasTransportRoute: false,
  });
}

function headAmount(
  breakdown: ReturnType<typeof resolve>["breakdown"],
  id: string,
) {
  return breakdown.coreHeads.find((head) => head.id === id)?.amount;
}

describe("custom tuition wins outright over conventional discounts", () => {
  it("uses the class default and still applies a conventional discount when no custom tuition is set", () => {
    const { breakdown } = resolve(buildOverride(), [STAFF_CHILD_ASSIGNMENT]);

    expect(breakdown.tuitionBeforeConventionalDiscount).toBe(16000);
    expect(headAmount(breakdown, "tuition_fee")).toBe(8000);
    expect(breakdown.conventionalDiscountApplied).toBe(8000);
    expect(breakdown.conventionalDiscountLabels).toEqual(["Staff Child"]);
  });

  it("ignores the conventional policy entirely once a custom tuition is set", () => {
    const { breakdown } = resolve(
      buildOverride({ customTuitionFeeAmount: 12000 }),
      [STAFF_CHILD_ASSIGNMENT],
    );

    expect(headAmount(breakdown, "tuition_fee")).toBe(12000);
    expect(breakdown.tuitionBeforeConventionalDiscount).toBe(12000);
    expect(breakdown.conventionalDiscountApplied).toBe(0);
    expect(breakdown.conventionalDiscountLabels).toEqual([]);
  });

  it("honours a custom tuition of zero rather than falling back to the class default", () => {
    const { breakdown } = resolve(buildOverride({ customTuitionFeeAmount: 0 }));

    expect(headAmount(breakdown, "tuition_fee")).toBe(0);
  });

  it("applies a custom transport amount over the route default", () => {
    const { breakdown } = resolve(
      buildOverride({ customTransportFeeAmount: 4500 }),
    );

    expect(headAmount(breakdown, "transport_fee")).toBe(4500);
  });
});

describe("per-student named fee heads", () => {
  it("expands each named head into its own row with its stored label", () => {
    const { breakdown } = resolve(
      buildOverride({
        customFeeHeadAmounts: { uniform_adj: 800, lab_fee: 1200 },
        customOtherFeeHeadLabels: {
          uniform_adj: "Uniform adj.",
          lab_fee: "Lab fee",
        },
      }),
    );

    expect(breakdown.otherAdjustmentHeads).toEqual([
      { id: "uniform_adj", label: "Uniform adj.", amount: 800 },
      { id: "lab_fee", label: "Lab fee", amount: 1200 },
    ]);

    const labels = breakdown.coreHeads.map((head) => head.label);
    expect(labels).toContain("Uniform adj.");
    expect(labels).toContain("Lab fee");
    // The collapsed placeholder row is replaced, not accompanied.
    expect(labels).not.toContain("Other fee / adjustment");
  });

  it("falls back to a title-cased slug when no label was stored", () => {
    const { breakdown } = resolve(
      buildOverride({ customFeeHeadAmounts: { lab_fee: 1200 } }),
    );

    expect(breakdown.otherAdjustmentHeads).toEqual([
      { id: "lab_fee", label: "Lab Fee", amount: 1200 },
    ]);
  });

  it("never double-counts: the named heads sum to otherAdjustmentAmount", () => {
    const { breakdown } = resolve(
      buildOverride({
        customFeeHeadAmounts: { uniform_adj: 800, lab_fee: 1200 },
        customOtherFeeHeadLabels: { uniform_adj: "Uniform adj." },
      }),
    );

    const headsTotal = breakdown.otherAdjustmentHeads.reduce(
      (sum, head) => sum + head.amount,
      0,
    );

    expect(headsTotal).toBe(breakdown.otherAdjustmentAmount);
    expect(breakdown.otherAdjustmentAmount).toBe(2000);
    // Named heads are display-only decoration over the same scalar, so the
    // totals must be byte-identical to the collapsed baseline.
    expect(breakdown.grossBaseBeforeDiscount).toBe(16000 + 500 + 2000);
    expect(breakdown.annualTotal).toBe(16000 + 500 + 2000);
    // They must not leak into customHeads, which display rows also render.
    expect(breakdown.customHeads).toEqual([]);
  });

  it("agrees with the SQL view: the scalar other_adjustment_amount wins over the jsonb", () => {
    // v_workbook_student_financials prefers other_adjustment_amount and only
    // falls back to summing custom_other_fee_heads. The resolver must match, or
    // the fee table and the workbook projection disagree.
    const { breakdown } = resolve(
      buildOverride({
        customFeeHeadAmounts: { uniform_adj: 800, lab_fee: 1200 },
        otherAdjustmentHead: "Manual adjustment",
        otherAdjustmentAmount: 500,
      }),
    );

    expect(breakdown.otherAdjustmentAmount).toBe(500);
    expect(breakdown.otherAdjustmentHeads).toEqual([]);
    expect(headAmount(breakdown, "other_adjustment")).toBe(500);
  });

  it("keeps the single collapsed row when the student has no named heads", () => {
    const { breakdown } = resolve(buildOverride());

    expect(breakdown.otherAdjustmentHeads).toEqual([]);
    expect(headAmount(breakdown, "other_adjustment")).toBe(0);
  });
});
