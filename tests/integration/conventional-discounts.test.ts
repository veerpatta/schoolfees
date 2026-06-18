import { describe, expect, it } from "vitest";

import {
  applyConventionalDiscountsToTuition,
  calculateConventionalPolicyTuition,
  selectThirdChildPolicyRecipient,
} from "@/lib/fees/conventional-discount-rules";
import type {
  ConventionalDiscountCalculationType,
  ConventionalDiscountPolicy,
  StudentConventionalDiscountAssignment,
} from "@/lib/fees/types";

function policy(
  code: string,
  calculationType: ConventionalDiscountCalculationType,
  overrides: Partial<ConventionalDiscountPolicy> = {},
): ConventionalDiscountPolicy {
  return {
    id: code,
    academicSessionLabel: "2026-27",
    code,
    displayName: overrides.displayName ?? code,
    calculationType,
    fixedTuitionAmount: overrides.fixedTuitionAmount ?? null,
    percentage: overrides.percentage ?? null,
    isActive: overrides.isActive ?? true,
    isBuiltin: overrides.isBuiltin ?? false,
    sortOrder: 1,
    updatedAt: null,
  };
}

function assignment(policyValue: ConventionalDiscountPolicy) {
  return {
    policy: policyValue,
  } as Pick<StudentConventionalDiscountAssignment, "policy">;
}

describe("conventional discount rules", () => {
  it("sets RTE tuition to zero", () => {
    expect(
      calculateConventionalPolicyTuition({
        baseTuition: 38000,
        policy: policy("rte", "tuition_zero"),
      }),
    ).toBe(0);
  });

  it("halves tuition for staff child", () => {
    expect(
      calculateConventionalPolicyTuition({
        baseTuition: 38000,
        policy: policy("staff_child", "tuition_percentage", { percentage: 50 }),
      }),
    ).toBe(19000);
  });

  it("sets third child tuition to the configured fixed amount", () => {
    expect(
      calculateConventionalPolicyTuition({
        baseTuition: 38000,
        policy: policy("third_child", "tuition_fixed_amount", { fixedTuitionAmount: 6000 }),
      }),
    ).toBe(6000);
  });

  it("uses the lowest tuition when multiple policies apply", () => {
    const result = applyConventionalDiscountsToTuition({
      baseTuition: 38000,
      assignments: [
        assignment(policy("staff_child", "tuition_percentage", { percentage: 50 })),
        assignment(policy("third_child", "tuition_fixed_amount", { fixedTuitionAmount: 6000 })),
      ],
    });

    expect(result.resultingTuition).toBe(6000);
    expect(result.discountApplied).toBe(32000);
  });

  it("lets RTE win with any other policy", () => {
    const result = applyConventionalDiscountsToTuition({
      baseTuition: 38000,
      assignments: [
        assignment(policy("rte", "tuition_zero")),
        assignment(policy("third_child", "tuition_fixed_amount", { fixedTuitionAmount: 6000 })),
      ],
    });

    expect(result.resultingTuition).toBe(0);
  });

  it("only changes tuition and leaves transport and academic fees outside the rule result", () => {
    const transportFee = 12000;
    const academicFee = 3000;
    const result = applyConventionalDiscountsToTuition({
      baseTuition: 38000,
      assignments: [assignment(policy("third_child", "tuition_fixed_amount", { fixedTuitionAmount: 6000 }))],
    });

    expect(result.resultingTuition + transportFee + academicFee).toBe(21000);
    expect(result.discountApplied).toBe(32000);
  });

  it("ignores inactive conventional policies", () => {
    const result = applyConventionalDiscountsToTuition({
      baseTuition: 38000,
      assignments: [
        assignment(policy("rte", "tuition_zero", { isActive: false })),
        assignment(policy("staff_child", "tuition_percentage", { percentage: 50 })),
      ],
    });

    expect(result.resultingTuition).toBe(19000);
  });

  it("selects only the sibling in the smallest class for the 3rd Child Policy", () => {
    const recipient = selectThirdChildPolicyRecipient([
      { studentId: "class-8-child", classSortOrder: 11, classLabel: "Class 8", admissionNo: "A-8" },
      { studentId: "class-2-child", classSortOrder: 5, classLabel: "Class 2", admissionNo: "A-2" },
      { studentId: "class-6-child", classSortOrder: 9, classLabel: "Class 6", admissionNo: "A-6" },
      { studentId: "class-4-child", classSortOrder: 7, classLabel: "Class 4", admissionNo: "A-4" },
    ]);

    expect(recipient?.studentId).toBe("class-2-child");
  });

  it("does not select a 3rd Child Policy recipient when fewer than three siblings are active", () => {
    expect(
      selectThirdChildPolicyRecipient([
        { studentId: "class-2-child", classSortOrder: 5, classLabel: "Class 2", admissionNo: "A-2" },
        { studentId: "class-6-child", classSortOrder: 9, classLabel: "Class 6", admissionNo: "A-6" },
      ]),
    ).toBeNull();
  });
});
