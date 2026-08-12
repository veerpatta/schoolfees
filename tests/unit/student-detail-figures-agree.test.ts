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
const PAGE = join(process.cwd(), "app/protected/students/[studentId]/page.tsx");
const QUICK_REFERENCE = join(process.cwd(), "components/students/student-quick-reference.tsx");

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

  it("reports Paid from the workbook projection, not the raw ledger sum", () => {
    // `ledger.totalPayments` is every payment row for the student: all
    // sessions, all modes including discount close-outs, and it ignores
    // payment_adjustments — so it reads HIGH for precisely the students with a
    // reversed receipt or a write-off.
    const page = read(PAGE);

    expect(page).not.toContain("totalCollected={ledger?.totalPayments ?? 0}");
    expect(page).toContain("totalCollected={cashPaidAllInstallments}");
  });

  it("never displays the retired late-fee waiver pool column", () => {
    // student_fee_overrides.late_fee_waiver_amount is DEPRECATED 2026-08-08 and
    // no engine reads it. The live truth is the sum of per-installment waivers.
    const page = read(PAGE);

    expect(page).not.toContain("<Money value={student.lateFeeWaiverAmount} />");
    expect(page).not.toContain("lateFeeWaiverAmount={student.lateFeeWaiverAmount ?? 0}");
    expect(page).toContain("lateFeeWaiverAmount={lateFeeWaivedTotal}");
  });

  it("shows one name for credit, not credit next to refundable", () => {
    // v_student_financial_state aliases credit_balance, overpaid_amount and
    // refundable_amount to the identical expression
    // GREATEST(total_paid - revised_total_due, 0). Verified against the live
    // view on 2026-08-12: zero rows where any two differ.
    const quickReference = read(QUICK_REFERENCE);

    expect(quickReference).not.toContain("financialSnapshot.refundableAmount");
    expect(quickReference).toContain("financialSnapshot.creditBalance");
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
