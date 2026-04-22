import "server-only";

import { getStudentFinancialSnapshot } from "@/lib/fees/data";
import { getLedgerPageData } from "@/lib/ledger/data";
import { createClient } from "@/lib/supabase/server";
import { getStudentDetail } from "@/lib/students/data";

type StudentReceiptRow = {
  id: string;
  receipt_number: string;
  payment_date: string;
  total_amount: number;
  payment_mode: "cash" | "upi" | "bank_transfer" | "cheque";
  reference_number: string | null;
  received_by: string | null;
  created_at: string;
};

type StudentInstallmentBalanceRow = {
  installment_id: string;
  installment_no: number;
  installment_label: string;
  due_date: string;
  amount_due: number;
  payments_total: number;
  adjustments_total: number;
  outstanding_amount: number;
  balance_status: "paid" | "partial" | "overdue" | "pending" | "waived" | "cancelled";
};

export async function getStudentWorkspaceData(studentId: string) {
  const supabase = await createClient();
  const [
    student,
    financialSnapshot,
    ledgerData,
    receiptsResult,
    installmentBalancesResult,
  ] = await Promise.all([
    getStudentDetail(studentId),
    getStudentFinancialSnapshot(studentId),
    getLedgerPageData({
      searchQuery: "",
      studentId,
      entryFilter: "all",
      entryQuery: "",
    }),
    supabase
      .from("receipts")
      .select(
        "id, receipt_number, payment_date, total_amount, payment_mode, reference_number, received_by, created_at",
      )
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("v_installment_balances")
      .select(
        "installment_id, installment_no, installment_label, due_date, amount_due, payments_total, adjustments_total, outstanding_amount, balance_status",
      )
      .eq("student_id", studentId)
      .order("due_date", { ascending: true })
      .order("installment_no", { ascending: true }),
  ]);

  if (receiptsResult.error) {
    throw new Error(`Unable to load student receipts: ${receiptsResult.error.message}`);
  }

  if (installmentBalancesResult.error) {
    throw new Error(
      `Unable to load student installment balances: ${installmentBalancesResult.error.message}`,
    );
  }

  return {
    student,
    financialSnapshot,
    ledger: ledgerData.selectedStudent,
    receipts: (receiptsResult.data ?? []) as StudentReceiptRow[],
    installmentBalances:
      (installmentBalancesResult.data ?? []) as StudentInstallmentBalanceRow[],
  };
}
