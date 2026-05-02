import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  ReceiptBreakdownItem,
  ReceiptDetail,
  ReceiptFeeSummaryItem,
  ReceiptListItem,
} from "@/lib/receipts/types";

type StudentClassRow = {
  session_label: string;
  class_name: string;
  section: string | null;
  stream_name: string | null;
};

type StudentRouteRow = {
  route_name: string;
  route_code: string | null;
};

type StudentRow = {
  id: string;
  full_name: string;
  admission_no: string;
  father_name: string | null;
  primary_phone: string | null;
  class_ref: StudentClassRow | StudentClassRow[] | null;
  route_ref: StudentRouteRow | StudentRouteRow[] | null;
};

type ReceiptListRow = {
  id: string;
  receipt_number: string;
  payment_date: string;
  payment_mode: "cash" | "upi" | "bank_transfer" | "cheque";
  total_amount: number;
  reference_number: string | null;
  notes: string | null;
  received_by: string | null;
  created_at: string;
  student_ref: StudentRow | StudentRow[] | null;
};

type PaymentInstallmentRow = {
  installment_no: number;
  installment_label: string;
  due_date: string;
};

type ReceiptPaymentRow = {
  id: string;
  amount: number;
  notes: string | null;
  installment_ref: PaymentInstallmentRow | PaymentInstallmentRow[] | null;
};

type ReceiptDetailRow = {
  id: string;
  student_id: string;
  receipt_number: string;
  payment_date: string;
  payment_mode: "cash" | "upi" | "bank_transfer" | "cheque";
  total_amount: number;
  reference_number: string | null;
  notes: string | null;
  received_by: string | null;
  created_at: string;
  created_by: string | null;
  student_ref: StudentRow | StudentRow[] | null;
};

type HistoricalReceiptRow = {
  id: string;
  total_amount: number;
  payment_date: string;
  created_at: string;
};

type WorkbookFinancialRow = {
  student_id: string;
  session_label: string;
  student_status_label: "New" | "Old";
  tuition_fee: number;
  transport_fee: number;
  academic_fee: number;
  other_adjustment_head: string | null;
  other_adjustment_amount: number;
  discount_amount: number;
  late_fee_total: number;
  late_fee_waiver_amount: number;
  total_due: number;
  total_paid: number;
  outstanding_amount: number;
};
type ReceiptFinanceAdjustmentRow = {
  quick_discount_amount: number;
  quick_late_fee_waiver_amount: number;
};

type UserRow = {
  id: string;
  full_name: string;
};

function toSingleRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function buildClassLabel(classRef: StudentClassRow | StudentClassRow[] | null) {
  const value = toSingleRecord(classRef);

  if (!value) {
    return "Unknown class";
  }

  const parts = [value.class_name];

  if (value.section) {
    parts.push(`Section ${value.section}`);
  }

  if (value.stream_name) {
    parts.push(value.stream_name);
  }

  return parts.join(" - ");
}

function buildRouteLabel(routeRef: StudentRouteRow | StudentRouteRow[] | null) {
  const value = toSingleRecord(routeRef);

  if (!value) {
    return "No Transport";
  }

  return value.route_code ? `${value.route_name} (${value.route_code})` : value.route_name;
}

function buildFeeSummary(row: WorkbookFinancialRow | null): ReceiptFeeSummaryItem[] {
  if (!row) {
    return [];
  }

  return [
    { label: "Tuition fee", amount: row.tuition_fee },
    { label: "Transport fee", amount: row.transport_fee },
    { label: "Academic fee", amount: row.academic_fee },
    {
      label: row.other_adjustment_head ? `Other adj. (${row.other_adjustment_head})` : "Other adjustment",
      amount: row.other_adjustment_amount,
    },
    { label: "Discount", amount: -row.discount_amount },
    { label: "Late fee", amount: row.late_fee_total },
    { label: "Late fee waived", amount: -row.late_fee_waiver_amount },
  ];
}

export async function getReceiptsPage(
  searchQuery: string,
  pagination: { page: number; pageSize: number },
): Promise<{ receipts: ReceiptListItem[]; totalCount: number; page: number; pageSize: number }> {
  const supabase = await createClient();
  const page = Math.max(1, Math.floor(pagination.page));
  const pageSize = Math.min(100, Math.max(1, Math.floor(pagination.pageSize)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("receipts")
    .select(
      "id, receipt_number, payment_date, payment_mode, total_amount, reference_number, notes, received_by, created_at, student_ref:students(id, full_name, admission_no, father_name, primary_phone, class_ref:classes(session_label, class_name, section, stream_name), route_ref:transport_routes(route_name, route_code))",
      { count: "exact" },
    )
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  const normalizedQuery = searchQuery.trim();

  if (normalizedQuery) {
    query = query.or(`receipt_number.ilike.%${normalizedQuery}%,reference_number.ilike.%${normalizedQuery}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Unable to load receipts: ${error.message}`);
  }

  const receipts = ((data ?? []) as ReceiptListRow[]).map((row) => {
    const student = toSingleRecord(row.student_ref);

    return {
      id: row.id,
      receiptNumber: row.receipt_number,
      paymentDate: row.payment_date,
      paymentMode: row.payment_mode,
      totalAmount: row.total_amount,
      referenceNumber: row.reference_number,
      notes: row.notes,
      receivedBy: row.received_by,
      createdAt: row.created_at,
      studentFullName: student?.full_name ?? "Unknown student",
      admissionNo: student?.admission_no ?? "N/A",
      classLabel: buildClassLabel(student?.class_ref ?? null),
    };
  });

  return {
    receipts,
    totalCount: count ?? 0,
    page,
    pageSize,
  };
}

export async function getReceiptsList(searchQuery: string): Promise<ReceiptListItem[]> {
  const page = await getReceiptsPage(searchQuery, { page: 1, pageSize: 80 });
  return page.receipts;
}

export async function getReceiptDetail(receiptId: string): Promise<ReceiptDetail | null> {
  const supabase = await createClient();

  const { data: receiptRaw, error: receiptError } = await supabase
    .from("receipts")
    .select(
      "id, student_id, receipt_number, payment_date, payment_mode, total_amount, reference_number, notes, received_by, created_at, created_by, student_ref:students(id, full_name, admission_no, father_name, primary_phone, class_ref:classes(session_label, class_name, section, stream_name), route_ref:transport_routes(route_name, route_code))",
    )
    .eq("id", receiptId)
    .maybeSingle();

  if (receiptError) {
    throw new Error(`Unable to load receipt details: ${receiptError.message}`);
  }

  if (!receiptRaw) {
    return null;
  }

  const receipt = receiptRaw as ReceiptDetailRow;

  const [
    { data: paymentsRaw, error: paymentsError },
    { data: userRaw, error: userError },
    { data: financialRaw, error: financialError },
    { data: studentReceiptsRaw, error: studentReceiptsError },
    { data: receiptAdjustmentRaw, error: receiptAdjustmentError },
  ] = await Promise.all([
    supabase
      .from("payments")
      .select("id, amount, notes, installment_ref:installments(installment_no, installment_label, due_date)")
      .eq("receipt_id", receipt.id)
      .order("created_at", { ascending: true }),
    receipt.created_by
      ? supabase.from("users").select("id, full_name").eq("id", receipt.created_by).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("v_workbook_student_financials")
      .select(
        "student_id, session_label, student_status_label, tuition_fee, transport_fee, academic_fee, other_adjustment_head, other_adjustment_amount, discount_amount, late_fee_total, late_fee_waiver_amount, total_due, total_paid, outstanding_amount",
      )
      .eq("student_id", receipt.student_id)
      .maybeSingle(),
    supabase
      .from("receipts")
      .select("id, total_amount, payment_date, created_at")
      .eq("student_id", receipt.student_id)
      .order("payment_date", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("receipt_finance_adjustments")
      .select("quick_discount_amount, quick_late_fee_waiver_amount")
      .eq("receipt_id", receipt.id)
      .maybeSingle(),
  ]);

  if (paymentsError) {
    throw new Error(`Unable to load receipt breakdown: ${paymentsError.message}`);
  }

  if (userError) {
    throw new Error(`Unable to load receipt creator details: ${userError.message}`);
  }

  if (financialError && !financialError.message.includes("does not exist")) {
    throw new Error(`Unable to load workbook receipt context: ${financialError.message}`);
  }

  if (studentReceiptsError) {
    throw new Error(`Unable to load receipt history: ${studentReceiptsError.message}`);
  }
  if (receiptAdjustmentError && !receiptAdjustmentError.message.includes("does not exist")) {
    throw new Error(`Unable to load receipt adjustment details: ${receiptAdjustmentError.message}`);
  }

  const breakdown: ReceiptBreakdownItem[] = ((paymentsRaw ?? []) as ReceiptPaymentRow[])
    .map((row) => {
      const installment = toSingleRecord(row.installment_ref);

      if (!installment) {
        return null;
      }

      return {
        paymentId: row.id,
        installmentNo: installment.installment_no,
        installmentLabel: installment.installment_label,
        dueDate: installment.due_date,
        amount: row.amount,
        notes: row.notes,
      };
    })
    .filter((value): value is ReceiptBreakdownItem => value !== null)
    .sort((left, right) => left.installmentNo - right.installmentNo);

  const student = toSingleRecord(receipt.student_ref);
  const createdByName = (userRaw as UserRow | null)?.full_name ?? null;
  const financial = (financialRaw ?? null) as WorkbookFinancialRow | null;
  const studentReceipts = (studentReceiptsRaw ?? []) as HistoricalReceiptRow[];
  const receiptAdjustment = (receiptAdjustmentRaw ?? null) as ReceiptFinanceAdjustmentRow | null;
  const currentReceiptIndex = studentReceipts.findIndex((row) => row.id === receipt.id);
  const receiptsUpToCurrent = currentReceiptIndex === -1 ? [] : studentReceipts.slice(0, currentReceiptIndex + 1);
  const receiptsBeforeCurrent = currentReceiptIndex <= 0 ? [] : studentReceipts.slice(0, currentReceiptIndex);
  const totalPaidBeforeReceipt = receiptsBeforeCurrent.reduce((sum, row) => sum + row.total_amount, 0);
  const totalPaidToDate = receiptsUpToCurrent.reduce((sum, row) => sum + row.total_amount, 0);
  const outstandingAfterReceipt = Math.max((financial?.total_due ?? totalPaidToDate) - totalPaidToDate, 0);

  return {
    id: receipt.id,
    studentId: receipt.student_id,
    receiptNumber: receipt.receipt_number,
    paymentDate: receipt.payment_date,
    paymentMode: receipt.payment_mode,
    totalAmount: receipt.total_amount,
    referenceNumber: receipt.reference_number,
    notes: receipt.notes,
    receivedBy: receipt.received_by,
    createdAt: receipt.created_at,
    createdByName,
    studentFullName: student?.full_name ?? "Unknown student",
    admissionNo: student?.admission_no ?? "N/A",
    fatherName: student?.father_name ?? null,
    fatherPhone: student?.primary_phone ?? null,
    classLabel: buildClassLabel(student?.class_ref ?? null),
    sessionLabel: toSingleRecord(student?.class_ref ?? null)?.session_label ?? "2026-27",
    transportRouteLabel: buildRouteLabel(student?.route_ref ?? null),
    studentStatusLabel: financial?.student_status_label ?? "Old",
    feeSummary: buildFeeSummary(financial),
    totalDue: financial?.total_due ?? totalPaidToDate,
    totalPaidBeforeReceipt,
    totalPaidToDate,
    outstandingAfterReceipt,
    currentOutstanding: financial?.outstanding_amount ?? outstandingAfterReceipt,
    discountAmount: receiptAdjustment?.quick_discount_amount ?? 0,
    lateFeeAmount: financial?.late_fee_total ?? 0,
    lateFeeWaived: receiptAdjustment?.quick_late_fee_waiver_amount ?? 0,
    breakdown,
  };
}
