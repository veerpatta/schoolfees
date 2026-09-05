import { buildFeeBreakupDisplayRows } from "@/modules/fees/domain/display-breakdown";
import type { ResolvedFeeBreakdown, StudentFinancialSnapshot } from "@/modules/fees/domain/types";
import { isYearCleared } from "@/modules/fees/domain/year-clear";
import type { WorkbookInstallmentBalance } from "@/modules/fees/domain/workbook-types";

/**
 * Every figure the printed fee statement shows, and the rules behind them.
 *
 * Pure on purpose: the money arithmetic on a document a parent is handed is the
 * part worth unit-testing, and the components stay presentational. Nothing here
 * imports `server-only`, so the tests need no Supabase client.
 *
 * Three rules this file exists to hold in one place:
 *
 * 1. **Paid on a row means `settledAmount`, never `paidAmount`.** `paidAmount`
 *    is raw cash receipted and still counts a receipt that was later reversed;
 *    `appliedAmount` is the receipt pin, which is history rather than position
 *    since money settles the installments oldest-first. The cash TOTAL is still
 *    the sum of `appliedAmount`, because that is what was actually received.
 * 2. **A late fee is not a fee.** `feesPending` and `lateFeePending` are carried
 *    separately all the way to the component, so the document can say which is
 *    which. `stillPayable` is their sum — what the counter can actually collect.
 * 3. **A write-off clears a balance but is not money.** `writtenOff` never joins
 *    `paidInCash`.
 */

export type StatementChargeRow = {
  id: string;
  label: string;
  /** Why this amount — the class rate, the route, the discount policy. */
  basis: string;
  amount: number;
  kind: "charge" | "discount";
};

export type StatementInstallmentStatus = "paid" | "written" | "overdue" | "pending";

export type StatementInstallmentRow = {
  id: string;
  label: string;
  dueDate: string;
  charged: number;
  paid: number;
  writtenOff: number;
  payable: number;
  lateFee: number;
  status: StatementInstallmentStatus;
};

export type StatementReceiptRow = {
  id: string;
  receiptNumber: string;
  paymentDate: string;
  studentName: string;
  appliedTo: string | null;
  modeLabel: string;
  amount: number;
  balanceAfter: number;
  isWriteOff: boolean;
  isReversed: boolean;
};

export type StatementStudentView = {
  studentId: string;
  name: string;
  /** SR number. The design's reference slot — a real identifier, not a made-up one. */
  identifier: string;
  classLabel: string;
  meta: string;
  fatherName: string;
  fatherPhone: string;
  transportRouteLabel: string;
  villageCity: string;

  chargeRows: StatementChargeRow[];
  annualFee: number;
  /** Rows raised by the engine but not part of this year's annual fee. */
  extras: Array<{ label: string; amount: number }>;
  previousYearBalance: number;
  lateFeeCharged: number;

  totalCharged: number;
  paidInCash: number;
  writtenOff: number;
  feesPending: number;
  lateFeePending: number;
  stillPayable: number;

  installmentRows: StatementInstallmentRow[];
  /**
   * The installment-split note, as numbers rather than a sentence: money is
   * formatted by `formatInr` at the component, never spelled into a string here.
   */
  installmentSplit: { count: number; approxAmount: number; collectsCarryForwardFirst: boolean };
  isYearClear: boolean;
  nextDueLabel: string | null;
  nextDueDate: string | null;
  nextDueAmount: number | null;
  lateFeeFlatAmount: number;
};

type ReceiptLike = {
  id: string;
  receiptNumber: string;
  paymentDate: string;
  totalAmount: number;
  paymentModeLabel: string;
  createdAt: string;
  isReversed: boolean;
  appliedTo?: string | null;
};

type StudentLike = {
  id: string;
  fullName: string;
  admissionNo: string;
  classLabel: string;
  studentStatusLabel: string;
  fatherName: string | null;
  fatherPhone: string | null;
  transportRouteLabel: string;
  villageCity?: string | null;
  address: string | null;
  tuitionOverride: number | null;
  transportOverride: number | null;
  overrideReason: string | null;
};

const DASH = "—";

function sum<T>(rows: readonly T[], pick: (row: T) => number) {
  return rows.reduce((total, row) => total + (pick(row) || 0), 0);
}

/**
 * The "Basis" column. Everything is read from real data; a head with nothing
 * meaningful to say gets an empty cell rather than invented prose.
 */
export function deriveFeeHeadBasis(
  headId: string,
  input: { student: StudentLike; breakdown: ResolvedFeeBreakdown },
): string {
  const { student, breakdown } = input;

  switch (headId) {
    case "tuition_fee":
      return student.tuitionOverride !== null
        ? "Custom rate for this student"
        : `${student.classLabel} annual rate`;
    case "transport_fee":
      return student.transportOverride !== null
        ? "Custom rate for this student"
        : student.transportRouteLabel;
    case "academic_fee":
      return `${student.studentStatusLabel} student`;
    case "conventional_discount":
      return breakdown.conventionalDiscountLabels.join(", ");
    case "student_discount":
      return student.overrideReason ?? "";
    default:
      return "";
  }
}

function resolveInstallmentStatus(
  item: WorkbookInstallmentBalance,
  todayIso: string,
): StatementInstallmentStatus {
  if (item.totalPending <= 0) {
    // A row cleared by a write-off is not a row someone paid. Saying "Paid"
    // there is exactly the confusion the "Written off" tile exists to prevent.
    if (item.discountCloseoutAmount > 0 && item.appliedAmount <= 0) return "written";
    return "paid";
  }
  return item.dueDate < todayIso ? "overdue" : "pending";
}

export function buildStatementStudentView(input: {
  student: StudentLike;
  financialSnapshot: StudentFinancialSnapshot;
  installmentBalances: readonly WorkbookInstallmentBalance[];
  receipts?: readonly ReceiptLike[];
  todayIso: string;
}): StatementStudentView {
  const { student, financialSnapshot, installmentBalances, todayIso } = input;
  const breakdown = financialSnapshot.resolvedBreakdown;

  const chargeRows: StatementChargeRow[] = buildFeeBreakupDisplayRows(breakdown).map((row) => ({
    id: row.id,
    label: row.label,
    basis: deriveFeeHeadBasis(row.id, { student, breakdown }),
    amount: row.amount,
    kind: row.kind,
  }));

  const carryForward = installmentBalances.filter((item) => item.isCarryForward);
  const previousYearBalance = sum(carryForward, (item) => item.baseCharge);
  const lateFeeCharged = sum(installmentBalances, (item) => item.finalLateFee);

  const totalCharged = sum(installmentBalances, (item) => item.totalCharge);
  const paidInCash = sum(installmentBalances, (item) => item.appliedAmount);
  const writtenOff = sum(installmentBalances, (item) => item.discountCloseoutAmount);
  const feesPending = sum(installmentBalances, (item) => item.pendingAmount);
  const lateFeePending = sum(installmentBalances, (item) => item.lateFeePending);
  const stillPayable = sum(installmentBalances, (item) => item.totalPending);

  const extras: Array<{ label: string; amount: number }> = [];
  if (previousYearBalance > 0) {
    extras.push({ label: "Previous year balance carried forward", amount: previousYearBalance });
  }
  if (lateFeeCharged > 0) {
    extras.push({ label: "Late fee charged this session", amount: lateFeeCharged });
  }

  // `annualTotal` is what policy says; `totalCharge` is what the ledger actually
  // raised. They diverge when fee setup was republished after dues were
  // prepared. Rather than print two contradictory "total charged" figures, name
  // the difference honestly so the column still adds up.
  const accountedFor = breakdown.annualTotal + previousYearBalance + lateFeeCharged;
  if (totalCharged !== accountedFor) {
    extras.push({ label: "Fee revision this session", amount: totalCharged - accountedFor });
  }

  const currentYear = installmentBalances.filter((item) => !item.isCarryForward);
  const perInstallment =
    currentYear.length > 0 ? Math.round(sum(currentYear, (i) => i.baseCharge) / currentYear.length) : 0;

  const installmentRows: StatementInstallmentRow[] = installmentBalances.map((item) => ({
    id: item.installmentId,
    label: item.installmentLabel,
    dueDate: item.dueDate,
    charged: item.totalCharge,
    paid: item.settledAmount,
    writtenOff: item.discountCloseoutAmount,
    payable: item.totalPending,
    lateFee: item.finalLateFee,
    status: resolveInstallmentStatus(item, todayIso),
  }));

  return {
    studentId: student.id,
    name: student.fullName,
    identifier: student.admissionNo,
    classLabel: student.classLabel,
    meta: `SR ${student.admissionNo} · ${student.classLabel} · ${student.studentStatusLabel} student`,
    fatherName: student.fatherName || DASH,
    fatherPhone: student.fatherPhone || DASH,
    transportRouteLabel: student.transportRouteLabel || DASH,
    villageCity: student.villageCity || student.address || DASH,

    chargeRows,
    annualFee: breakdown.annualTotal,
    extras,
    previousYearBalance,
    lateFeeCharged,

    totalCharged,
    paidInCash,
    writtenOff,
    feesPending,
    lateFeePending,
    stillPayable,

    installmentRows,
    installmentSplit: {
      count: currentYear.length,
      approxAmount: perInstallment,
      collectsCarryForwardFirst: previousYearBalance > 0,
    },
    isYearClear: isYearCleared({
      outstandingAmount: financialSnapshot.currentOutstanding,
      totalPaid: paidInCash,
      discountClosedAmount: writtenOff,
      hasPreparedDues: installmentBalances.length > 0,
    }),
    nextDueLabel: financialSnapshot.nextDueLabel,
    nextDueDate: financialSnapshot.nextDueDate,
    nextDueAmount: financialSnapshot.nextDueAmount,
    lateFeeFlatAmount: financialSnapshot.policy.lateFeeFlatAmount,
  };
}

/**
 * Receipts oldest-first with a running balance, so the register reads like a
 * passbook: each line says what was received and what was still owed after it.
 *
 * Sorted by payment date THEN `createdAt` — two receipts posted the same day
 * would otherwise swap places between renders and take the running balance with
 * them. Reversed receipts stay on the page (the register is append-only) and
 * contribute nothing to the balance.
 */
export function buildStatementReceiptRows(
  receipts: readonly (ReceiptLike & { studentName?: string })[],
  totalCharged: number,
): StatementReceiptRow[] {
  const ordered = [...receipts].sort((left, right) => {
    const byDate = left.paymentDate.localeCompare(right.paymentDate);
    return byDate !== 0 ? byDate : left.createdAt.localeCompare(right.createdAt);
  });

  let running = 0;
  return ordered.map((entry) => {
    if (!entry.isReversed) {
      running += entry.totalAmount;
    }
    return {
      id: entry.id,
      receiptNumber: entry.receiptNumber,
      paymentDate: entry.paymentDate,
      studentName: entry.studentName ?? "",
      appliedTo: entry.appliedTo ?? null,
      modeLabel: entry.paymentModeLabel,
      amount: entry.totalAmount,
      balanceAfter: Math.max(totalCharged - running, 0),
      isWriteOff: entry.paymentModeLabel.toLowerCase().includes("discount"),
      isReversed: entry.isReversed,
    };
  });
}

export type StatementFamilyView = {
  familyName: string;
  identifier: string;
  sessionLabel: string;
  students: StatementStudentView[];
  fatherName: string;
  fatherPhone: string;
  transportRouteLabel: string;
  villageCity: string;

  totalCharged: number;
  paidInCash: number;
  writtenOff: number;
  feesPending: number;
  lateFeePending: number;
  stillPayable: number;

  receiptRows: StatementReceiptRow[];
  isYearClear: boolean;
  lateFeeFlatAmount: number;
};

export function buildStatementFamilyView(input: {
  familyGroup: { id: string; name: string; academic_session_label: string };
  students: ReadonlyArray<{
    student: StudentLike;
    financialSnapshot: StudentFinancialSnapshot | null;
    installmentBalances: readonly WorkbookInstallmentBalance[];
    receipts?: readonly ReceiptLike[];
  }>;
  todayIso: string;
}): StatementFamilyView | null {
  const views: StatementStudentView[] = [];
  const receipts: Array<ReceiptLike & { studentName: string }> = [];

  for (const member of input.students) {
    if (!member.financialSnapshot) continue;
    views.push(
      buildStatementStudentView({
        student: member.student,
        financialSnapshot: member.financialSnapshot,
        installmentBalances: member.installmentBalances,
        todayIso: input.todayIso,
      }),
    );
    for (const receipt of member.receipts ?? []) {
      receipts.push({ ...receipt, studentName: member.student.fullName });
    }
  }

  if (views.length === 0) return null;

  const totalCharged = sum(views, (view) => view.totalCharged);
  const paidInCash = sum(views, (view) => view.paidInCash);
  const writtenOff = sum(views, (view) => view.writtenOff);
  const primary = input.students.find((member) => member.financialSnapshot)!.student;

  return {
    familyName: input.familyGroup.name,
    identifier: input.familyGroup.name,
    sessionLabel: input.familyGroup.academic_session_label,
    students: views,
    fatherName: primary.fatherName || DASH,
    fatherPhone: primary.fatherPhone || DASH,
    transportRouteLabel: primary.transportRouteLabel || DASH,
    villageCity: primary.villageCity || primary.address || DASH,

    totalCharged,
    paidInCash,
    writtenOff,
    feesPending: sum(views, (view) => view.feesPending),
    lateFeePending: sum(views, (view) => view.lateFeePending),
    stillPayable: sum(views, (view) => view.stillPayable),

    receiptRows: buildStatementReceiptRows(receipts, totalCharged),
    isYearClear: views.every((view) => view.isYearClear),
    lateFeeFlatAmount: views[0].lateFeeFlatAmount,
  };
}
