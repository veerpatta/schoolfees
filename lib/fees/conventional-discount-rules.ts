import type {
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
