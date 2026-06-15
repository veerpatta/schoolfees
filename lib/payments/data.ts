import "server-only";


import type { StaffRole } from "@/lib/auth/roles";
import type { PaymentMode } from "@/lib/db/types";
import { getFeePolicyForSession, getFeePolicySummary } from "@/lib/fees/data";
import { createClient } from "@/lib/supabase/server";
import { cacheSafeUnstableCache, getCacheSafeClient } from "@/lib/supabase/cache-safe";
import { getStudentDetail } from "@/lib/students/data";
import { calculateOverdueBaseAmount } from "@/lib/fees/due-amounts";
import {
  prepareDuesForStudentsAutomatically,
} from "@/lib/system-sync/finance-sync";
import { logError, logWarn } from "@/lib/observability/log";
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

/**
 * Stable identifier for each readiness blocking reason. Lets callers (the
 * Payment Desk page renders WorkflowGuard) translate by key while keeping
 * the English fallback shipped from this server-side data layer.
 */
export type PaymentDeskBlockingReasonKey =
  | "read_only"
  | "no_policy"
  | "no_active_class"
  | "selected_student_missing"
  | "selected_student_inactive"
  | "selected_student_session_mismatch"
  | "selected_student_review_needed"
  | "dues_prepare_failed"
  | "dues_load_failed"
  | "dues_not_prepared";

export type PaymentDeskReadiness = {
  canPostPayments: boolean;
  blockingReason:
    | {
        key?: PaymentDeskBlockingReasonKey;
        /** Optional ICU-message values for dynamic substitution at render. */
        keyValues?: Record<string, string | number>;
        title: string;
        detail: string;
        actionLabel: string | null;
        actionHref: string | null;
      }
    | null;
  canRepairOrPrepareDues: boolean;
};

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
  primary_phone: string | null;
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

type PaymentDeskClassRow = {
  id: string;
  class_name: string;
  section: string | null;
  stream_name: string | null;
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

type ConfirmedFamilyMembershipRow = {
  family_group_id: string;
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

export type DuplicatePaymentKind = "near-duplicate" | "daily-amount";

export class DuplicatePaymentWarning extends Error {
  receiptId: string;
  receiptNumber: string;
  kind: DuplicatePaymentKind;

  constructor(
    receipt: { id: string; receiptNumber: string },
    options: { kind?: DuplicatePaymentKind; amount?: number; paymentDate?: string } = {},
  ) {
    const kind: DuplicatePaymentKind = options.kind ?? "near-duplicate";
    const message =
      kind === "daily-amount"
        ? `A payment of ₹${(options.amount ?? 0).toLocaleString("en-IN")} was already posted for this student on ${options.paymentDate ?? "the same date"}. Continue anyway only if this is genuinely a separate payment.`
        : "A similar payment was just recorded. Open the latest receipt or start a new payment if this is intentional.";
    super(message);
    this.name = "DuplicatePaymentWarning";
    this.receiptId = receipt.id;
    this.receiptNumber = receipt.receiptNumber;
    this.kind = kind;
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

  console.error("[PaymentPostingError Debug] Raw error:", error);
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

  // A Postgres-level "permission denied for function/schema/relation" (SQLSTATE
  // 42501) is an infrastructure/grant misconfiguration, NOT a staff RBAC denial.
  // The Server Action already enforced payments:write via requireStaffPermission
  // before reaching this RPC, so the caller demonstrably has posting access.
  // Surfacing this as "you don't have permission" hides the real problem (e.g. a
  // missing EXECUTE grant on a private helper, which broke posting school-wide in
  // May 2026). Route it to the database-update message instead. This branch must
  // precede the generic "permission" check below, since this text also matches it.
  if (normalized.includes("42501") || normalized.includes("permission denied for")) {
    return "Payment posting needs a database update. Ask an admin to open Admin Tools > System checks.";
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

  return `Unable to save payment right now. Please check the student, dues, amount, and payment mode. (Raw error: ${rawMessage})`;
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

async function getPaymentDeskReadinessUncached(payload: {
  sessionLabel: string;
  staffAppRole: StaffRole;
  canWritePayments: boolean;
  policy: Awaited<ReturnType<typeof getFeePolicyForSession>>;
  hasActiveClass: boolean;
}): Promise<PaymentDeskReadiness> {
  const { policy } = payload;
  const { hasActiveClass } = payload;
  const policyExists =
    Boolean(policy.id) &&
    policy.academicSessionLabel.trim().toLowerCase() ===
      payload.sessionLabel.trim().toLowerCase();
  let blockingReason: PaymentDeskReadiness["blockingReason"] = null;

  if (!payload.canWritePayments) {
    blockingReason = {
      key: "read_only",
      title: "Read-only access.",
      detail: "You can review the desk but cannot post payments.",
      actionLabel: null,
      actionHref: null,
    };
  } else if (!policyExists) {
    blockingReason = {
      key: "no_policy",
      title: "Fee Setup is incomplete for this year.",
      detail:
        "Open Fee Setup and publish the academic year policy before collecting payments.",
      actionLabel: "Open Fee Setup",
      actionHref: "/protected/fee-setup",
    };
  } else if (!hasActiveClass) {
    blockingReason = {
      key: "no_active_class",
      title: "No active classes for this academic year.",
      detail: "Open Master Data and activate at least one class for the session.",
      actionLabel: "Open Master Data",
      actionHref: "/protected/admin-tools",
    };
  }

  return {
    canPostPayments: payload.canWritePayments && policyExists && hasActiveClass,
    blockingReason,
    canRepairOrPrepareDues:
      payload.canWritePayments &&
      payload.staffAppRole === "admin" &&
      policyExists &&
      hasActiveClass,
  };
}

async function getPaymentDeskHasActiveClassUncached(sessionLabel: string) {
  const supabase = await getCacheSafeClient();
  const { data, error } = await supabase
    .from("classes")
    .select("id")
    .eq("session_label", sessionLabel)
    .eq("status", "active")
    .limit(1);

  if (error) {
    throw new Error(`Unable to check active classes: ${error.message}`);
  }

  return (data ?? []).length > 0;
}

async function getPaymentDeskHasActiveClass(sessionLabel: string) {
  return cacheSafeUnstableCache(
    async () => getPaymentDeskHasActiveClassUncached(sessionLabel),
    ["payment-desk-active-class", sessionLabel],
    { tags: [`session:${sessionLabel}`] },
  )();
}

export async function getPaymentDeskReadiness(payload: {
  sessionLabel: string;
  staffAppRole: StaffRole;
  canWritePayments: boolean;
}): Promise<PaymentDeskReadiness> {
  try {
    const [policy, hasActiveClass] = await Promise.all([
      getFeePolicyForSession(payload.sessionLabel),
      getPaymentDeskHasActiveClass(payload.sessionLabel),
    ]);
    return await getPaymentDeskReadinessUncached({ ...payload, policy, hasActiveClass });
  } catch (error) {
    // Audit 1.11 — fail safe. Previously the catch returned
    // `canPostPayments: payload.canWritePayments, blockingReason: null` which
    // hid every gate (active class, fee policy) on a transient DB hiccup
    // and showed the UI a green checkmark. Now we block posting and return
    // a generic actionable blocking reason. RLS denials and missing-view
    // errors no longer silently unlock the desk.
    logWarn("payments.readiness.check_failed", {
      sessionLabel: payload.sessionLabel,
      cause: error,
    });

    return {
      canPostPayments: false,
      blockingReason: {
        title: "Readiness check failed",
        detail:
          "Could not confirm the Payment Desk is ready. Please retry; if it persists, ask an admin to check Fee Setup and System checks.",
        actionLabel: "Retry",
        actionHref: null,
      },
      canRepairOrPrepareDues:
        payload.canWritePayments && payload.staffAppRole === "admin",
    };
  }
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
    fatherPhone: row.primary_phone,
    studentStatus: "active",
  };
}

async function getPaymentDeskStudentIndexUncached(payload: {
  classId?: string | null;
  limit?: number;
  sessionLabel?: string;
} = {}) {
  const sessionLabel =
    payload.sessionLabel ?? (await getFeePolicySummary()).academicSessionLabel;
  const supabase = await getCacheSafeClient();
  let query = supabase
    .from("students")
    .select(
      "id, full_name, admission_no, primary_phone, class_ref:classes!inner(id, session_label, status, class_name, section, stream_name)",
    )
    .eq("status", "active")
    .eq("class_ref.session_label", sessionLabel)
    .eq("class_ref.status", "active")
    .order("full_name", { ascending: true });

  if (payload.classId) {
    query = query.eq("class_id", payload.classId);
  }

  const { data, error } = await query.limit(payload.limit ?? 2000);

  if (error) {
    throw new Error(`Unable to load Payment Desk student index: ${error.message}`);
  }

  return ((data ?? []) as PaymentStudentBaseRow[])
    .map(toStudentIndexItem)
    .filter((row): row is PaymentStudentIndexItem => Boolean(row));
}

export async function getPaymentDeskStudentIndex(payload: {
  classId?: string | null;
  limit?: number;
  sessionLabel?: string;
} = {}) {
  const sessionLabel = payload.sessionLabel ?? (await getFeePolicySummary()).academicSessionLabel;

  return cacheSafeUnstableCache(
    async () => getPaymentDeskStudentIndexUncached({ ...payload, sessionLabel }),
    [
      "payment-desk-student-index",
      sessionLabel,
      payload.classId ?? "",
      String(payload.limit ?? 2000),
    ],
    { tags: [`session:${sessionLabel}`] },
  )();
}

async function getPaymentDeskClassOptionsUncached(sessionLabel?: string) {
  const resolvedSessionLabel =
    sessionLabel ?? (await getFeePolicySummary()).academicSessionLabel;
  const supabase = await getCacheSafeClient();
  const { data, error } = await supabase
    .from("classes")
    .select("id, class_name, section, stream_name")
    .eq("session_label", resolvedSessionLabel)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("class_name", { ascending: true });

  if (error) {
    throw new Error(`Unable to load Payment Desk class list: ${error.message}`);
  }

  return ((data ?? []) as PaymentDeskClassRow[]).map((row) => ({
    id: row.id,
    label: buildClassLabel(row),
  }));
}

export async function getPaymentDeskClassOptions(sessionLabel?: string) {
  const resolvedSessionLabel = sessionLabel ?? (await getFeePolicySummary()).academicSessionLabel;

  return cacheSafeUnstableCache(
    async () => getPaymentDeskClassOptionsUncached(resolvedSessionLabel),
    ["payment-desk-class-options", resolvedSessionLabel],
    { tags: [`session:${resolvedSessionLabel}`] },
  )();
}

function summarizeStudent(
  financial: Awaited<ReturnType<typeof getWorkbookStudentFinancials>>[number],
  breakdown: InstallmentBalanceItem[],
  financialState: StudentFinancialStateRow | null,
  installmentCount: number,
  conventionalDiscount: { amount: number; labels: string[] },
): SelectedStudentSummary {
  const pendingAmount = financialState?.pending_amount ?? financial.outstandingAmount;
  const totalDue = financial.baseChargeTotal;
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
    overdueAmount: calculateOverdueBaseAmount(breakdown),
    nextDueInstallmentLabel: financial.nextDueLabel,
    nextDueDate: financial.nextDueDate,
    nextDueAmount: financial.nextDueAmount,
    feeHeadDistribution: {
      tuitionFee: financial.tuitionFee,
      transportFee: financial.transportFee,
      academicFee: financial.academicFee,
      otherAdjustmentHead: financial.otherAdjustmentHead,
      otherAdjustmentAmount: financial.otherAdjustmentAmount,
      discountAmount: financial.discountAmount,
      conventionalDiscountAmount: conventionalDiscount.amount,
      conventionalDiscountLabels: conventionalDiscount.labels,
      installmentCount: Math.max(installmentCount, 1),
    },
  };
}

async function getConventionalDiscountForStudent(
  studentId: string,
  sessionLabel: string,
): Promise<{ amount: number; labels: string[] }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("student_conventional_discount_assignments")
      .select(
        "before_tuition_amount, resulting_tuition_amount, policy:conventional_discount_policies (display_name, code, is_active)",
      )
      .eq("student_id", studentId)
      .eq("academic_session_label", sessionLabel)
      .eq("is_active", true);

    if (error || !data) {
      return { amount: 0, labels: [] };
    }

    type AssignmentRow = {
      before_tuition_amount: number;
      resulting_tuition_amount: number;
      policy: { display_name: string | null; code: string | null; is_active?: boolean | null } | Array<{
        display_name: string | null;
        code: string | null;
        is_active?: boolean | null;
      }> | null;
    };

    // Conventional discount policy rule: max two active policies per student/year,
    // and when multiple policies apply the *lowest* candidate tuition wins
    // (see lib/fees/conventional-discount-rules.ts → applyConventionalDiscountsToTuition).
    // Summing savings across rows therefore double-counts — keep only the winner.
    const rows = (data as AssignmentRow[]).filter((row) => {
      const policyRow = Array.isArray(row.policy) ? row.policy[0] : row.policy;
      return policyRow?.is_active !== false;
    });

    if (rows.length === 0) {
      return { amount: 0, labels: [] };
    }

    const baselineBefore = rows.reduce(
      (max, row) => Math.max(max, row.before_tuition_amount ?? 0),
      0,
    );
    const winningResulting = rows.reduce(
      (min, row) => Math.min(min, row.resulting_tuition_amount ?? baselineBefore),
      baselineBefore,
    );
    const amount = Math.max(0, baselineBefore - winningResulting);
    const labels = rows
      .map((row) => {
        const policyRow = Array.isArray(row.policy) ? row.policy[0] : row.policy;
        return policyRow?.display_name ?? policyRow?.code ?? null;
      })
      .filter((label): label is string => Boolean(label));
    return { amount, labels };
  } catch (error) {
    // Audit 1.12 — surface the failure instead of swallowing it. Returning a
    // zero-discount default on RLS/missing-view errors used to hide credit
    // and discount state from the Payment Desk so the cashier saw full dues
    // even when an unrefunded credit existed.
    logError("payments.conventional_discount.lookup_failed", {
      studentId,
      cause: error,
    });
    return { amount: 0, labels: [] };
  }
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
      // Audit 1.12 — RLS denial or missing-view error used to silently
      // collapse to null and hide the actual credit/overpaid state.
      logError("payments.financial_state.lookup_failed", {
        studentId,
        cause: error,
      });
      return null;
    }

    return (data ?? null) as StudentFinancialStateRow | null;
  } catch (error) {
    logError("payments.financial_state.threw", { studentId, cause: error });
    return null;
  }
}

async function getConfirmedFamilyMembership(studentId: string, sessionLabel: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_family_members")
    .select("family_group_id")
    .eq("student_id", studentId)
    .eq("academic_session_label", sessionLabel)
    .maybeSingle();

  if (error || !data?.family_group_id) {
    return { familyGroupId: null, siblingCount: 0 };
  }

  const familyGroupId = (data as ConfirmedFamilyMembershipRow).family_group_id;
  const { count } = await supabase
    .from("student_family_members")
    .select("id", { count: "exact", head: true })
    .eq("family_group_id", familyGroupId)
    .eq("academic_session_label", sessionLabel);

  return {
    familyGroupId,
    siblingCount: Math.max((count ?? 1) - 1, 0),
  };
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

async function getRecentPaymentDeskReceipts(limit = 6, sessionLabel?: string) {
  const resolvedSessionLabel = sessionLabel ?? (await getFeePolicySummary()).academicSessionLabel;

  return cacheSafeUnstableCache(
    async () => getRecentPaymentDeskReceiptsUncached(limit, resolvedSessionLabel),
    ["payment-desk-recent-receipts", resolvedSessionLabel, String(limit)],
    { tags: [`session:${resolvedSessionLabel}`] },
  )();
}

async function getRecentPaymentDeskReceiptsUncached(limit = 6, sessionLabel: string) {
  const supabase = await getCacheSafeClient();
  const { data, error } = await supabase
    .from("receipts")
    .select(
      "id, receipt_number, student_id, total_amount, payment_mode, payment_date, reference_number, created_at, student_ref:students!inner(full_name, admission_no, father_name, primary_phone, class_ref:classes!inner(session_label, class_name, section, stream_name))",
    )
    .eq("student_ref.class_ref.session_label", sessionLabel)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Unable to load recent receipts: ${error.message}`);
  }

  return ((data ?? []) as PaymentDeskReceiptRow[]).map(mapPaymentDeskReceipt);
}

async function getTodayPaymentDeskCollection(sessionLabel?: string) {
  const resolvedSessionLabel = sessionLabel ?? (await getFeePolicySummary()).academicSessionLabel;

  return cacheSafeUnstableCache(
    async () => getTodayPaymentDeskCollectionUncached(resolvedSessionLabel),
    ["payment-desk-today-collection", resolvedSessionLabel, new Date().toISOString().slice(0, 10)],
    { tags: [`session:${resolvedSessionLabel}`] },
  )();
}

async function getTodayPaymentDeskCollectionUncached(sessionLabel: string) {
  const supabase = await getCacheSafeClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("receipts")
    .select("id, total_amount, student_ref:students!inner(class_ref:classes!inner(session_label))")
    .eq("student_ref.class_ref.session_label", sessionLabel)
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
  try {
    return await getLatestReceiptForStudentUncached(studentId);
  } catch {
    return null;
  }
}

async function getLatestReceiptForStudentUncached(studentId: string) {
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

async function getSelectedStudentPreflightContext(
  studentId: string,
  sessionLabel?: string | null,
) {
  const requestedSessionLabel = sessionLabel?.trim() || null;
  const [policy, student, installmentCount] = await Promise.all([
    requestedSessionLabel
      ? getFeePolicyForSession(requestedSessionLabel)
      : getFeePolicySummary(),
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
  sessionLabel?: string | null;
}) {
  const context = await getSelectedStudentPreflightContext(
    payload.studentId,
    payload.sessionLabel,
  );
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
  const pendingLateFeeAmount = previewRows.reduce(
    (sum, row) => sum + Math.min(row.finalLateFee, row.outstandingAmount),
    0,
  );
  const revisedPendingAmount = Math.max(previewPendingAmount - adjustmentAmount, 0);

  if (Math.max(payload.quickLateFeeWaiverAmount ?? 0, 0) > pendingLateFeeAmount) {
    throw new PaymentPostingPreflightError(
      "Late fee waiver cannot be more than pending late fee.",
      buildPaymentDiagnostic({
        ...baseDiagnostic,
        installmentCount,
        previewPendingAmount,
        revisedPendingAmount,
        previewWorked: true,
        autoPrepareAttempted,
        autoPrepareWorked,
        reason: "late_fee_waiver_exceeds_pending_late_fee",
      }),
    );
  }

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
      key: "selected_student_missing",
      title: "Selected student could not be loaded.",
      detail: "Refresh Payment Desk and select the student again.",
      actionLabel: "Open Students",
      actionHref: "/protected/students",
    };
  }

  if (student.status !== "active") {
    return {
      key: "selected_student_inactive",
      title: "Dues were not prepared.",
      detail: "This student is not active, so new dues were not prepared.",
      actionLabel: "Open student record",
      actionHref: `/protected/students/${student.id}`,
    };
  }

  if (student.classSessionLabel !== payload.policySessionLabel) {
    return {
      key: "selected_student_session_mismatch",
      keyValues: {
        studentSession: student.classSessionLabel || "another year",
        policySession: payload.policySessionLabel,
      },
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
      key: "selected_student_review_needed",
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
    key: "dues_prepare_failed",
    keyValues: duesResult.reasonSummary ? { detail: duesResult.reasonSummary } : undefined,
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
  sessionLabel?: string;
  autoPrepareMissingDues?: boolean;
  initialSelectedSummary?: PaymentDeskStudentSummary | null;
}): Promise<PaymentEntryPageData> {
  const _t0 = Date.now();
  const policy = payload.sessionLabel
    ? await getFeePolicyForSession(payload.sessionLabel)
    : await getFeePolicySummary();
  const sessionLabel = payload.sessionLabel ?? policy.academicSessionLabel;
  const today = new Date().toISOString().slice(0, 10);
  const [studentIndex, recentReceipts, todayCollection, summary] = await Promise.all([
    getPaymentDeskStudentIndex({ sessionLabel }),
    getRecentPaymentDeskReceipts(6, sessionLabel),
    getTodayPaymentDeskCollection(sessionLabel),
    payload.initialSelectedSummary !== undefined
      ? Promise.resolve(payload.initialSelectedSummary)
      : payload.studentId
      ? getPaymentDeskStudentSummary({
          studentId: payload.studentId,
          paymentDate: today,
          sessionLabel,
          autoPrepareMissingDues: payload.autoPrepareMissingDues,
        })
      : Promise.resolve(null),
  ]);

  console.log(`[payment-entry-page-data] loaded in ${Date.now() - _t0}ms`);

  return {
    studentIndex,
    initialStudentId: payload.studentId,
    initialClassId: payload.classId ?? "",
    initialStudentSummary: summary?.student ?? null,
    initialStudentIssue: summary?.issue ?? null,
    initialLatestReceipt: summary?.latestReceipt ?? null,
    modeOptions: policy.acceptedPaymentModes,
    sessionLabel,
    policyNote: `${sessionLabel} policy uses receipt prefix ${policy.receiptPrefix}, ${policy.lateFeeLabel.toLowerCase()}, and ${policy.acceptedPaymentModes.map((item) => item.label).join(", ")}.`,
    recentReceipts,
    todayCollection,
  };
}

export async function getPaymentDeskStudentSummary(payload: {
  studentId: string;
  paymentDate: string;
  sessionLabel?: string;
  autoPrepareMissingDues?: boolean;
  includeLatestReceipt?: boolean;
  includeBreakdown?: boolean;
}): Promise<PaymentDeskStudentSummary> {
  const policy = payload.sessionLabel
    ? await getFeePolicyForSession(payload.sessionLabel)
    : await getFeePolicySummary();
  const sessionLabel = payload.sessionLabel ?? policy.academicSessionLabel;
  const selectedWorkbookRows = await getWorkbookStudentFinancials({
    studentId: payload.studentId,
    sessionLabel,
  });
  let selectedFinancial = selectedWorkbookRows[0] ?? null;
  let selectedStudentDetail: Awaited<ReturnType<typeof getStudentDetail>> | null = null;
  let selectedStudentIssue: PaymentDeskIssue | null = null;
  const shouldIncludeLatestReceipt = payload.includeLatestReceipt ?? true;
  const shouldIncludeBreakdown = payload.includeBreakdown ?? true;
  const latestReceiptPromise = shouldIncludeLatestReceipt
    ? getLatestReceiptForStudent(payload.studentId)
    : Promise.resolve(null);

  async function loadSelectedStudentDetail() {
    selectedStudentDetail ??= await getStudentDetail(payload.studentId);
    return selectedStudentDetail;
  }

  if (
    !selectedFinancial &&
    !payload.autoPrepareMissingDues &&
    !selectedStudentDetail
  ) {
    selectedStudentDetail = await loadSelectedStudentDetail();
  }

  if (
    !selectedFinancial &&
    payload.autoPrepareMissingDues
  ) {
    const detail = await loadSelectedStudentDetail();
    const autoPrepareIssue = await tryAutoPrepareSelectedStudentDues({
      studentId: detail?.id ?? payload.studentId,
      policySessionLabel: sessionLabel,
    });

    if (!autoPrepareIssue) {
      const repairedWorkbookRows = await getWorkbookStudentFinancials({
        studentId: detail?.id ?? payload.studentId,
        sessionLabel,
      });
      selectedFinancial = repairedWorkbookRows[0] ?? null;
    } else {
      selectedStudentIssue = autoPrepareIssue;
    }
  }

  if (selectedFinancial) {
    let previewReadError: unknown = null;
    let [breakdown, financialState, familyMembership] = await Promise.all([
      shouldIncludeBreakdown
        ? getPaymentDateAwareInstallmentBalances({
            studentId: selectedFinancial.studentId,
            paymentDate: payload.paymentDate,
          }).catch((error) => {
            previewReadError = error;
            return [] as InstallmentBalanceItem[];
          })
        : Promise.resolve([] as InstallmentBalanceItem[]),
      getStudentFinancialState(selectedFinancial.studentId),
      getConfirmedFamilyMembership(selectedFinancial.studentId, sessionLabel),
    ]);

    const shouldRepairEmptyBreakdown =
      shouldIncludeBreakdown &&
      breakdown.length === 0 &&
      payload.autoPrepareMissingDues &&
      (previewReadError || selectedFinancial.outstandingAmount > 0);

    if (shouldRepairEmptyBreakdown) {
      const autoPrepareIssue = await tryAutoPrepareSelectedStudentDues({
        studentId: selectedFinancial.studentId,
        policySessionLabel: sessionLabel,
      });

      if (!autoPrepareIssue) {
        try {
          breakdown = await getPaymentDateAwareInstallmentBalances({
            studentId: selectedFinancial.studentId,
            paymentDate: payload.paymentDate,
          });
          financialState = await getStudentFinancialState(selectedFinancial.studentId);
          familyMembership = await getConfirmedFamilyMembership(selectedFinancial.studentId, sessionLabel);
          previewReadError = null;
        } catch (error) {
          previewReadError = error;
          selectedStudentIssue = {
            key: "dues_load_failed",
            keyValues: { detail: toFriendlyPaymentPreviewError(error) },
            title: "Dues could not be loaded.",
            detail: toFriendlyPaymentPreviewError(error),
            actionLabel: "Prepare dues again",
            actionHref: null,
            repairStudentId: selectedFinancial.studentId,
          };
        }
      } else {
        selectedStudentIssue = autoPrepareIssue;
      }
    }

    if (
      shouldIncludeBreakdown &&
      breakdown.length === 0 &&
      (selectedStudentIssue || previewReadError || selectedFinancial.outstandingAmount > 0)
    ) {
      return {
        student: null,
        issue:
          selectedStudentIssue ?? {
            key: "dues_not_prepared",
            keyValues: previewReadError
              ? { detail: toFriendlyPaymentPreviewError(previewReadError) }
              : undefined,
            title: "Dues are not prepared for this student.",
            detail:
              previewReadError
                ? toFriendlyPaymentPreviewError(previewReadError)
                : "Student exists, but dues are not prepared yet. Payment Desk can repair this only when Fee Setup is complete.",
            actionLabel: "Prepare dues again",
            actionHref: null,
            repairStudentId: selectedFinancial.studentId,
          },
        latestReceipt: await latestReceiptPromise,
        suggestedDefaultAmount: null,
        paymentDate: payload.paymentDate,
      };
    }

    const conventionalDiscount = await getConventionalDiscountForStudent(
      selectedFinancial.studentId,
      sessionLabel,
    );
    const selectedStudent = {
      ...summarizeStudent(
        selectedFinancial,
        breakdown,
        financialState,
        policy.installmentCount,
        conventionalDiscount,
      ),
      confirmedFamilyGroupId: familyMembership.familyGroupId,
      confirmedSiblingCount: familyMembership.siblingCount,
    };

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

  selectedStudentDetail = selectedStudentDetail ?? (await loadSelectedStudentDetail());

  if (selectedStudentDetail) {
    return {
      student: null,
      issue:
        selectedStudentIssue ??
        (selectedStudentDetail.classSessionLabel !== sessionLabel
          ? {
              key: "selected_student_session_mismatch",
              keyValues: {
                studentSession: selectedStudentDetail.classSessionLabel || "a different session",
                policySession: sessionLabel,
              },
              title: "Selected student belongs to another academic session.",
              detail:
                `This student is in ${selectedStudentDetail.classSessionLabel || "a different session"}, but this view is showing ${sessionLabel}. Change the session to review matching dues.`,
              actionLabel: "Open Fee Setup",
              actionHref: "/protected/fee-setup",
            }
          : {
              key: "dues_not_prepared",
              title: "Dues are not prepared for this student.",
              detail:
                "Student exists, but dues are not prepared yet. Payment Desk can repair this only when Fee Setup is complete.",
              actionLabel: "Prepare dues again",
              actionHref: null,
              repairStudentId: selectedStudentDetail.id,
            }),
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
  sessionLabel?: string | null;
  /**
   * Audit 1.4 — When true, the same-student/date/amount soft-duplicate check
   * is bypassed. Staff must have seen and dismissed the prompt before this
   * flag is set. The 60-second near-duplicate check is always applied.
   */
  acknowledgeDailyDuplicate?: boolean;
}) {
  const policy = payload.sessionLabel
    ? await getFeePolicyForSession(payload.sessionLabel)
    : await getFeePolicySummary();
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
    sessionLabel: payload.sessionLabel,
  });
  const duplicateReceipt = await findLikelyDuplicateReceipt({
    studentId: payload.studentId,
    paymentDate: payload.paymentDate,
    paymentMode: payload.paymentMode,
    paymentAmount: payload.paymentAmount,
    referenceNumber: payload.referenceNumber,
  });

  if (duplicateReceipt) {
    throw new DuplicatePaymentWarning(duplicateReceipt, { kind: "near-duplicate" });
  }

  // Audit 1.4 — broader same-day same-amount soft check. Caught even when the
  // amount or reference differs from the most recent post.
  if (!payload.acknowledgeDailyDuplicate) {
    const dailyDuplicate = await findLikelyDailyDuplicateReceipt({
      studentId: payload.studentId,
      paymentDate: payload.paymentDate,
      paymentAmount: payload.paymentAmount,
    });

    if (dailyDuplicate) {
      throw new DuplicatePaymentWarning(dailyDuplicate, {
        kind: "daily-amount",
        amount: payload.paymentAmount,
        paymentDate: payload.paymentDate,
      });
    }
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

/**
 * Audit 1.4 — Soft daily-amount duplicate check.
 *
 * Detects another receipt for the same (student_id, payment_date, total_amount)
 * regardless of payment mode or reference number, with no 60-second cutoff.
 * A cashier who fat-fingers an amount or pastes a different UPI reference on
 * the same student/day/amount can still trigger this.
 *
 * Surfaced as a soft warning (DuplicatePaymentWarning with kind: "daily-amount")
 * that staff can explicitly acknowledge via the acknowledgeDailyDuplicate flag
 * on postStudentPayment.
 */
async function findLikelyDailyDuplicateReceipt(payload: {
  studentId: string;
  paymentDate: string;
  paymentAmount: number;
}) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("receipts")
      .select("id, receipt_number")
      .eq("student_id", payload.studentId)
      .eq("payment_date", payload.paymentDate)
      .eq("total_amount", payload.paymentAmount)
      .order("created_at", { ascending: false })
      .limit(1);

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
  return getPaymentDateAwareInstallmentBalancesUncached(payload);
}

async function getPaymentDateAwareInstallmentBalancesUncached(payload: {
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
