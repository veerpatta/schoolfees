import { describe, expect, it } from "vitest";

import {
  BUILTIN_CONVENTIONAL_DISCOUNT_CODES,
  CONVENTIONAL_DISCOUNT_CODE_PATTERN,
  assertConventionalDiscountPolicyMutationAllowed,
  isBuiltinConventionalDiscountCode,
  normalizeAssignmentPolicySelection,
  normalizeConventionalDiscountCode,
  validateConventionalDiscountPolicyInput,
} from "@/lib/fees/conventional-discount-rules";

describe("isBuiltinConventionalDiscountCode", () => {
  it("recognises the three school defaults regardless of case/whitespace", () => {
    for (const code of BUILTIN_CONVENTIONAL_DISCOUNT_CODES) {
      expect(isBuiltinConventionalDiscountCode(code)).toBe(true);
    }
    expect(isBuiltinConventionalDiscountCode("  RTE ")).toBe(true);
  });

  it("treats custom codes as not built-in", () => {
    expect(isBuiltinConventionalDiscountCode("sports_quota")).toBe(false);
    expect(isBuiltinConventionalDiscountCode("staff")).toBe(false);
  });
});

describe("conventional discount code format", () => {
  it("accepts the built-in codes and well-formed custom slugs", () => {
    for (const code of [...BUILTIN_CONVENTIONAL_DISCOUNT_CODES, "sports_quota", "sibling_2026"]) {
      expect(CONVENTIONAL_DISCOUNT_CODE_PATTERN.test(code)).toBe(true);
    }
  });

  it("rejects uppercase, leading digits, spaces, and leading underscores", () => {
    for (const code of ["RTE", "3rd_child", "sports quota", "_quota", "x"]) {
      expect(CONVENTIONAL_DISCOUNT_CODE_PATTERN.test(code)).toBe(false);
    }
  });

  it("normalises free text into a valid slug", () => {
    expect(normalizeConventionalDiscountCode("Sports Quota")).toBe("sports_quota");
    expect(normalizeConventionalDiscountCode("  Staff-Child  ")).toBe("staff_child");
    expect(normalizeConventionalDiscountCode("EWS / BPL")).toBe("ews_bpl");
  });
});

describe("validateConventionalDiscountPolicyInput", () => {
  it("lowercases the code and zeroes irrelevant params for tuition_zero", () => {
    expect(
      validateConventionalDiscountPolicyInput({
        code: "Free_Seat",
        calculationType: "tuition_zero",
        fixedTuitionAmount: 500,
        percentage: 25,
      }),
    ).toEqual({
      code: "free_seat",
      calculationType: "tuition_zero",
      fixedTuitionAmount: null,
      percentage: null,
    });
  });

  it("keeps the percentage and drops the fixed amount for tuition_percentage", () => {
    expect(
      validateConventionalDiscountPolicyInput({
        code: "staff_child",
        calculationType: "tuition_percentage",
        fixedTuitionAmount: 6000,
        percentage: 50,
      }),
    ).toEqual({
      code: "staff_child",
      calculationType: "tuition_percentage",
      fixedTuitionAmount: null,
      percentage: 50,
    });
  });

  it("truncates the fixed amount and drops the percentage for tuition_fixed_amount", () => {
    expect(
      validateConventionalDiscountPolicyInput({
        code: "third_child",
        calculationType: "tuition_fixed_amount",
        fixedTuitionAmount: 6000.9,
        percentage: 10,
      }),
    ).toEqual({
      code: "third_child",
      calculationType: "tuition_fixed_amount",
      fixedTuitionAmount: 6000,
      percentage: null,
    });
  });

  it("rejects an invalid slug code", () => {
    expect(() =>
      validateConventionalDiscountPolicyInput({
        code: "3rd Child",
        calculationType: "tuition_zero",
        fixedTuitionAmount: null,
        percentage: null,
      }),
    ).toThrow(/Invalid discount code/);
  });

  it("rejects an out-of-range percentage", () => {
    expect(() =>
      validateConventionalDiscountPolicyInput({
        code: "half_off",
        calculationType: "tuition_percentage",
        fixedTuitionAmount: null,
        percentage: 150,
      }),
    ).toThrow(/between 0 and 100/);
  });

  it("rejects a negative fixed amount", () => {
    expect(() =>
      validateConventionalDiscountPolicyInput({
        code: "concession",
        calculationType: "tuition_fixed_amount",
        fixedTuitionAmount: -1,
        percentage: null,
      }),
    ).toThrow(/zero or more/);
  });
});

describe("assertConventionalDiscountPolicyMutationAllowed (built-in protection)", () => {
  it("blocks renaming a built-in policy", () => {
    expect(() =>
      assertConventionalDiscountPolicyMutationAllowed({
        existingCode: "rte",
        existingIsBuiltin: true,
        nextCode: "rte_custom",
      }),
    ).toThrow(/cannot be renamed/);
  });

  it("protects built-ins even if the is_builtin column was missed (code fallback)", () => {
    expect(() =>
      assertConventionalDiscountPolicyMutationAllowed({
        existingCode: "third_child",
        existingIsBuiltin: false,
        nextCode: "renamed",
      }),
    ).toThrow(/cannot be renamed/);
  });

  it("allows re-saving a built-in with the same code", () => {
    expect(() =>
      assertConventionalDiscountPolicyMutationAllowed({
        existingCode: "staff_child",
        existingIsBuiltin: true,
        nextCode: "staff_child",
      }),
    ).not.toThrow();
  });

  it("allows renaming a custom policy", () => {
    expect(() =>
      assertConventionalDiscountPolicyMutationAllowed({
        existingCode: "sports_quota",
        existingIsBuiltin: false,
        nextCode: "sports_concession",
      }),
    ).not.toThrow();
  });
});

describe("normalizeAssignmentPolicySelection (max two active)", () => {
  it("dedupes and trims ids", () => {
    expect(normalizeAssignmentPolicySelection([" a ", "a", "b", ""])).toEqual(["a", "b"]);
  });

  it("allows up to two distinct policies", () => {
    expect(normalizeAssignmentPolicySelection(["a", "b"])).toEqual(["a", "b"]);
  });

  it("throws when more than two distinct policies are selected", () => {
    expect(() => normalizeAssignmentPolicySelection(["a", "b", "c"])).toThrow(
      /no more than two/,
    );
  });
});
