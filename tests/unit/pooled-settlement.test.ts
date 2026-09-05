import { describe, expect, it } from "vitest";

import {
  settleOldestFirst,
  type PooledMoney,
  type PooledSettlementRow,
} from "@/modules/fees/domain/pooled-settlement";

/**
 * The cases the pooled-settlement rule (20260905090000) has to get right, in
 * plain numbers. The SQL is the engine; this is the statement of intent it is
 * held to, and the reference `scripts/verify-live-fee-health.mjs` recomputes
 * a sample of live students against.
 */

const TODAY = "2026-09-05";

function year(overrides: Partial<PooledSettlementRow>[] = []): PooledSettlementRow[] {
  const dates = ["2026-04-20", "2026-07-20", "2026-10-20", "2027-01-20"];
  return dates.map((dueDate, index) => ({
    installmentId: `inst-${index + 1}`,
    installmentNo: index + 1,
    dueDate,
    baseCharge: 8000,
    installmentStatus: "scheduled" as const,
    lateFeeFlatAmount: 1000,
    appliedAmount: 0,
    ...(overrides[index] ?? {}),
  }));
}

function byNo(results: ReturnType<typeof settleOldestFirst>) {
  return Object.fromEntries(results.map((row) => [row.installmentId, row]));
}

describe("money settles the installments oldest-first", () => {
  it("SR 660: Rs 7,600 paid before installment 1 was due sits on installment 1, whatever it was pinned to", () => {
    // The screenshot. The receipt had been pinned to installments 3 and 4 by a
    // regeneration; the pool puts it where the family actually stands.
    const rows = year([{ baseCharge: 8500 }, {}, { appliedAmount: 1900 }, { appliedAmount: 5700 }]);
    const money: PooledMoney[] = [{ paymentDate: "2026-04-08", amount: 7600 }];
    const result = byNo(settleOldestFirst({ rows, money, today: TODAY }));

    expect(result["inst-1"]).toMatchObject({
      settledAmount: 7600,
      feeSettledAmount: 7600,
      pendingAmount: 900,
      // 7,600 by 20-Apr is short of 8,500, so the late fee stands.
      rawLateFee: 1000,
      lateFeePending: 1000,
      balanceStatus: "overdue",
    });
    expect(result["inst-2"]).toMatchObject({ settledAmount: 0, pendingAmount: 8000, balanceStatus: "overdue" });
    expect(result["inst-3"]).toMatchObject({ settledAmount: 0, pendingAmount: 8000, balanceStatus: "pending" });
    expect(result["inst-4"]).toMatchObject({ settledAmount: 0, pendingAmount: 8000, balanceStatus: "pending" });
    // Never again: a later row reading paid while an earlier one is owed.
    expect(result["inst-3"].balanceStatus).not.toBe("paid");
  });

  it("a student whose charges never moved reads exactly what the receipt pins say", () => {
    // Posted greedily at the counter: 8,000 on 15-Apr (I1 on time), then
    // 10,000 on 01-Aug after I2 went overdue (I2 8,000 + its 1,000 late fee,
    // 1,000 spilling onto I3).
    const rows = year([{ appliedAmount: 8000 }, { appliedAmount: 9000 }, { appliedAmount: 1000 }, {}]);
    const money: PooledMoney[] = [
      { paymentDate: "2026-04-15", amount: 8000 },
      { paymentDate: "2026-08-01", amount: 10000 },
    ];
    const result = byNo(settleOldestFirst({ rows, money, today: TODAY }));

    expect(result["inst-1"]).toMatchObject({ settledAmount: 8000, rawLateFee: 0, balanceStatus: "paid" });
    expect(result["inst-2"]).toMatchObject({
      settledAmount: 9000,
      feeSettledAmount: 8000,
      lateFeeSettledAmount: 1000,
      rawLateFee: 1000,
      lateFeeStatus: "paid",
      balanceStatus: "paid",
    });
    expect(result["inst-3"]).toMatchObject({ settledAmount: 1000, pendingAmount: 7000, balanceStatus: "partial" });
    // Pooled equals pinned, row by row.
    for (const row of rows) {
      expect(result[row.installmentId].settledAmount).toBe(row.appliedAmount);
    }
  });

  it("a family who skipped installment 1 and paid installment 2 in full reads I1 paid and I2 short", () => {
    // 8,000 pinned to I2 on its due date. The pool clears I1 first: its base
    // and, since it was overdue by then, its late fee. I2 is then 1,000 short
    // on its own due date, so it charges too. That is the counter's own rule;
    // the migration grandfathers the increase for anyone it newly bites.
    const rows = year([{}, { appliedAmount: 8000 }, {}, {}]);
    const money: PooledMoney[] = [{ paymentDate: "2026-07-20", amount: 8000 }];
    const result = byNo(settleOldestFirst({ rows, money, today: TODAY }));

    expect(result["inst-1"]).toMatchObject({
      rawLateFee: 1000,
      settledAmount: 8000,
      feeSettledAmount: 8000,
      pendingAmount: 0,
      lateFeePending: 1000,
      balanceStatus: "paid",
      lateFeeStatus: "pending",
    });
    expect(result["inst-2"]).toMatchObject({
      rawLateFee: 1000,
      settledAmount: 0,
      pendingAmount: 8000,
      balanceStatus: "overdue",
    });
  });

  it("an overpaid family reads every row paid and the excess is credit, not a row", () => {
    const rows = year([{ appliedAmount: 8000 }, { appliedAmount: 8000 }, { appliedAmount: 8000 }, { appliedAmount: 8000 }]);
    // The year was later re-split down to 4 x 6,000 -- a discount after the fact.
    const cheaper = rows.map((row) => ({ ...row, baseCharge: 6000 }));
    const money: PooledMoney[] = [{ paymentDate: "2026-04-01", amount: 32000 }];
    const result = settleOldestFirst({ rows: cheaper, money, today: TODAY });

    expect(result.every((row) => row.balanceStatus === "paid")).toBe(true);
    expect(result.every((row) => row.rawLateFee === 0)).toBe(true);
    const settled = result.reduce((sum, row) => sum + row.settledAmount, 0);
    // 24,000 of capacity absorbed; the other 8,000 is credit_balance in
    // v_student_financial_state, which reads total_paid - total_due.
    expect(settled).toBe(24000);
  });

  it("carry-forward rows settle first and EMI plan rows outrank everything", () => {
    // Rs 6,500 was receipted against installment 3 (a regeneration left it
    // there); the pool decides where it sits.
    const rows: PooledSettlementRow[] = [
      ...year([{}, {}, { appliedAmount: 6500 }, {}]),
      // Last year's balance: earliest due date, never a late fee.
      {
        installmentId: "carry",
        installmentNo: 90,
        dueDate: "2026-04-01",
        baseCharge: 5000,
        installmentStatus: "scheduled",
        lateFeeFlatAmount: 0,
        appliedAmount: 0,
      },
      // An EMI late-fee row: the charge IS the late fee, no base.
      {
        installmentId: "emi-late",
        installmentNo: 101,
        dueDate: "2026-06-10",
        baseCharge: 0,
        installmentStatus: "scheduled",
        lateFeeFlatAmount: 1000,
        isEmiLateFee: true,
        planPriority: 0,
        appliedAmount: 0,
      },
    ];
    const money: PooledMoney[] = [{ paymentDate: "2026-08-15", amount: 6500 }];
    const result = settleOldestFirst({ rows, money, today: TODAY });
    const order = result.map((row) => row.installmentId);

    expect(order).toEqual(["emi-late", "carry", "inst-1", "inst-2", "inst-3", "inst-4"]);
    const map = byNo(result);
    expect(map["emi-late"]).toMatchObject({ rawLateFee: 1000, settledAmount: 1000, lateFeeStatus: "paid" });
    expect(map["carry"]).toMatchObject({ rawLateFee: 0, settledAmount: 5000, balanceStatus: "paid" });
    expect(map["inst-1"]).toMatchObject({ settledAmount: 500, pendingAmount: 7500, balanceStatus: "overdue" });
  });

  it("a late fee the family already paid, then forgiven, releases the money onto the next row", () => {
    // I1 paid with its late fee on 01-Jun (9,000 pinned). An admin then waives
    // the collected late fee: I1's capacity falls to 8,000 and the surplus
    // 1,000 settles I2 -- the `manual_collected` case of 20260826120000.
    const rows = year([{ appliedAmount: 9000, waiverAmount: 1000 }, {}, {}, {}]);
    const money: PooledMoney[] = [{ paymentDate: "2026-06-01", amount: 9000 }];
    const result = byNo(settleOldestFirst({ rows, money, today: TODAY }));

    expect(result["inst-1"]).toMatchObject({
      rawLateFee: 1000,
      waiverApplied: 1000,
      finalLateFee: 0,
      settledAmount: 8000,
      lateFeeStatus: "waived",
      balanceStatus: "paid",
    });
    expect(result["inst-2"]).toMatchObject({ settledAmount: 1000, pendingAmount: 7000 });
  });

  it("a reversal comes out of the pool and frees the LAST installments first", () => {
    // 16,000 paid in April, 8,000 of it reversed in August (dated to the
    // April receipt). The family now stands at 8,000: I1 paid, I2 owed.
    const rows = year([{ appliedAmount: 8000 }, { appliedAmount: 0 }, {}, {}]);
    const money: PooledMoney[] = [
      { paymentDate: "2026-04-10", amount: 16000 },
      { paymentDate: "2026-04-10", amount: -8000 },
    ];
    const result = byNo(settleOldestFirst({ rows, money, today: TODAY }));

    expect(result["inst-1"]).toMatchObject({ settledAmount: 8000, rawLateFee: 0, balanceStatus: "paid" });
    expect(result["inst-2"]).toMatchObject({ settledAmount: 0, rawLateFee: 1000, balanceStatus: "overdue" });
  });

  it("never lets a later row carry money while an earlier row still owes", () => {
    const rows = year([{ appliedAmount: 0 }, { appliedAmount: 3000 }, { appliedAmount: 8000 }, { appliedAmount: 2000 }]);
    const money: PooledMoney[] = [{ paymentDate: "2026-09-01", amount: 13000 }];
    const result = settleOldestFirst({ rows, money, today: TODAY });

    for (let later = 1; later < result.length; later += 1) {
      for (let earlier = 0; earlier < later; earlier += 1) {
        if (result[later].settledAmount > 0) {
          expect(result[earlier].totalPending).toBe(0);
        }
      }
    }
  });
});
