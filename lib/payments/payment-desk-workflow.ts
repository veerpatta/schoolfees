import type { PaymentMode } from "@/lib/db/types";
import type {
  PaymentStudentIndexItem,
  PaymentStudentOption,
  SelectedStudentSummary,
} from "@/lib/payments/types";

export type PaymentDraft = {
  selectedStudent: SelectedStudentSummary | null;
  amountInput: string;
  paymentDate: string;
  paymentMode: PaymentMode | string;
  paymentModeLabel: string;
  referenceNumber: string;
  receivedBy: string;
  previewTotalPending: number;
  isPreviewRefreshing?: boolean;
  referenceRequired?: boolean;
  creditBalance?: number;
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

  if (draft.isPreviewRefreshing) {
    return { ok: false, message: "Wait for the dues preview to finish refreshing." };
  }

  if (draft.previewTotalPending <= 0) {
    if ((draft.creditBalance ?? 0) > 0) {
      return {
        ok: false,
        message: `No pending dues. Student has Rs ${draft.creditBalance} credit.`,
      };
    }

    return { ok: false, message: "No pending dues are available for this student." };
  }

  if (draft.referenceRequired && !draft.referenceNumber.trim()) {
    return {
      ok: false,
      message: "Reference number is required for UPI, bank transfer, and cheque payments.",
    };
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

export function paymentModeNeedsReference(paymentMode: PaymentMode | string) {
  return paymentMode === "upi" || paymentMode === "bank_transfer" || paymentMode === "cheque";
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
  return `${student.fullName} — SR: ${student.admissionNo}`;
}

export function buildPaymentDeskSearchIndex(students: PaymentStudentIndexItem[]) {
  return new Map(
    students.map((student) => [
      student.id,
      `${student.fullName} ${student.admissionNo} ${student.fatherName ?? ""} ${student.fatherPhone ?? ""} ${student.motherPhone ?? ""}`
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim(),
    ]),
  );
}

export function filterPaymentDeskStudents(payload: {
  students: PaymentStudentIndexItem[];
  searchIndex: Map<string, string>;
  selectedClassId: string;
  query: string;
  limit?: number;
}) {
  const normalizedQuery = payload.query.trim().toLowerCase();
  const classFiltered = payload.selectedClassId
    ? payload.students.filter((student) => student.classId === payload.selectedClassId)
    : payload.students;
  const searched = normalizedQuery
    ? classFiltered.filter((student) =>
        (payload.searchIndex.get(student.id) ?? "").includes(normalizedQuery),
      )
    : classFiltered;

  return searched
    .slice()
    .sort((left, right) => left.fullName.localeCompare(right.fullName))
    .slice(0, payload.limit ?? 200);
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
