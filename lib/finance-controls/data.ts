import "server-only";

import { formatPaymentModeLabel } from "@/lib/config/fee-rules";
import { createClient } from "@/lib/supabase/server";

import type { AdjustmentType, PaymentMode, RefundRequestStatus } from "@/lib/db/types";

import type {
  FinanceClosureRecord,
  FinanceControlsPageData,
  FinanceCorrectionReviewRow,
  FinanceDayBookRow,
  FinanceDaySummarySnapshot,
  FinanceModeTotal,
  FinanceReceiptOption,
  FinanceRefundRequestRow,
  FinanceReceivedByTotal,
} from "@/lib/finance-controls/types";

type ClassRow = {
  class_name: string;
  section: string | null;
  stream_name: string | null;
};

type StudentRow = {
  id: string;
  full_name: string;
  admission_no: string;
  class_ref: ClassRow | ClassRow[] | null;
};

type ReceiptRow = {
  id: string;
  receipt_number: string;
  payment_date: string;
  payment_mode: PaymentMode;
  total_amount: number;
  reference_number: string | null;
  notes: string | null;
  received_by: string | null;
  created_at: string;
  created_by: string | null;
  student_ref: StudentRow | StudentRow[] | null;
};

type RefundRow = {
  id: string;
  refund_date: string;
  requested_amount: number;
  refund_method: PaymentMode;
  refund_reference: string | null;
  reason: string;
  notes: string | null;
  status: RefundRequestStatus;
  approval_note: string | null;
  processing_note: string | null;
  created_at: string;
  approved_at: string | null;
  processed_at: string | null;
  created_by: string | null;
  approved_by: string | null;
  processed_by: string | null;
  receipt_ref: ReceiptRow | ReceiptRow[] | null;
};

type PaymentRefRow = {
  amount: number;
  receipt_ref: ReceiptRow | ReceiptRow[] | null;
  installment_ref: {
    installment_label: string;
    due_date: string;
  } | {
    installment_label: string;
    due_date: string;
  }[]
    | null;
  student_ref: StudentRow | StudentRow[] | null;
};

type PaymentAdjustmentRow = {
  id: string;
  payment_id: string;
  adjustment_type: AdjustmentType;
  amount_delta: number;
  reason: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  payment_ref: PaymentRefRow | PaymentRefRow[] | null;
};

type AdjustmentReviewRow = {
  payment_adjustment_id: string;
  review_status: "reviewed" | "flagged" | "needs_followup";
  review_note: string | null;
  created_at: string;
  created_by: string | null;
};

type CollectionCloseRow = {
  id: string;
  payment_date: string;
  status: "draft" | "pending_approval" | "closed" | "reopened";
  cash_deposit_status: "pending" | "deposited" | "carried_forward" | "not_applicable";
  reconciliation_status: "pending" | "in_review" | "cleared" | "issue_found";
  bank_deposit_reference: string | null;
  close_note: string | null;
  summary_snapshot: unknown;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
};

type UserRow = {
  id: string;
  full_name: string;
};

type SingleRecord<T> = T | T[] | null;

function toSingleRecord<T>(value: SingleRecord<T>) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function normalizeDate(value: string | undefined | null) {
  const normalized = (value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return new Date().toISOString().slice(0, 10);
  }

  return normalized;
}

function getDatePart(value: string) {
  return value.slice(0, 10);
}

function addOneDay(dateValue: string) {
  const utcDate = new Date(`${dateValue}T00:00:00.000Z`);
  utcDate.setUTCDate(utcDate.getUTCDate() + 1);
  return utcDate.toISOString().slice(0, 10);
}

function buildClassLabel(value: ClassRow) {
  const parts = [value.class_name];

  if (value.section) {
    parts.push(`Section ${value.section}`);
  }

  if (value.stream_name) {
    parts.push(value.stream_name);
  }

  return parts.join(" - ");
}

function parseSummarySnapshot(value: unknown): FinanceDaySummarySnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      receiptCount: 0,
      receiptTotal: 0,
      refundRequestCount: 0,
      refundRequestTotal: 0,
      refundProcessedCount: 0,
      refundProcessedTotal: 0,
      netCashTotal: 0,
      pendingRefundCount: 0,
      pendingRefundTotal: 0,
      correctionCount: 0,
      correctionNet: 0,
      pendingCorrectionCount: 0,
      pendingCorrectionNet: 0,
      modeTotals: [],
      receivedByTotals: [],
      closeStatus: null,
      cashDepositStatus: null,
      reconciliationStatus: null,
    };
  }

  const raw = value as Record<string, unknown>;
  const modeTotals = Array.isArray(raw.modeTotals)
    ? (raw.modeTotals as Array<Record<string, unknown>>).map((item) => ({
        paymentMode:
          item.paymentMode === "cash" ||
          item.paymentMode === "upi" ||
          item.paymentMode === "bank_transfer" ||
          item.paymentMode === "cheque"
            ? item.paymentMode
            : "cash",
        totalAmount: typeof item.totalAmount === "number" ? item.totalAmount : 0,
        receiptCount: typeof item.receiptCount === "number" ? item.receiptCount : 0,
      })) as FinanceModeTotal[]
    : [];

  const receivedByTotals = Array.isArray(raw.receivedByTotals)
    ? (raw.receivedByTotals as Array<Record<string, unknown>>).map((item) => ({
        receivedBy: typeof item.receivedBy === "string" ? item.receivedBy : "Unspecified",
        totalAmount: typeof item.totalAmount === "number" ? item.totalAmount : 0,
        receiptCount: typeof item.receiptCount === "number" ? item.receiptCount : 0,
      }))
    : [];

  return {
    receiptCount: typeof raw.receiptCount === "number" ? raw.receiptCount : 0,
    receiptTotal: typeof raw.receiptTotal === "number" ? raw.receiptTotal : 0,
    refundRequestCount: typeof raw.refundRequestCount === "number" ? raw.refundRequestCount : 0,
    refundRequestTotal: typeof raw.refundRequestTotal === "number" ? raw.refundRequestTotal : 0,
    refundProcessedCount: typeof raw.refundProcessedCount === "number" ? raw.refundProcessedCount : 0,
    refundProcessedTotal: typeof raw.refundProcessedTotal === "number" ? raw.refundProcessedTotal : 0,
    netCashTotal: typeof raw.netCashTotal === "number" ? raw.netCashTotal : 0,
    pendingRefundCount: typeof raw.pendingRefundCount === "number" ? raw.pendingRefundCount : 0,
    pendingRefundTotal: typeof raw.pendingRefundTotal === "number" ? raw.pendingRefundTotal : 0,
    correctionCount: typeof raw.correctionCount === "number" ? raw.correctionCount : 0,
    correctionNet: typeof raw.correctionNet === "number" ? raw.correctionNet : 0,
    pendingCorrectionCount:
      typeof raw.pendingCorrectionCount === "number" ? raw.pendingCorrectionCount : 0,
    pendingCorrectionNet:
      typeof raw.pendingCorrectionNet === "number" ? raw.pendingCorrectionNet : 0,
    modeTotals,
    receivedByTotals,
    closeStatus:
      raw.closeStatus === "draft" ||
      raw.closeStatus === "pending_approval" ||
      raw.closeStatus === "closed" ||
      raw.closeStatus === "reopened"
        ? raw.closeStatus
        : null,
    cashDepositStatus:
      raw.cashDepositStatus === "pending" ||
      raw.cashDepositStatus === "deposited" ||
      raw.cashDepositStatus === "carried_forward" ||
      raw.cashDepositStatus === "not_applicable"
        ? raw.cashDepositStatus
        : null,
    reconciliationStatus:
      raw.reconciliationStatus === "pending" ||
      raw.reconciliationStatus === "in_review" ||
      raw.reconciliationStatus === "cleared" ||
      raw.reconciliationStatus === "issue_found"
        ? raw.reconciliationStatus
        : null,
  };
}

function statusToneForRefund(status: RefundRequestStatus) {
  if (status === "processed") {
    return "good" as const;
  }

  if (status === "approved") {
    return "accent" as const;
  }

  if (status === "rejected") {
    return "neutral" as const;
  }

  return "warning" as const;
}

function statusLabelForRefund(status: RefundRequestStatus) {
  switch (status) {
    case "pending_approval":
      return "Pending approval";
    case "approved":
      return "Approved";
    case "processed":
      return "Processed";
    case "rejected":
      return "Rejected";
  }
}

function statusToneForClosure(status: CollectionCloseRow["status"]) {
  switch (status) {
    case "closed":
      return "good" as const;
    case "pending_approval":
      return "warning" as const;
    case "reopened":
      return "accent" as const;
    case "draft":
    default:
      return "neutral" as const;
  }
}

function statusLabelForClosure(status: CollectionCloseRow["status"]) {
  switch (status) {
    case "draft":
      return "Draft";
    case "pending_approval":
      return "Pending approval";
    case "closed":
      return "Closed";
    case "reopened":
      return "Reopened";
  }
}

function statusToneForReconciliation(status: CollectionCloseRow["reconciliation_status"]) {
  switch (status) {
    case "cleared":
      return "good" as const;
    case "issue_found":
      return "warning" as const;
    case "in_review":
      return "accent" as const;
    case "pending":
    default:
      return "neutral" as const;
  }
}

function statusLabelForReconciliation(status: CollectionCloseRow["reconciliation_status"]) {
  switch (status) {
    case "pending":
      return "Pending reconciliation";
    case "in_review":
      return "In review";
    case "cleared":
      return "Cleared";
    case "issue_found":
      return "Issue found";
  }
}

function statusToneForCashDeposit(status: CollectionCloseRow["cash_deposit_status"]) {
  switch (status) {
    case "deposited":
      return "good" as const;
    case "carried_forward":
      return "warning" as const;
    case "not_applicable":
      return "neutral" as const;
    case "pending":
    default:
      return "accent" as const;
  }
}

function statusLabelForCashDeposit(status: CollectionCloseRow["cash_deposit_status"]) {
  switch (status) {
    case "pending":
      return "Cash deposit pending";
    case "deposited":
      return "Cash deposited";
    case "carried_forward":
      return "Carried forward";
    case "not_applicable":
      return "Not applicable";
  }
}

function toStringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function mapReceipt(row: ReceiptRow): FinanceDayBookRow {
  const student = toSingleRecord(row.student_ref);
  const classRef = student ? toSingleRecord(student.class_ref) : null;
  const classLabel = classRef ? buildClassLabel(classRef) : null;

  return {
    entryType: "collection",
    entryId: row.id,
    entryDate: row.payment_date,
    postedAt: row.created_at,
    studentId: student?.id ?? null,
    studentName: student?.full_name ?? "Unknown student",
    admissionNo: student?.admission_no ?? null,
    classLabel,
    receiptNumber: row.receipt_number,
    referenceNumber: row.reference_number,
    paymentMode: row.payment_mode,
    receivedBy: row.received_by,
    cashIn: row.total_amount,
    cashOut: 0,
    ledgerEffect: row.total_amount,
    statusLabel: `Receipt ${row.receipt_number}`,
    statusTone: "good",
    createdByName: null,
    note: row.notes,
  };
}

function mapRefundRow(
  row: RefundRow,
  userNameMap: Map<string, string>,
): FinanceRefundRequestRow | null {
  const receipt = toSingleRecord(row.receipt_ref);
  const student = receipt ? toSingleRecord(receipt.student_ref) : null;
  const classRef = student ? toSingleRecord(student.class_ref) : null;

  if (!receipt || !student || !classRef) {
    return null;
  }

  return {
    refundRequestId: row.id,
    refundDate: row.refund_date,
    receiptId: receipt.id,
    receiptNumber: receipt.receipt_number,
    paymentDate: receipt.payment_date,
    studentId: student.id,
    studentName: student.full_name,
    admissionNo: student.admission_no,
    classLabel: buildClassLabel(classRef),
    refundMethod: row.refund_method,
    requestedAmount: row.requested_amount,
    refundReference: row.refund_reference,
    status: row.status,
    reason: row.reason,
    notes: row.notes,
    approvalNote: row.approval_note,
    processingNote: row.processing_note,
    requestedAt: row.created_at,
    approvedAt: row.approved_at,
    processedAt: row.processed_at,
    requestedByName: row.created_by ? (userNameMap.get(row.created_by) ?? row.created_by) : null,
    approvedByName: row.approved_by ? (userNameMap.get(row.approved_by) ?? row.approved_by) : null,
    processedByName: row.processed_by ? (userNameMap.get(row.processed_by) ?? row.processed_by) : null,
  };
}

function mapAdjustmentRow(
  row: PaymentAdjustmentRow,
  reviewMap: Map<string, AdjustmentReviewRow>,
  userNameMap: Map<string, string>,
): FinanceCorrectionReviewRow | null {
  const payment = toSingleRecord(row.payment_ref);
  const receipt = payment ? toSingleRecord(payment.receipt_ref) : null;
  const student = payment ? toSingleRecord(payment.student_ref) : null;
  const installment = payment ? toSingleRecord(payment.installment_ref) : null;
  const classRef = student ? toSingleRecord(student.class_ref) : null;

  if (!payment || !receipt || !student || !classRef || !installment) {
    return null;
  }

  const review = reviewMap.get(row.id) ?? null;

  return {
    paymentAdjustmentId: row.id,
    paymentId: row.payment_id,
    entryDate: getDatePart(row.created_at),
    postedAt: row.created_at,
    studentId: student.id,
    studentName: student.full_name,
    admissionNo: student.admission_no,
    classLabel: buildClassLabel(classRef),
    paymentMode: receipt.payment_mode,
    receivedBy: receipt.received_by,
    receiptNumber: receipt.receipt_number,
    paymentDate: receipt.payment_date,
    installmentLabel: installment.installment_label,
    adjustmentType: row.adjustment_type,
    amountDelta: row.amount_delta,
    reason: row.reason,
    notes: row.notes,
    reviewStatus: review ? review.review_status : "pending",
    reviewNote: review?.review_note ?? null,
    reviewedByName: review?.created_by
      ? (userNameMap.get(review.created_by) ?? review.created_by)
      : null,
    reviewedAt: review?.created_at ?? null,
    createdByName: row.created_by ? (userNameMap.get(row.created_by) ?? row.created_by) : null,
  };
}

function buildSummarySnapshot(payload: {
  receipts: ReceiptRow[];
  refunds: FinanceRefundRequestRow[];
  corrections: FinanceCorrectionReviewRow[];
  closure: FinanceClosureRecord | null;
}): FinanceDaySummarySnapshot {
  const modeMap = new Map<
    PaymentMode,
    { paymentMode: PaymentMode; totalAmount: number; receiptCount: number }
  >();
  const cashierMap = new Map<string, { receivedBy: string; totalAmount: number; receiptCount: number }>();
  let receiptTotal = 0;

  payload.receipts.forEach((row) => {
    receiptTotal += row.total_amount;

    const modeExisting = modeMap.get(row.payment_mode);
    if (modeExisting) {
      modeExisting.totalAmount += row.total_amount;
      modeExisting.receiptCount += 1;
    } else {
      modeMap.set(row.payment_mode, {
        paymentMode: row.payment_mode,
        totalAmount: row.total_amount,
        receiptCount: 1,
      });
    }

    const cashierKey = row.received_by ?? "Unspecified";
    const cashierExisting = cashierMap.get(cashierKey);
    if (cashierExisting) {
      cashierExisting.totalAmount += row.total_amount;
      cashierExisting.receiptCount += 1;
    } else {
      cashierMap.set(cashierKey, {
        receivedBy: cashierKey,
        totalAmount: row.total_amount,
        receiptCount: 1,
      });
    }
  });

  const refundRequestCount = payload.refunds.length;
  const refundRequestTotal = payload.refunds.reduce((sum, row) => sum + row.requestedAmount, 0);
  const refundProcessedRows = payload.refunds.filter((row) => row.status === "processed");
  const refundProcessedCount = refundProcessedRows.length;
  const refundProcessedTotal = refundProcessedRows.reduce((sum, row) => sum + row.requestedAmount, 0);
  const pendingRefundRows = payload.refunds.filter((row) => row.status === "pending_approval" || row.status === "approved");
  const pendingRefundTotal = pendingRefundRows.reduce((sum, row) => sum + row.requestedAmount, 0);
  const correctionCount = payload.corrections.length;
  const correctionNet = payload.corrections.reduce((sum, row) => sum + row.amountDelta, 0);
  const pendingCorrectionRows = payload.corrections.filter((row) => row.reviewStatus === "pending");
  const pendingCorrectionNet = pendingCorrectionRows.reduce((sum, row) => sum + row.amountDelta, 0);
  const modeTotals = Array.from(modeMap.values()).sort((left, right) =>
    left.paymentMode.localeCompare(right.paymentMode),
  );
  const receivedByTotals = Array.from(cashierMap.values()).sort((left, right) =>
    right.totalAmount - left.totalAmount || left.receivedBy.localeCompare(right.receivedBy),
  );

  return {
    receiptCount: payload.receipts.length,
    receiptTotal,
    refundRequestCount,
    refundRequestTotal,
    refundProcessedCount,
    refundProcessedTotal,
    netCashTotal: receiptTotal - refundProcessedTotal,
    pendingRefundCount: pendingRefundRows.length,
    pendingRefundTotal,
    correctionCount,
    correctionNet,
    pendingCorrectionCount: pendingCorrectionRows.length,
    pendingCorrectionNet,
    modeTotals,
    receivedByTotals,
    closeStatus: payload.closure?.status ?? null,
    cashDepositStatus: payload.closure?.cashDepositStatus ?? null,
    reconciliationStatus: payload.closure?.reconciliationStatus ?? null,
  };
}

async function loadUserNameMap(userIds: string[]) {
  const uniqueIds = Array.from(new Set(userIds.filter((value): value is string => Boolean(value))));

  if (uniqueIds.length === 0) {
    return new Map<string, string>();
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("users").select("id, full_name").in("id", uniqueIds);

  if (error) {
    throw new Error(`Unable to load finance staff names: ${error.message}`);
  }

  const nameMap = new Map<string, string>();
  ((data ?? []) as UserRow[]).forEach((row) => {
    nameMap.set(row.id, row.full_name);
  });

  return nameMap;
}

export function normalizeFinanceDateFilter(value: string | undefined | null) {
  return normalizeDate(value);
}

export function buildFinanceDayBookFilename(paymentDate: string) {
  return `day-book-${paymentDate}.csv`;
}

export async function getFinanceControlsPageData(
  selectedDateInput: string,
): Promise<FinanceControlsPageData> {
  const selectedDate = normalizeDate(selectedDateInput);
  const nextDate = addOneDay(selectedDate);
  const supabase = await createClient();

  const [
    receiptsResult,
    refundsResult,
    adjustmentsResult,
    closureResult,
  ] = await Promise.all([
    supabase
      .from("receipts")
      .select(
        "id, receipt_number, payment_date, payment_mode, total_amount, reference_number, notes, received_by, created_at, created_by, student_ref:students(id, full_name, admission_no, class_ref:classes(class_name, section, stream_name))",
      )
      .eq("payment_date", selectedDate)
      .order("created_at", { ascending: false }),
    supabase
      .from("refund_requests")
      .select(
        "id, refund_date, requested_amount, refund_method, refund_reference, reason, notes, status, approval_note, processing_note, created_at, approved_at, processed_at, created_by, approved_by, processed_by, receipt_ref:receipts(id, receipt_number, payment_date, payment_mode, total_amount, reference_number, notes, received_by, created_at, created_by, student_ref:students(id, full_name, admission_no, class_ref:classes(class_name, section, stream_name)))",
      )
      .eq("refund_date", selectedDate)
      .order("created_at", { ascending: false }),
    supabase
      .from("payment_adjustments")
      .select(
        "id, payment_id, adjustment_type, amount_delta, reason, notes, created_at, created_by, payment_ref:payments(amount, receipt_ref:receipts(id, receipt_number, payment_date, payment_mode, total_amount, reference_number, notes, received_by, created_at, created_by, student_ref:students(id, full_name, admission_no, class_ref:classes(class_name, section, stream_name))), installment_ref:installments(installment_label, due_date), student_ref:students(id, full_name, admission_no, class_ref:classes(class_name, section, stream_name)))",
      )
      .gte("created_at", `${selectedDate}T00:00:00.000Z`)
      .lt("created_at", `${nextDate}T00:00:00.000Z`)
      .order("created_at", { ascending: false }),
    supabase
      .from("collection_closures")
      .select(
        "id, payment_date, status, cash_deposit_status, reconciliation_status, bank_deposit_reference, close_note, summary_snapshot, created_at, updated_at, created_by, updated_by, approved_at, approved_by, closed_at, closed_by",
      )
      .eq("payment_date", selectedDate)
      .maybeSingle(),
  ]);

  const receiptsRaw = (receiptsResult.data ?? []) as ReceiptRow[];
  const refundsRaw = (refundsResult.data ?? []) as RefundRow[];
  const adjustmentsRaw = (adjustmentsResult.data ?? []) as PaymentAdjustmentRow[];
  const closureRaw = (closureResult.data ?? null) as CollectionCloseRow | null;

  if (receiptsResult.error) {
    throw new Error(`Unable to load finance receipts: ${receiptsResult.error.message}`);
  }

  if (refundsResult.error) {
    throw new Error(`Unable to load refund requests: ${refundsResult.error.message}`);
  }

  if (adjustmentsResult.error) {
    throw new Error(`Unable to load payment adjustments: ${adjustmentsResult.error.message}`);
  }

  if (closureResult.error) {
    throw new Error(`Unable to load day close record: ${closureResult.error.message}`);
  }

  const reviewIds = adjustmentsRaw.map((row) => row.id);
  const reviewResult =
    reviewIds.length > 0
      ? await supabase
          .from("payment_adjustment_reviews")
          .select("payment_adjustment_id, review_status, review_note, created_at, created_by")
          .in("payment_adjustment_id", reviewIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null };

  if (reviewResult.error) {
    throw new Error(`Unable to load correction review rows: ${reviewResult.error.message}`);
  }

  const userNameMap = await loadUserNameMap(
    [
    ...(closureRaw
      ? [
          closureRaw.created_by,
          closureRaw.updated_by,
          closureRaw.approved_by,
          closureRaw.closed_by,
        ]
      : []),
    ...refundsRaw.flatMap((row) => [row.created_by, row.approved_by, row.processed_by]),
    ...adjustmentsRaw.map((row) => row.created_by),
    ...((reviewResult.data ?? []) as AdjustmentReviewRow[]).map((row) => row.created_by),
    ].filter((value): value is string => Boolean(value)),
  );

  const refunds = refundsRaw
    .map((row) => mapRefundRow(row, userNameMap))
    .filter((row): row is FinanceRefundRequestRow => row !== null);

  const reviewMap = new Map<string, AdjustmentReviewRow>();
  ((reviewResult.data ?? []) as AdjustmentReviewRow[]).forEach((row) => {
    if (!reviewMap.has(row.payment_adjustment_id)) {
      reviewMap.set(row.payment_adjustment_id, row);
    }
  });

  const corrections = adjustmentsRaw
    .map((row) => mapAdjustmentRow(row, reviewMap, userNameMap))
    .filter((row): row is FinanceCorrectionReviewRow => row !== null);

  const closure: FinanceClosureRecord | null = closureRaw
    ? {
        id: closureRaw.id,
        paymentDate: closureRaw.payment_date,
        status: closureRaw.status,
        cashDepositStatus: closureRaw.cash_deposit_status,
        reconciliationStatus: closureRaw.reconciliation_status,
        bankDepositReference: closureRaw.bank_deposit_reference,
        closeNote: closureRaw.close_note,
        summarySnapshot: parseSummarySnapshot(closureRaw.summary_snapshot),
        createdAt: closureRaw.created_at,
        updatedAt: closureRaw.updated_at,
        createdByName: closureRaw.created_by
          ? (userNameMap.get(closureRaw.created_by) ?? closureRaw.created_by)
          : null,
        updatedByName: closureRaw.updated_by
          ? (userNameMap.get(closureRaw.updated_by) ?? closureRaw.updated_by)
          : null,
        approvedAt: closureRaw.approved_at,
        approvedByName: closureRaw.approved_by
          ? (userNameMap.get(closureRaw.approved_by) ?? closureRaw.approved_by)
          : null,
        closedAt: closureRaw.closed_at,
        closedByName: closureRaw.closed_by
          ? (userNameMap.get(closureRaw.closed_by) ?? closureRaw.closed_by)
          : null,
      }
    : null;

  const receipts = receiptsRaw;
  const summary = buildSummarySnapshot({
    receipts,
    refunds,
    corrections,
    closure,
  });

  const dayBookRows: FinanceDayBookRow[] = [
    ...receipts.map((row) => {
      const student = toSingleRecord(row.student_ref);
      const classRef = student ? toSingleRecord(student.class_ref) : null;

      return {
        entryType: "collection" as const,
        entryId: row.id,
        entryDate: row.payment_date,
        postedAt: row.created_at,
        studentId: student?.id ?? null,
        studentName: student?.full_name ?? "Unknown student",
        admissionNo: student?.admission_no ?? null,
        classLabel: classRef ? buildClassLabel(classRef) : null,
        receiptNumber: row.receipt_number,
        referenceNumber: row.reference_number,
        paymentMode: row.payment_mode,
        receivedBy: row.received_by,
        cashIn: row.total_amount,
        cashOut: 0,
        ledgerEffect: row.total_amount,
        statusLabel: `Receipt ${row.receipt_number}`,
        statusTone: "good" as const,
        createdByName: row.created_by ? (userNameMap.get(row.created_by) ?? row.created_by) : null,
        note: row.notes,
      };
    }),
    ...refunds.map((row) => ({
      entryType: "refund" as const,
      entryId: row.refundRequestId,
      entryDate: row.refundDate,
      postedAt: row.requestedAt,
      studentId: row.studentId,
      studentName: row.studentName,
      admissionNo: row.admissionNo,
      classLabel: row.classLabel,
      receiptNumber: row.receiptNumber,
      referenceNumber: row.refundReference,
      paymentMode: row.refundMethod,
      receivedBy: row.requestedByName,
      cashIn: 0,
      cashOut: row.requestedAmount,
      ledgerEffect: 0,
      statusLabel: statusLabelForRefund(row.status),
      statusTone: statusToneForRefund(row.status),
      createdByName: row.requestedByName,
      note: row.reason,
    })),
    ...corrections.map((row) => ({
      entryType: "correction" as const,
      entryId: row.paymentAdjustmentId,
      entryDate: row.entryDate,
      postedAt: row.postedAt,
      studentId: row.studentId,
      studentName: row.studentName,
      admissionNo: row.admissionNo,
      classLabel: row.classLabel,
      receiptNumber: row.receiptNumber,
      referenceNumber: row.reason,
      paymentMode: row.paymentMode,
      receivedBy: row.receivedBy,
      cashIn: 0,
      cashOut: 0,
      ledgerEffect: row.amountDelta,
      statusLabel: row.reviewStatus === "pending" ? "Pending review" : `Review ${row.reviewStatus}`,
      statusTone: (
        row.reviewStatus === "pending"
          ? "warning"
          : row.reviewStatus === "reviewed"
            ? "good"
            : "accent"
      ) as "good" | "warning" | "neutral" | "accent",
      createdByName: row.createdByName,
      note: row.reviewNote ?? row.notes ?? null,
    })),
  ].sort((left, right) => right.postedAt.localeCompare(left.postedAt));

  const receiptOptions: FinanceReceiptOption[] = receipts.map((row) => ({
    id: row.id,
    label: `${row.receipt_number} - ${toSingleRecord(row.student_ref)?.full_name ?? "Student"}`,
    receiptNumber: row.receipt_number,
    paymentDate: row.payment_date,
    totalAmount: row.total_amount,
  }));

  return {
    selectedDate,
    summary,
    closure,
    modeTotals: summary.modeTotals,
    receivedByTotals: summary.receivedByTotals,
    dayBookRows,
    refundRequests: refunds,
    correctionRows: corrections,
    receiptOptions,
  };
}

export async function getFinanceDayBookCsvData(selectedDateInput: string) {
  const data = await getFinanceControlsPageData(selectedDateInput);

  return {
    filename: buildFinanceDayBookFilename(data.selectedDate),
    headers: [
      "Entry type",
      "Entry date",
      "Posted at",
      "Student",
      "SR no",
      "Class",
      "Receipt no",
      "Reference / reason",
      "Payment mode",
      "Cash in",
      "Cash out",
      "Ledger effect",
      "Status",
      "Received by",
      "Created by",
      "Notes",
    ],
      rows: data.dayBookRows.map((row) => [
      row.entryType,
      row.entryDate,
      row.postedAt,
      row.studentName,
      row.admissionNo,
      row.classLabel,
      row.receiptNumber,
      row.referenceNumber,
      row.paymentMode ? formatPaymentModeLabel(row.paymentMode) : null,
      row.cashIn,
      row.cashOut,
      row.ledgerEffect,
      row.statusLabel,
      row.receivedBy,
      row.createdByName,
      row.note,
    ]),
  };
}

export function serializeFinanceDayBookCsv(payload: {
  headers: string[];
  rows: Array<Array<string | number | null>>;
}) {
  const rows = [payload.headers, ...payload.rows];

  return rows
    .map((row) =>
      row
        .map((value) => {
          if (value === null || value === undefined) {
            return "";
          }

          const normalized = String(value).replace(/"/g, '""');
          return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized;
        })
        .join(","),
    )
    .join("\n");
}

export {
  formatPaymentModeLabel,
  statusLabelForCashDeposit,
  statusLabelForClosure,
  statusLabelForReconciliation,
  statusToneForCashDeposit,
  statusToneForClosure,
  statusToneForReconciliation,
};
