import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/**
 * Cancelling a charge for a student who has left.
 *
 * The fee engine cancels un-accrued installments by itself but deliberately
 * LOCKS any row carrying money or adjustment history: cancelling one silently
 * drops its payments out of the settlement pool, so the family's `total_paid`
 * falls and they can disappear from the money scope entirely
 * (`classifyCancelLock` in src/modules/fees/data/generator.ts).
 *
 * The lock asks for a person, and until this action nothing let a person
 * answer — the rows were counted as "kept for review" with no review surface,
 * so the only exit an office could find was writing the whole balance off as
 * though the charge had been real. That is how a term a child never attended
 * became a "discount" on the books.
 *
 * Source assertions, because the action needs a live Supabase session. They pin
 * the guards that make it narrow: anything that widens it silently is the bug
 * this file exists to catch.
 */
const ACTION = read("src/app/protected/students/actions.ts");
const BODY = ACTION.slice(ACTION.indexOf("export async function cancelLeftStudentChargeAction"));

describe("cancelling a left student's un-accrued charge", () => {
  it("is admin-only, on top of the fees:write RLS gate", () => {
    // fees:write is what RLS wants for `installments`; the Danger Zone only
    // demands students:write. Asking for both means a role rebalance produces a
    // sentence rather than an update that matches zero rows and reports success.
    expect(BODY).toContain('requireStaffPermission("fees:write")');
    expect(BODY).toContain('staff.appRole !== "admin"');
  });

  it("refuses a student who is still on the roll", () => {
    // A charge for an enrolled child changes through Fee Setup. This path
    // exists only because the student is gone.
    expect(BODY).toContain('student.status === "active"');
  });

  it("refuses when no leave date is on file", () => {
    // The leave date is the entire justification: without one there is nothing
    // to say the charge is for a term they were not here for.
    expect(BODY).toContain("!student.left_on");
  });

  it("only ever cancels a charge due strictly AFTER the leave date", () => {
    // Strictly after, matching the generator and the late-fee boundary: a row
    // due ON the leave date accrued, because they were a student that day.
    expect(BODY).toContain("!(row.due_date > student.left_on)");
  });

  it("never cancels a carry-forward row or a missed-EMI late fee", () => {
    // Both are charges the school levied rather than something fee policy
    // produced, and both are excluded by the generator for the same reason.
    expect(BODY).toContain("row.is_carry_forward");
    expect(BODY).toContain("row.is_emi_late_fee");
  });

  it("refuses a row under an ACTIVE repayment plan, and only an active one", () => {
    // Mirrors generator.ts:708-712. A superseded plan's items are history and
    // must not block a cancellation forever.
    expect(BODY).toContain('.eq("student_repayment_plans.lifecycle", "active")');
  });

  it("re-reads the row server-side instead of trusting the form", () => {
    // Every guard above is worthless if the installment's own fields come from
    // the browser. The id is the only thing taken on trust, and ownership is
    // checked against it.
    expect(BODY).toContain('.from("installments")');
    expect(BODY).toContain("row.student_id !== studentId");
  });

  it("requires a reason and writes it to the row", () => {
    expect(BODY).toContain("reason.length < 4");
    expect(BODY).toMatch(/notes:\s*row\.notes/);
  });

  it("only flips a still-scheduled row, so a double submit cannot re-cancel", () => {
    expect(BODY).toMatch(/\.eq\("status", "scheduled"\)/);
  });

  it("touches no payment or receipt", () => {
    // It changes what is CHARGED. Money already receipted keeps its receipt and
    // simply stops settling a charge that no longer exists — which is why the
    // UI tells the office to reverse an over-posted write-off first.
    expect(BODY).not.toContain('from("payments")');
    expect(BODY).not.toContain('from("receipts")');
    expect(BODY).not.toContain("post_student_payment");
  });

  it("busts the finance cache and drains the matview", () => {
    // Cancelling changes expected fees, so a dashboard that does not hear about
    // it serves the old number until the next posting happens to clear the tag.
    expect(BODY).toContain("drainFinancialViewRefresh");
    expect(BODY).toContain("revalidateFinanceSurfaces");
  });

  it("warns the office to reverse an over-posted write-off first", () => {
    // Cancelling a row strands any write-off pinned to it: that portion stops
    // counting, and the family reads as though the school owes them money.
    const ui = read("src/modules/students/ui/left-student-held-charges.tsx");
    expect(ui).toContain("Reverse an over-posted write-off first");
  });
});
