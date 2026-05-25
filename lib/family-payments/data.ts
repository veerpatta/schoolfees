import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/supabase/session";
import { revalidateFinanceSurfaces } from "@/lib/system-sync/finance-sync";
import { isFamilyPaymentsEnabled } from "@/lib/family-payments/feature-flag";

export type FamilyPaymentMode = "cash" | "upi" | "bank_transfer" | "cheque";

export type FamilyMemberPending = {
  studentId: string;
  fullName: string;
  admissionNo: string;
  classLabel: string;
  outstandingAmount: number;
};

export type FamilyPaymentContext = {
  familyGroupId: string;
  academicSessionLabel: string;
  members: FamilyMemberPending[];
  totalPending: number;
};

export async function getFamilyPaymentContext(
  familyGroupId: string,
): Promise<FamilyPaymentContext | null> {
  const supabase = await createClient();

  const { data: groupRow, error: groupError } = await supabase
    .from("student_family_groups")
    .select("id, academic_session_label")
    .eq("id", familyGroupId)
    .maybeSingle();

  if (groupError) {
    throw new Error(`Unable to load family group: ${groupError.message}`);
  }
  if (!groupRow) return null;

  const sessionLabel = (groupRow as { academic_session_label: string }).academic_session_label;

  const { data: memberRows, error: memberError } = await supabase
    .from("student_family_members")
    .select("student_id")
    .eq("family_group_id", familyGroupId)
    .eq("academic_session_label", sessionLabel);

  if (memberError) {
    throw new Error(`Unable to load family members: ${memberError.message}`);
  }

  const studentIds = (memberRows ?? []).map((row) => (row as { student_id: string }).student_id);
  if (studentIds.length === 0) {
    return {
      familyGroupId,
      academicSessionLabel: sessionLabel,
      members: [],
      totalPending: 0,
    };
  }

  const [studentsResult, financialsResult] = await Promise.all([
    supabase
      .from("students")
      .select(
        "id, full_name, admission_no, class_ref:classes(class_name, section, stream_name, session_label)",
      )
      .in("id", studentIds),
    supabase
      .from("v_workbook_student_financials")
      .select("student_id, outstanding_amount")
      .in("student_id", studentIds),
  ]);

  if (studentsResult.error) {
    throw new Error(`Unable to load family students: ${studentsResult.error.message}`);
  }
  if (financialsResult.error) {
    throw new Error(`Unable to load family balances: ${financialsResult.error.message}`);
  }

  type ClassRef = { class_name: string; section: string | null; stream_name: string | null };
  type StudentRow = {
    id: string;
    full_name: string;
    admission_no: string;
    class_ref: ClassRef | ClassRef[] | null;
  };

  const outstandingMap = new Map(
    ((financialsResult.data ?? []) as Array<{ student_id: string; outstanding_amount: number | null }>).map(
      (row) => [row.student_id, row.outstanding_amount ?? 0],
    ),
  );

  const members: FamilyMemberPending[] = ((studentsResult.data ?? []) as StudentRow[]).map((row) => {
    const ref = Array.isArray(row.class_ref) ? row.class_ref[0] ?? null : row.class_ref;
    const labelParts = ref ? [ref.class_name] : ["Unknown class"];
    if (ref?.section) labelParts.push(ref.section);
    if (ref?.stream_name) labelParts.push(`(${ref.stream_name})`);
    return {
      studentId: row.id,
      fullName: row.full_name,
      admissionNo: row.admission_no,
      classLabel: labelParts.join(" "),
      outstandingAmount: outstandingMap.get(row.id) ?? 0,
    };
  });

  members.sort((a, b) => a.fullName.localeCompare(b.fullName));

  return {
    familyGroupId,
    academicSessionLabel: sessionLabel,
    members,
    totalPending: members.reduce((sum, member) => sum + member.outstandingAmount, 0),
  };
}

export type PostFamilyPaymentPayload = {
  familyGroupId: string;
  paymentDate: string;
  paymentMode: FamilyPaymentMode;
  referenceNumber?: string | null;
  receivedBy?: string | null;
  notes?: string | null;
  totalAmount: number;
  allocations: Array<{
    studentId: string;
    amount: number;
    discount?: number;
    lateFeeWaiver?: number;
  }>;
  receiptPrefix?: string;
};

export async function postFamilyPayment(payload: PostFamilyPaymentPayload) {
  if (!isFamilyPaymentsEnabled()) {
    throw new Error(
      "Family payments are disabled. Set FAMILY_PAYMENTS_ENABLED=true to enable.",
    );
  }

  await requireStaffPermission("payments:write");

  const supabase = await createClient();

  const context = await getFamilyPaymentContext(payload.familyGroupId);
  if (!context) {
    throw new Error("Family group not found.");
  }

  if (payload.allocations.length === 0) {
    throw new Error("Add at least one student allocation.");
  }

  const allocationSum = payload.allocations.reduce((sum, allocation) => sum + Math.max(0, allocation.amount), 0);
  if (allocationSum !== payload.totalAmount) {
    throw new Error(`Allocation total ₹${allocationSum} does not match payment total ₹${payload.totalAmount}.`);
  }

  const clientRequestId = `${payload.familyGroupId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const { data, error } = await supabase.rpc("post_family_payment", {
    p_family_group_id: payload.familyGroupId,
    p_session_label: context.academicSessionLabel,
    p_payment_date: payload.paymentDate,
    p_payment_mode: payload.paymentMode,
    p_reference_number: payload.referenceNumber ?? null,
    p_received_by: payload.receivedBy ?? null,
    p_notes: payload.notes ?? null,
    p_total_amount: payload.totalAmount,
    p_allocations: payload.allocations.map((entry) => ({
      student_id: entry.studentId,
      amount: entry.amount,
      discount: entry.discount ?? 0,
      late_fee_waiver: entry.lateFeeWaiver ?? 0,
    })),
    p_client_request_id: clientRequestId,
    p_receipt_prefix: payload.receiptPrefix ?? "SVP",
  });

  if (error) {
    throw new Error(`Family payment failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const familyPaymentId = row?.family_payment_id as string | undefined;
  const receiptIds = (row?.receipt_ids as string[] | undefined) ?? [];

  const affectedStudentIds = payload.allocations.map((entry) => entry.studentId);
  revalidateFinanceSurfaces({ studentIds: affectedStudentIds });

  return {
    familyPaymentId: familyPaymentId ?? null,
    receiptIds,
  };
}
