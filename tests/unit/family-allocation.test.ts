import { describe, expect, it } from "vitest";

import {
  buildProRataFamilyAllocations,
  getFamilyAllocationCredit,
  validateFamilyAllocationSum,
} from "@/lib/payments/family-allocation";

describe("family allocation helpers", () => {
  it("splits a family payment pro-rata and assigns rounding drift deterministically", () => {
    const allocations = buildProRataFamilyAllocations(
      [
        { studentId: "student-a", outstandingAmount: 100 },
        { studentId: "student-b", outstandingAmount: 100 },
        { studentId: "student-c", outstandingAmount: 100 },
      ],
      100,
    );

    expect(allocations.map((item) => item.allocatedAmount)).toEqual([34, 33, 33]);
    expect(validateFamilyAllocationSum(allocations, 100)).toEqual({ valid: true, driftAmount: 0 });
  });

  it("detects allocation drift exactly with integer math", () => {
    const validation = validateFamilyAllocationSum(
      [
        { allocatedAmount: 4000 },
        { allocatedAmount: 3000 },
      ],
      8000,
    );

    expect(validation).toEqual({ valid: false, driftAmount: -1000 });
  });

  it("detects per-child credit overflow", () => {
    expect(getFamilyAllocationCredit({ allocatedAmount: 7000, outstandingAmount: 5000 })).toBe(2000);
    expect(getFamilyAllocationCredit({ allocatedAmount: 3000, outstandingAmount: 5000 })).toBe(0);
  });

  it("keeps the sum invariant even when all children have zero pending", () => {
    const allocations = buildProRataFamilyAllocations(
      [
        { studentId: "student-a", outstandingAmount: 0 },
        { studentId: "student-b", outstandingAmount: 0 },
      ],
      101,
    );

    expect(allocations.map((item) => item.allocatedAmount)).toEqual([51, 50]);
    expect(allocations.map((item) => item.creditAmount)).toEqual([51, 50]);
    expect(validateFamilyAllocationSum(allocations, 101).valid).toBe(true);
  });
});
