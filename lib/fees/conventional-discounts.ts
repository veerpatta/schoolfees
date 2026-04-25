import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { calculateConventionalPolicyTuition } from "@/lib/fees/conventional-discount-rules";
import type {
  ConventionalDiscountCalculationType,
  ConventionalDiscountPolicy,
  StudentConventionalDiscountAssignment,
} from "@/lib/fees/types";
export {
  applyConventionalDiscountsToTuition,
  calculateConventionalPolicyTuition,
} from "@/lib/fees/conventional-discount-rules";

type DiscountPolicyRow = {
  id: string;
  academic_session_label: string;
  code: string;
  display_name: string;
  calculation_type: ConventionalDiscountCalculationType;
  fixed_tuition_amount: number | null;
  percentage: number | null;
  is_active: boolean;
  sort_order: number;
  updated_at: string | null;
};

type DiscountAssignmentRow = {
  id: string;
  student_id: string;
  policy_id: string;
  academic_session_label: string;
  is_active: boolean;
  reason: string;
  notes: string | null;
  before_tuition_amount: number;
  resulting_tuition_amount: number;
  family_group_id: string | null;
  is_manual_override: boolean | null;
  manual_override_reason: string | null;
  applied_by: string | null;
  applied_at: string | null;
  policy_ref: DiscountPolicyRow | DiscountPolicyRow[] | null;
  family_group_ref: { family_label: string } | { family_label: string }[] | null;
};

export const DEFAULT_CONVENTIONAL_DISCOUNT_POLICIES = [
  {
    code: "rte",
    displayName: "RTE",
    calculationType: "tuition_zero",
    fixedTuitionAmount: null,
    percentage: null,
    sortOrder: 1,
  },
  {
    code: "staff_child",
    displayName: "Staff Child",
    calculationType: "tuition_percentage",
    fixedTuitionAmount: null,
    percentage: 50,
    sortOrder: 2,
  },
  {
    code: "third_child",
    displayName: "3rd Child Policy",
    calculationType: "tuition_fixed_amount",
    fixedTuitionAmount: 6000,
    percentage: null,
    sortOrder: 3,
  },
] as const;

function toSingleRecord<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function isMissingTableError(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || message.includes("does not exist");
}

function toWholeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function toPolicy(row: DiscountPolicyRow): ConventionalDiscountPolicy {
  return {
    id: row.id,
    academicSessionLabel: row.academic_session_label,
    code: row.code,
    displayName: row.display_name,
    calculationType: row.calculation_type,
    fixedTuitionAmount: row.fixed_tuition_amount,
    percentage: row.percentage,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
}

function buildFallbackPolicies(sessionLabel: string): ConventionalDiscountPolicy[] {
  return DEFAULT_CONVENTIONAL_DISCOUNT_POLICIES.map((policy) => ({
    id: null,
    academicSessionLabel: sessionLabel,
    code: policy.code,
    displayName: policy.displayName,
    calculationType: policy.calculationType,
    fixedTuitionAmount: policy.fixedTuitionAmount,
    percentage: policy.percentage,
    isActive: true,
    sortOrder: policy.sortOrder,
    updatedAt: null,
  }));
}

export async function getConventionalDiscountPolicies(sessionLabel: string) {
  const normalizedSession = sessionLabel.trim();
  if (!normalizedSession) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conventional_discount_policies")
    .select(
      "id, academic_session_label, code, display_name, calculation_type, fixed_tuition_amount, percentage, is_active, sort_order, updated_at",
    )
    .eq("academic_session_label", normalizedSession)
    .order("sort_order", { ascending: true });

  if (error) {
    if (isMissingTableError(error)) {
      return buildFallbackPolicies(normalizedSession);
    }
    throw new Error(`Unable to load conventional discount policies: ${error.message}`);
  }

  const rows = (data ?? []) as DiscountPolicyRow[];
  return rows.length > 0 ? rows.map(toPolicy) : buildFallbackPolicies(normalizedSession);
}

export async function getStudentConventionalDiscountAssignments(payload: {
  academicSessionLabel: string;
  studentIds?: string[];
}) {
  const normalizedSession = payload.academicSessionLabel.trim();
  if (!normalizedSession) {
    return [];
  }

  const supabase = await createClient();
  let query = supabase
    .from("student_conventional_discount_assignments")
    .select(
      "id, student_id, policy_id, academic_session_label, is_active, reason, notes, before_tuition_amount, resulting_tuition_amount, family_group_id, is_manual_override, manual_override_reason, applied_by, applied_at, policy_ref:conventional_discount_policies(id, academic_session_label, code, display_name, calculation_type, fixed_tuition_amount, percentage, is_active, sort_order, updated_at), family_group_ref:student_family_groups(family_label)",
    )
    .eq("academic_session_label", normalizedSession)
    .eq("is_active", true)
    .order("applied_at", { ascending: true });

  if (payload.studentIds && payload.studentIds.length > 0) {
    query = query.in("student_id", payload.studentIds);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    throw new Error(`Unable to load student conventional discounts: ${error.message}`);
  }

  return ((data ?? []) as DiscountAssignmentRow[])
    .map((row) => {
      const policy = toSingleRecord(row.policy_ref);
      if (!policy) {
        return null;
      }
      const familyGroup = toSingleRecord(row.family_group_ref);

      return {
        id: row.id,
        studentId: row.student_id,
        policyId: row.policy_id,
        academicSessionLabel: row.academic_session_label,
        isActive: row.is_active,
        reason: row.reason,
        notes: row.notes,
        beforeTuitionAmount: row.before_tuition_amount,
        resultingTuitionAmount: row.resulting_tuition_amount,
        familyGroupId: row.family_group_id,
        familyGroupLabel: familyGroup?.family_label ?? null,
        isManualOverride: Boolean(row.is_manual_override),
        manualOverrideReason: row.manual_override_reason,
        appliedBy: row.applied_by,
        appliedAt: row.applied_at,
        policy: toPolicy(policy),
      } satisfies StudentConventionalDiscountAssignment;
    })
    .filter((row): row is StudentConventionalDiscountAssignment => Boolean(row));
}

async function findOrCreateFamilyGroup(payload: {
  academicSessionLabel: string;
  familyLabel: string;
  guardianName: string | null;
  guardianPhone: string | null;
}) {
  const supabase = createAdminClient();
  const familyLabel = payload.familyLabel.trim();

  if (!familyLabel) {
    return null;
  }

  const { data: existing, error: existingError } = await supabase
    .from("student_family_groups")
    .select("id")
    .eq("academic_session_label", payload.academicSessionLabel)
    .ilike("family_label", familyLabel)
    .maybeSingle();

  if (existingError && !isMissingTableError(existingError)) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("student_family_groups")
    .insert({
      academic_session_label: payload.academicSessionLabel,
      family_label: familyLabel,
      guardian_name: payload.guardianName,
      guardian_phone: payload.guardianPhone,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id as string;
}

export async function saveStudentConventionalDiscountAssignments(payload: {
  studentId: string;
  academicSessionLabel: string;
  policyIds: string[];
  reason: string;
  notes: string | null;
  baseTuition: number;
  familyGroupLabel?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  manualOverrideReason?: string | null;
}) {
  const academicSessionLabel = payload.academicSessionLabel.trim();
  const policyIds = Array.from(new Set(payload.policyIds.filter(Boolean))).slice(0, 2);
  const reason = payload.reason.trim();

  if (policyIds.length > 2) {
    throw new Error("Select no more than two conventional discounts.");
  }

  if (policyIds.length > 0 && !reason) {
    throw new Error("Reason is required for conventional discounts.");
  }

  const supabase = createAdminClient();
  const { data: policiesRaw, error: policiesError } = await supabase
    .from("conventional_discount_policies")
    .select(
      "id, academic_session_label, code, display_name, calculation_type, fixed_tuition_amount, percentage, is_active, sort_order, updated_at",
    )
    .eq("academic_session_label", academicSessionLabel)
    .eq("is_active", true)
    .in("id", policyIds);

  if (policiesError) {
    throw new Error(policiesError.message);
  }

  const policies = ((policiesRaw ?? []) as DiscountPolicyRow[]).map(toPolicy);
  if (policies.length !== policyIds.length) {
    throw new Error("One or more selected discounts are not active for this academic year.");
  }

  const needsThirdChild = policies.some((policy) => policy.code === "third_child");
  const manualOverrideReason = payload.manualOverrideReason?.trim() || null;
  const familyGroupLabel = payload.familyGroupLabel?.trim() || null;
  if (needsThirdChild && !familyGroupLabel && !manualOverrideReason) {
    throw new Error("3rd Child Policy needs a sibling group or an override reason.");
  }

  const familyGroupId = familyGroupLabel
    ? await findOrCreateFamilyGroup({
        academicSessionLabel,
        familyLabel: familyGroupLabel,
        guardianName: payload.guardianName ?? null,
        guardianPhone: payload.guardianPhone ?? null,
      })
    : null;

  if (familyGroupId) {
    await supabase
      .from("student_family_members")
      .upsert(
        {
          family_group_id: familyGroupId,
          student_id: payload.studentId,
          academic_session_label: academicSessionLabel,
          is_policy_candidate: needsThirdChild,
          manual_order_override: Boolean(manualOverrideReason),
        },
        { onConflict: "family_group_id,student_id,academic_session_label" },
      );
  }

  const { error: deactivateError } = await supabase
    .from("student_conventional_discount_assignments")
    .update({ is_active: false })
    .eq("student_id", payload.studentId)
    .eq("academic_session_label", academicSessionLabel)
    .eq("is_active", true)
    .not("policy_id", "in", `(${policyIds.join(",") || "00000000-0000-0000-0000-000000000000"})`);

  if (deactivateError) {
    throw new Error(deactivateError.message);
  }

  for (const policy of policies) {
    const resultingTuition = calculateConventionalPolicyTuition({
      baseTuition: payload.baseTuition,
      policy,
    });
    const rowValues = {
      student_id: payload.studentId,
      policy_id: policy.id,
      academic_session_label: academicSessionLabel,
      is_active: true,
      reason,
      notes: payload.notes,
      before_tuition_amount: toWholeNumber(payload.baseTuition),
      resulting_tuition_amount: resultingTuition,
      calculation_snapshot: {
        policyCode: policy.code,
        policyName: policy.displayName,
        calculationType: policy.calculationType,
        fixedTuitionAmount: policy.fixedTuitionAmount,
        percentage: policy.percentage,
        beforeTuitionAmount: toWholeNumber(payload.baseTuition),
        resultingTuitionAmount: resultingTuition,
      },
      family_group_id: policy.code === "third_child" ? familyGroupId : null,
      is_manual_override: Boolean(manualOverrideReason),
      manual_override_reason: manualOverrideReason,
      applied_at: new Date().toISOString(),
    };

    const { data: existing, error: existingError } = await supabase
      .from("student_conventional_discount_assignments")
      .select(
        "id, is_active, reason, notes, before_tuition_amount, resulting_tuition_amount, family_group_id, is_manual_override, manual_override_reason",
      )
      .eq("student_id", payload.studentId)
      .eq("academic_session_label", academicSessionLabel)
      .eq("policy_id", policy.id)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (
      existing?.id &&
      existing.is_active === rowValues.is_active &&
      existing.reason === rowValues.reason &&
      (existing.notes ?? null) === rowValues.notes &&
      existing.before_tuition_amount === rowValues.before_tuition_amount &&
      existing.resulting_tuition_amount === rowValues.resulting_tuition_amount &&
      (existing.family_group_id ?? null) === rowValues.family_group_id &&
      Boolean(existing.is_manual_override) === rowValues.is_manual_override &&
      (existing.manual_override_reason ?? null) === rowValues.manual_override_reason
    ) {
      continue;
    }

    const writeResult = existing?.id
      ? await supabase
          .from("student_conventional_discount_assignments")
          .update(rowValues)
          .eq("id", existing.id)
      : await supabase.from("student_conventional_discount_assignments").insert(rowValues);

    if (writeResult.error) {
      throw new Error(writeResult.error.message);
    }
  }
}

export async function upsertConventionalDiscountPolicies(payload: {
  academicSessionLabel: string;
  policies: Array<{
    id: string | null;
    code: string;
    displayName: string;
    calculationType: ConventionalDiscountCalculationType;
    fixedTuitionAmount: number | null;
    percentage: number | null;
    isActive: boolean;
    sortOrder: number;
  }>;
}) {
  const academicSessionLabel = payload.academicSessionLabel.trim();
  if (!academicSessionLabel) {
    throw new Error("Academic year is required for conventional discounts.");
  }

  const supabase = createAdminClient();

  for (const policy of payload.policies) {
    const values = {
      academic_session_label: academicSessionLabel,
      code: policy.code,
      display_name: policy.displayName.trim(),
      calculation_type: policy.calculationType,
      fixed_tuition_amount: policy.fixedTuitionAmount,
      percentage: policy.percentage,
      is_active: policy.isActive,
      sort_order: policy.sortOrder,
    };

    if (policy.id) {
      const { error } = await supabase
        .from("conventional_discount_policies")
        .update(values)
        .eq("id", policy.id);

      if (error) {
        throw new Error(error.message);
      }
      continue;
    }

    const { error } = await supabase
      .from("conventional_discount_policies")
      .upsert(values, { onConflict: "academic_session_label,code" });

    if (error) {
      throw new Error(error.message);
    }
  }
}
