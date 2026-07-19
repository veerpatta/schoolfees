import type { PaymentMode } from "@/lib/db/types";

/** Template columns for the bulk payment upload (order matters). */
export const PAYMENT_TEMPLATE_HEADERS = [
  "SR no",
  "Amount",
  "Payment date",
  "Payment mode",
  "Remarks",
] as const;

/** Hard cap per batch — keeps commit chunking and review manageable. */
export const PAYMENT_IMPORT_MAX_ROWS = 200;

/** Rows posted per commit request — the client loops until done. */
export const PAYMENT_IMPORT_COMMIT_CHUNK_SIZE = 25;

export type PaymentImportRowStatus = "pending" | "valid" | "warning" | "error";

export type PaymentImportRowView = {
  id: string;
  rowNumber: number;
  admissionNo: string | null;
  studentId: string | null;
  studentName: string | null;
  paymentDate: string | null;
  paymentMode: PaymentMode | null;
  amount: number | null;
  remarks: string | null;
  validationStatus: PaymentImportRowStatus;
  validationMessages: string[];
  duplicateAcknowledged: boolean;
  receiptId: string | null;
  receiptNumber: string | null;
  postedAt: string | null;
  postError: string | null;
};

export type PaymentImportBatchSummary = {
  batchId: string;
  sessionLabel: string;
  fileName: string;
  status: "uploaded" | "validated" | "committing" | "committed" | "failed" | "cancelled";
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  postedRows: number;
  rows: PaymentImportRowView[];
};

export type ValidatedPaymentRow = {
  admissionNo: string | null;
  studentId: string | null;
  studentName: string | null;
  paymentDate: string | null;
  paymentMode: PaymentMode | null;
  amount: number | null;
  remarks: string | null;
  status: PaymentImportRowStatus;
  messages: string[];
};
