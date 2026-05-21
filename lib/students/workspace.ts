import "server-only";

import { getStudentFinancialSnapshot } from "@/lib/fees/data";
import { getLedgerPageData } from "@/lib/ledger/data";
import { createClient } from "@/lib/supabase/server";
import { getStudentDetail } from "@/lib/students/data";
import { getWorkbookInstallmentBalances } from "@/lib/workbook/data";

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

function paymentModeLabel(mode: StudentReceiptRow["payment_mode"]) {
  if (mode === "upi") {
    return "UPI";
  }

  if (mode === "bank_transfer") {
    return "Bank transfer";
  }

  if (mode === "cheque") {
    return "Cheque";
  }

  return "Cash";
}

export async function getStudentWorkspaceData(studentId: string) {
  const supabase = await createClient();
  const [student, financialSnapshot, ledgerData, receiptsResult, installmentBalances] =
    await Promise.all([
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
      getWorkbookInstallmentBalances(studentId),
    ]);

  if (receiptsResult.error) {
    throw new Error(`Unable to load student receipts: ${receiptsResult.error.message}`);
  }

  return {
    student,
    financialSnapshot,
    ledger: ledgerData.selectedStudent,
    receipts: ((receiptsResult.data ?? []) as StudentReceiptRow[]).map((row) => ({
      id: row.id,
      receiptNumber: row.receipt_number,
      paymentDate: row.payment_date,
      totalAmount: row.total_amount,
      paymentMode: row.payment_mode,
      paymentModeLabel: paymentModeLabel(row.payment_mode),
      referenceNumber: row.reference_number,
      receivedBy: row.received_by,
      createdAt: row.created_at,
    })),
    installmentBalances,
  };
}

export async function getFamilyWorkspaceData(familyGroupId: string) {
  const supabase = await createClient();
  const { data: members, error: membersError } = await supabase
    .from("student_family_members")
    .select("student_id, academic_session_label")
    .eq("family_group_id", familyGroupId);

  if (membersError) {
    throw new Error(`Unable to load family members: ${membersError.message}`);
  }

  if (!members || members.length === 0) {
    throw new Error("No family members found for the provided familyGroupId.");
  }

  const studentIds = members.map((m) => m.student_id);
  const workspaces = await Promise.all(
    studentIds.map(async (studentId) => {
      try {
        const workspace = await getStudentWorkspaceData(studentId);
        return workspace;
      } catch (err) {
        console.error(`Error loading workspace for student ${studentId}`, err);
        return null;
      }
    })
  );

  const activeWorkspaces = workspaces.filter(
    (w): w is Omit<NonNullable<typeof w>, "student"> & { student: NonNullable<NonNullable<typeof w>["student"]> } =>
      w !== null && w.student !== null
  );

  // Fetch family group details
  const { data: familyGroup } = await supabase
    .from("student_family_groups")
    .select("id, name, academic_session_label")
    .eq("id", familyGroupId)
    .maybeSingle();

  return {
    familyGroup: familyGroup ?? { id: familyGroupId, name: "Family Group", academic_session_label: members[0]?.academic_session_label ?? "2026-27" },
    students: activeWorkspaces,
  };
}
