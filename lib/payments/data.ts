import "server-only";

import type { PaymentMode } from "@/lib/db/types";
import { getFeePolicySummary } from "@/lib/fees/data";
import { looksLikeReceiptQuery, normalizePaymentDeskQuery } from "@/lib/payments/search";
import { createClient } from "@/lib/supabase/server";
import {
  getWorkbookInstallmentBalances,
  getWorkbookStudentFinancials,
  getWorkbookTransactions,
} from "@/lib/workbook/data";
import type {
  InstallmentBalanceItem,
  PaymentEntryPageData,
  PaymentStudentOption,
  SelectedStudentSummary,
} from "@/lib/payments/types";

type PostStudentPaymentRow = {
  receipt_id: string;
  receipt_number: string;
  allocated_total: number;
};

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
  }));
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
  });
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

  let studentOptions = mapStudentOptions(filteredWorkbookRows);

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

        studentOptions = [
          {
            id: row.studentId,
            fullName: row.studentName,
            admissionNo: row.admissionNo,
            classLabel: row.classLabel,
            fatherName: row.fatherName,
            fatherPhone: row.fatherPhone,
            motherPhone: null,
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
      searchQuery: normalizedQuery,
      classId: payload.classId ?? "",
      modeOptions: policy.acceptedPaymentModes,
      policyNote: `${policy.academicSessionLabel} policy uses receipt prefix ${policy.receiptPrefix}, ${policy.lateFeeLabel.toLowerCase()}, and ${policy.acceptedPaymentModes.map((item) => item.label).join(", ")}.`,
      recentReceipts,
      todayCollection,
    };
  }

  const selectedFinancial =
    workbookRows.find((row) => row.studentId === payload.studentId) ?? null;

  if (!selectedFinancial) {
    return {
      studentOptions,
      selectedStudent: null,
      searchQuery: normalizedQuery,
      classId: payload.classId ?? "",
      modeOptions: policy.acceptedPaymentModes,
      policyNote: `${policy.academicSessionLabel} policy uses receipt prefix ${policy.receiptPrefix}, ${policy.lateFeeLabel.toLowerCase()}, and ${policy.acceptedPaymentModes.map((item) => item.label).join(", ")}.`,
      recentReceipts,
      todayCollection,
    };
  }

  const breakdown = mapBreakdown(await getWorkbookInstallmentBalances(selectedFinancial.studentId));

  return {
    studentOptions,
    selectedStudent: summarizeStudent(selectedFinancial, breakdown),
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
