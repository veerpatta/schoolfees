import type { PaymentMode } from "@/lib/db/types";
import type { PaymentStudentOption, SelectedStudentSummary } from "@/lib/payments/types";

export type PaymentDraft = {
  selectedStudent: SelectedStudentSummary | null;
  amountInput: string;
  paymentDate: string;
  paymentMode: PaymentMode | string;
  paymentModeLabel: string;
  referenceNumber: string;
  receivedBy: string;
  previewTotalPending: number;
};

export type PaymentDraftValidation =
  | { ok: true; amount: number; remainingBalance: number }
  | { ok: false; message: string };

export type PaymentConfirmationSummary = {
  studentName: string;
  admissionNo: string;
  classLabel: string;
  amount: number;
  paymentDate: string;
  paymentModeLabel: string;
  referenceNumber: string | null;
  receivedBy: string;
  remainingBalance: number;
};

export function validatePaymentDraft(draft: PaymentDraft): PaymentDraftValidation {
  if (!draft.selectedStudent) {
    return { ok: false, message: "Select a student before confirming payment." };
  }

  const amount = Number(draft.amountInput);

  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, message: "Enter a valid whole rupee payment amount." };
  }

  if (draft.previewTotalPending <= 0) {
    return { ok: false, message: "No pending dues are available for this student." };
  }

  if (amount > draft.previewTotalPending) {
    return { ok: false, message: "Payment amount exceeds pending amount." };
  }

  return {
    ok: true,
    amount,
    remainingBalance: Math.max(draft.previewTotalPending - amount, 0),
  };
}

export function buildPaymentConfirmationSummary(
  draft: PaymentDraft,
): PaymentConfirmationSummary | null {
  const validation = validatePaymentDraft(draft);

  if (!validation.ok || !draft.selectedStudent) {
    return null;
  }

  return {
    studentName: draft.selectedStudent.fullName,
    admissionNo: draft.selectedStudent.admissionNo,
    classLabel: draft.selectedStudent.classLabel,
    amount: validation.amount,
    paymentDate: draft.paymentDate,
    paymentModeLabel: draft.paymentModeLabel,
    referenceNumber: draft.referenceNumber.trim() || null,
    receivedBy: draft.receivedBy.trim(),
    remainingBalance: validation.remainingBalance,
  };
}

export function buildStudentSelectLabel(student: PaymentStudentOption) {
  const pendingLabel =
    student.pendingAmount == null
      ? "dues load after selection"
      : `pending Rs ${student.pendingAmount}`;

  return `${student.fullName} (${student.admissionNo}) - ${student.classLabel} - ${pendingLabel}`;
}

export function shouldBlockClientSubmission(payload: {
  isSubmitting: boolean;
  isLockedAfterSuccess: boolean;
}) {
  return payload.isSubmitting || payload.isLockedAfterSuccess;
}

export function resetPaymentDraftForNextPayment(payload: {
  keepPaymentMode: PaymentMode | string;
  defaultReceivedBy: string;
}) {
  return {
    amountInput: "",
    referenceNumber: "",
    remarks: "",
    paymentMode: payload.keepPaymentMode,
    receivedBy: payload.defaultReceivedBy,
  };
}
