import { describe, expect, it } from "vitest";

import {
  applyConventionalDiscountsToTuition,
  calculateConventionalPolicyTuition,
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
});
