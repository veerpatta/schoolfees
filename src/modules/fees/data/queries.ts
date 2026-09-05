import "server-only";

// Re-exported so existing call sites keep working; the declarations now live
// in domain/, where pure code can reach them without importing IO.
export type {
  WorkbookClassOption,
  WorkbookStudentFinancial,
  WorkbookInstallmentBalance,
  WorkbookTransaction,
} from "@/modules/fees/domain/workbook-types";
import type {
  WorkbookClassOption,
  WorkbookStudentFinancial,
  WorkbookInstallmentBalance,
  WorkbookTransaction,
} from "@/modules/fees/domain/workbook-types";

import { WORKBOOK_CLASS_ORDER, normalizeWorkbookClassLabel } from "@/modules/fees/domain/workbook";
import type { PaymentMode } from "@/platform/db/types";
import { fetchAllPages, fetchInChunks } from "@/platform/helpers/chunk";
import { describeError } from "@/platform/observability/log";
import { getDisplayInstallmentLabel } from "@/modules/prev-year-dues/domain/display";
import { getReceiptReversalTotals, isReceiptReversed } from "@/modules/receipts/data/reversals";
import { loadSessionScopedReceiptIds } from "@/platform/session/installment-scope";
import { buildTransportRouteLabel, matchesTransportRouteFilter } from "@/modules/fees/domain/label";
import { createClient } from "@/platform/supabase/server";
import { getStudentFormOptions } from "@/modules/students/data/queries";

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
  /** Both discount lines together. gross - discount_amount = base_charge_total. */
  discount_amount: number;
  /** Optional so the app still boots if 20260807120000 has not been applied yet. */
  conventional_discount_amount?: number | null;
  student_discount_amount?: number | null;
  conventional_discount_labels?: string | null;
  late_fee_waiver_amount: number;
  base_charge_total: number;
  total_discount_closeouts: number | null;
  late_fee_total: number;
  total_due: number;
  total_paid: number;
  outstanding_amount: number;
  base_outstanding_amount: number;
  late_fee_outstanding_amount: number;
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
  is_carry_forward?: boolean | null;
  source_session_label?: string | null;
  target_session_label?: string | null;
  carry_forward_fee_head?: string | null;
  due_date: string;
  base_charge: number;
  paid_amount: number;
  discount_closeout_amount?: number | null;
  adjustment_amount: number;
  applied_amount: number;
  raw_late_fee: number;
  waiver_applied: number;
  final_late_fee: number;
  total_charge: number;
  pending_amount: number;
  late_fee_pending?: number | null;
  total_pending?: number | null;
  balance_status: "paid" | "partial" | "overdue" | "pending" | "waived";
  late_fee_status?: "none" | "pending" | "waived" | "paid" | null;
  last_payment_date: string | null;
  transport_route_id: string | null;
  transport_route_name: string | null;
  transport_route_code: string | null;
  /** Pooled settlement, since 20260905064847. Optional so an older select still maps. */
  settled_amount?: number | null;
  fee_settled_amount?: number | null;
  late_fee_settled_amount?: number | null;
  plan_priority?: number | null;
  settlement_rank?: number | null;
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

function buildRouteLabel(value: ReceiptRouteRow | null, transportFeeAmount?: number | null) {
  return buildTransportRouteLabel({ route: value, transportFeeAmount });
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
    // Fall back to "all of it is a student discount" when the columns are
    // absent, which is what the view reported before 20260807120000. Keeps the
    // total honest whichever side of the migration this code runs against.
    conventionalDiscountAmount: row.conventional_discount_amount ?? 0,
    studentDiscountAmount: row.student_discount_amount ?? row.discount_amount ?? 0,
    conventionalDiscountLabels: row.conventional_discount_labels ?? null,
    lateFeeWaiverAmount: row.late_fee_waiver_amount,
    baseChargeTotal: row.base_charge_total,
    lateFeeTotal: row.late_fee_total,
    discountClosedAmount: row.total_discount_closeouts ?? 0,
    totalDue: row.total_due,
    totalPaid: row.total_paid,
    outstandingAmount: row.outstanding_amount,
    baseOutstandingAmount: row.base_outstanding_amount ?? row.outstanding_amount,
    // Read straight off the view. It used to be derived as
    // (outstanding - base_outstanding); since the split those two are the same
    // number, so that subtraction now yields 0 for everyone.
    lateFeeOutstandingAmount: row.late_fee_outstanding_amount ?? 0,
    totalOwedAmount: (row.outstanding_amount ?? 0) + (row.late_fee_outstanding_amount ?? 0),
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
  const isCarryForward = row.is_carry_forward === true;
  const feeBucket = row.carry_forward_fee_head ? `previous_year_${row.carry_forward_fee_head}` : null;
  // The pooled figure. A caller that selected the view before 20260905064847
  // added the column gets the pin back, which is what it used to read anyway.
  const appliedAmount = row.applied_amount ?? row.paid_amount;
  const settledAmount = row.settled_amount ?? appliedAmount + (row.discount_closeout_amount ?? 0);
  const feeSettledAmount =
    row.fee_settled_amount ?? Math.min(settledAmount, Math.max(row.base_charge, 0));
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
    installmentLabel: getDisplayInstallmentLabel({
      installmentNo: row.installment_no,
      installmentLabel: row.installment_label,
      isCarryForward,
      sourceSessionLabel: row.source_session_label ?? null,
      feeBucket,
    }),
    isCarryForward,
    sourceSessionLabel: row.source_session_label ?? null,
    targetSessionLabel: row.target_session_label ?? null,
    feeBucket,
    dueDate: row.due_date,
    transportRouteId: row.transport_route_id,
    transportRouteName: row.transport_route_name,
    transportRouteCode: row.transport_route_code,
    lastPaymentDate: row.last_payment_date,
    baseCharge: row.base_charge,
    paidAmount: row.paid_amount,
    appliedAmount,
    discountCloseoutAmount: row.discount_closeout_amount ?? 0,
    adjustmentAmount: row.adjustment_amount,
    rawLateFee: row.raw_late_fee,
    waiverApplied: row.waiver_applied,
    finalLateFee: row.final_late_fee,
    totalCharge: row.total_charge,
    // Fees only. The late fee on this installment is lateFeePending; add the
    // two for what the counter can collect against it (totalPending).
    pendingAmount: row.pending_amount,
    lateFeePending: row.late_fee_pending ?? 0,
    totalPending: row.total_pending ?? row.pending_amount + (row.late_fee_pending ?? 0),
    balanceStatus: row.balance_status,
    lateFeeStatus: row.late_fee_status ?? "none",
    settledAmount,
    feeSettledAmount,
    lateFeeSettledAmount: row.late_fee_settled_amount ?? settledAmount - feeSettledAmount,
    planPriority: row.plan_priority ?? 1,
    settlementRank: row.settlement_rank ?? row.installment_no,
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

/**
 * PostgREST serialises `.in(...)` filters into the request URL. A session scope
 * resolves to every receipt id that settled a session-frozen installment — up to
 * SESSION_SCOPE_ROW_LIMIT (20k) ids — and a few hundred UUIDs already blow past
 * the gateway's URL/header limit, which comes back as a 400 Bad Request that
 * fails the whole Transactions page. Batch the id filter instead and merge in JS.
 */
const RECEIPT_ID_FILTER_CHUNK_SIZE = 100;

/**
 * How many matched-student ids may be inlined into a receipt search.
 *
 * Each id costs about 39 characters inside `or=(student_id.in.(…))`, so 150 is
 * roughly 6 KB of URL — comfortably inside the gateway limit with the rest of
 * the query alongside it. Every realistic search (a name, a phone fragment, an
 * SR number) matches far fewer than this; only a one- or two-character query
 * reaches it, and that is handled by falling back to a JS match rather than by
 * failing the page.
 */
const SEARCH_STUDENT_ID_INLINE_LIMIT = 150;

/**
 * Mirrors the DB `ORDER BY payment_date DESC, created_at DESC` used by the
 * receipts listing. When the id filter is chunked, each batch is ordered only
 * within itself, so the merged rows have to be re-sorted here before any
 * limit/offset slice is applied. Postgres puts NULLs first for a DESC sort, so
 * null `created_at` sorts ahead of a timestamp within the same payment_date;
 * `id` is the final tiebreak so paging stays deterministic.
 */
function compareReceiptRowsForListing(a: ReceiptRow, b: ReceiptRow) {
  const dateDiff = (b.payment_date ?? "").localeCompare(a.payment_date ?? "");
  if (dateDiff !== 0) {
    return dateDiff;
  }

  const aCreated = a.created_at;
  const bCreated = b.created_at;
  if (aCreated === null && bCreated !== null) {
    return -1;
  }
  if (aCreated !== null && bCreated === null) {
    return 1;
  }
  if (aCreated !== null && bCreated !== null) {
    const createdDiff = bCreated.localeCompare(aCreated);
    if (createdDiff !== 0) {
      return createdDiff;
    }
  }

  return a.id.localeCompare(b.id);
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
  // No status filter. This resolves WHICH STUDENTS a class/route/name
  // filter refers to, and a payment made by a student who has since left
  // is still a payment that happened. Filtering to active students meant
  // picking a class made every leaver's receipt disappear from a finance
  // record that is supposed to be append-only.
  let query = supabase
    .from("students")
    .select("id, class_ref:classes!inner(id, session_label)");

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
  studentIds?: readonly string[] | null;
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

  const buildQuery = (from: number, to: number) => {
    let query = supabase
      .from("v_workbook_student_financials")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("student_name", { ascending: true })
      // Stable tiebreaker so rows cannot drift between pages when two students
      // share a sort_order and a name.
      .order("student_id", { ascending: true })
      .range(from, to);

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
      // "Active only" means financially in scope, which is not quite the same as
      // on the roll. A student who left owing money still owes it: the school
      // rule is that a leaver who never paid has their dues cancelled (the
      // withdraw action cancels every clean unpaid installment, so they carry
      // nothing anyway), but a leaver who HAD paid keeps their remaining dues
      // and they must still be collected. Filtering on record_status alone hid
      // Rs 17,250 of collectable money across three students in the live
      // session -- the ledger held the debt while every report denied it.
      query = query.or("record_status.eq.active,total_paid.gt.0");
    }

    return query;
  };

  // An explicit limit is caller-controlled pagination — honour it exactly and
  // do not page past it. Without one, read every row: this view is one row per
  // student and the roster grows, so an unpaged select would eventually hit the
  // same silent PostgREST truncation that broke the installment view.
  if (typeof filters?.limit === "number") {
    const offset = Math.max(0, Math.floor(filters.offset ?? 0));
    const size = Math.max(1, Math.floor(filters.limit));
    const { data, error } = await buildQuery(offset, offset + size - 1);

    if (error) {
      throw new Error(`Unable to load workbook student financials: ${error.message}`);
    }

    return ((data ?? []) as WorkbookStudentFinancialRow[]).map(mapFinancialRow);
  }

  const { data, error } = await fetchAllPages<WorkbookStudentFinancialRow>((from, to) =>
    buildQuery(from, to),
  );

  if (error) {
    throw new Error(
      `Unable to load workbook student financials: ${
        describeError(error)
      }`,
    );
  }

  return data.map(mapFinancialRow);
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

  // PAGED, not a single select. One session of this view is 4 rows per student
  // plus any carry-forward row — 2,000 for the 481-student live session — and
  // PostgREST truncates a response at its max-rows ceiling without an error.
  // The unpaged version returned the first 1,000 and every caller believed it:
  // the dashboard reported ₹56.8L expected instead of ₹1.14 Cr, and the
  // installment export wrote half a file. See fetchAllPages.
  const { data, error } = await fetchAllPages<WorkbookInstallmentBalanceRow>(
    (from, to) => {
      let query = supabase
        .from("v_workbook_installment_balances")
        .select("*")
        .order("due_date", { ascending: true })
        .order("installment_no", { ascending: true })
        .order("student_name", { ascending: true })
        // Ties on all three sort keys would otherwise let rows drift between
        // pages; id is unique, so it pins the order across requests.
        .order("installment_id", { ascending: true })
        .range(from, to);

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

      return query;
    },
  );

  if (error) {
    throw new Error(
      `Unable to load workbook installment rows: ${
        describeError(error)
      }`,
    );
  }

  return data.map(mapInstallmentRow);
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

/**
 * Fold receipt rows into mode totals. Shared by the scoped and unscoped paths
 * so the two can never drift apart on what counts.
 *
 * Fully reversed receipts are dropped first. A reversal never changes
 * `receipts.total_amount` — it writes a compensating `payment_adjustments` row —
 * so folding the raw column counts money that was handed back, and the day
 * strip would disagree with the dashboard on the same day's takings.
 */
async function sumReceiptSnapshot(
  allRows: Array<{ id: string; payment_mode: string | null; total_amount: number | null }>,
): Promise<TodayReceiptSnapshot> {
  const reversalTotals = await getReceiptReversalTotals(allRows.map((row) => row.id));
  const rows = allRows.filter(
    (row) => !isReceiptReversed(reversalTotals, row.id, row.total_amount ?? 0),
  );

  const totals: TodayReceiptSnapshot = {
    receiptCount: 0,
    total: 0,
    cashTotal: 0,
    upiTotal: 0,
    bankTotal: 0,
    chequeTotal: 0,
  };

  for (const row of rows) {
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
      default:
        break;
    }
  }

  return totals;
}

export async function getTodayReceiptSnapshot(
  options: { sessionLabel?: string } = {},
): Promise<TodayReceiptSnapshot> {
  const supabase = await createClient();

  // Receipts carry no session_label, so the scope travels through the
  // student's class.
  //
  // This used to load every active student id and hand them to
  // `.in("student_id", ...)`. At ~460 students that put ~17KB of UUIDs into
  // the query string and fetch refused to send it — which took the whole
  // Transactions route down with "fetch failed". The failure scaled in with
  // the roster rather than showing up in testing.
  //
  // The inner join does the same scoping server-side and is the shape
  // getShellPulse (lib/dashboard/shell-metrics.ts) already uses against this
  // table. Embedding students under RECEIPTS is supported; it is the
  // payments→students embed that has no FK to travel.
  if (options.sessionLabel) {
    const { data, error } = await supabase
      .from("receipts")
      .select(
        "id, payment_mode, total_amount, student_ref:students!inner(class_ref:classes!inner(session_label))",
      )
      .eq("student_ref.class_ref.session_label", options.sessionLabel)
      .eq("payment_date", getTodayStamp());

    if (error) {
      throw new Error(`Unable to load today receipt snapshot: ${error.message}`);
    }

    return sumReceiptSnapshot(
      (data ?? []) as Array<{ id: string; payment_mode: string | null; total_amount: number | null }>,
    );
  }

  const { data, error } = await supabase
    .from("receipts")
    .select("id, payment_mode, total_amount")
    .eq("payment_date", getTodayStamp());

  if (error) {
    throw new Error(`Unable to load today receipt snapshot: ${error.message}`);
  }

  return sumReceiptSnapshot(
    (data ?? []) as Array<{ id: string; payment_mode: string | null; total_amount: number | null }>,
  );
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
  /** Extra student scope, ANDed with the class/route scope. Segment filters use this. */
  studentIds?: readonly string[] | null;
  sessionLabel?: string;
  toDate?: string;
}) {
  const supabase = await createClient();
  const normalizedSearch = normalizeTransactionSearch(filters?.query);
  // Class/route/name filters scope by student attributes (current class, route,
  // name) and stay student-based. Session scoping, however, must follow the
  // installment frozen on each payment — NOT the student's current class — so a
  // promoted student's prior-year receipts stay under the session they paid into.
  const hasStudentScopeFilter = Boolean(filters?.classId || filters?.routeId);

  // Run the student-id and session-receipt lookups in parallel to save round-trips.
  const [scopedStudentIds, searchStudentIds, sessionReceiptIds] = await Promise.all([
    filters?.studentId || !hasStudentScopeFilter
      ? Promise.resolve(null)
      : loadTransactionStudentIds({
          classId: filters?.classId,
          routeId: filters?.routeId,
        }),
    filters?.studentId || !normalizedSearch
      ? Promise.resolve(null)
      : loadTransactionStudentIds({
          classId: filters?.classId,
          query: normalizedSearch,
          routeId: filters?.routeId,
        }),
    filters?.sessionLabel
      ? loadSessionScopedReceiptIds(filters.sessionLabel)
      : Promise.resolve(null),
  ]);

  // Two independent scopes: the class/route lookup above, and an explicit id
  // list from the caller (segment filters). Intersect rather than override --
  // "Class 5" AND "old balance due" has to mean both.
  const explicitStudentIds = filters?.studentIds ? [...new Set(filters.studentIds)] : null;
  const effectiveStudentIds =
    scopedStudentIds && explicitStudentIds
      ? scopedStudentIds.filter((id) => explicitStudentIds.includes(id))
      : (scopedStudentIds ?? explicitStudentIds);

  if (effectiveStudentIds && effectiveStudentIds.length === 0) {
    return [];
  }

  if (sessionReceiptIds && sessionReceiptIds.length === 0) {
    return [];
  }

  // Every filter except the receipt-id scope and the row cap. Built per batch so
  // the chunked path applies exactly the same predicates as the single-shot one.
  const buildReceiptQuery = (receiptIdChunk: readonly string[] | null) => {
    let query = supabase
      .from("receipts")
      .select(
        "id, receipt_number, payment_date, created_at, payment_mode, total_amount, reference_number, received_by, student_id, student_ref:students(id, full_name, admission_no, father_name, primary_phone, transport_route_id, class_ref:classes(id, session_label, class_name, section, stream_name), route_ref:transport_routes(route_name, route_code))",
      )
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (filters?.studentId) {
      query = query.eq("student_id", filters.studentId);
    } else if (effectiveStudentIds) {
      // Bounded by a class/route/segment filter, so this list stays
      // roster-sized and does not need batching.
      query = query.in("student_id", effectiveStudentIds);
    }

    if (receiptIdChunk) {
      query = query.in("id", receiptIdChunk);
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

      /**
       * The matched-student ids go inline, but only while they fit in a URL.
       *
       * A short query matches most of the roster — `?query=a` matched every
       * student — and inlining 500 UUIDs into one `or=(...)` builds a ~20 KB
       * request URL that PostgREST rejects with `400 Bad Request`. The whole
       * Transactions page then rendered as bare chrome: no rows, no message,
       * nothing to act on. That is what an office saw the moment somebody typed
       * a single letter into the search box. It is the same URL-length failure
       * the comment on RECEIPT_ID_FILTER_CHUNK_SIZE describes, in a second
       * place that did not get the same treatment.
       *
       * Two things are deliberately NOT done when the list is too long:
       *  - it is not truncated, because a truncated id list silently hides a
       *    family's receipts, and a wrong total is worse than a slow one;
       *  - the id clause is not simply dropped, because the remaining
       *    receipt-number match would answer "no receipts" for a search that
       *    plainly has some.
       *
       * Instead the DB-side search is skipped altogether and the rows are
       * matched by name in JS — `filterStudentRows` in lib/transactions/dues.ts
       * already applies exactly this predicate to whatever comes back. The
       * result is a broad search that reads the first page rather than the
       * whole table, which is the honest behaviour for "show me everything
       * containing the letter a".
       */
      const idsFitInUrl =
        searchStudentIds !== null &&
        searchStudentIds.length > 0 &&
        searchStudentIds.length <= SEARCH_STUDENT_ID_INLINE_LIMIT;

      const searchIsTooBroadToNarrow =
        searchStudentIds !== null &&
        searchStudentIds.length > SEARCH_STUDENT_ID_INLINE_LIMIT;

      if (idsFitInUrl) {
        receiptSearchParts.push(`student_id.in.(${toPostgrestInList(searchStudentIds)})`);
      }

      if (!searchIsTooBroadToNarrow) {
        query = query.or(receiptSearchParts.join(","));
      }
    }

    return query;
  };

  const hasExplicitLimit = typeof filters?.limit === "number";
  const explicitLimit = hasExplicitLimit ? Math.max(1, Math.floor(filters.limit as number)) : 0;
  const rowOffset = hasExplicitLimit ? Math.max(0, Math.floor(filters?.offset ?? 0)) : 0;
  // Total rows the DB must return for the caller's page to be satisfiable.
  // `null` means "no cap" (export callers pass limit: null).
  const rowCap = hasExplicitLimit
    ? rowOffset + explicitLimit
    : filters?.limit !== null
      ? 250
      : null;

  let receipts: ReceiptRow[];

  if (!sessionReceiptIds) {
    let query = buildReceiptQuery(null);

    if (hasExplicitLimit) {
      query = query.range(rowOffset, rowOffset + explicitLimit - 1);
    } else if (rowCap !== null) {
      query = query.limit(rowCap);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Unable to load workbook transactions: ${error.message}`);
    }

    receipts = (data ?? []) as ReceiptRow[];
  } else {
    // Chunked path: each batch is capped at `rowCap` (not at the page size) so
    // that after merging there are always enough rows to satisfy offset+limit,
    // then the ordering and the page slice are re-applied in JS. Batches are
    // disjoint id sets, so no de-duplication is needed. fetchInChunks stops at
    // the first failing batch and surfaces its error.
    const { data, error } = await fetchInChunks<ReceiptRow>(
      sessionReceiptIds,
      RECEIPT_ID_FILTER_CHUNK_SIZE,
      (chunk) => {
        const query = buildReceiptQuery(chunk);
        return (rowCap === null ? query : query.limit(rowCap)) as unknown as PromiseLike<{
          data: ReceiptRow[] | null;
          error: unknown;
        }>;
      },
    );

    if (error) {
      const message = (error as { message?: string }).message ?? String(error);
      throw new Error(`Unable to load workbook transactions: ${message}`);
    }

    receipts = data
      .sort(compareReceiptRowsForListing)
      .slice(rowOffset, rowCap === null ? undefined : rowCap);
  }

  const receiptStudentIds = [...new Set(receipts.map((row) => row.student_id).filter(Boolean))];
  // Reversed receipts (undo / refund) must be visibly flagged in every list.
  const reversalTotals = await getReceiptReversalTotals(receipts.map((row) => row.id));
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
        transportRouteLabel: buildRouteLabel(routeRef, financial?.transportFee ?? null),
        sessionLabel: classRef?.session_label ?? null,
        currentOutstanding: financial?.outstandingAmount ?? 0,
        currentTotalPaid: financial?.totalPaid ?? 0,
        discountApplied: financial?.discountAmount ?? 0,
        lateFeeWaived: financial?.lateFeeWaiverAmount ?? 0,
        isReversed: isReceiptReversed(reversalTotals, row.id, row.total_amount),
      } satisfies WorkbookTransaction;
    })
    .filter((row) => (filters?.classId ? row.classId === filters.classId : true))
    .filter((row) =>
      matchesTransportRouteFilter(filters?.routeId, {
        transportRouteId: row.transportRouteId,
        routeName: row.transportRouteLabel,
        transportFeeAmount: financialMap.get(row.studentId)?.transportFee ?? null,
      }),
    )
    // Session scoping is enforced upstream via installment-frozen receipt ids
    // (.in("id", sessionReceiptIds)); the current-class post-filter that used to
    // sit here would have dropped promoted students' prior-year receipts.
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
