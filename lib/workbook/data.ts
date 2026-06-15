import "server-only";

import { WORKBOOK_CLASS_ORDER, normalizeWorkbookClassLabel } from "@/lib/fees/workbook";
import type { PaymentMode } from "@/lib/db/types";
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
  payment_mode: PaymentMode;
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
  baseChargeTotal: number;
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
  paidInstallmentCount: number;
  partlyPaidInstallmentCount: number;
  overdueInstallmentCount: number;
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
    baseChargeTotal: row.base_charge_total,
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
    paidInstallmentCount: row.paid_installment_count,
    partlyPaidInstallmentCount: row.partly_paid_installment_count,
    overdueInstallmentCount: row.overdue_installment_count,
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

function normalizeTransactionSearch(value: string | undefined) {
  const normalized = (value ?? "").trim();
  return normalized ? normalized.replace(/[,%()]/g, " ").replace(/\s+/g, " ") : "";
}

function escapeIlikePattern(value: string) {
  return value.replace(/[\\_%]/g, (match) => `\\${match}`);
}

function toPostgrestInList(values: readonly string[]) {
  return values.map((value) => `"${value}"`).join(",");
}

async function loadTransactionStudentIds(filters: {
  classId?: string;
  query?: string;
  routeId?: string;
  sessionLabel?: string;
}) {
  const shouldLoad =
    Boolean(filters.classId) ||
    Boolean(filters.routeId) ||
    Boolean(filters.sessionLabel) ||
    Boolean(filters.query);

  if (!shouldLoad) {
    return null;
  }

  const supabase = await createClient();
  let query = supabase
    .from("students")
    .select("id, class_ref:classes!inner(id, session_label)")
    .eq("status", "active");

  if (filters.classId) {
    query = query.eq("class_id", filters.classId);
  }

  if (filters.routeId) {
    query = query.eq("transport_route_id", filters.routeId);
  }

  if (filters.sessionLabel) {
    query = query.eq("class_ref.session_label", filters.sessionLabel);
  }

  if (filters.query) {
    const pattern = `%${escapeIlikePattern(filters.query)}%`;
    query = query.or(
      [
        `full_name.ilike.${pattern}`,
        `admission_no.ilike.${pattern}`,
        `father_name.ilike.${pattern}`,
        `primary_phone.ilike.${pattern}`,
      ].join(","),
    );
  }

  const { data, error } = await query.limit(5000);

  if (error) {
    throw new Error(`Unable to load transaction student scope: ${error.message}`);
  }

  return [...new Set(((data ?? []) as Array<{ id: string }>).map((row) => row.id))];
}

export async function getWorkbookClassOptions(sessionLabel?: string) {
  const { classOptions } = await getStudentFormOptions({ sessionLabel });

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
  studentIds?: readonly string[];
  onlyOverdue?: boolean;
  sessionLabel?: string;
  activeOnly?: boolean;
  limit?: number | null;
  offset?: number;
}) {
  const supabase = await createClient();
  const studentIds = [...new Set(filters?.studentIds?.filter(Boolean) ?? [])];

  if (filters?.studentIds && studentIds.length === 0) {
    return [];
  }

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

  if (studentIds.length > 0) {
    query = query.in("student_id", studentIds);
  }

  if (filters?.onlyOverdue) {
    query = query.eq("status_label", "OVERDUE");
  }

  if (filters?.sessionLabel) {
    query = query.eq("session_label", filters.sessionLabel);
  }

  if (filters?.activeOnly) {
    query = query.eq("record_status", "active");
  }

  if (typeof filters?.limit === "number") {
    const offset = Math.max(0, Math.floor(filters.offset ?? 0));
    query = query.range(offset, offset + Math.max(1, Math.floor(filters.limit)) - 1);
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

/**
 * Lean aggregate of today's receipts by payment mode. Used by the
 * Transactions page snapshot strip (and anywhere else that just wants the
 * "what came in today" totals — receipt count + per-mode amount). It avoids
 * the 4-level nested student/class/route embed that the regular
 * `getWorkbookTransactions` pulls.
 *
 * Returns: { receiptCount, total, cashTotal, upiTotal, bankTotal, chequeTotal }
 */
export type TodayReceiptSnapshot = {
  receiptCount: number;
  total: number;
  cashTotal: number;
  upiTotal: number;
  bankTotal: number;
  chequeTotal: number;
};

export async function getTodayReceiptSnapshot(
  options: { sessionLabel?: string } = {},
): Promise<TodayReceiptSnapshot> {
  const supabase = await createClient();
  let query = supabase
    .from("receipts")
    .select("payment_mode, total_amount")
    .eq("payment_date", getTodayStamp());

  // Receipts have no direct session_label; we restrict via students when a
  // scope is supplied. Most callers don't filter — the office only needs
  // "what came in today" totals.
  if (options.sessionLabel) {
    const scopedStudentIds = await loadTransactionStudentIds({
      sessionLabel: options.sessionLabel,
    });
    // loadTransactionStudentIds returns null when no scoping is needed; in
    // practice we always passed sessionLabel here so it will be an array,
    // but guard explicitly for type-safety.
    if (scopedStudentIds && scopedStudentIds.length === 0) {
      return {
        receiptCount: 0,
        total: 0,
        cashTotal: 0,
        upiTotal: 0,
        bankTotal: 0,
        chequeTotal: 0,
      };
    }
    if (scopedStudentIds) {
      query = query.in("student_id", scopedStudentIds);
    }
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Unable to load today receipt snapshot: ${error.message}`);
  }

  const totals: TodayReceiptSnapshot = {
    receiptCount: 0,
    total: 0,
    cashTotal: 0,
    upiTotal: 0,
    bankTotal: 0,
    chequeTotal: 0,
  };
  for (const row of (data ?? []) as Array<{
    payment_mode: string | null;
    total_amount: number | null;
  }>) {
    const amount = Math.round(Number(row.total_amount ?? 0));
    totals.receiptCount += 1;
    totals.total += amount;
    switch (row.payment_mode) {
      case "cash":
        totals.cashTotal += amount;
        break;
      case "upi":
        totals.upiTotal += amount;
        break;
      case "bank_transfer":
        totals.bankTotal += amount;
        break;
      case "cheque":
        totals.chequeTotal += amount;
        break;
    }
  }
  return totals;
}

export async function getWorkbookTransactions(filters?: {
  classId?: string;
  fromDate?: string;
  limit?: number | null;
  offset?: number;
  paymentMode?: string;
  query?: string;
  routeId?: string;
  skipFinancials?: boolean;
  todayOnly?: boolean;
  studentId?: string;
  sessionLabel?: string;
  toDate?: string;
}) {
  const supabase = await createClient();
  const normalizedSearch = normalizeTransactionSearch(filters?.query);
  const hasStudentScopeFilter = Boolean(filters?.classId || filters?.routeId || filters?.sessionLabel);

  // Run both student-id lookups in parallel to save a full DB round-trip
  const [scopedStudentIds, searchStudentIds] = await Promise.all([
    filters?.studentId || !hasStudentScopeFilter
      ? Promise.resolve(null)
      : loadTransactionStudentIds({
          classId: filters?.classId,
          routeId: filters?.routeId,
          sessionLabel: filters?.sessionLabel,
        }),
    filters?.studentId || !normalizedSearch
      ? Promise.resolve(null)
      : loadTransactionStudentIds({
          classId: filters?.classId,
          query: normalizedSearch,
          routeId: filters?.routeId,
          sessionLabel: filters?.sessionLabel,
        }),
  ]);

  if (scopedStudentIds && scopedStudentIds.length === 0) {
    return [];
  }

  let query = supabase
    .from("receipts")
    .select(
      "id, receipt_number, payment_date, created_at, payment_mode, total_amount, reference_number, received_by, student_id, student_ref:students(id, full_name, admission_no, father_name, primary_phone, transport_route_id, class_ref:classes(id, session_label, class_name, section, stream_name), route_ref:transport_routes(route_name, route_code))",
    )
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters?.studentId) {
    query = query.eq("student_id", filters.studentId);
  } else if (scopedStudentIds) {
    query = query.in("student_id", scopedStudentIds);
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

  if (normalizedSearch) {
    const pattern = `%${escapeIlikePattern(normalizedSearch)}%`;
    const receiptSearchParts = [
      `receipt_number.ilike.${pattern}`,
      `reference_number.ilike.${pattern}`,
    ];

    if (searchStudentIds && searchStudentIds.length > 0) {
      receiptSearchParts.push(`student_id.in.(${toPostgrestInList(searchStudentIds)})`);
    }

    query = query.or(receiptSearchParts.join(","));
  }

  if (typeof filters?.limit === "number") {
    const limit = Math.max(1, Math.floor(filters.limit));
    const offset = Math.max(0, Math.floor(filters.offset ?? 0));
    query = query.range(offset, offset + limit - 1);
  } else if (filters?.limit !== null) {
    query = query.limit(250);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Unable to load workbook transactions: ${error.message}`);
  }

  const receipts = (data ?? []) as ReceiptRow[];
  const receiptStudentIds = [...new Set(receipts.map((row) => row.student_id).filter(Boolean))];
  // Skip financial enrichment when the caller only needs display data (not export).
  // currentOutstanding / currentTotalPaid are not shown in the UI table — only in CSV exports.
  const financials =
    !filters?.skipFinancials && receipts.length > 0
      ? await getWorkbookStudentFinancials({
          classId: filters?.classId,
          studentId: filters?.studentId,
          studentIds: filters?.studentId ? undefined : receiptStudentIds,
          sessionLabel: filters?.sessionLabel,
        })
      : [];
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
      const normalizedQuery = normalizedSearch.toLowerCase();

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
