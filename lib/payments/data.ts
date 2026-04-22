import "server-only";

import type { PaymentMode } from "@/lib/db/types";
import { getFeePolicySummary } from "@/lib/fees/data";
import { looksLikeReceiptQuery, normalizePaymentDeskQuery } from "@/lib/payments/search";
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
  primary_phone: string | null;
  secondary_phone: string | null;
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

type RecentReceiptRow = {
  id: string;
  receipt_number: string;
  total_amount: number;
  student_id: string;
  student_ref:
    | {
        full_name: string;
        admission_no: string;
      }
    | Array<{
        full_name: string;
        admission_no: string;
      }>
    | null;
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
      fatherPhone: row.primary_phone,
      motherPhone: row.secondary_phone,
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
  classId?: string;
}): Promise<PaymentEntryPageData> {
  const supabase = await createClient();
  const policy = await getFeePolicySummary();
  const normalizedQuery = normalizePaymentDeskQuery(payload.searchQuery);
  let studentsQuery = supabase
    .from("students")
    .select(
      "id, full_name, admission_no, primary_phone, secondary_phone, class_ref:classes(class_name, section, stream_name)",
    )
    .in("status", ["active", "inactive"])
    .order("full_name", { ascending: true })
    .limit(150);

  if (payload.classId) {
    studentsQuery = studentsQuery.eq("class_id", payload.classId);
  }

  if (normalizedQuery) {
    studentsQuery = studentsQuery.or(
      `full_name.ilike.%${normalizedQuery}%,admission_no.ilike.%${normalizedQuery}%,primary_phone.ilike.%${normalizedQuery}%,secondary_phone.ilike.%${normalizedQuery}%`,
    );
  }

  const { data: studentsRaw, error: studentsError } = await studentsQuery;

  if (studentsError) {
    throw new Error(`Unable to load students for payment entry: ${studentsError.message}`);
  }

  let studentOptions = mapStudentOptions((studentsRaw ?? []) as StudentRow[]);

  if (normalizedQuery && looksLikeReceiptQuery(normalizedQuery)) {
    const { data: receiptMatchesRaw, error: receiptMatchesError } = await supabase
      .from("receipts")
      .select("id, receipt_number, total_amount, student_id, student_ref:students(full_name, admission_no)")
      .or(`receipt_number.ilike.%${normalizedQuery}%,reference_number.ilike.%${normalizedQuery}%`)
      .order("created_at", { ascending: false })
      .limit(8);

    if (receiptMatchesError) {
      throw new Error(`Unable to load receipt search results: ${receiptMatchesError.message}`);
    }

    const receiptMatches = (receiptMatchesRaw ?? []) as RecentReceiptRow[];
    const seenIds = new Set(studentOptions.map((item) => item.id));

    receiptMatches.forEach((row) => {
      if (seenIds.has(row.student_id)) {
        return;
      }

      const studentRef = toSingleRecord(row.student_ref);

      studentOptions = [
        {
          id: row.student_id,
          fullName: studentRef?.full_name ?? `Receipt ${row.receipt_number}`,
          admissionNo: studentRef?.admission_no ?? "-",
          classLabel: "Open from receipt search",
          fatherPhone: null,
          motherPhone: null,
        },
        ...studentOptions,
      ];
      seenIds.add(row.student_id);
    });
  }

  const [{ data: recentReceiptsRaw, error: recentReceiptsError }, { data: todayReceiptsRaw, error: todayReceiptsError }] =
    await Promise.all([
      supabase
        .from("receipts")
        .select("id, receipt_number, total_amount, student_id, student_ref:students(full_name, admission_no)")
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("receipts")
        .select("id, receipt_number, total_amount")
        .eq(
          "payment_date",
          new Intl.DateTimeFormat("sv-SE", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date()),
        )
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  if (recentReceiptsError) {
    throw new Error(`Unable to load recent receipts for payment desk: ${recentReceiptsError.message}`);
  }

  if (todayReceiptsError) {
    throw new Error(`Unable to load today’s collection summary: ${todayReceiptsError.message}`);
  }

  const recentReceipts = ((recentReceiptsRaw ?? []) as RecentReceiptRow[]).map((row) => {
    const studentRef = toSingleRecord(row.student_ref);

    return {
      id: row.id,
      receiptNumber: row.receipt_number,
      studentId: row.student_id,
      studentLabel: studentRef
        ? `${studentRef.full_name} (${studentRef.admission_no})`
        : row.receipt_number,
      totalAmount: row.total_amount,
    };
  });

  const todayCollection = {
    receiptCount: (todayReceiptsRaw ?? []).length,
    totalAmount: ((todayReceiptsRaw ?? []) as Array<{ total_amount: number }>).reduce(
      (sum, row) => sum + row.total_amount,
      0,
    ),
  };

  if (!payload.studentId) {
    return {
      studentOptions,
      selectedStudent: null,
      searchQuery: normalizedQuery,
      classId: payload.classId ?? "",
      modeOptions: policy.acceptedPaymentModes,
      policyNote: `${policy.academicSessionLabel} policy uses receipt prefix ${policy.receiptPrefix}, ${policy.lateFeeLabel.toLowerCase()}, and ${policy.acceptedPaymentModes.length} accepted payment modes.`,
      recentReceipts,
      todayCollection,
    };
  }

  const selectedStudent = studentOptions.find((option) => option.id === payload.studentId);

  if (!selectedStudent) {
    return {
      studentOptions,
      selectedStudent: null,
      searchQuery: normalizedQuery,
      classId: payload.classId ?? "",
      modeOptions: policy.acceptedPaymentModes,
      policyNote: `${policy.academicSessionLabel} policy uses receipt prefix ${policy.receiptPrefix}, ${policy.lateFeeLabel.toLowerCase()}, and ${policy.acceptedPaymentModes.length} accepted payment modes.`,
      recentReceipts,
      todayCollection,
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
    classId: payload.classId ?? "",
    modeOptions: policy.acceptedPaymentModes,
    policyNote: `${policy.academicSessionLabel} policy uses receipt prefix ${policy.receiptPrefix}, ${policy.lateFeeLabel.toLowerCase()}, and ${policy.acceptedPaymentModes.map((item) => item.label).join(", ")}.`,
    recentReceipts,
    todayCollection,
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
