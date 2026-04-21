import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ReceiptBreakdownItem, ReceiptDetail, ReceiptListItem } from "@/lib/receipts/types";

type StudentClassRow = {
  class_name: string;
  section: string | null;
  stream_name: string | null;
};

type StudentRow = {
  full_name: string;
  admission_no: string;
  class_ref: StudentClassRow | StudentClassRow[] | null;
};

type ReceiptListRow = {
  id: string;
  receipt_number: string;
  payment_date: string;
  payment_mode: "cash" | "upi" | "bank_transfer" | "cheque";
  total_amount: number;
  reference_number: string | null;
  notes: string | null;
  received_by: string | null;
  created_at: string;
  student_ref: StudentRow | StudentRow[] | null;
};

type PaymentInstallmentRow = {
  installment_no: number;
  installment_label: string;
  due_date: string;
};

type ReceiptPaymentRow = {
  id: string;
  amount: number;
  notes: string | null;
  installment_ref: PaymentInstallmentRow | PaymentInstallmentRow[] | null;
};

type ReceiptDetailRow = {
  id: string;
  receipt_number: string;
  payment_date: string;
  payment_mode: "cash" | "upi" | "bank_transfer" | "cheque";
  total_amount: number;
  reference_number: string | null;
  notes: string | null;
  received_by: string | null;
  created_at: string;
  created_by: string | null;
  student_ref: StudentRow | StudentRow[] | null;
};

type UserRow = {
  id: string;
  full_name: string;
};

function toSingleRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function buildClassLabel(classRef: StudentClassRow | StudentClassRow[] | null) {
  const value = toSingleRecord(classRef);

  if (!value) {
    return "Unknown class";
  }

  const parts = [value.class_name];

  if (value.section) {
    parts.push(`Section ${value.section}`);
  }

  if (value.stream_name) {
    parts.push(value.stream_name);
  }

  return parts.join(" - ");
}

export async function getReceiptsList(searchQuery: string): Promise<ReceiptListItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("receipts")
    .select(
      "id, receipt_number, payment_date, payment_mode, total_amount, reference_number, notes, received_by, created_at, student_ref:students(full_name, admission_no, class_ref:classes(class_name, section, stream_name))",
    )
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(80);

  const normalizedQuery = searchQuery.trim();

  if (normalizedQuery) {
    query = query.or(`receipt_number.ilike.%${normalizedQuery}%,reference_number.ilike.%${normalizedQuery}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Unable to load receipts: ${error.message}`);
  }

  return ((data ?? []) as ReceiptListRow[]).map((row) => {
    const student = toSingleRecord(row.student_ref);

    return {
      id: row.id,
      receiptNumber: row.receipt_number,
      paymentDate: row.payment_date,
      paymentMode: row.payment_mode,
      totalAmount: row.total_amount,
      referenceNumber: row.reference_number,
      notes: row.notes,
      receivedBy: row.received_by,
      createdAt: row.created_at,
      studentFullName: student?.full_name ?? "Unknown student",
      admissionNo: student?.admission_no ?? "N/A",
      classLabel: buildClassLabel(student?.class_ref ?? null),
    };
  });
}

export async function getReceiptDetail(receiptId: string): Promise<ReceiptDetail | null> {
  const supabase = await createClient();

  const { data: receiptRaw, error: receiptError } = await supabase
    .from("receipts")
    .select(
      "id, receipt_number, payment_date, payment_mode, total_amount, reference_number, notes, received_by, created_at, created_by, student_ref:students(full_name, admission_no, class_ref:classes(class_name, section, stream_name))",
    )
    .eq("id", receiptId)
    .maybeSingle();

  if (receiptError) {
    throw new Error(`Unable to load receipt details: ${receiptError.message}`);
  }

  if (!receiptRaw) {
    return null;
  }

  const receipt = receiptRaw as ReceiptDetailRow;

  const { data: paymentsRaw, error: paymentsError } = await supabase
    .from("payments")
    .select("id, amount, notes, installment_ref:installments(installment_no, installment_label, due_date)")
    .eq("receipt_id", receipt.id)
    .order("created_at", { ascending: true });

  if (paymentsError) {
    throw new Error(`Unable to load receipt breakdown: ${paymentsError.message}`);
  }

  const breakdown: ReceiptBreakdownItem[] = ((paymentsRaw ?? []) as ReceiptPaymentRow[])
    .map((row) => {
      const installment = toSingleRecord(row.installment_ref);

      if (!installment) {
        return null;
      }

      return {
        paymentId: row.id,
        installmentNo: installment.installment_no,
        installmentLabel: installment.installment_label,
        dueDate: installment.due_date,
        amount: row.amount,
        notes: row.notes,
      };
    })
    .filter((value): value is ReceiptBreakdownItem => value !== null)
    .sort((a, b) => a.installmentNo - b.installmentNo);

  let createdByName: string | null = null;

  if (receipt.created_by) {
    const { data: userRaw, error: userError } = await supabase
      .from("users")
      .select("id, full_name")
      .eq("id", receipt.created_by)
      .maybeSingle();

    if (userError) {
      throw new Error(`Unable to load receipt creator details: ${userError.message}`);
    }

    createdByName = (userRaw as UserRow | null)?.full_name ?? null;
  }

  const student = toSingleRecord(receipt.student_ref);

  return {
    id: receipt.id,
    receiptNumber: receipt.receipt_number,
    paymentDate: receipt.payment_date,
    paymentMode: receipt.payment_mode,
    totalAmount: receipt.total_amount,
    referenceNumber: receipt.reference_number,
    notes: receipt.notes,
    receivedBy: receipt.received_by,
    createdAt: receipt.created_at,
    createdByName,
    studentFullName: student?.full_name ?? "Unknown student",
    admissionNo: student?.admission_no ?? "N/A",
    classLabel: buildClassLabel(student?.class_ref ?? null),
    breakdown,
  };
}
