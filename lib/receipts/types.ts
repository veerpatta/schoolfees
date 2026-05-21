import type { PaymentMode } from "@/lib/db/types";

export type ReceiptListItem = {
  id: string;
  receiptNumber: string;
  paymentDate: string;
  paymentMode: PaymentMode;
  totalAmount: number;
  referenceNumber: string | null;
  notes: string | null;
  receivedBy: string | null;
  createdAt: string;
  studentFullName: string;
  admissionNo: string;
  classLabel: string;
};

export type ReceiptBreakdownItem = {
  paymentId: string;
  installmentNo: number;
  installmentLabel: string;
  sessionLabel: string | null;
  dueDate: string;
  amount: number;
  notes: string | null;
};

export type ReceiptFeeSummaryItem = {
  label: string;
  amount: number;
};

export type ConventionalDiscountAssignmentSummary = {
  assignmentId: string;
  policyCode: string;
  policyDisplayName: string;
  beforeTuitionAmount: number;
  resultingTuitionAmount: number;
};

export type ReceiptDetail = {
  id: string;
  studentId: string;
  receiptNumber: string;
  paymentDate: string;
  paymentMode: PaymentMode;
  totalAmount: number;
  referenceNumber: string | null;
  notes: string | null;
  receivedBy: string | null;
  createdAt: string;
  createdByName: string | null;
  studentFullName: string;
  admissionNo: string;
  fatherName: string | null;
  fatherPhone: string | null;
  classLabel: string;
  sessionLabel: string;
  transportRouteLabel: string;
  studentStatusLabel: "New" | "Old";
  feeSummary: ReceiptFeeSummaryItem[];
  totalDue: number;
  totalPaidBeforeReceipt: number;
  totalPaidToDate: number;
  outstandingAfterReceipt: number;
  currentOutstanding: number;
  discountAmount: number;
  lateFeeAmount: number;
  lateFeeWaived: number;
  breakdown: ReceiptBreakdownItem[];
  conventionalDiscountAssignments: ConventionalDiscountAssignmentSummary[];
};
