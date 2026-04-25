import "server-only";

import { WORKBOOK_CLASS_ORDER, normalizeWorkbookClassLabel } from "@/lib/fees/workbook";
import { createClient } from "@/lib/supabase/server";
import { getStudentFormOptions } from "@/lib/students/data";

type WorkbookStudentFinancialRow = {
  student_id: string;
  admission_no: string;
  student_name: string;
  date_of_birth: string | null;
  father_name: string | null;
  mother_name: string | null;
  father_phone: string | null;
  mother_phone: string | null;
  record_status: string;
  class_id: string;
  session_label: string;
  class_name: string;
  class_label: string;
  sort_order: number;
  transport_route_id: string | null;
  transport_route_name: string | null;
  transport_route_code: string | null;
  student_status_code: "new" | "existing";
  student_status_label: "New" | "Old";
  tuition_fee: number;
  transport_fee: number;
  academic_fee: number;
  other_adjustment_head: string | null;
  other_adjustment_amount: number;
  gross_base_before_discount: number;
  discount_amount: number;
  late_fee_waiver_amount: number;
  base_charge_total: number;
  late_fee_total: number;
  total_due: number;
  total_paid: number;
  outstanding_amount: number;
  next_due_date: string | null;
  next_due_amount: number | null;
  next_due_label: string | null;
  last_payment_date: string | null;
  paid_installment_count: number;
  partly_paid_installment_count: number;
  overdue_installment_count: number;
  inst1_pending: number;
  inst2_pending: number;
  inst3_pending: number;
  inst4_pending: number;
  status_label: "" | "PAID" | "NOT STARTED" | "OVERDUE" | "PARTLY PAID";
  override_reason: string | null;
};

type WorkbookInstallmentBalanceRow = {
  installment_id: string;
  student_id: string;
  admission_no: string;
  student_name: string;
  father_name: string | null;
  father_phone: string | null;
  session_label: string;
  class_id: string;
  class_name: string;
  class_label: string;
  section: string;
  stream_name: string;
  installment_no: number;
  installment_label: string;
  due_date: string;
  base_charge: number;
  paid_amount: number;
  adjustment_amount: number;
  applied_amount: number;
  raw_late_fee: number;
  waiver_applied: number;
  final_late_fee: number;
  total_charge: number;
  pending_amount: number;
  balance_status: "paid" | "partial" | "overdue" | "pending" | "waived";
  last_payment_date: string | null;
  transport_route_id: string | null;
  transport_route_name: string | null;
  transport_route_code: string | null;
};

type ReceiptClassRow = {
  id: string;
  session_label: string;
  class_name: string;
  section: string | null;
  stream_name: string | null;
};

type ReceiptRouteRow = {
  route_name: string;
  route_code: string | null;
};

type ReceiptStudentRow = {
  id: string;
  full_name: string;
  admission_no: string;
  father_name: string | null;
  primary_phone: string | null;
  transport_route_id: string | null;
  class_ref: ReceiptClassRow | ReceiptClassRow[] | null;
  route_ref: ReceiptRouteRow | ReceiptRouteRow[] | null;
};

type ReceiptRow = {
  id: string;
  receipt_number: string;
  payment_date: string;
  created_at: string | null;
  payment_mode: "cash" | "upi" | "bank_transfer" | "cheque";
  total_amount: number;
  reference_number: string | null;
  received_by: string | null;
  student_id: string;
  student_ref: ReceiptStudentRow | ReceiptStudentRow[] | null;
};

export type WorkbookClassOption = {
  id: string;
  label: string;
  sessionLabel: string;
};

export type WorkbookStudentFinancial = {
  studentId: string;
  admissionNo: string;
  studentName: string;
  dateOfBirth: string | null;
  fatherName: string | null;
  motherName: string | null;
  fatherPhone: string | null;
  motherPhone: string | null;
  recordStatus: string;
  classId: string;
  sessionLabel: string;
  className: string;
  classLabel: string;
  sortOrder: number;
  transportRouteId: string | null;
  transportRouteName: string | null;
  transportRouteCode: string | null;
  studentStatusCode: "new" | "existing";
  studentStatusLabel: "New" | "Old";
  tuitionFee: number;
  transportFee: number;
  academicFee: number;
  otherAdjustmentHead: string | null;
  otherAdjustmentAmount: number;
  grossBaseBeforeDiscount: number;
  discountAmount: number;
  lateFeeWaiverAmount: number;
  lateFeeTotal: number;
  totalDue: number;
  totalPaid: number;
  outstandingAmount: number;
  nextDueDate: string | null;
  nextDueAmount: number | null;
  nextDueLabel: string | null;
  lastPaymentDate: string | null;
  inst1Pending: number;
  inst2Pending: number;
  inst3Pending: number;
  inst4Pending: number;
  statusLabel: "" | "PAID" | "NOT STARTED" | "OVERDUE" | "PARTLY PAID";
  overrideReason: string | null;
};

export type WorkbookInstallmentBalance = {
  installmentId: string;
  studentId: string;
  admissionNo: string;
  studentName: string;
  fatherName: string | null;
  fatherPhone: string | null;
  sessionLabel: string;
  classId: string;
  className: string;
  classLabel: string;
  section: string;
  streamName: string;
  installmentNo: number;
  installmentLabel: string;
  dueDate: string;
  transportRouteId: string | null;
  transportRouteName: string | null;
  transportRouteCode: string | null;
  lastPaymentDate: string | null;
  baseCharge: number;
  paidAmount: number;
  adjustmentAmount: number;
  rawLateFee: number;
  waiverApplied: number;
  finalLateFee: number;
  totalCharge: number;
  pendingAmount: number;
  balanceStatus: "paid" | "partial" | "overdue" | "pending" | "waived";
};

export type WorkbookTransaction = {
  receiptId: string;
  receiptNumber: string;
  paymentDate: string;
  createdAt?: string | null;
  paymentMode: string;
  referenceNumber: string | null;
  receivedBy?: string | null;
  totalAmount: number;
  studentId: string;
  studentName: string;
  admissionNo: string;
  fatherName: string | null;
  fatherPhone: string | null;
  classId: string | null;
  classLabel: string;
  transportRouteId: string | null;
  transportRouteLabel: string;
  sessionLabel: string | null;
  currentOutstanding: number;
  currentTotalPaid: number;
  discountApplied: number;
  lateFeeWaived: number;
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
  const workbookLabel = normalizeWorkbookClassLabel(
    `${value.class_name} ${value.stream_name ?? ""}`.trim(),
  );

  if (workbookLabel) {
    return workbookLabel;
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

function buildRouteLabel(value: ReceiptRouteRow | null) {
  if (!value) {
    return "No Transport";
  }

  return value.route_code ? `${value.route_name} (${value.route_code})` : value.route_name;
}

function sortWorkbookClassOptions(options: WorkbookClassOption[]) {
  return [...options].sort((left, right) => {
    const leftIndex = WORKBOOK_CLASS_ORDER.indexOf(
      (normalizeWorkbookClassLabel(left.label) ?? left.label) as (typeof WORKBOOK_CLASS_ORDER)[number],
    );
    const rightIndex = WORKBOOK_CLASS_ORDER.indexOf(
      (normalizeWorkbookClassLabel(right.label) ?? right.label) as (typeof WORKBOOK_CLASS_ORDER)[number],
    );

    if (leftIndex !== -1 || rightIndex !== -1) {
      if (leftIndex === -1) {
        return 1;
      }

      if (rightIndex === -1) {
        return -1;
      }

      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
    }

    return left.label.localeCompare(right.label);
  });
}

function mapFinancialRow(row: WorkbookStudentFinancialRow): WorkbookStudentFinancial {
  return {
    studentId: row.student_id,
    admissionNo: row.admission_no,
    studentName: row.student_name,
    dateOfBirth: row.date_of_birth,
    fatherName: row.father_name,
    motherName: row.mother_name,
    fatherPhone: row.father_phone,
    motherPhone: row.mother_phone,
    recordStatus: row.record_status,
    classId: row.class_id,
    sessionLabel: row.session_label,
    className: row.class_name,
    classLabel: row.class_label,
    sortOrder: row.sort_order,
    transportRouteId: row.transport_route_id,
    transportRouteName: row.transport_route_name,
    transportRouteCode: row.transport_route_code,
    studentStatusCode: row.student_status_code,
    studentStatusLabel: row.student_status_label,
    tuitionFee: row.tuition_fee,
    transportFee: row.transport_fee,
    academicFee: row.academic_fee,
    otherAdjustmentHead: row.other_adjustment_head,
    otherAdjustmentAmount: row.other_adjustment_amount,
    grossBaseBeforeDiscount: row.gross_base_before_discount,
    discountAmount: row.discount_amount,
    lateFeeWaiverAmount: row.late_fee_waiver_amount,
    lateFeeTotal: row.late_fee_total,
    totalDue: row.total_due,
    totalPaid: row.total_paid,
    outstandingAmount: row.outstanding_amount,
    nextDueDate: row.next_due_date,
    nextDueAmount: row.next_due_amount,
    nextDueLabel: row.next_due_label,
    lastPaymentDate: row.last_payment_date,
    inst1Pending: row.inst1_pending,
    inst2Pending: row.inst2_pending,
    inst3Pending: row.inst3_pending,
    inst4Pending: row.inst4_pending,
    statusLabel: row.status_label,
    overrideReason: row.override_reason,
  };
}

function mapInstallmentRow(row: WorkbookInstallmentBalanceRow): WorkbookInstallmentBalance {
  return {
    installmentId: row.installment_id,
    studentId: row.student_id,
    admissionNo: row.admission_no,
    studentName: row.student_name,
    fatherName: row.father_name,
    fatherPhone: row.father_phone,
    sessionLabel: row.session_label,
    classId: row.class_id,
    className: row.class_name,
    classLabel: row.class_label,
    section: row.section,
    streamName: row.stream_name,
    installmentNo: row.installment_no,
    installmentLabel: row.installment_label,
    dueDate: row.due_date,
    transportRouteId: row.transport_route_id,
    transportRouteName: row.transport_route_name,
    transportRouteCode: row.transport_route_code,
    lastPaymentDate: row.last_payment_date,
    baseCharge: row.base_charge,
    paidAmount: row.paid_amount,
    adjustmentAmount: row.adjustment_amount,
    rawLateFee: row.raw_late_fee,
    waiverApplied: row.waiver_applied,
    finalLateFee: row.final_late_fee,
    totalCharge: row.total_charge,
    pendingAmount: row.pending_amount,
    balanceStatus: row.balance_status,
  };
}

function getTodayStamp(referenceDate = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referenceDate);
}

export async function getWorkbookClassOptions() {
  const { classOptions } = await getStudentFormOptions();

  return sortWorkbookClassOptions(
    classOptions.map((option) => ({
      id: option.id,
      label: normalizeWorkbookClassLabel(option.label) ?? option.label,
      sessionLabel: option.sessionLabel,
    })),
  );
}

export async function getWorkbookStudentFinancials(filters?: {
  classId?: string;
  studentId?: string;
  onlyOverdue?: boolean;
  sessionLabel?: string;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("v_workbook_student_financials")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("student_name", { ascending: true });

  if (filters?.classId) {
    query = query.eq("class_id", filters.classId);
  }

  if (filters?.studentId) {
    query = query.eq("student_id", filters.studentId);
  }

  if (filters?.onlyOverdue) {
    query = query.eq("status_label", "OVERDUE");
  }

  if (filters?.sessionLabel) {
    query = query.eq("session_label", filters.sessionLabel);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Unable to load workbook student financials: ${error.message}`);
  }

  return ((data ?? []) as WorkbookStudentFinancialRow[]).map(mapFinancialRow);
}

export async function getWorkbookInstallmentBalances(studentId: string) {
  const rows = await getWorkbookInstallmentRows({ studentId });
  return rows;
}

export async function getWorkbookInstallmentRows(filters?: {
  classId?: string;
  studentId?: string;
  sessionLabel?: string;
  pendingOnly?: boolean;
  overdueOnly?: boolean;
  todayOnly?: boolean;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("v_workbook_installment_balances")
    .select("*")
    .order("due_date", { ascending: true })
    .order("installment_no", { ascending: true })
    .order("student_name", { ascending: true });

  if (filters?.classId) {
    query = query.eq("class_id", filters.classId);
  }

  if (filters?.studentId) {
    query = query.eq("student_id", filters.studentId);
  }

  if (filters?.sessionLabel) {
    query = query.eq("session_label", filters.sessionLabel);
  }

  if (filters?.pendingOnly) {
    query = query.gt("pending_amount", 0);
  }

  if (filters?.overdueOnly) {
    query = query.eq("balance_status", "overdue");
  }

  if (filters?.todayOnly) {
    query = query.eq("due_date", getTodayStamp());
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Unable to load workbook installment rows: ${error.message}`);
  }

  return ((data ?? []) as WorkbookInstallmentBalanceRow[]).map(mapInstallmentRow);
}

export async function getWorkbookTransactions(filters?: {
  classId?: string;
  fromDate?: string;
  limit?: number | null;
  paymentMode?: string;
  query?: string;
  routeId?: string;
  todayOnly?: boolean;
  studentId?: string;
  sessionLabel?: string;
  toDate?: string;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("receipts")
    .select(
      "id, receipt_number, payment_date, created_at, payment_mode, total_amount, reference_number, received_by, student_id, student_ref:students(id, full_name, admission_no, father_name, primary_phone, transport_route_id, class_ref:classes(id, session_label, class_name, section, stream_name), route_ref:transport_routes(route_name, route_code))",
    )
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters?.studentId) {
    query = query.eq("student_id", filters.studentId);
  }

  if (filters?.todayOnly) {
    query = query.eq("payment_date", getTodayStamp());
  }

  if (filters?.fromDate) {
    query = query.gte("payment_date", filters.fromDate);
  }

  if (filters?.toDate) {
    query = query.lte("payment_date", filters.toDate);
  }

  if (filters?.paymentMode) {
    query = query.eq("payment_mode", filters.paymentMode);
  }

  if (typeof filters?.limit === "number") {
    query = query.limit(filters.limit);
  } else if (filters?.limit !== null) {
    query = query.limit(250);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Unable to load workbook transactions: ${error.message}`);
  }

  const receipts = (data ?? []) as ReceiptRow[];
  const financials = await getWorkbookStudentFinancials({
    classId: filters?.classId,
    studentId: filters?.studentId,
    sessionLabel: filters?.sessionLabel,
  });
  const financialMap = new Map(financials.map((item) => [item.studentId, item]));

  return receipts
    .map((row) => {
      const studentRef = toSingleRecord(row.student_ref);
      const classRef = studentRef ? toSingleRecord(studentRef.class_ref) : null;
      const routeRef = studentRef ? toSingleRecord(studentRef.route_ref) : null;
      const financial = financialMap.get(row.student_id);

      return {
        receiptId: row.id,
        receiptNumber: row.receipt_number,
        paymentDate: row.payment_date,
        createdAt: row.created_at ?? null,
        paymentMode: row.payment_mode,
        referenceNumber: row.reference_number,
        receivedBy: row.received_by ?? null,
        totalAmount: row.total_amount,
        studentId: row.student_id,
        studentName: studentRef?.full_name ?? "Unknown student",
        admissionNo: studentRef?.admission_no ?? "-",
        fatherName: studentRef?.father_name ?? null,
        fatherPhone: studentRef?.primary_phone ?? null,
        classId: classRef?.id ?? null,
        classLabel: classRef ? buildClassLabel(classRef) : "Unknown class",
        transportRouteId: studentRef?.transport_route_id ?? null,
        transportRouteLabel: buildRouteLabel(routeRef),
        sessionLabel: classRef?.session_label ?? null,
        currentOutstanding: financial?.outstandingAmount ?? 0,
        currentTotalPaid: financial?.totalPaid ?? 0,
        discountApplied: financial?.discountAmount ?? 0,
        lateFeeWaived: financial?.lateFeeWaiverAmount ?? 0,
      } satisfies WorkbookTransaction;
    })
    .filter((row) => (filters?.classId ? row.classId === filters.classId : true))
    .filter((row) => (filters?.routeId ? row.transportRouteId === filters.routeId : true))
    .filter((row) => (filters?.sessionLabel ? row.sessionLabel === filters.sessionLabel : true))
    .filter((row) => {
      const normalizedQuery = (filters?.query ?? "").trim().toLowerCase();

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        row.receiptNumber,
        row.referenceNumber ?? "",
        row.studentName,
        row.admissionNo,
        row.classLabel,
        row.fatherName ?? "",
        row.fatherPhone ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
}
