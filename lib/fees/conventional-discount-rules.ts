import type {
  ConventionalDiscountPolicy,
  StudentConventionalDiscountAssignment,
} from "@/lib/fees/types";

function toWholeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
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
