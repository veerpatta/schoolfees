import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The student detail page rendered four pairs of figures that shared a label
 * but came from different sources, so they could visibly disagree while both
 * claimed to be the same thing. Each is now pinned to one source.
 *
 * Source-text assertions rather than a render test: the page is a ~1,200-line
 * server component behind eight data fetches, and what actually broke was
 * always "somebody read the other field", which is exactly what this catches.
 */
const PAGE = join(process.cwd(), "src/app/protected/students/[studentId]/page.tsx");
const QUICK_REFERENCE = join(process.cwd(), "src/components/students/student-quick-reference.tsx");
const MONEY_BAND = join(process.cwd(), "src/components/students/student-money-band.tsx");

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("student detail: figures that share a label share a source", () => {
  it("never adds waived late fee into a fee total", () => {
    // `waiverApplied` is forgiven LATE FEE, not fee. And per migration
    // 20260809110000 nearly every waiver in the database is an automatic
    // grandfather row, so this inflated the "annual fee" of most of the school
    // by an amount nobody granted. It was on BOTH the desktop glance and the
    // phone stat strip.
    const page = read(PAGE);

    expect(page).not.toContain("totalAnnualForGlance + lateFeeWaivedTotal");
    expect(page).not.toMatch(/sessionFeeTotal\s*\+\s*lateFeeWaivedTotal/);
  });

  it("derives the session fee total from the ledger, once", () => {
    const page = read(PAGE);
    const declarations = page.match(/const sessionFeeTotal =/g) ?? [];

    expect(declarations).toHaveLength(1);
    expect(page).toContain(
      "const sessionFeeTotal = installmentBalances.reduce((sum, b) => sum + b.baseCharge, 0);",
    );
  });

  it("reports Paid net of reversals, not raw cash receipted", () => {
    /**
     * Found by walking the live app, not by a test — which is why it is pinned
     * now. `paidAmount` on a workbook row is cash receipted BEFORE adjustments,
     * so it still counts a reversed receipt. A TEST student with one Rs 6,000
     * reversal and one Rs 5,000 reversed discount write-off showed
     * "Paid this session Rs 15,650" against a ledger that had applied Rs 9,650.
     *
     * That is the same defect this file's "Paid" test was written to prevent —
     * the figure was moved off `ledger.totalPayments` onto a column that has
     * the identical flaw. Only `appliedAmount` balances
     * base + late fee − applied − discountCloseout = pending.
     */
    const page = read(PAGE);

    expect(page).toContain("sum + b.appliedAmount");
    expect(page).not.toMatch(/cashPaidAllInstallments[\s\S]{0,120}sum \+ b\.paidAmount/);
    // Discount close-outs have the same trap: summing discount-mode receipts
    // counts one that was later reversed.
    expect(page).toContain("sum + b.discountCloseoutAmount");
    expect(page).not.toContain('r.paymentMode === "discount"');
  });

  it("reports Paid from the workbook projection, not the raw ledger sum", () => {
    // `ledger.totalPayments` is every payment row for the student: all
    // sessions, all modes including discount close-outs, and it ignores
    // payment_adjustments — so it reads HIGH for precisely the students with a
    // reversed receipt or a write-off. `ledger.payments` stays in use for the
    // payment-lines table; only the TOTAL must not come from there.
    const page = read(PAGE);

    expect(page).not.toContain("ledger?.totalPayments");
    expect(page).not.toContain("ledger.totalPayments");
    expect(page).toContain("paidThisSession={cashPaidAllInstallments}");
  });

  it("never reads the retired late-fee waiver pool column", () => {
    // student_fee_overrides.late_fee_waiver_amount is DEPRECATED 2026-08-08 and
    // no engine reads it. The live truth is the sum of per-installment waivers.
    // Asserted on the value, not on any one prop name, so the guarantee
    // survives the props being rearranged.
    const page = read(PAGE);

    expect(page).not.toContain("student.lateFeeWaiverAmount");
    expect(page).toContain("currentWaiverAmount: lateFeeWaivedTotal");
  });

  it("shows credit in exactly one place", () => {
    // v_student_financial_state aliases credit_balance, overpaid_amount and
    // refundable_amount to the identical expression
    // GREATEST(total_paid - revised_total_due, 0). Verified against the live
    // view on 2026-08-12: zero rows where any two differ.
    //
    // The desktop redesign briefly reintroduced this duplicate — the money
    // band's ribbon and Quick Reference both printed it, in near-identical
    // words, one tab apart. The band is the canonical home.
    const quickReference = read(QUICK_REFERENCE);
    const moneyBand = read(MONEY_BAND);

    expect(quickReference).not.toContain("financialSnapshot.refundableAmount");
    expect(quickReference).not.toContain("financialSnapshot.creditBalance");
    expect(moneyBand).toContain("creditBalance");
  });

  it("declares the shared totals before feePlanContent reads them", () => {
    // `feePlanContent` is an eagerly-evaluated JSX const, not a function, so a
    // total declared after it lands in the temporal dead zone and throws at
    // render — which typecheck alone will not always surface.
    const page = read(PAGE);

    const declaredAt = page.indexOf("const lateFeeWaivedTotal =");
    const feePlanAt = page.indexOf("const feePlanContent =");

    expect(declaredAt).toBeGreaterThan(-1);
    expect(feePlanAt).toBeGreaterThan(-1);
    expect(declaredAt).toBeLessThan(feePlanAt);
  });
});
