// Every blocker below mirrors a real `on delete restrict` / `on delete no action`
// foreign key on public.students. If a restricting table is missing here the UI
// happily offers the delete button, Postgres refuses the DELETE, and staff get an
// unexplained failure after typing the SR no. Keep this list in sync with:
//   select conrelid::regclass, confdeltype from pg_constraint
//    where contype = 'f' and confrelid = 'public.students'::regclass;
// Restricting tables that are derived/staging rather than money — carry-forward
// balances, session reanchor log, payment import staging — are cleaned up by
// hardDeleteStudent() instead of blocking, so they are deliberately absent.
export type StudentDeletePolicyInput = {
  installmentCount: number;
  receiptCount: number;
  paymentCount: number;
  adjustmentCount: number;
  refundRequestCount?: number;
  receiptAdjustmentCount?: number;
  receiptFinanceAdjustmentCount?: number;
  blockedInstallmentCount?: number;
  ledgerRegenerationRowCount?: number;
  sessionLabel: string;
  admissionNo: string;
  fullName: string;
};

export function getStudentDeletePolicy(input: StudentDeletePolicyInput) {
  const hasFinancialHistory =
    input.receiptCount > 0 ||
    input.paymentCount > 0 ||
    input.adjustmentCount > 0 ||
    (input.refundRequestCount ?? 0) > 0 ||
    (input.receiptAdjustmentCount ?? 0) > 0 ||
    (input.receiptFinanceAdjustmentCount ?? 0) > 0;
  const hardDeleteBlockers = [
    input.receiptCount > 0 ? `receipts (${input.receiptCount})` : null,
    input.paymentCount > 0 ? `payments (${input.paymentCount})` : null,
    input.adjustmentCount > 0 ? `payment adjustments (${input.adjustmentCount})` : null,
    (input.refundRequestCount ?? 0) > 0
      ? `refund requests (${input.refundRequestCount})`
      : null,
    (input.receiptAdjustmentCount ?? 0) > 0
      ? `receipt adjustments (${input.receiptAdjustmentCount})`
      : null,
    (input.receiptFinanceAdjustmentCount ?? 0) > 0
      ? `receipt finance adjustments (${input.receiptFinanceAdjustmentCount})`
      : null,
    (input.blockedInstallmentCount ?? 0) > 0
      ? `fee review rows (${input.blockedInstallmentCount})`
      : null,
    (input.ledgerRegenerationRowCount ?? 0) > 0
      ? `dues recalculation rows (${input.ledgerRegenerationRowCount})`
      : null,
  ].filter((item): item is string => Boolean(item));
  const isTestStudent =
    input.sessionLabel.toUpperCase().startsWith("TEST-") ||
    input.admissionNo.toUpperCase().startsWith("TEST-") ||
    input.fullName.toLowerCase().startsWith("test ");

  return {
    hasFinancialHistory,
    hardDeleteAllowed: hardDeleteBlockers.length === 0,
    generatedDuesDeleteAllowed: hardDeleteBlockers.length === 0 && input.installmentCount > 0,
    canForceDeleteTestRecord: isTestStudent && hardDeleteBlockers.length === 0,
    hardDeleteBlockers,
  };
}
