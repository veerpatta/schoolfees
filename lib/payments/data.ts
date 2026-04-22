import "server-only";

import type { PaymentMode } from "@/lib/db/types";
import { getFeePolicySummary } from "@/lib/fees/data";
import { createClient } from "@/lib/supabase/server";
import type {
  InstallmentBalanceItem,
  PaymentEntryPageData,
  PaymentStudentOption,
  SelectedStudentSummary,
} from "@/lib/payments/types";

type StudentClassRow = {
  class_name: string;
  section: string | null;
  stream_name: string | null;
};

type StudentRow = {
  id: string;
  full_name: string;
  admission_no: string;
  class_ref: StudentClassRow | StudentClassRow[] | null;
};

type BalanceRow = {
  installment_id: string;
  installment_no: number;
  installment_label: string;
  due_date: string;
  amount_due: number;
  payments_total: number;
  adjustments_total: number;
  outstanding_amount: number;
  balance_status: InstallmentBalanceItem["balanceStatus"];
};

type PostStudentPaymentRow = {
  receipt_id: string;
  receipt_number: string;
  allocated_total: number;
};

function toSingleRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function buildClassLabel(value: {
  class_name: string;
  section: string | null;
  stream_name: string | null;
}) {
  const segments = [value.class_name];

  if (value.section) {
    segments.push(`Section ${value.section}`);
  }

  if (value.stream_name) {
    segments.push(value.stream_name);
  }

  return segments.join(" - ");
}

function mapStudentOptions(rows: StudentRow[]): PaymentStudentOption[] {
  return rows.map((row) => {
    const classRef = toSingleRecord(row.class_ref);

    return {
      id: row.id,
      fullName: row.full_name,
      admissionNo: row.admission_no,
      classLabel: classRef ? buildClassLabel(classRef) : "Unknown class",
    };
  });
}

function mapBreakdown(rows: BalanceRow[]): InstallmentBalanceItem[] {
  return rows.map((row) => ({
    installmentId: row.installment_id,
    installmentNo: row.installment_no,
    installmentLabel: row.installment_label,
    dueDate: row.due_date,
    amountDue: row.amount_due,
    paymentsTotal: row.payments_total,
    adjustmentsTotal: row.adjustments_total,
    outstandingAmount: row.outstanding_amount,
    balanceStatus: row.balance_status,
  }));
}

function summarizeStudent(
  student: PaymentStudentOption,
  breakdown: InstallmentBalanceItem[],
): SelectedStudentSummary {
  const totalDue = breakdown.reduce((sum, item) => sum + item.amountDue, 0);
  const totalPending = breakdown.reduce((sum, item) => sum + item.outstandingAmount, 0);
  const totalPaid = Math.max(totalDue - totalPending, 0);

  const nextDue = breakdown.find((item) => item.outstandingAmount > 0) ?? null;

  return {
    id: student.id,
    fullName: student.fullName,
    admissionNo: student.admissionNo,
    classLabel: student.classLabel,
    breakdown,
    totalDue,
    totalPaid,
    totalPending,
    nextDueInstallmentLabel: nextDue?.installmentLabel ?? null,
    nextDueDate: nextDue?.dueDate ?? null,
    nextDueAmount: nextDue?.outstandingAmount ?? null,
  };
}

export async function getPaymentEntryPageData(payload: {
  studentId: string | null;
  searchQuery: string;
}): Promise<PaymentEntryPageData> {
  const supabase = await createClient();
  const policy = await getFeePolicySummary();
  let studentsQuery = supabase
    .from("students")
    .select(
      "id, full_name, admission_no, class_ref:classes(class_name, section, stream_name)",
    )
    .in("status", ["active", "inactive"])
    .order("full_name", { ascending: true })
    .limit(150);

  const normalizedQuery = payload.searchQuery.trim();

  if (normalizedQuery) {
    studentsQuery = studentsQuery.or(
      `full_name.ilike.%${normalizedQuery}%,admission_no.ilike.%${normalizedQuery}%`,
    );
  }

  const { data: studentsRaw, error: studentsError } = await studentsQuery;

  if (studentsError) {
    throw new Error(`Unable to load students for payment entry: ${studentsError.message}`);
  }

  const studentOptions = mapStudentOptions((studentsRaw ?? []) as StudentRow[]);

  if (!payload.studentId) {
    return {
      studentOptions,
      selectedStudent: null,
      searchQuery: normalizedQuery,
      modeOptions: policy.acceptedPaymentModes,
      policyNote: `${policy.academicSessionLabel} policy uses receipt prefix ${policy.receiptPrefix} and ${policy.lateFeeLabel.toLowerCase()}.`,
    };
  }

  const selectedStudent = studentOptions.find((option) => option.id === payload.studentId);

  if (!selectedStudent) {
    return {
      studentOptions,
      selectedStudent: null,
      searchQuery: normalizedQuery,
      modeOptions: policy.acceptedPaymentModes,
      policyNote: `${policy.academicSessionLabel} policy uses receipt prefix ${policy.receiptPrefix} and ${policy.lateFeeLabel.toLowerCase()}.`,
    };
  }

  const { data: balanceRaw, error: balanceError } = await supabase
    .from("v_installment_balances")
    .select(
      "installment_id, installment_no, installment_label, due_date, amount_due, payments_total, adjustments_total, outstanding_amount, balance_status",
    )
    .eq("student_id", selectedStudent.id)
    .order("due_date", { ascending: true })
    .order("installment_no", { ascending: true });

  if (balanceError) {
    throw new Error(`Unable to load student balances: ${balanceError.message}`);
  }

  const breakdown = mapBreakdown((balanceRaw ?? []) as BalanceRow[]);

  return {
    studentOptions,
    selectedStudent: summarizeStudent(selectedStudent, breakdown),
    searchQuery: normalizedQuery,
    modeOptions: policy.acceptedPaymentModes,
    policyNote: `${policy.academicSessionLabel} policy uses receipt prefix ${policy.receiptPrefix} and ${policy.lateFeeLabel.toLowerCase()}.`,
  };
}

export async function postStudentPayment(payload: {
  studentId: string;
  paymentDate: string;
  paymentMode: PaymentMode;
  paymentAmount: number;
  referenceNumber: string | null;
  remarks: string | null;
  receivedBy: string;
}) {
  const supabase = await createClient();
  const policy = await getFeePolicySummary();
  const { data, error } = await supabase.rpc("post_student_payment", {
    p_student_id: payload.studentId,
    p_payment_date: payload.paymentDate,
    p_payment_mode: payload.paymentMode,
    p_total_amount: payload.paymentAmount,
    p_reference_number: payload.referenceNumber,
    p_remarks: payload.remarks,
    p_received_by: payload.receivedBy,
    p_receipt_prefix: policy.receiptPrefix,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data)
    ? ((data[0] ?? null) as PostStudentPaymentRow | null)
    : (data as PostStudentPaymentRow | null);

  if (!row?.receipt_id || !row.receipt_number) {
    throw new Error("Payment saved, but receipt details are missing.");
  }

  return {
    receiptId: row.receipt_id,
    receiptNumber: row.receipt_number,
    allocatedTotal: row.allocated_total,
  };
}
