import "server-only";

import { getFeePolicyForSession } from "@/lib/fees/data";
import {
  buildProRataFamilyAllocations,
  type FamilyAllocationInput,
} from "@/lib/payments/family-allocation";
import type { FamilyPaymentEntryPageData } from "@/lib/payments/types";
import type { ConventionalDiscountAssignmentSummary } from "@/lib/receipts/types";
import { createClient } from "@/lib/supabase/server";
import { getWorkbookStudentFinancials } from "@/lib/workbook/data";

type FamilyGroupRow = {
  id: string;
  academic_session_label: string;
  family_label: string;
  guardian_name: string | null;
  guardian_phone: string | null;
};

type FamilyMemberRow = {
  student_id: string;
};

type ConventionalDiscountPolicyRow = {
  code: string;
  display_name: string;
};

type ConventionalDiscountAssignmentRow = {
  id: string;
  student_id: string;
  academic_session_label: string;
  before_tuition_amount: number;
  resulting_tuition_amount: number;
  policy_ref: ConventionalDiscountPolicyRow | ConventionalDiscountPolicyRow[] | null;
};

function toSingleRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

/** Loads the confirmed family payment page data for a single family group. */
export async function getFamilyPaymentEntryPageData(
  familyGroupId: string,
): Promise<FamilyPaymentEntryPageData | null> {
  const supabase = await createClient();
  const { data: familyRaw, error: familyError } = await supabase
    .from("student_family_groups")
    .select("id, academic_session_label, family_label, guardian_name, guardian_phone")
    .eq("id", familyGroupId)
    .maybeSingle();

  if (familyError) {
    throw new Error(`Unable to load family group: ${familyError.message}`);
  }

  if (!familyRaw) {
    return null;
  }

  const family = familyRaw as FamilyGroupRow;
  const { data: membersRaw, error: membersError } = await supabase
    .from("student_family_members")
    .select("student_id")
    .eq("family_group_id", familyGroupId)
    .eq("academic_session_label", family.academic_session_label);

  if (membersError) {
    throw new Error(`Unable to load family members: ${membersError.message}`);
  }

  const studentIds = ((membersRaw ?? []) as FamilyMemberRow[]).map((member) => member.student_id);

  if (studentIds.length < 2) {
    return null;
  }

  const [financialRows, policy, { data: assignmentsRaw, error: assignmentsError }] = await Promise.all([
    getWorkbookStudentFinancials({
      studentIds,
      sessionLabel: family.academic_session_label,
      activeOnly: true,
    }),
    getFeePolicyForSession(family.academic_session_label),
    supabase
      .from("student_conventional_discount_assignments")
      .select(
        "id, student_id, academic_session_label, before_tuition_amount, resulting_tuition_amount, policy_ref:conventional_discount_policies(code, display_name)",
      )
      .in("student_id", studentIds)
      .eq("academic_session_label", family.academic_session_label)
      .eq("is_active", true),
  ]);

  if (assignmentsError && !assignmentsError.message.includes("does not exist")) {
    throw new Error(`Unable to load family discount assignments: ${assignmentsError.message}`);
  }

  const assignmentsByStudent = new Map<string, ConventionalDiscountAssignmentSummary[]>();

  for (const row of (assignmentsRaw ?? []) as ConventionalDiscountAssignmentRow[]) {
    const policyRef = toSingleRecord(row.policy_ref);
    const current = assignmentsByStudent.get(row.student_id) ?? [];

    current.push({
      assignmentId: row.id,
      policyCode: policyRef?.code ?? "unknown",
      policyDisplayName: policyRef?.display_name ?? "Conventional discount",
      beforeTuitionAmount: row.before_tuition_amount,
      resultingTuitionAmount: row.resulting_tuition_amount,
    });
    assignmentsByStudent.set(row.student_id, current);
  }

  const allocationInputs: FamilyAllocationInput[] = financialRows.map((row) => ({
    studentId: row.studentId,
    outstandingAmount: row.outstandingAmount,
  }));
  const defaultAllocations = new Map(
    buildProRataFamilyAllocations(
      allocationInputs,
      allocationInputs.reduce((sum, row) => sum + row.outstandingAmount, 0),
    ).map((allocation) => [allocation.studentId, allocation.allocatedAmount]),
  );

  return {
    familyGroupId: family.id,
    sessionLabel: family.academic_session_label,
    familyLabel: family.family_label,
    guardianName: family.guardian_name,
    guardianPhone: family.guardian_phone,
    paymentDate: todayIsoDate(),
    totalOutstanding: financialRows.reduce((sum, row) => sum + row.outstandingAmount, 0),
    children: financialRows.map((row) => ({
      studentId: row.studentId,
      fullName: row.studentName,
      admissionNo: row.admissionNo,
      classLabel: row.classLabel,
      outstandingAmount: row.outstandingAmount,
      defaultAllocatedAmount: defaultAllocations.get(row.studentId) ?? 0,
      conventionalDiscountAssignments: assignmentsByStudent.get(row.studentId) ?? [],
    })),
    modeOptions: policy.acceptedPaymentModes,
  };
}
