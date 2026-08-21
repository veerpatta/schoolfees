import type {
  ConventionalDiscountCalculationType,
  ConventionalDiscountPolicy,
  StudentConventionalDiscountAssignment,
} from "@/lib/fees/types";

export type ThirdChildPolicyFamilyMember = {
  studentId: string;
  classSortOrder: number | null;
  classLabel?: string | null;
  admissionNo?: string | null;
};

function toWholeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function compareNullableText(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? "").localeCompare(right ?? "", "en-IN", {
    numeric: true,
    sensitivity: "base",
  });
}

export function selectThirdChildPolicyRecipient(
  members: ThirdChildPolicyFamilyMember[],
) {
  if (members.length < 3) {
    return null;
  }

  const [recipient = null] = [...members].sort((left, right) => {
    const leftOrder = left.classSortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.classSortOrder ?? Number.MAX_SAFE_INTEGER;

    return (
      leftOrder - rightOrder ||
      compareNullableText(left.classLabel, right.classLabel) ||
      compareNullableText(left.admissionNo, right.admissionNo) ||
      left.studentId.localeCompare(right.studentId)
    );
  });

  return recipient;
}

export function calculateConventionalPolicyTuition(payload: {
  baseTuition: number;
  policy: Pick<
    ConventionalDiscountPolicy,
    "calculationType" | "fixedTuitionAmount" | "percentage"
  >;
}) {
  const baseTuition = toWholeNumber(payload.baseTuition);

  if (payload.policy.calculationType === "tuition_zero") {
    return 0;
  }

  if (payload.policy.calculationType === "tuition_percentage") {
    const percentage = Math.max(0, Math.min(100, Number(payload.policy.percentage ?? 0)));
    return Math.round((baseTuition * percentage) / 100);
  }

  return toWholeNumber(payload.policy.fixedTuitionAmount);
}

/**
 * The school's three default policies. These codes are load-bearing — the domain
 * keys behaviour on them (e.g. `code === "third_child"` drives the sibling rule) —
 * so they are always treated as built-in and protected, regardless of the
 * `is_builtin` column value (which a pre-migration session copy might have missed).
 */
export const BUILTIN_CONVENTIONAL_DISCOUNT_CODES = [
  "rte",
  "staff_child",
  "third_child",
] as const;

export type BuiltinConventionalDiscountCode =
  (typeof BUILTIN_CONVENTIONAL_DISCOUNT_CODES)[number];

export function isBuiltinConventionalDiscountCode(code: string): boolean {
  return (BUILTIN_CONVENTIONAL_DISCOUNT_CODES as readonly string[]).includes(
    code.trim().toLowerCase(),
  );
}

/**
 * Must stay in sync with the DB CHECK in
 * `20260618053746_relax_conventional_discount_codes.sql`: a lowercase slug that
 * starts with a letter, followed by 1-47 of [a-z0-9_] (2-48 chars total).
 */
export const CONVENTIONAL_DISCOUNT_CODE_PATTERN = /^[a-z][a-z0-9_]{1,47}$/;

/** Best-effort slug from free text (e.g. "Sports Quota" -> "sports_quota"). */
export function normalizeConventionalDiscountCode(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export type ConventionalDiscountPolicyInput = {
  code: string;
  calculationType: ConventionalDiscountCalculationType;
  fixedTuitionAmount: number | null;
  percentage: number | null;
};

/**
 * Validates and normalises a discount-policy definition before it is written.
 * Throws with a staff-facing message on invalid input. Returns the cleaned
 * values (lowercased code, params zeroed for the irrelevant calculation type).
 */
export function validateConventionalDiscountPolicyInput(
  input: ConventionalDiscountPolicyInput,
): ConventionalDiscountPolicyInput {
  const code = input.code.trim().toLowerCase();

  if (!CONVENTIONAL_DISCOUNT_CODE_PATTERN.test(code)) {
    throw new Error(
      `Invalid discount code "${input.code}". Use a lowercase slug starting with a letter ` +
        `(letters, digits, underscores), for example "sports_quota".`,
    );
  }

  if (input.calculationType === "tuition_percentage") {
    const percentage = Number(input.percentage);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      throw new Error("Percentage discounts need a percentage between 0 and 100.");
    }
    return {
      code,
      calculationType: "tuition_percentage",
      percentage,
      fixedTuitionAmount: null,
    };
  }

  if (input.calculationType === "tuition_fixed_amount") {
    const fixedTuitionAmount = Number(input.fixedTuitionAmount);
    if (!Number.isFinite(fixedTuitionAmount) || fixedTuitionAmount < 0) {
      throw new Error("Fixed-amount discounts need a tuition amount of zero or more.");
    }
    return {
      code,
      calculationType: "tuition_fixed_amount",
      fixedTuitionAmount: Math.trunc(fixedTuitionAmount),
      percentage: null,
    };
  }

  return { code, calculationType: "tuition_zero", fixedTuitionAmount: null, percentage: null };
}

/**
 * Built-in protection: a built-in policy's `code` is immutable (the domain keys
 * behaviour on it). Custom policies are fully editable. Display name, amount,
 * percentage, active state, and sort order stay editable for built-ins too.
 */
export function assertConventionalDiscountPolicyMutationAllowed(check: {
  existingCode: string;
  existingIsBuiltin: boolean;
  nextCode: string;
}): void {
  const existingIsBuiltin =
    check.existingIsBuiltin || isBuiltinConventionalDiscountCode(check.existingCode);

  if (!existingIsBuiltin) {
    return;
  }

  if (check.nextCode.trim().toLowerCase() !== check.existingCode.trim().toLowerCase()) {
    throw new Error(
      `The built-in "${check.existingCode}" discount cannot be renamed. Built-in discount codes are fixed.`,
    );
  }
}

/**
 * Dedupes a student's selected policy ids and enforces the max-two-active rule
 * (also enforced by a DB trigger). Throws on more than two distinct selections.
 */
export function normalizeAssignmentPolicySelection(policyIds: string[]): string[] {
  const unique = Array.from(new Set(policyIds.map((id) => id.trim()).filter(Boolean)));

  if (unique.length > 2) {
    throw new Error("Select no more than two conventional discounts.");
  }

  return unique;
}

export function applyConventionalDiscountsToTuition(payload: {
  baseTuition: number;
  assignments: Pick<StudentConventionalDiscountAssignment, "policy">[];
}) {
  const baseTuition = toWholeNumber(payload.baseTuition);
  const activeAssignments = payload.assignments.filter((assignment) => assignment.policy.isActive);
  const candidates = activeAssignments.map((assignment) => ({
    label: assignment.policy.displayName,
    tuition: calculateConventionalPolicyTuition({
      baseTuition,
      policy: assignment.policy,
    }),
  }));
  const resultingTuition = candidates.length
    ? Math.min(baseTuition, ...candidates.map((candidate) => candidate.tuition))
    : baseTuition;

  return {
    beforeTuition: baseTuition,
    resultingTuition,
    discountApplied: Math.max(0, baseTuition - resultingTuition),
    appliedLabels: candidates.map((candidate) => candidate.label),
    candidates,
  };
}
