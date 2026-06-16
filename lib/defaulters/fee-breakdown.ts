import "server-only";

import {
  getWorkbookInstallmentRows,
  getWorkbookStudentFinancials,
  getWorkbookTransactions,
} from "@/lib/workbook/data";
import {
  getCarryForwardSourceSession,
  getDisplayInstallmentLabel,
  isCarryForwardInstallment,
} from "@/lib/prev-year-dues/display";

export type FeeBreakdownInstallment = {
  installmentNo: number;
  installmentLabel: string;
  isCarryForward?: boolean;
  sourceSessionLabel?: string | null;
  dueDate: string;
  baseCharge: number;
  paidAmount: number;
  pendingAmount: number;
  /** Late fee CHARGED on this installment before waiver. */
  rawLateFee: number;
  /** Late fee waived on this installment. */
  waiverApplied: number;
  /** Late fee actually owed (raw − waiver). */
  finalLateFee: number;
  /** Net adjustments applied to this installment (positive reduces due). */
  adjustmentAmount: number;
  totalCharge: number;
  lastPaymentDate: string | null;
  balanceStatus: "paid" | "partial" | "overdue" | "pending" | "waived";
};

export type FeeBreakdownPayment = {
  receiptId: string;
  receiptNumber: string;
  paymentDate: string;
  paymentMode: string;
  totalAmount: number;
  referenceNumber: string | null;
};

export type FeeBreakdownHeadline = {
  totalDue: number;
  totalPaid: number;
  outstanding: number;
  lateFeeTotal: number;
  discountApplied: number;
  lateFeeWaived: number;
  paidInstallments: number;
  partialInstallments: number;
  openInstallments: number;
  overdueInstallments: number;
  lastPaymentDate: string | null;
};

export type FeeBreakdown = {
  headline: FeeBreakdownHeadline;
  installments: FeeBreakdownInstallment[];
  recentPayments: FeeBreakdownPayment[];
};

const STATUS_RANK: Record<FeeBreakdownInstallment["balanceStatus"], number> = {
  paid: 4,
  waived: 3,
  partial: 2,
  overdue: 1,
  pending: 0,
};

/**
 * Full fee breakdown for a single student — used by the Defaulters Worklist
 * Drawer so a fee collector can read it out to the parent on a call.
 *
 * Returns headline totals, per-installment status, and the last few receipts.
 * Best-effort: any sub-query that fails returns an empty section so the
 * panel can still render the partial picture.
 */
export async function getStudentFeeBreakdown(
  studentId: string,
  sessionLabel: string,
  options: { recentPaymentLimit?: number } = {},
): Promise<FeeBreakdown | null> {
  const recentPaymentLimit = options.recentPaymentLimit ?? 5;

  const [installmentRows, financialRows, recentTxRows] = await Promise.all([
    safeCall(() => getWorkbookInstallmentRows({ studentId, sessionLabel })),
    safeCall(() => getWorkbookStudentFinancials({ sessionLabel })),
    safeCall(() =>
      getWorkbookTransactions({
        studentId,
        sessionLabel,
        limit: recentPaymentLimit,
      }),
    ),
  ]);

  const financial =
    financialRows?.find((row) => row.studentId === studentId) ?? null;
  const installments = (installmentRows ?? [])
    .filter((row) => row.studentId === studentId)
    .map(
      (row): FeeBreakdownInstallment => ({
        installmentNo: row.installmentNo,
        installmentLabel: getDisplayInstallmentLabel(row),
        isCarryForward: isCarryForwardInstallment(row),
        sourceSessionLabel: getCarryForwardSourceSession(row),
        dueDate: row.dueDate,
        baseCharge: row.baseCharge,
        paidAmount: row.paidAmount,
        pendingAmount: row.pendingAmount,
        rawLateFee: row.rawLateFee,
        waiverApplied: row.waiverApplied,
        finalLateFee: row.finalLateFee,
        adjustmentAmount: row.adjustmentAmount,
        totalCharge: row.totalCharge,
        lastPaymentDate: row.lastPaymentDate,
        balanceStatus: row.balanceStatus,
      }),
    )
    .sort((a, b) => a.installmentNo - b.installmentNo);

  if (!financial && installments.length === 0) return null;

  const paidInstallments = installments.filter(
    (i) => i.balanceStatus === "paid" || i.balanceStatus === "waived",
  ).length;
  const partialInstallments = installments.filter(
    (i) => i.balanceStatus === "partial",
  ).length;
  const overdueInstallments = installments.filter(
    (i) => i.balanceStatus === "overdue",
  ).length;
  const openInstallments = installments.filter(
    (i) => i.balanceStatus === "pending",
  ).length;

  const headline: FeeBreakdownHeadline = {
    totalDue: financial?.baseChargeTotal ?? installments.reduce((s, i) => s + i.baseCharge, 0),
    totalPaid: financial?.totalPaid ?? installments.reduce((s, i) => s + i.paidAmount, 0),
    outstanding:
      financial?.outstandingAmount ?? installments.reduce((s, i) => s + i.pendingAmount, 0),
    lateFeeTotal:
      financial?.lateFeeTotal ?? installments.reduce((s, i) => s + i.finalLateFee, 0),
    discountApplied: financial?.discountAmount ?? 0,
    lateFeeWaived: financial?.lateFeeWaiverAmount ?? 0,
    paidInstallments,
    partialInstallments,
    openInstallments,
    overdueInstallments,
    lastPaymentDate: financial?.lastPaymentDate ?? null,
  };

  const recentPayments: FeeBreakdownPayment[] = (recentTxRows ?? [])
    .filter((tx) => tx.studentId === studentId)
    .slice(0, recentPaymentLimit)
    .map((tx) => ({
      receiptId: tx.receiptId,
      receiptNumber: tx.receiptNumber,
      paymentDate: tx.paymentDate,
      paymentMode: tx.paymentMode,
      totalAmount: tx.totalAmount,
      referenceNumber: tx.referenceNumber,
    }));

  return { headline, installments, recentPayments };
}

/**
 * Suggests which installment to highlight first — the next one the collector
 * should ask the parent about. Picks overdue/partial first, otherwise the
 * earliest open one.
 */
export function nextFocusInstallment(
  installments: FeeBreakdownInstallment[],
): FeeBreakdownInstallment | null {
  if (installments.length === 0) return null;
  return [...installments].sort((a, b) => STATUS_RANK[a.balanceStatus] - STATUS_RANK[b.balanceStatus])[0];
}

async function safeCall<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (caught) {
    console.warn("[fee-breakdown] sub-query failed", caught);
    return null;
  }
}
