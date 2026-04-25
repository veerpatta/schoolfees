import "server-only";

import type { PaymentMode } from "@/lib/db/types";
import { getFeePolicySummary } from "@/lib/fees/data";
import { looksLikeReceiptQuery, normalizePaymentDeskQuery } from "@/lib/payments/search";
import { createClient } from "@/lib/supabase/server";
import { getStudentDetail } from "@/lib/students/data";
import {
  getWorkbookInstallmentBalances,
  getWorkbookStudentFinancials,
  getWorkbookTransactions,
} from "@/lib/workbook/data";
import type {
  InstallmentBalanceItem,
  PaymentDeskIssue,
  PaymentEntryPageData,
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
    normalized.includes("preview_workbook_payment_allocation") ||
    normalized.includes("could not find the function") ||
    normalized.includes("pgrst202") ||
    normalized.includes("42883")
  ) {
    return "Payment preview database function is missing. Apply latest Supabase migrations.";
  }

  if (
    normalized.includes("private.workbook_installment_snapshot") ||
    normalized.includes("permission denied for schema private") ||
    normalized.includes("permission denied for function workbook_installment_snapshot")
  ) {
    return "Payment preview database helper is not ready. Apply latest Supabase migrations.";
  }

  if (normalized.includes("no pending dues")) {
    return "No pending dues for selected payment date.";
  }

  if (normalized.includes("dues") || normalized.includes("installment")) {
    return "Dues not generated for this student.";
  }

  if (normalized.includes("session")) {
    return "Selected student belongs to another session. Align the working session with Fee Setup before posting.";
  }

  return "Unable to refresh payment preview. Check Live Data Health and apply latest migrations if needed.";
}

export function toFriendlyPaymentPostingError(error: unknown) {
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
    return "No pending dues are available for this student.";
  }

  if (normalized.includes("selected student was not found")) {
    return "Selected student could not be found. Refresh Payment Desk and select the student again.";
  }

  if (normalized.includes("dues") || normalized.includes("installment")) {
    return "Dues not generated for this student.";
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
    return "Payment posting database function is missing. Apply latest Supabase migrations.";
  }

  return "Unable to save payment right now. Please check the student, dues, amount, and payment mode.";
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
    .order("full_name", { ascending: true });

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

export async function getPaymentEntryPageData(payload: {
  studentId: string | null;
  searchQuery: string;
  classId?: string;
}): Promise<PaymentEntryPageData> {
  const policy = await getFeePolicySummary();
  const normalizedQuery = normalizePaymentDeskQuery(payload.searchQuery);
  const workbookRows = await getWorkbookStudentFinancials({
    classId: payload.classId,
    sessionLabel: policy.academicSessionLabel,
  });
  const selectedWorkbookRows = payload.studentId
    ? await getWorkbookStudentFinancials({ studentId: payload.studentId, sessionLabel: policy.academicSessionLabel })
    : [];
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
    const receiptMatches = await getWorkbookTransactions();
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

        const financial = workbookRows.find((item) => item.studentId === row.studentId);

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
    getWorkbookTransactions(),
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
        selectedStudentIssue: {
          title: "Dues are not generated for this student yet.",
          detail:
            "Student exists, but dues are not generated yet. Generate dues for this student before posting payment.",
          actionLabel: "Generate Dues for this Student",
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
      selectedStudentDetail.classSessionLabel !== policy.academicSessionLabel
        ? {
            title: "Selected student belongs to another academic session.",
            detail:
              `This student is in ${selectedStudentDetail.classSessionLabel || "a different session"}, but the active fee policy is ${policy.academicSessionLabel}. Open Fee Setup and make the same session active before dues or payments will appear.`,
            actionLabel: "Open Fee Setup",
            actionHref: "/protected/fee-setup",
          }
        : {
            title: "Dues are not generated for this student yet.",
            detail:
              "Student exists, but dues are not generated yet. Generate dues for this student before posting payment.",
            actionLabel: "Generate Dues for this Student",
            actionHref: null,
            repairStudentId: selectedStudentDetail.id,
          };

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
    throw new Error(toFriendlyPaymentPostingError(error));
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
