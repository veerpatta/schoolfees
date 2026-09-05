/**
 * The pooled-settlement rule, in TypeScript, for tests and health checks.
 *
 * The rule itself lives in SQL, twice, under the `>>> SHARED POOLED SETTLEMENT
 * RULE <<<` marker in `v_workbook_installment_balances` and
 * `private.workbook_installment_snapshot` (20260905064847). This is a third
 * copy, deliberately: it exists so a unit test can state the cases the SQL has
 * to get right in plain numbers, and so `scripts/verify-live-fee-health.mjs`
 * can recompute a sample of students from the raw tables and diff them
 * against the matview. It is never used to render a figure.
 *
 * The rule, in one paragraph. Every rupee the family paid in the session is
 * one pool. It settles the rows in the counter's order -- rows on an active
 * EMI plan first, then oldest due date, then installment number -- and on each
 * row it covers the fees first, then the late fee, before moving on. The late
 * fee is pooled the same way: a row was settled on time if everything paid by
 * its due date, minus what the rows ahead of it absorb (their base and their
 * own late fee), covers its base. That last clause is why this is a walk and
 * not a sum: row 2's late fee depends on whether row 1 charged one.
 */

export type PooledSettlementRow = {
  installmentId: string;
  installmentNo: number;
  dueDate: string;
  baseCharge: number;
  /** `installments.status`; `waived` never charges a late fee. */
  installmentStatus: "scheduled" | "waived" | "cancelled";
  lateFeeFlatAmount: number;
  isEmiLateFee?: boolean;
  /** 0 when an active EMI plan covers the row, else 1. */
  planPriority?: number;
  /** Non-voided `student_late_fee_waivers` on this row, summed. */
  waiverAmount?: number;
  /**
   * The pin, per row: cash net of cash adjustments, floored at zero, plus
   * discount-mode close-outs. Only the SUM across rows matters to the pool.
   */
  appliedAmount: number;
  discountCloseoutAmount?: number;
};

export type PooledMoney = {
  /** `receipts.payment_date` of the receipt the money (or its reversal) belongs to. */
  paymentDate: string;
  /** Positive for a payment, negative for a reversal. */
  amount: number;
};

export type PooledSettlementResult = {
  installmentId: string;
  settlementRank: number;
  rawLateFee: number;
  waiverApplied: number;
  finalLateFee: number;
  totalCharge: number;
  settledAmount: number;
  feeSettledAmount: number;
  lateFeeSettledAmount: number;
  pendingAmount: number;
  lateFeePending: number;
  totalPending: number;
  balanceStatus: "paid" | "partial" | "overdue" | "pending" | "waived";
  lateFeeStatus: "none" | "pending" | "waived" | "paid";
};

function toInt(value: number | undefined | null) {
  return Math.trunc(value ?? 0);
}

export function settleOldestFirst(payload: {
  rows: readonly PooledSettlementRow[];
  money: readonly PooledMoney[];
  /** `current_date` in the engines. YYYY-MM-DD. */
  today: string;
}): PooledSettlementResult[] {
  const active = payload.rows.filter((row) => row.installmentStatus !== "cancelled");
  const ordered = [...active].sort((left, right) => {
    const priority = (left.planPriority ?? 1) - (right.planPriority ?? 1);
    if (priority !== 0) return priority;
    if (left.dueDate !== right.dueDate) return left.dueDate < right.dueDate ? -1 : 1;
    if (left.installmentNo !== right.installmentNo) return left.installmentNo - right.installmentNo;
    return left.installmentId < right.installmentId ? -1 : left.installmentId > right.installmentId ? 1 : 0;
  });

  const poolTotal = ordered.reduce(
    (sum, row) =>
      sum + Math.max(toInt(row.appliedAmount), 0) + Math.max(toInt(row.discountCloseoutAmount), 0),
    0,
  );
  const poolByDate = (dueDate: string) =>
    Math.max(
      payload.money
        .filter((entry) => entry.paymentDate <= dueDate)
        .reduce((sum, entry) => sum + toInt(entry.amount), 0),
      0,
    );

  let capacityBefore = 0;
  return ordered.map((row, index) => {
    const base = toInt(row.baseCharge);
    const flat = toInt(row.lateFeeFlatAmount);
    const past = payload.today > row.dueDate;

    // >>> SHARED LATE FEE RULE <<< (the TypeScript reading of it)
    let rawLateFee = 0;
    if (row.installmentStatus === "waived") rawLateFee = 0;
    else if (flat <= 0) rawLateFee = 0;
    else if (row.isEmiLateFee) rawLateFee = past ? flat : 0;
    else if (base <= 0) rawLateFee = 0;
    else if (poolByDate(row.dueDate) >= capacityBefore + base) rawLateFee = 0;
    else if (past) rawLateFee = flat;

    const waiverApplied = Math.min(rawLateFee, Math.max(toInt(row.waiverAmount), 0));
    const finalLateFee = Math.max(rawLateFee - waiverApplied, 0);
    const capacity = base + finalLateFee;
    const settledAmount = Math.min(Math.max(poolTotal - capacityBefore, 0), capacity);
    const feeSettledAmount = Math.min(settledAmount, base);
    const lateFeeSettledAmount = settledAmount - feeSettledAmount;
    const pendingAmount = Math.max(base - feeSettledAmount, 0);
    const lateFeePending = Math.max(finalLateFee - lateFeeSettledAmount, 0);
    capacityBefore += capacity;

    const balanceStatus: PooledSettlementResult["balanceStatus"] =
      row.installmentStatus === "waived"
        ? "waived"
        : pendingAmount <= 0
          ? "paid"
          : past
            ? "overdue"
            : settledAmount > 0
              ? "partial"
              : "pending";
    const lateFeeStatus: PooledSettlementResult["lateFeeStatus"] =
      rawLateFee <= 0
        ? "none"
        : lateFeePending > 0
          ? "pending"
          : waiverApplied >= rawLateFee
            ? "waived"
            : "paid";

    return {
      installmentId: row.installmentId,
      settlementRank: index + 1,
      rawLateFee,
      waiverApplied,
      finalLateFee,
      totalCharge: Math.max(base + rawLateFee - waiverApplied, 0),
      settledAmount,
      feeSettledAmount,
      lateFeeSettledAmount,
      pendingAmount,
      lateFeePending,
      totalPending: pendingAmount + lateFeePending,
      balanceStatus,
      lateFeeStatus,
    };
  });
}
