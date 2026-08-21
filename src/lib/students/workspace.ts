import "server-only";

import type { PaymentMode } from "@/platform/db/types";
import { getFeePolicySummary, getStudentFinancialSnapshot } from "@/lib/fees/data";
import { getLedgerPageData } from "@/lib/ledger/data";
import {
  buildReceiptAllocationIndex,
  formatAppliedTo,
  type ReceiptAllocationRow,
} from "@/lib/receipts/allocations";
import { getReceiptReversalTotals, isReceiptReversed } from "@/lib/receipts/reversals";
import { createClient } from "@/platform/supabase/server";
import { getStudentDetail } from "@/lib/students/data";
import { getWorkbookInstallmentBalances } from "@/lib/workbook/data";

export class WorkspaceContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceContextError";
  }
}

type StudentReceiptRow = {
  id: string;
  receipt_number: string;
  payment_date: string;
  total_amount: number;
  payment_mode: PaymentMode;
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

  if (mode === "discount") {
    return "Discount";
  }

  return "Cash";
}

export async function getStudentWorkspaceData(
  studentId: string,
  options: { skipCache?: boolean } = {},
) {
  const supabase = await createClient();
  const [student, financialSnapshot, ledgerData, receiptsResult, installmentBalances] =
    await Promise.all([
      getStudentDetail(studentId),
      getStudentFinancialSnapshot(studentId, options),
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
        .limit(100),
      getWorkbookInstallmentBalances(studentId),
    ]);

  if (receiptsResult.error) {
    throw new Error(`Unable to load student receipts: ${receiptsResult.error.message}`);
  }

  const receiptRows = (receiptsResult.data ?? []) as StudentReceiptRow[];
  const receiptIds = receiptRows.map((row) => row.id);

  // Which installment each receipt was applied to. `payments` holds one row per
  // installment a receipt touched, and carries both receipt_id and
  // installment_id, so this is one indexed batch read — never an N+1. It runs
  // beside the reversal totals, which were already a sequential await here, so
  // the statement's "Applied to" column costs no extra round trip.
  const [reversalTotals, allocationRows] = await Promise.all([
    getReceiptReversalTotals(receiptIds),
    receiptIds.length === 0
      ? Promise.resolve<ReceiptAllocationRow[]>([])
      : supabase
          .from("payments")
          .select(
            "receipt_id, amount, installment_ref:installments(installment_no, installment_label, due_date, is_carry_forward, source_session_label)",
          )
          .in("receipt_id", receiptIds)
          .order("created_at", { ascending: true })
          .then(({ data, error }) => {
            if (error) {
              throw new Error(`Unable to load receipt allocations: ${error.message}`);
            }
            return (data ?? []) as ReceiptAllocationRow[];
          }),
  ]);

  const allocationIndex = buildReceiptAllocationIndex(allocationRows);

  return {
    student,
    financialSnapshot,
    ledger: ledgerData.selectedStudent,
    receipts: receiptRows.map((row) => {
      const appliedToInstallments = allocationIndex.get(row.id) ?? [];
      return {
        id: row.id,
        receiptNumber: row.receipt_number,
        paymentDate: row.payment_date,
        totalAmount: row.total_amount,
        paymentMode: row.payment_mode,
        paymentModeLabel: paymentModeLabel(row.payment_mode),
        referenceNumber: row.reference_number,
        receivedBy: row.received_by,
        createdAt: row.created_at,
        isReversed: isReceiptReversed(reversalTotals, row.id, row.total_amount),
        appliedToInstallments,
        appliedTo: formatAppliedTo(appliedToInstallments),
      };
    }),
    installmentBalances,
  };
}

export async function getFamilyWorkspaceData(
  familyGroupId: string,
  options: { skipCache?: boolean } = {},
) {
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
  // Workspaces fan out in parallel; the family-group detail row fetches
  // alongside them so we don't pay a second sequential round trip after the
  // (slowest) workspace resolves.
  const [workspaces, familyGroupResult] = await Promise.all([
    Promise.all(
      studentIds.map(async (studentId) => {
        try {
          const workspace = await getStudentWorkspaceData(studentId, options);
          return workspace;
        } catch (err) {
          console.error(`Error loading workspace for student ${studentId}`, err);
          return null;
        }
      }),
    ),
    // The column is `family_label`; there has never been a `name`. Selecting one
    // errored on every call, so `data` came back null and EVERY family fell
    // through to the "Family Group" placeholder below — the statement header
    // read "Family ID: Family Group" for all of them. The redesign puts this
    // identifier in the letterhead and the footer, so it has to be the real one.
    supabase
      .from("student_family_groups")
      .select("id, family_label, academic_session_label")
      .eq("id", familyGroupId)
      .maybeSingle(),
  ]);

  const activeWorkspaces = workspaces.filter(
    (w): w is Omit<NonNullable<typeof w>, "student"> & { student: NonNullable<NonNullable<typeof w>["student"]> } =>
      w !== null && w.student !== null
  );

  const familyGroup = familyGroupResult.data;

  let resolvedFallbackLabel: string | null = null;
  if (!familyGroup) {
    const memberLabel = members[0]?.academic_session_label?.trim();
    if (memberLabel) {
      resolvedFallbackLabel = memberLabel;
    } else {
      const policy = await getFeePolicySummary();
      const policyLabel = policy.academicSessionLabel?.trim();
      if (!policyLabel) {
        throw new WorkspaceContextError(
          `Unable to resolve academic session for family group ${familyGroupId}: no member label or active fee policy.`,
        );
      }
      resolvedFallbackLabel = policyLabel;
    }
  }

  return {
    // `name` is the shape every caller already reads; it is `family_label` in
    // the database. The placeholder stays as the genuine last resort — a family
    // group row that really is missing — rather than the everyday outcome.
    familyGroup: familyGroup
      ? {
          id: familyGroup.id,
          name: familyGroup.family_label,
          academic_session_label: familyGroup.academic_session_label,
        }
      : {
          id: familyGroupId,
          name: "Family Group",
          academic_session_label: resolvedFallbackLabel!,
        },
    students: activeWorkspaces,
  };
}
