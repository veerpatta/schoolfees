import { describe, expect, it } from "vitest";

import {
  buildWorkbookStudentKey,
  buildWorkbookStudentMasterCalculation,
  WORKBOOK_CLASS_TUITION_DEFAULTS,
} from "@/lib/fees/workbook";

const dueDates = ["2026-04-20", "2026-07-20", "2026-10-20", "2027-01-20"];

function calculate(
  patch: Partial<Parameters<typeof buildWorkbookStudentMasterCalculation>[0]> = {},
) {
  return buildWorkbookStudentMasterCalculation({
    classLabel: "Class 1",
    studentName: "Test Student",
    admissionNo: "TEST-SR-001",
    installmentDueDates: dueDates,
    lateFeeFlatAmount: 1000,
    tuitionFee: 18000,
    transportFee: 0,
    academicFee: 500,
    otherAdjustmentAmount: 0,
    discountAmount: 0,
    lateFeeWaiverAmount: 0,
    payments: [],
    today: "2026-04-21",
    ...patch,
  });
}

describe("workbook parity formula cases", () => {
  it("calculates an old student with no transport and no override", () => {
    const result = calculate();

    expect(result.baseTotalDue).toBe(18500);
    expect(result.installmentBase).toEqual([5000, 4500, 4500, 4500]);
    expect(result.outstanding).toBe(18500);
    expect(result.status).toBe("NOT STARTED");
  });

  it("charges new student academic fee fully in installment 1", () => {
    const result = calculate({ academicFee: 1100 });

    expect(result.baseTotalDue).toBe(19100);
    expect(result.installmentBase).toEqual([5600, 4500, 4500, 4500]);
  });

  it("adds selected transport route fee", () => {
    const result = calculate({ transportFee: 5500 });

    expect(result.transportFee).toBe(5500);
    expect(result.baseTotalDue).toBe(24000);
  });

  it("uses tuition override instead of class tuition", () => {
    const result = calculate({ tuitionFee: 12000 });

    expect(result.tuitionRate).toBe(12000);
    expect(result.baseTotalDue).toBe(12500);
  });

  it("uses transport override instead of route default", () => {
    const result = calculate({ transportFee: 3000 });

    expect(result.transportFee).toBe(3000);
    expect(result.baseTotalDue).toBe(21500);
  });

  it("caps discount at gross base", () => {
    const result = calculate({ discountAmount: 99999 });

    expect(result.discountApplied).toBe(18500);
    expect(result.baseTotalDue).toBe(0);
    expect(result.status).toBe("");
  });

  it("accepts positive other fee", () => {
    const result = calculate({ otherAdjustmentAmount: 1500 });

    expect(result.grossBaseBeforeDiscount).toBe(20000);
    expect(result.baseTotalDue).toBe(20000);
  });

  it("accepts negative other adjustment", () => {
    const result = calculate({ otherAdjustmentAmount: -1000 });

    expect(result.grossBaseBeforeDiscount).toBe(17500);
    expect(result.baseTotalDue).toBe(17500);
  });

  it("adds late fee only after a late payment happens", () => {
    const noPayment = calculate({ today: "2026-05-01" });
    const latePayment = calculate({
      payments: [{ paymentDate: "2026-04-25", amount: 1000 }],
      today: "2026-05-01",
    });

    expect(noPayment.lateFeeTotal).toBe(0);
    expect(latePayment.rawLateFees).toEqual([1000, 0, 0, 0]);
    expect(latePayment.outstanding).toBe(18500);
  });

  it("distributes late fee waiver in installment order", () => {
    const result = calculate({
      payments: [
        { paymentDate: "2026-04-25", amount: 1000 },
        { paymentDate: "2026-07-25", amount: 1000 },
      ],
      lateFeeWaiverAmount: 1500,
      today: "2026-08-01",
    });

    expect(result.rawLateFees.slice(0, 2)).toEqual([1000, 1000]);
    expect(result.lateFeeWaiverApplied.slice(0, 2)).toEqual([1000, 500]);
    expect(result.finalLateFees.slice(0, 2)).toEqual([0, 500]);
  });

  it("builds workbook key for blank SR from DOB or name", () => {
    expect(
      buildWorkbookStudentKey({
        classLabel: "Class 1",
        studentName: "Test Student",
        admissionNo: "",
        dateOfBirth: "2020-03-01",
      }),
    ).toBe("Class 1|Test Student|01032020");

    expect(
      buildWorkbookStudentKey({
        classLabel: "Class 1",
        studentName: "Test Student",
        admissionNo: "",
      }),
    ).toBe("Class 1|Test Student");
  });

  it("keeps Class 12 Science tuition at 38000", () => {
    expect(
      WORKBOOK_CLASS_TUITION_DEFAULTS.find((row) => row.label === "12 Science")
        ?.annualTuition,
    ).toBe(38000);
  });

  it("sends odd rupee split to installment 4", () => {
    const result = calculate({ tuitionFee: 18001 });

    expect(result.installmentBase).toEqual([5000, 4500, 4500, 4501]);
  });

  it("allocates total paid oldest due first", () => {
    const result = calculate({
      payments: [{ paymentDate: "2026-04-10", amount: 7000 }],
      today: "2026-04-21",
    });

    expect(result.paidByInstallment).toEqual([5000, 2000, 0, 0]);
    expect(result.pendingByInstallment).toEqual([0, 2500, 4500, 4500]);
  });
});
