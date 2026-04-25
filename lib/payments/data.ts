import "server-only";

import type { PaymentMode } from "@/lib/db/types";
import { getFeePolicySummary } from "@/lib/fees/data";
import { looksLikeReceiptQuery, normalizePaymentDeskQuery } from "@/lib/payments/search";
import { createClient } from "@/lib/supabase/server";
import { getStudentDetail } from "@/lib/students/data";
import {
  prepareDuesForStudentsAutomatically,
} from "@/lib/system-sync/finance-sync";
import {
  getWorkbookInstallmentBalances,
  getWorkbookStudentFinancials,
  getWorkbookTransactions,
} from "@/lib/workbook/data";
import type {
  InstallmentBalanceItem,
  PaymentDeskIssue,
  PaymentEntryPageData,
  PaymentPostingDiagnostic,
  PaymentStudentOption,
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

function mapStudentOptions(
  rows: Awaited<ReturnType<typeof getWorkbookStudentFinancials>>,
): PaymentStudentOption[] {
  return rows.map((row) => ({
    id: row.studentId,
    fullName: row.studentName,
    admissionNo: row.admissionNo,
    classLabel: row.classLabel,
    fatherName: row.fatherName,
    fatherPhone: row.fatherPhone,
    motherPhone: row.motherPhone,
    pendingAmount: row.outstandingAmount,
  }));
}

function buildStudentOption(payload: {
  studentId: string;
  studentName: string;
  admissionNo: string;
  classLabel: string;
  fatherName: string | null;
  fatherPhone: string | null;
  motherPhone: string | null;
  pendingAmount?: number;
}): PaymentStudentOption {
  return {
    id: payload.studentId,
    fullName: payload.studentName,
    admissionNo: payload.admissionNo,
    classLabel: payload.classLabel,
    fatherName: payload.fatherName,
    fatherPhone: payload.fatherPhone,
    motherPhone: payload.motherPhone,
    pendingAmount: payload.pendingAmount ?? 0,
  };
}

async function getBasePaymentStudentOptions(payload: {
  classId?: string;
  normalizedQuery: string;
  selectedStudentId?: string | null;
  pendingByStudentId: Map<string, number>;
}) {
  const policy = await getFeePolicySummary();
  const supabase = await createClient();
  let query = supabase
    .from("students")
    .select(
      "id, full_name, admission_no, father_name, primary_phone, secondary_phone, class_ref:classes!inner(id, session_label, status, class_name, section, stream_name)",
    )
    .eq("status", "active")
    .eq("class_ref.session_label", policy.academicSessionLabel)
    .eq("class_ref.status", "active")
    .order("full_name", { ascending: true })
    .limit(80);

  if (payload.classId) {
    query = query.eq("class_ref.id", payload.classId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Unable to load Payment Desk students: ${error.message}`);
  }

  const normalizedQuery = payload.normalizedQuery.toLowerCase();
  const selectedStudentId = payload.selectedStudentId ?? null;

  return ((data ?? []) as PaymentStudentBaseRow[])
    .map((row) => {
      const classRef = toSingleRecord(row.class_ref);

      return buildStudentOption({
        studentId: row.id,
        studentName: row.full_name,
        admissionNo: row.admission_no,
        classLabel: classRef ? buildClassLabel(classRef) : "Unknown class",
        fatherName: row.father_name,
        fatherPhone: row.primary_phone,
        motherPhone: row.secondary_phone,
        pendingAmount: payload.pendingByStudentId.get(row.id) ?? 0,
      });
    })
    .filter((row) => {
      if (row.id === selectedStudentId) {
        return true;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        row.fullName,
        row.admissionNo,
        row.fatherName ?? "",
        row.fatherPhone ?? "",
        row.motherPhone ?? "",
        row.classLabel,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
}

function mapBreakdown(
  rows: Awaited<ReturnType<typeof getWorkbookInstallmentBalances>>,
): InstallmentBalanceItem[] {
  return rows.map((row) => ({
    installmentId: row.installmentId,
    installmentNo: row.installmentNo,
    installmentLabel: row.installmentLabel,
    dueDate: row.dueDate,
    amountDue: row.totalCharge,
    paymentsTotal: row.paidAmount,
    adjustmentsTotal: row.adjustmentAmount,
    outstandingAmount: row.pendingAmount,
    rawLateFee: row.rawLateFee,
    waiverApplied: row.waiverApplied,
    finalLateFee: row.finalLateFee,
    balanceStatus: row.balanceStatus,
  }));
}

function summarizeStudent(
  financial: Awaited<ReturnType<typeof getWorkbookStudentFinancials>>[number],
  breakdown: InstallmentBalanceItem[],
): SelectedStudentSummary {
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
    totalDue: financial.totalDue,
    totalPaid: financial.totalPaid,
    totalPending: financial.outstandingAmount,
    overdueAmount: breakdown
      .filter((item) => item.balanceStatus === "overdue")
      .reduce((sum, item) => sum + item.outstandingAmount, 0),
    nextDueInstallmentLabel: financial.nextDueLabel,
    nextDueDate: financial.nextDueDate,
    nextDueAmount: financial.nextDueAmount,
  };
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

  if (payload.paymentAmount > previewPendingAmount) {
    throw new PaymentPostingPreflightError(
      "Payment amount is more than pending dues.",
      buildPaymentDiagnostic({
        ...baseDiagnostic,
        installmentCount,
        previewPendingAmount,
        previewWorked: true,
        autoPrepareAttempted,
        autoPrepareWorked,
        reason: "payment_amount_exceeds_preview_pending",
      }),
    );
  }

  return buildPaymentDiagnostic({
    ...baseDiagnostic,
    installmentCount,
    previewPendingAmount,
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
      actionHref: "/protected/advanced",
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
  const normalizedQuery = normalizePaymentDeskQuery(payload.searchQuery);
  const shouldLoadWorkbookList = !payload.studentId;
  const [workbookRows, selectedWorkbookRows] = await Promise.all([
    shouldLoadWorkbookList
      ? getWorkbookStudentFinancials({
          classId: payload.classId,
          sessionLabel: policy.academicSessionLabel,
        })
      : Promise.resolve([]),
    payload.studentId
      ? getWorkbookStudentFinancials({
          studentId: payload.studentId,
          sessionLabel: policy.academicSessionLabel,
        })
      : Promise.resolve([]),
  ]);
  const filteredWorkbookRows = normalizedQuery
    ? workbookRows.filter((row) => {
        const haystack = [
          row.studentName,
          row.admissionNo,
          row.fatherName ?? "",
          row.fatherPhone ?? "",
          row.motherPhone ?? "",
          row.classLabel,
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedQuery.toLowerCase());
      })
    : workbookRows;

  const pendingByStudentId = new Map(
    workbookRows.map((row) => [row.studentId, row.outstandingAmount]),
  );
  let studentOptions = await getBasePaymentStudentOptions({
    classId: payload.classId,
    normalizedQuery,
    selectedStudentId: payload.studentId,
    pendingByStudentId,
  });
  let selectedStudentIssue: PaymentDeskIssue | null = null;

  if (studentOptions.length === 0 && filteredWorkbookRows.length > 0) {
    studentOptions = mapStudentOptions(filteredWorkbookRows);
  }

  if (normalizedQuery && looksLikeReceiptQuery(normalizedQuery)) {
    const receiptMatches = await getWorkbookTransactions({ limit: 30, query: normalizedQuery });
    const seenIds = new Set(studentOptions.map((item) => item.id));

    receiptMatches
      .filter((row) => {
        const haystack = `${row.receiptNumber} ${row.referenceNumber ?? ""}`.toLowerCase();
        return haystack.includes(normalizedQuery.toLowerCase());
      })
      .forEach((row) => {
        if (seenIds.has(row.studentId)) {
          return;
        }

        const financial =
          workbookRows.find((item) => item.studentId === row.studentId) ??
          selectedWorkbookRows.find((item) => item.studentId === row.studentId);

        studentOptions = [
          {
            id: row.studentId,
            fullName: row.studentName,
            admissionNo: row.admissionNo,
            classLabel: row.classLabel,
            fatherName: row.fatherName,
            fatherPhone: row.fatherPhone,
            motherPhone: null,
            pendingAmount: financial?.outstandingAmount ?? row.currentOutstanding,
          },
          ...studentOptions,
        ];
        seenIds.add(row.studentId);
      });
  }

  const [recentTransactions, todayTransactions] = await Promise.all([
    getWorkbookTransactions({ limit: 6 }),
    getWorkbookTransactions({ todayOnly: true }),
  ]);

  const recentReceipts = recentTransactions.slice(0, 6).map((row) => ({
    id: row.receiptId,
    receiptNumber: row.receiptNumber,
    studentId: row.studentId,
    studentLabel: `${row.studentName} (${row.admissionNo})`,
    totalAmount: row.totalAmount,
  }));

  const todayCollection = {
    receiptCount: todayTransactions.length,
    totalAmount: todayTransactions.reduce((sum, row) => sum + row.totalAmount, 0),
  };

  if (!payload.studentId) {
    return {
      studentOptions,
      selectedStudent: null,
      selectedStudentIssue: null,
      searchQuery: normalizedQuery,
      classId: payload.classId ?? "",
      modeOptions: policy.acceptedPaymentModes,
      policyNote: `${policy.academicSessionLabel} policy uses receipt prefix ${policy.receiptPrefix}, ${policy.lateFeeLabel.toLowerCase()}, and ${policy.acceptedPaymentModes.map((item) => item.label).join(", ")}.`,
      recentReceipts,
      todayCollection,
    };
  }

  const selectedFinancial = selectedWorkbookRows[0] ?? null;

  if (selectedFinancial) {
    const breakdown = mapBreakdown(
      await getWorkbookInstallmentBalances(selectedFinancial.studentId),
    );
    if (breakdown.length === 0) {
      if (payload.autoPrepareMissingDues) {
        const autoPrepareIssue = await tryAutoPrepareSelectedStudentDues({
          studentId: selectedFinancial.studentId,
          policySessionLabel: policy.academicSessionLabel,
        });

        if (!autoPrepareIssue) {
          return getPaymentEntryPageData({
            ...payload,
            autoPrepareMissingDues: false,
          });
        }

        selectedStudentIssue = autoPrepareIssue;
      }

      const selectedOption = buildStudentOption({
        studentId: selectedFinancial.studentId,
        studentName: selectedFinancial.studentName,
        admissionNo: selectedFinancial.admissionNo,
        classLabel: selectedFinancial.classLabel,
        fatherName: selectedFinancial.fatherName,
        fatherPhone: selectedFinancial.fatherPhone,
        motherPhone: selectedFinancial.motherPhone,
        pendingAmount: selectedFinancial.outstandingAmount,
      });

      if (!studentOptions.some((item) => item.id === selectedOption.id)) {
        studentOptions = [selectedOption, ...studentOptions];
      }

      return {
        studentOptions,
        selectedStudent: null,
        selectedStudentIssue:
          selectedStudentIssue ?? {
            title: "Dues are not prepared for this student.",
            detail:
              "Student exists, but dues are not prepared yet. Payment Desk can repair this only when Fee Setup is complete.",
            actionLabel: "Prepare dues again",
            actionHref: null,
            repairStudentId: selectedFinancial.studentId,
          },
        searchQuery: normalizedQuery,
        classId: payload.classId ?? "",
        modeOptions: policy.acceptedPaymentModes,
        policyNote: `${policy.academicSessionLabel} policy uses receipt prefix ${policy.receiptPrefix}, ${policy.lateFeeLabel.toLowerCase()}, and ${policy.acceptedPaymentModes.map((item) => item.label).join(", ")}.`,
        recentReceipts,
        todayCollection,
      };
    }

    const selectedStudent = summarizeStudent(selectedFinancial, breakdown);
    const selectedOption = buildStudentOption({
      studentId: selectedStudent.id,
      studentName: selectedStudent.fullName,
      admissionNo: selectedStudent.admissionNo,
      classLabel: selectedStudent.classLabel,
      fatherName: selectedStudent.fatherName,
      fatherPhone: selectedStudent.fatherPhone,
      motherPhone: selectedStudent.motherPhone,
      pendingAmount: selectedStudent.totalPending,
    });

    if (!studentOptions.some((item) => item.id === selectedOption.id)) {
      studentOptions = [selectedOption, ...studentOptions];
    }

    return {
      studentOptions,
      selectedStudent,
      selectedStudentIssue: null,
      searchQuery: normalizedQuery,
      classId: payload.classId ?? "",
      modeOptions: policy.acceptedPaymentModes,
      policyNote: `${policy.academicSessionLabel} policy uses receipt prefix ${policy.receiptPrefix}, ${policy.lateFeeLabel.toLowerCase()}, and ${policy.acceptedPaymentModes.map((item) => item.label).join(", ")}.`,
      recentReceipts,
      todayCollection,
    };
  }

  const selectedStudentDetail = await getStudentDetail(payload.studentId);

  if (selectedStudentDetail) {
    if (payload.autoPrepareMissingDues) {
      const autoPrepareIssue = await tryAutoPrepareSelectedStudentDues({
        studentId: selectedStudentDetail.id,
        policySessionLabel: policy.academicSessionLabel,
      });

      if (!autoPrepareIssue) {
        return getPaymentEntryPageData({
          ...payload,
          autoPrepareMissingDues: false,
        });
      }

      selectedStudentIssue = autoPrepareIssue;
    }

    const selectedOption = buildStudentOption({
      studentId: selectedStudentDetail.id,
      studentName: selectedStudentDetail.fullName,
      admissionNo: selectedStudentDetail.admissionNo,
      classLabel: selectedStudentDetail.classLabel,
      fatherName: selectedStudentDetail.fatherName,
      fatherPhone: selectedStudentDetail.fatherPhone,
      motherPhone: selectedStudentDetail.motherPhone,
    });

    if (!studentOptions.some((item) => item.id === selectedOption.id)) {
      studentOptions = [selectedOption, ...studentOptions];
    }

    selectedStudentIssue =
      selectedStudentIssue ??
      (selectedStudentDetail.classSessionLabel !== policy.academicSessionLabel
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
          });

    return {
      studentOptions,
      selectedStudent: null,
      selectedStudentIssue,
      searchQuery: normalizedQuery,
      classId: payload.classId ?? "",
      modeOptions: policy.acceptedPaymentModes,
      policyNote: `${policy.academicSessionLabel} policy uses receipt prefix ${policy.receiptPrefix}, ${policy.lateFeeLabel.toLowerCase()}, and ${policy.acceptedPaymentModes.map((item) => item.label).join(", ")}.`,
      recentReceipts,
      todayCollection,
    };
  }

  return {
    studentOptions,
    selectedStudent: null,
    selectedStudentIssue: {
      title: "Selected student could not be loaded.",
      detail:
        "Refresh the Payment Desk and try again, or open the student record to confirm the student exists and has fee data.",
      actionLabel: "Open Students",
      actionHref: "/protected/students",
    },
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
  const preflightDiagnostic = await preflightPaymentPosting({
    studentId: payload.studentId,
    paymentDate: payload.paymentDate,
    paymentAmount: payload.paymentAmount,
  });
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
  };
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
