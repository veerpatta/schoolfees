import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FamilyPaymentClient } from "@/components/payments/family-payment-client";
import { buildProRataFamilyAllocations, validateFamilyAllocationSum } from "@/lib/payments/family-allocation";
import type { FamilyPaymentActionState, FamilyPaymentEntryPageData } from "@/lib/payments/types";

const noopAction = async (
  previous: FamilyPaymentActionState,
  formData: FormData,
): Promise<FamilyPaymentActionState> => {
  void formData;
  return previous;
};

function pageData(): FamilyPaymentEntryPageData {
  return {
    familyGroupId: "11111111-1111-4111-8111-111111111111",
    sessionLabel: "TEST-2026-27",
    familyLabel: "Family SR001/SR002",
    guardianName: "TEST Guardian",
    guardianPhone: "8123456789",
    paymentDate: "2026-05-21",
    totalOutstanding: 9000,
    modeOptions: [{ value: "cash", label: "Cash" }],
    children: [
      {
        studentId: "22222222-2222-4222-8222-222222222222",
        fullName: "TEST Student One",
        admissionNo: "SR001",
        classLabel: "Class 1",
        outstandingAmount: 6000,
        defaultAllocatedAmount: 6000,
        conventionalDiscountAssignments: [],
      },
      {
        studentId: "33333333-3333-4333-8333-333333333333",
        fullName: "TEST Student Two",
        admissionNo: "SR002",
        classLabel: "Class 2",
        outstandingAmount: 3000,
        defaultAllocatedAmount: 3000,
        conventionalDiscountAssignments: [],
      },
    ],
  };
}

describe("family statement client", () => {
  it("renders family children and the one-receipt-per-child confirmation", () => {
    const html = renderToStaticMarkup(<FamilyPaymentClient data={pageData()} action={noopAction} />);

    expect(html).toContain("Family Statement");
    expect(html).toContain("TEST Student One");
    expect(html).toContain("TEST Student Two");
    expect(html).toContain("One receipt will be created per child");
  });

  it("keeps the default allocation sum invariant", () => {
    const allocations = buildProRataFamilyAllocations(
      [
        { studentId: "student-a", outstandingAmount: 6000 },
        { studentId: "student-b", outstandingAmount: 3000 },
      ],
      9000,
    );

    expect(validateFamilyAllocationSum(allocations, 9000).valid).toBe(true);
  });
});
