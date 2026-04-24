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
  });
  const selectedWorkbookRows = payload.studentId
    ? await getWorkbookStudentFinancials({ studentId: payload.studentId })
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

  let studentOptions = mapStudentOptions(filteredWorkbookRows);
  let selectedStudentIssue: PaymentDeskIssue | null = null;

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
            "Open Fee Setup / Refresh Dues to generate installment rows before posting a payment.",
          actionLabel: "Refresh Dues",
          actionHref: "/protected/fee-setup/generate",
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
              "Open Fee Setup / Refresh Dues to generate installment rows before posting a payment.",
            actionLabel: "Refresh Dues",
            actionHref: "/protected/fee-setup/generate",
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
