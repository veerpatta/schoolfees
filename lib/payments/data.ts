import "server-only";

import type { PaymentMode } from "@/lib/db/types";
import { getFeePolicySummary } from "@/lib/fees/data";
import { createClient } from "@/lib/supabase/server";
import { getStudentDetail } from "@/lib/students/data";
import {
  prepareDuesForStudentsAutomatically,
} from "@/lib/system-sync/finance-sync";
import { getWorkbookStudentFinancials } from "@/lib/workbook/data";
import type {
  InstallmentBalanceItem,
  PaymentDeskStudentSummary,
  PaymentDeskIssue,
  PaymentEntryPageData,
  PaymentStudentIndexItem,
  PaymentPostingDiagnostic,
  SelectedStudentSummary,
} from "@/lib/payments/types";

type PostStudentPaymentRow = {
  receipt_id: string;
  receipt_number: string;
  allocated_total: number;
};

type PaymentPreviewRpcRow = {
  installment_id: string;
  installment_no: number;
  installment_label: string;
  due_date: string;
  total_charge: number;
  paid_amount: number;
  adjustment_amount: number;
  raw_late_fee: number;
  waiver_applied: number;
  final_late_fee: number;
  pending_amount: number;
  balance_status: InstallmentBalanceItem["balanceStatus"];
};

type PaymentStudentBaseRow = {
  id: string;
  full_name: string;
  admission_no: string;
  father_name: string | null;
  primary_phone: string | null;
  secondary_phone: string | null;
  class_ref:
    | {
        id: string;
        session_label: string;
        class_name: string;
        section: string | null;
        stream_name: string | null;
        status: string;
      }
    | Array<{
        id: string;
        session_label: string;
        class_name: string;
        section: string | null;
        stream_name: string | null;
        status: string;
      }>
    | null;
};

type StudentFinancialStateRow = {
  student_id: string;
  total_due: number | null;
  total_paid: number | null;
  pending_amount: number | null;
  credit_balance: number | null;
  overpaid_amount: number | null;
  refundable_amount: number | null;
  rows_kept_for_review: number | null;
  installment_pending_amount: number | null;
};

type PaymentDeskReceiptRow = {
  id: string;
  receipt_number: string;
  student_id: string;
  total_amount: number;
  payment_mode: string;
  payment_date: string;
  reference_number: string | null;
  created_at: string | null;
  student_ref:
    | {
        full_name: string;
        admission_no: string;
        father_name: string | null;
        primary_phone: string | null;
        class_ref:
          | {
              class_name: string;
              section: string | null;
              stream_name: string | null;
            }
          | Array<{
              class_name: string;
              section: string | null;
              stream_name: string | null;
            }>
          | null;
      }
    | Array<{
        full_name: string;
        admission_no: string;
        father_name: string | null;
        primary_phone: string | null;
        class_ref:
          | {
              class_name: string;
              section: string | null;
              stream_name: string | null;
            }
          | Array<{
              class_name: string;
              section: string | null;
              stream_name: string | null;
            }>
          | null;
      }>
    | null;
};

export class PaymentPostingPreflightError extends Error {
  diagnostic: PaymentPostingDiagnostic;

  constructor(message: string, diagnostic: PaymentPostingDiagnostic) {
    super(message);
    this.name = "PaymentPostingPreflightError";
    this.diagnostic = diagnostic;
  }
}

export class PaymentPostingRpcError extends Error {
  diagnostic: PaymentPostingDiagnostic;

  constructor(message: string, diagnostic: PaymentPostingDiagnostic) {
    super(message);
    this.name = "PaymentPostingRpcError";
    this.diagnostic = diagnostic;
  }
}

export class DuplicatePaymentWarning extends Error {
  receiptId: string;
  receiptNumber: string;

  constructor(receipt: { id: string; receiptNumber: string }) {
    super(
      "A similar payment was just recorded. Open the latest receipt or start a new payment if this is intentional.",
    );
    this.name = "DuplicatePaymentWarning";
    this.receiptId = receipt.id;
    this.receiptNumber = receipt.receiptNumber;
  }
}

export function toFriendlyPaymentPreviewError(error: unknown) {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? `${"code" in error ? String(error.code) : ""} ${String(error.message)}`
        : String(error);
  const normalized = rawMessage.toLowerCase();

  if (
    normalized.includes("payment preview database function is missing") ||
    normalized.includes("payment preview needs a database update") ||
    normalized.includes("preview_workbook_payment_allocation") ||
    normalized.includes("could not find the function") ||
    normalized.includes("pgrst202") ||
    normalized.includes("42883")
  ) {
    return "Payment preview needs a database update. Ask an admin to open Admin Tools > System checks.";
  }

  if (
    normalized.includes("private.workbook_installment_snapshot") ||
    normalized.includes("permission denied for schema private") ||
    normalized.includes("permission denied for function workbook_installment_snapshot")
  ) {
    return "Payment preview needs a database update. Ask an admin to open Admin Tools > System checks.";
  }

  if (normalized.includes("no pending dues")) {
    return "No pending dues for selected payment date.";
  }

  if (normalized.includes("dues") || normalized.includes("installment")) {
    return "Dues are not prepared for this student.";
  }

  if (normalized.includes("session")) {
    return "Selected student belongs to another session. Align the working session with Fee Setup before posting.";
  }

  return "Unable to refresh payment preview. Ask an admin to check Fee Data Status.";
}

export function toFriendlyPaymentPostingError(error: unknown) {
  if (error instanceof DuplicatePaymentWarning) {
    return error.message;
  }

  if (
    error instanceof PaymentPostingPreflightError ||
    error instanceof PaymentPostingRpcError
  ) {
    return error.message;
  }

  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? `${"code" in error ? String(error.code) : ""} ${String(error.message)}`
        : String(error);
  const normalized = rawMessage.toLowerCase();

  if (
    normalized.includes("cannot exceed") ||
    normalized.includes("exceed total pending") ||
    normalized.includes("amount exceeds")
  ) {
    return "Payment amount exceeds pending amount for the selected payment date.";
  }

  if (normalized.includes("reference number is required")) {
    return "Reference number is required for UPI, bank transfer, and cheque payments.";
  }

  if (normalized.includes("no pending dues") || normalized.includes("total_outstanding")) {
    return "No payable dues found for selected payment date.";
  }

  if (normalized.includes("selected student was not found")) {
    return "Selected student could not be found. Refresh Payment Desk and select the student again.";
  }

  if (normalized.includes("dues") || normalized.includes("installment")) {
    return "Dues exist, but payment posting could not read them. Ask admin to check database update.";
  }

  if (normalized.includes("session")) {
    return "Selected student belongs to another session. Align the working session with Fee Setup before posting.";
  }

  if (normalized.includes("permission") || normalized.includes("not have permission")) {
    return "You do not have permission to post payments.";
  }

  if (
    normalized.includes("post_student_payment") ||
    normalized.includes("could not find the function") ||
    normalized.includes("pgrst202") ||
    normalized.includes("42883")
  ) {
    return "Payment posting needs a database update. Ask an admin to open Admin Tools > System checks.";
  }

  return "Unable to save payment right now. Please check the student, dues, amount, and payment mode.";
}

export function getPaymentPostingDiagnostic(error: unknown) {
  if (
    error instanceof PaymentPostingPreflightError ||
    error instanceof PaymentPostingRpcError
  ) {
    return error.diagnostic;
  }

  return null;
}

function getRawDatabaseError(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const record = error as { code?: unknown; message?: unknown };

    return {
      code: typeof record.code === "string" ? record.code : null,
      message: typeof record.message === "string" ? record.message : null,
    };
  }

  return {
    code: null,
    message: error instanceof Error ? error.message : String(error),
  };
}

function buildPaymentDiagnostic(
  input: Partial<PaymentPostingDiagnostic> & {
    studentId: string | null;
    selectedPaymentDate: string | null;
    reason: string;
  },
): PaymentPostingDiagnostic {
  return {
    rawRpcErrorCode: input.rawRpcErrorCode ?? null,
    rawRpcErrorMessage: input.rawRpcErrorMessage ?? null,
    studentId: input.studentId,
    activeFeeSetupSession: input.activeFeeSetupSession ?? null,
    studentClassSession: input.studentClassSession ?? null,
    installmentCount: input.installmentCount ?? null,
    previewPendingAmount: input.previewPendingAmount ?? null,
    selectedPaymentDate: input.selectedPaymentDate,
    previewWorked: input.previewWorked ?? false,
    postStudentPaymentWorked: input.postStudentPaymentWorked ?? false,
    autoPrepareAttempted: input.autoPrepareAttempted ?? false,
    autoPrepareWorked: input.autoPrepareWorked ?? null,
    reason: input.reason,
  };
}

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
  const parts = [value.class_name];

  if (value.section) {
    parts.push(`Section ${value.section}`);
  }

  if (value.stream_name) {
    parts.push(value.stream_name);
  }

  return parts.join(" - ");
}

function toStudentIndexItem(row: PaymentStudentBaseRow): PaymentStudentIndexItem | null {
  const classRef = toSingleRecord(row.class_ref);

  if (!classRef) {
    return null;
  }

  return {
    id: row.id,
    fullName: row.full_name,
    admissionNo: row.admission_no,
    classId: classRef.id,
    classLabel: buildClassLabel(classRef),
    fatherName: row.father_name,
    fatherPhone: row.primary_phone,
    motherPhone: row.secondary_phone,
    studentStatus: "active",
  };
}

export async function getPaymentDeskStudentIndex() {
  const policy = await getFeePolicySummary();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("students")
    .select(
      "id, full_name, admission_no, father_name, primary_phone, secondary_phone, class_ref:classes!inner(id, session_label, status, class_name, section, stream_name)",
    )
    .eq("status", "active")
    .eq("class_ref.session_label", policy.academicSessionLabel)
    .eq("class_ref.status", "active")
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(`Unable to load Payment Desk student index: ${error.message}`);
  }

  return ((data ?? []) as PaymentStudentBaseRow[])
    .map(toStudentIndexItem)
    .filter((row): row is PaymentStudentIndexItem => Boolean(row))
    .sort((left, right) => left.fullName.localeCompare(right.fullName));
}

function summarizeStudent(
  financial: Awaited<ReturnType<typeof getWorkbookStudentFinancials>>[number],
  breakdown: InstallmentBalanceItem[],
  financialState: StudentFinancialStateRow | null,
): SelectedStudentSummary {
  const pendingAmount = financialState?.pending_amount ?? financial.outstandingAmount;
  const totalDue = financialState?.total_due ?? financial.totalDue;
  const totalPaid = financialState?.total_paid ?? financial.totalPaid;

  return {
    id: financial.studentId,
    fullName: financial.studentName,
    admissionNo: financial.admissionNo,
    classLabel: financial.classLabel,
    fatherName: financial.fatherName,
    fatherPhone: financial.fatherPhone,
    motherPhone: financial.motherPhone,
    studentStatusLabel: financial.studentStatusLabel,
    transportRouteLabel: financial.transportRouteName ?? "No Transport",
    breakdown,
    totalDue,
    totalPaid,
    totalPending: pendingAmount,
    creditBalance: financialState?.credit_balance ?? 0,
    overpaidAmount: financialState?.overpaid_amount ?? 0,
    refundableAmount: financialState?.refundable_amount ?? 0,
    rowsKeptForReview: financialState?.rows_kept_for_review ?? 0,
    overdueAmount: breakdown
      .filter((item) => item.balanceStatus === "overdue")
      .reduce((sum, item) => sum + item.outstandingAmount, 0),
    nextDueInstallmentLabel: financial.nextDueLabel,
    nextDueDate: financial.nextDueDate,
    nextDueAmount: financial.nextDueAmount,
  };
}

async function getStudentFinancialState(studentId: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("v_student_financial_state")
      .select(
        "student_id, total_due, total_paid, pending_amount, credit_balance, overpaid_amount, refundable_amount, rows_kept_for_review, installment_pending_amount",
      )
      .eq("student_id", studentId)
      .maybeSingle();

    if (error) {
      return null;
    }

    return (data ?? null) as StudentFinancialStateRow | null;
  } catch {
    return null;
  }
}

function mapPaymentDeskReceipt(row: PaymentDeskReceiptRow) {
  const student = toSingleRecord(row.student_ref);

  return {
    id: row.id,
    receiptNumber: row.receipt_number,
    studentId: row.student_id,
    studentLabel: student
      ? `${student.full_name} (${student.admission_no})`
      : "Unknown student",
    totalAmount: row.total_amount,
    paymentMode: row.payment_mode,
    paymentDate: row.payment_date,
    createdAt: row.created_at,
  };
}

async function getRecentPaymentDeskReceipts(limit = 6) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("receipts")
    .select(
      "id, receipt_number, student_id, total_amount, payment_mode, payment_date, reference_number, created_at, student_ref:students!inner(full_name, admission_no, father_name, primary_phone, class_ref:classes(class_name, section, stream_name))",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Unable to load recent receipts: ${error.message}`);
  }

  return ((data ?? []) as PaymentDeskReceiptRow[]).map(mapPaymentDeskReceipt);
}

async function getTodayPaymentDeskCollection() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("receipts")
    .select("id, total_amount")
    .eq("payment_date", today);

  if (error) {
    throw new Error(`Unable to load today's collection: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{ id: string; total_amount: number | null }>;

  return {
    receiptCount: rows.length,
    totalAmount: rows.reduce((sum, row) => sum + (row.total_amount ?? 0), 0),
  };
}

async function getLatestReceiptForStudent(studentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("receipts")
    .select(
      "id, receipt_number, student_id, total_amount, payment_mode, payment_date, reference_number, created_at, student_ref:students!inner(full_name, admission_no, father_name, primary_phone, class_ref:classes(class_name, section, stream_name))",
    )
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data ? mapPaymentDeskReceipt(data as PaymentDeskReceiptRow) : null;
}


export async function countNonCancelledInstallments(studentId: string) {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("installments")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId)
    .neq("status", "cancelled");

  if (error) {
    throw new Error(`Unable to check prepared dues: ${error.message}`);
  }

  return count ?? 0;
}

async function getSelectedStudentPreflightContext(studentId: string) {
  const [policy, student, installmentCount] = await Promise.all([
    getFeePolicySummary(),
    getStudentDetail(studentId),
    countNonCancelledInstallments(studentId),
  ]);

  return {
    policy,
    student,
    installmentCount,
  };
}

function mapDuesPreparationReason(reason: string | null) {
  const normalized = (reason ?? "").toLowerCase();

  if (normalized.includes("does not have a fee amount") || normalized.includes("class fee")) {
    return reason ?? "Class fee is missing in Fee Setup.";
  }

  if (normalized.includes("installment date") || normalized.includes("no installment")) {
    return reason ?? "Installment dates are missing in Fee Setup.";
  }

  if (normalized.includes("another year") || normalized.includes("session")) {
    return reason ?? "Student belongs to another academic year.";
  }

  return reason ?? "Dues could not be prepared. Check Fee Setup for this class and year.";
}

export async function preflightPaymentPosting(payload: {
  studentId: string;
  paymentDate: string;
  paymentAmount: number;
  quickDiscountAmount?: number;
  quickLateFeeWaiverAmount?: number;
  paymentMode?: PaymentMode;
  referenceNumber?: string | null;
}) {
  const context = await getSelectedStudentPreflightContext(payload.studentId);
  let installmentCount = context.installmentCount;
  let autoPrepareAttempted = false;
  let autoPrepareWorked: boolean | null = null;
  const baseDiagnostic = {
    studentId: payload.studentId,
    activeFeeSetupSession: context.policy.academicSessionLabel,
    studentClassSession: context.student?.classSessionLabel ?? null,
    selectedPaymentDate: payload.paymentDate,
    installmentCount,
  };

  if (!context.student) {
    throw new PaymentPostingPreflightError(
      "Selected student could not be found. Refresh Payment Desk and select the student again.",
      buildPaymentDiagnostic({
        ...baseDiagnostic,
        reason: "student_not_found",
      }),
    );
  }

  if (context.student.status !== "active") {
    throw new PaymentPostingPreflightError(
      "No payable dues found for selected payment date.",
      buildPaymentDiagnostic({
        ...baseDiagnostic,
        reason: `student_status_${context.student.status}`,
      }),
    );
  }

  if (context.student.classSessionLabel !== context.policy.academicSessionLabel) {
    throw new PaymentPostingPreflightError(
      "Student belongs to another academic year.",
      buildPaymentDiagnostic({
        ...baseDiagnostic,
        reason: "session_mismatch",
      }),
    );
  }

  if (
    payload.paymentMode &&
    (payload.paymentMode === "upi" || payload.paymentMode === "bank_transfer" || payload.paymentMode === "cheque") &&
    !payload.referenceNumber?.trim()
  ) {
    throw new PaymentPostingPreflightError(
      "Reference number is required for UPI, bank transfer, and cheque payments.",
      buildPaymentDiagnostic({
        ...baseDiagnostic,
        reason: "reference_required_for_non_cash_payment",
      }),
    );
  }

  if (installmentCount === 0) {
    autoPrepareAttempted = true;
    const duesResult = await prepareDuesForStudentsAutomatically({
      studentIds: [payload.studentId],
      reason: "Payment submit auto-prepare",
      useSystemClient: true,
    });

    autoPrepareWorked =
      duesResult.readyForPaymentCount > 0 && duesResult.duesNeedAttentionCount === 0;

    if (!autoPrepareWorked) {
      throw new PaymentPostingPreflightError(
        mapDuesPreparationReason(duesResult.reasonSummary),
        buildPaymentDiagnostic({
          ...baseDiagnostic,
          autoPrepareAttempted,
          autoPrepareWorked,
          reason: duesResult.reasonSummary ?? "auto_prepare_failed",
        }),
      );
    }

    installmentCount = await countNonCancelledInstallments(payload.studentId);
  }

  let previewRows: InstallmentBalanceItem[];
  try {
    previewRows = await getPaymentDateAwareInstallmentBalances({
      studentId: payload.studentId,
      paymentDate: payload.paymentDate,
    });
  } catch (error) {
    throw new PaymentPostingPreflightError(
      "Dues exist, but payment posting could not read them. Ask admin to check database update.",
      buildPaymentDiagnostic({
        ...baseDiagnostic,
        installmentCount,
        autoPrepareAttempted,
        autoPrepareWorked,
        rawRpcErrorMessage: error instanceof Error ? error.message : String(error),
        reason: "preview_failed",
      }),
    );
  }

  const previewPendingAmount = previewRows.reduce(
    (sum, row) => sum + row.outstandingAmount,
    0,
  );

  if (previewPendingAmount <= 0) {
    throw new PaymentPostingPreflightError(
      "No payable dues found for selected payment date.",
      buildPaymentDiagnostic({
        ...baseDiagnostic,
        installmentCount,
        previewPendingAmount,
        previewWorked: true,
        autoPrepareAttempted,
        autoPrepareWorked,
        reason: "no_payable_dues_for_payment_date",
      }),
    );
  }

  const adjustmentAmount =
    Math.max(payload.quickDiscountAmount ?? 0, 0) +
    Math.max(payload.quickLateFeeWaiverAmount ?? 0, 0);
  const revisedPendingAmount = Math.max(previewPendingAmount - adjustmentAmount, 0);

  if (adjustmentAmount > previewPendingAmount) {
    throw new PaymentPostingPreflightError(
      "Discount and late fee waiver exceed pending amount.",
      buildPaymentDiagnostic({
        ...baseDiagnostic,
        installmentCount,
        previewPendingAmount,
        revisedPendingAmount,
        previewWorked: true,
        autoPrepareAttempted,
        autoPrepareWorked,
        reason: "adjustment_amount_exceeds_preview_pending",
      }),
    );
  }

  if (revisedPendingAmount <= 0) {
    throw new PaymentPostingPreflightError(
      "No payable dues found after discount and late fee waiver.",
      buildPaymentDiagnostic({
        ...baseDiagnostic,
        installmentCount,
        previewPendingAmount,
        previewWorked: true,
        autoPrepareAttempted,
        autoPrepareWorked,
        reason: "no_payable_dues_after_adjustments",
      }),
    );
  }

  if (payload.paymentAmount > revisedPendingAmount) {
    throw new PaymentPostingPreflightError(
      "Payment amount is more than net payable after discount.",
      buildPaymentDiagnostic({
        ...baseDiagnostic,
        installmentCount,
        previewPendingAmount,
        previewWorked: true,
        autoPrepareAttempted,
        autoPrepareWorked,
        reason: "payment_amount_exceeds_revised_pending",
      }),
    );
  }

  return buildPaymentDiagnostic({
    ...baseDiagnostic,
    installmentCount,
    previewPendingAmount,
    revisedPendingAmount,
    previewWorked: true,
    autoPrepareAttempted,
    autoPrepareWorked,
    reason: "preflight_passed",
  });
}

async function tryAutoPrepareSelectedStudentDues(payload: {
  studentId: string;
  policySessionLabel: string;
}): Promise<PaymentDeskIssue | null> {
  const student = await getStudentDetail(payload.studentId);

  if (!student) {
    return {
      title: "Selected student could not be loaded.",
      detail: "Refresh Payment Desk and select the student again.",
      actionLabel: "Open Students",
      actionHref: "/protected/students",
    };
  }

  if (student.status !== "active") {
    return {
      title: "Dues were not prepared.",
      detail: "This student is not active, so new dues were not prepared.",
      actionLabel: "Open student record",
      actionHref: `/protected/students/${student.id}`,
    };
  }

  if (student.classSessionLabel !== payload.policySessionLabel) {
    return {
      title: "Selected student belongs to another academic session.",
      detail:
        `This student is in ${student.classSessionLabel || "another year"}, but Fee Setup is active for ${payload.policySessionLabel}.`,
      actionLabel: "Open Fee Setup",
      actionHref: "/protected/fee-setup",
    };
  }

  const nonCancelledInstallments = await countNonCancelledInstallments(student.id);

  if (nonCancelledInstallments > 0) {
    return {
      title: "Fee records need admin review.",
      detail:
        "Dues records already exist, but Payment Desk could not load payable balances. Ask an admin to run Fee Data Status before posting.",
      actionLabel: "Open Fee Data Status",
      actionHref: "/protected/admin-tools",
    };
  }

  const duesResult = await prepareDuesForStudentsAutomatically({
    studentIds: [student.id],
    reason: "Payment Desk selected student",
  });

  if (duesResult.readyForPaymentCount > 0 && duesResult.duesNeedAttentionCount === 0) {
    return null;
  }

  return {
    title: "Dues could not be prepared.",
    detail:
      duesResult.reasonSummary ||
      "Fee Setup is incomplete for this class/year. Check class fee amount, installment dates, and active session.",
    actionLabel: "Open Fee Setup",
    actionHref: "/protected/fee-setup",
    repairStudentId: student.id,
  };
}

export async function getPaymentEntryPageData(payload: {
  studentId: string | null;
  searchQuery: string;
  classId?: string;
  autoPrepareMissingDues?: boolean;
}): Promise<PaymentEntryPageData> {
  const policy = await getFeePolicySummary();
  const [studentIndex, recentReceipts, todayCollection] = await Promise.all([
    getPaymentDeskStudentIndex(),
    getRecentPaymentDeskReceipts(6),
    getTodayPaymentDeskCollection(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const summary = payload.studentId
    ? await getPaymentDeskStudentSummary({
        studentId: payload.studentId,
        paymentDate: today,
        autoPrepareMissingDues: payload.autoPrepareMissingDues,
      })
    : null;

  return {
    studentIndex,
    initialStudentId: payload.studentId,
    initialClassId: payload.classId ?? "",
    initialStudentSummary: summary?.student ?? null,
    initialStudentIssue: summary?.issue ?? null,
    initialLatestReceipt: summary?.latestReceipt ?? null,
    modeOptions: policy.acceptedPaymentModes,
    policyNote: `${policy.academicSessionLabel} policy uses receipt prefix ${policy.receiptPrefix}, ${policy.lateFeeLabel.toLowerCase()}, and ${policy.acceptedPaymentModes.map((item) => item.label).join(", ")}.`,
    recentReceipts,
    todayCollection,
  };
}

export async function getPaymentDeskStudentSummary(payload: {
  studentId: string;
  paymentDate: string;
  autoPrepareMissingDues?: boolean;
  includeLatestReceipt?: boolean;
}): Promise<PaymentDeskStudentSummary> {
  const policy = await getFeePolicySummary();
  const [selectedWorkbookRows, selectedStudentDetail] = await Promise.all([
    getWorkbookStudentFinancials({
      studentId: payload.studentId,
      sessionLabel: policy.academicSessionLabel,
    }),
    getStudentDetail(payload.studentId),
  ]);
  const selectedFinancial = selectedWorkbookRows[0] ?? null;
  let selectedStudentIssue: PaymentDeskIssue | null = null;
  const shouldIncludeLatestReceipt = payload.includeLatestReceipt ?? true;
  const latestReceiptPromise = shouldIncludeLatestReceipt
    ? getLatestReceiptForStudent(payload.studentId)
    : Promise.resolve(null);

  if (selectedFinancial) {
    let [breakdown, financialState] = await Promise.all([
      getPaymentDateAwareInstallmentBalances({
        studentId: selectedFinancial.studentId,
        paymentDate: payload.paymentDate,
      }),
      getStudentFinancialState(selectedFinancial.studentId),
    ]);

    if (breakdown.length === 0 && payload.autoPrepareMissingDues) {
      const autoPrepareIssue = await tryAutoPrepareSelectedStudentDues({
        studentId: selectedFinancial.studentId,
        policySessionLabel: policy.academicSessionLabel,
      });

      if (!autoPrepareIssue) {
        breakdown = await getPaymentDateAwareInstallmentBalances({
          studentId: selectedFinancial.studentId,
          paymentDate: payload.paymentDate,
        });
        financialState = await getStudentFinancialState(selectedFinancial.studentId);
      } else {
        selectedStudentIssue = autoPrepareIssue;
      }
    }

    if (breakdown.length === 0) {
      return {
        student: null,
        issue:
          selectedStudentIssue ?? {
            title: "Dues are not prepared for this student.",
            detail:
              "Student exists, but dues are not prepared yet. Payment Desk can repair this only when Fee Setup is complete.",
            actionLabel: "Prepare dues again",
            actionHref: null,
            repairStudentId: selectedFinancial.studentId,
          },
        latestReceipt: await latestReceiptPromise,
        suggestedDefaultAmount: null,
        paymentDate: payload.paymentDate,
      };
    }

    const selectedStudent = summarizeStudent(selectedFinancial, breakdown, financialState);

    return {
      student: selectedStudent,
      issue: null,
      latestReceipt: await latestReceiptPromise,
      suggestedDefaultAmount:
        selectedStudent.totalPending > 0
          ? (selectedStudent.nextDueAmount ?? selectedStudent.totalPending)
          : null,
      paymentDate: payload.paymentDate,
    };
  }

  if (selectedStudentDetail) {
    return {
      student: null,
      issue:
        selectedStudentDetail.classSessionLabel !== policy.academicSessionLabel
          ? {
              title: "Selected student belongs to another academic session.",
              detail:
                `This student is in ${selectedStudentDetail.classSessionLabel || "a different session"}, but the active fee policy is ${policy.academicSessionLabel}. Open Fee Setup and make the same session active before dues or payments will appear.`,
              actionLabel: "Open Fee Setup",
              actionHref: "/protected/fee-setup",
            }
          : {
              title: "Dues are not prepared for this student.",
              detail:
                "Student exists, but dues are not prepared yet. Payment Desk can repair this only when Fee Setup is complete.",
            actionLabel: "Prepare dues again",
            actionHref: null,
            repairStudentId: selectedStudentDetail.id,
            },
      latestReceipt: await latestReceiptPromise,
      suggestedDefaultAmount: null,
      paymentDate: payload.paymentDate,
    };
  }

  return {
    student: null,
    issue: {
      title: "Selected student could not be loaded.",
      detail:
        "Refresh the Payment Desk and try again, or open the student record to confirm the student exists and has fee data.",
      actionLabel: "Open Students",
      actionHref: "/protected/students",
    },
    latestReceipt: null,
    suggestedDefaultAmount: null,
    paymentDate: payload.paymentDate,
  };
}

export async function postStudentPayment(payload: {
  studentId: string;
  paymentDate: string;
  paymentMode: PaymentMode;
  paymentAmount: number;
  quickDiscountAmount?: number;
  quickLateFeeWaiverAmount?: number;
  referenceNumber: string | null;
  remarks: string | null;
  receivedBy: string;
  clientRequestId: string;
}) {
  const policy = await getFeePolicySummary();
  const existingReceipt = await findReceiptByClientRequestId({
    studentId: payload.studentId,
    clientRequestId: payload.clientRequestId,
  });

  if (existingReceipt) {
    return existingReceipt;
  }

  const preflightDiagnostic = await preflightPaymentPosting({
    studentId: payload.studentId,
    paymentDate: payload.paymentDate,
    paymentAmount: payload.paymentAmount,
    quickDiscountAmount: payload.quickDiscountAmount,
    quickLateFeeWaiverAmount: payload.quickLateFeeWaiverAmount,
    paymentMode: payload.paymentMode,
    referenceNumber: payload.referenceNumber,
  });
  const duplicateReceipt = await findLikelyDuplicateReceipt({
    studentId: payload.studentId,
    paymentDate: payload.paymentDate,
    paymentMode: payload.paymentMode,
    paymentAmount: payload.paymentAmount,
    referenceNumber: payload.referenceNumber,
  });

  if (duplicateReceipt) {
    throw new DuplicatePaymentWarning(duplicateReceipt);
  }

  const supabase = await createClient();
  const quickDiscountAmount = Math.max(payload.quickDiscountAmount ?? 0, 0);
  const quickLateFeeWaiverAmount = Math.max(payload.quickLateFeeWaiverAmount ?? 0, 0);
  const { data, error } = await supabase.rpc("post_student_payment_with_adjustments", {
    p_student_id: payload.studentId,
    p_payment_date: payload.paymentDate,
    p_payment_mode: payload.paymentMode,
    p_total_amount: payload.paymentAmount,
    p_reference_number: payload.referenceNumber,
    p_remarks: payload.remarks,
    p_received_by: payload.receivedBy,
    p_receipt_prefix: policy.receiptPrefix,
    p_client_request_id: payload.clientRequestId,
    p_quick_discount_amount: quickDiscountAmount,
    p_quick_late_fee_waiver_amount: quickLateFeeWaiverAmount,
  });

  if (error) {
    const raw = getRawDatabaseError(error);
    throw new PaymentPostingRpcError(
      toFriendlyPaymentPostingError(error),
      {
        ...preflightDiagnostic,
        rawRpcErrorCode: raw.code,
        rawRpcErrorMessage: raw.message,
        postStudentPaymentWorked: false,
        reason: "post_student_payment_failed",
      },
    );
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
    quickDiscountApplied: quickDiscountAmount,
    lateFeeWaivedApplied: quickLateFeeWaiverAmount,
    remainingBalance: Math.max(
      (preflightDiagnostic.previewPendingAmount ?? 0) -
        quickDiscountAmount -
        quickLateFeeWaiverAmount -
        payload.paymentAmount,
      0,
    ),
  };
}

async function findReceiptByClientRequestId(payload: {
  studentId: string;
  clientRequestId: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("receipts")
    .select("id, receipt_number, total_amount, student_id")
    .eq("student_id", payload.studentId)
    .eq("client_request_id", payload.clientRequestId)
    .maybeSingle();

  if (error || !data?.id || !data.receipt_number) {
    return null;
  }

  const financialState = await getStudentFinancialState(payload.studentId);

  return {
    receiptId: data.id as string,
    receiptNumber: data.receipt_number as string,
    allocatedTotal: (data.total_amount ?? 0) as number,
    quickDiscountApplied: 0,
    lateFeeWaivedApplied: 0,
    remainingBalance: financialState?.pending_amount ?? null,
  };
}

async function findLikelyDuplicateReceipt(payload: {
  studentId: string;
  paymentDate: string;
  paymentMode: PaymentMode;
  paymentAmount: number;
  referenceNumber: string | null;
}) {
  try {
    const supabase = await createClient();
    const recentCutoff = new Date(Date.now() - 60_000).toISOString();
    let query = supabase
      .from("receipts")
      .select("id, receipt_number")
      .eq("student_id", payload.studentId)
      .eq("payment_date", payload.paymentDate)
      .eq("payment_mode", payload.paymentMode)
      .eq("total_amount", payload.paymentAmount)
      .gte("created_at", recentCutoff)
      .order("created_at", { ascending: false })
      .limit(1);

    if (payload.referenceNumber) {
      query = query.eq("reference_number", payload.referenceNumber);
    } else {
      query = query.is("reference_number", null);
    }

    const { data, error } = await query;

    if (error) {
      return null;
    }

    const row = (data ?? [])[0] as { id?: string; receipt_number?: string } | undefined;

    if (!row?.id || !row.receipt_number) {
      return null;
    }

    return {
      id: row.id,
      receiptNumber: row.receipt_number,
    };
  } catch {
    return null;
  }
}

export async function getPaymentDateAwareInstallmentBalances(payload: {
  studentId: string;
  paymentDate: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_workbook_payment_allocation", {
    p_student_id: payload.studentId,
    p_payment_date: payload.paymentDate,
  });

  if (error) {
    throw new Error(toFriendlyPaymentPreviewError(error));
  }

  return ((data ?? []) as PaymentPreviewRpcRow[]).map((row) => ({
    installmentId: row.installment_id,
    installmentNo: row.installment_no,
    installmentLabel: row.installment_label,
    dueDate: row.due_date,
    amountDue: row.total_charge,
    paymentsTotal: row.paid_amount,
    adjustmentsTotal: row.adjustment_amount,
    outstandingAmount: row.pending_amount,
    rawLateFee: row.raw_late_fee,
    waiverApplied: row.waiver_applied,
    finalLateFee: row.final_late_fee,
    balanceStatus: row.balance_status,
  })) satisfies InstallmentBalanceItem[];
}
