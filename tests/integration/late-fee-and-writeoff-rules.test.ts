import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");

function readMigration(name: string) {
  return readFileSync(path.join(MIGRATIONS, name), "utf8");
}

/**
 * A paid late fee could not be waived — the rule as 20260808190000 wrote it.
 *
 * Its reasoning: waiving collected money does not return it, it reduces what the
 * installment charges, so the payment that covered the late fee turns into an
 * unexplained credit and the late fee drops out of the late-fee figures. Money
 * that came in as a late fee has to keep being counted as one.
 *
 * That reasoning held for four months and then met the office. Late fees land
 * automatically the day an installment goes past due, and a fair share of them
 * are simply wrong — and by the time anyone notices, the family has usually paid
 * the quote including the ₹1,000, because that is what the counter asked for.
 * 20260826120000 reopened the case for admins (`fees:write`) and late fees only;
 * 20260826115000 answered the "unexplained credit" objection by spilling the
 * released money onto the next installments, where it is anything but
 * unexplained. See the describe below.
 *
 * This block stays, unchanged, because 20260808190000 is immutable history and
 * because it is the written record of what the narrow rule was and why. It is
 * still live behaviour for everyone without `fees:write`.
 */
describe("a paid late fee could not be waived (until 20260826120000)", () => {
  const sql = readMigration("20260808190000_cannot_waive_a_paid_late_fee.sql");

  it("caps waivable at what is still outstanding on the installment", () => {
    expect(sql).toMatch(/least\(\s*greatest\(snap\.final_late_fee, 0\),\s*greatest\(snap\.pending_amount, 0\)\s*\)/);
  });

  it("tells the cashier the fee was paid rather than claiming there is none", () => {
    // "This student has no pending late fee" would contradict the receipt in
    // their hand. The two states need different messages.
    expect(sql).toContain("This late fee has already been paid, so it cannot be waived.");
    expect(sql).toContain("This student has no pending late fee to waive.");
    expect(sql).toMatch(/if v_charged_late_fee > 0 then/);
  });

  it("still allocates only across installments that have something left to waive", () => {
    expect(sql).toMatch(/from _waivable where remaining > 0 order by due_date, installment_no/);
  });

  it("keeps the amount ceiling message pointing at the outstanding figure", () => {
    // app/protected/payments/actions.ts matches on this string.
    expect(sql).toContain("Waiver cannot exceed the current pending late fee (%s).");
  });
});

/**
 * Reversing a discount write-off has to bring the debt back.
 *
 * A close-out lands in discount_closeout_amount, not paid_amount. The old
 * arithmetic netted its reversal against the CASH bucket, where
 * greatest(paid + adjustment, 0) floored it away while the close-out kept
 * counting — so a write-off could never be undone.
 */
describe("reversing a write-off restores the debt", () => {
  const sql = readMigration("20260808200000_reversing_a_writeoff_restores_the_debt.sql");

  it("splits adjustments by the payment mode they adjust", () => {
    expect(sql).toContain(
      "coalesce(sum(adj.amount_delta) filter (where adj_receipt.payment_mode <> 'discount'), 0) as cash_adjustment",
    );
    expect(sql).toContain(
      "coalesce(sum(adj.amount_delta) filter (where adj_receipt.payment_mode = 'discount'), 0) as closeout_adjustment",
    );
  });

  it("nets each bucket against its own adjustments", () => {
    expect(sql).toMatch(/coalesce\(payment_row\.paid_amount, 0\)\s*\+ coalesce\(adjustment_row\.cash_adjustment, 0\), 0/);
    expect(sql).toMatch(/coalesce\(payment_row\.discount_closeout_amount, 0\)\s*\+ coalesce\(adjustment_row\.closeout_adjustment, 0\), 0/);
  });

  it("keeps the public adjustment_amount column meaning every adjustment", () => {
    // The ledger surfaces display it; only the arithmetic behind
    // applied/closeout changes.
    expect(sql).toContain("coalesce(sum(adj.amount_delta), 0) as adjustment_amount");
  });

  it("still lets a reversed on-time payment re-expose the late fee", () => {
    // settled_by_due deliberately sums ALL adjustments regardless of mode.
    expect(sql).toMatch(/settled_by_due deliberately keeps summing ALL adjustments/);
  });

  it("asserts in-migration that no reversed write-off stays closed out", () => {
    expect(sql).toMatch(/A reversed write-off is still counted as closed out on % row\(s\)/);
  });

  it("asserts in-migration that the engines still agree and the live session did not move", () => {
    expect(sql).toMatch(/Late-fee engines disagree on % installment\(s\)/);
    expect(sql).toMatch(/Live 2026-27 moved on % installment\(s\)/);
  });
});
