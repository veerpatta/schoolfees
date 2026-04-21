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
  dueDate: string;
  amount: number;
  notes: string | null;
};

export type ReceiptDetail = {
  id: string;
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
  classLabel: string;
  breakdown: ReceiptBreakdownItem[];
};
