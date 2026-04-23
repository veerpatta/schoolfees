import { describe, expect, it } from "vitest";

import {
  buildWorkbookInstallmentCharges,
  buildWorkbookStatus,
  distributeLateFeeWaiver,
  normalizeWorkbookClassLabel,
} from "@/lib/fees/workbook";

describe("workbook fee helpers", () => {
  it("normalizes workbook class aliases", () => {
    expect(normalizeWorkbookClassLabel("1st")).toBe("Class 1");
    expect(normalizeWorkbookClassLabel("XI Science")).toBe("11 Science");
    expect(normalizeWorkbookClassLabel("xii commerce")).toBe("12 Commerce");
  });

  it("puts the academic fee fully into installment 1 and remainder into installment 4", () => {
    expect(
      buildWorkbookInstallmentCharges({
        installmentCount: 4,
        tuitionFee: 16001,
        transportFee: 0,
        academicFee: 1100,
        otherAdjustmentAmount: 0,
        discountAmount: 0,
      }).installmentCharges,
    ).toEqual([5100, 4000, 4000, 4001]);
  });

  it("caps the discount to the workbook gross base", () => {
    const result = buildWorkbookInstallmentCharges({
      installmentCount: 4,
      tuitionFee: 1000,
      transportFee: 0,
      academicFee: 500,
      otherAdjustmentAmount: -700,
      discountAmount: 2000,
    });

    expect(result.grossBaseBeforeDiscount).toBe(800);
    expect(result.discountApplied).toBe(800);
    expect(result.baseTotalDue).toBe(0);
    expect(result.installmentCharges).toEqual([0, 0, 0, 0]);
  });

  it("caps and distributes late fee waiver installment by installment", () => {
    expect(
      distributeLateFeeWaiver({
        rawLateFees: [1000, 1000, 500, 0],
        waiverAmount: 1800,
      }),
    ).toEqual([
      { rawLateFee: 1000, appliedWaiver: 1000, finalLateFee: 0 },
      { rawLateFee: 1000, appliedWaiver: 800, finalLateFee: 200 },
      { rawLateFee: 500, appliedWaiver: 0, finalLateFee: 500 },
      { rawLateFee: 0, appliedWaiver: 0, finalLateFee: 0 },
    ]);
  });

  it("builds workbook payment status using next due and paid position", () => {
    expect(
      buildWorkbookStatus({
        totalDueIncludingLate: 100,
        totalPaid: 0,
        outstandingAmount: 100,
        nextDueDate: "2026-04-20",
        today: "2026-04-10",
      }),
    ).toBe("NOT STARTED");

    expect(
      buildWorkbookStatus({
        totalDueIncludingLate: 100,
        totalPaid: 40,
        outstandingAmount: 60,
        nextDueDate: "2026-04-20",
        today: "2026-04-10",
      }),
    ).toBe("PARTLY PAID");

    expect(
      buildWorkbookStatus({
        totalDueIncludingLate: 100,
        totalPaid: 40,
        outstandingAmount: 60,
        nextDueDate: "2026-04-20",
        today: "2026-04-25",
      }),
    ).toBe("OVERDUE");

    expect(
      buildWorkbookStatus({
        totalDueIncludingLate: 100,
        totalPaid: 100,
        outstandingAmount: 0,
        nextDueDate: null,
        today: "2026-04-25",
      }),
    ).toBe("PAID");
  });
});
