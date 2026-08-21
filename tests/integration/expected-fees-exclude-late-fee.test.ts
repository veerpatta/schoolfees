import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MONEY_GLOSSARY } from "@/platform/money/glossary";

/**
 * A late fee is not part of the fee the school expects to collect.
 *
 * It exists to get the fee in on time, it is issued expecting to be waived, and
 * it is not revenue anyone planned for. Folding it into an "expected" figure
 * also makes that figure grow on its own: every due date that passes would
 * inflate what the school appears to be owed without a human deciding to charge
 * anything. With roughly 400 students overdue at each due date, one night could
 * silently add lakhs to the fee book.
 *
 * Three places in get_dashboard_summary got this wrong and were corrected in
 * 20260808170000 and 20260808180000. These tests pin the rule so it cannot be
 * reintroduced by someone reaching for the nearest "total" column.
 */

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");

function readMigration(name: string) {
  return readFileSync(path.join(MIGRATIONS, name), "utf8");
}

describe("expected fees exclude late fee", () => {
  const studentLevel = readMigration("20260808170000_expected_fees_exclude_late_fee.sql");
  const installmentLevel = readMigration(
    "20260808180000_installment_expected_excludes_late_fee.sql",
  );

  it("swaps the student-level expected totals off the late-fee-inclusive column", () => {
    // total_due is base + late fee; base_charge_total is base alone.
    expect(studentLevel).toContain("'sum(total_due)'");
    expect(studentLevel).toContain("'sum(base_charge_total)'");
  });

  it("asserts in-migration that exactly the two known expected sums were swapped", () => {
    expect(studentLevel).toMatch(/Expected exactly 2 occurrences of sum\(total_due\)/);
  });

  it("caps the collection rate once its denominator excludes late fee", () => {
    // Collected is real cash and includes late fee actually paid, so measuring
    // it against a base-only denominator can exceed the target.
    expect(studentLevel).toContain("least(100, round(");
  });

  it("swaps the per-installment expected off total_charge", () => {
    expect(installmentLevel).toContain('sum(total_charge)::integer as "expectedAmount"');
    expect(installmentLevel).toContain('sum(base_charge)::integer as "expectedAmount"');
  });

  it("refuses to leave any expected figure reading a late-fee-inclusive total", () => {
    expect(installmentLevel).toMatch(/An expected figure still reads sum\(total_due\)/);
    expect(installmentLevel).toMatch(/An expected figure still reads sum\(total_charge\)/);
  });

  it("leaves the owed-side total_charge sums alone", () => {
    // Owed and expected are different questions: what a student still owes
    // legitimately includes an unwaived late fee.
    expect(installmentLevel).toMatch(/left alone on\s*--\s*purpose/);
  });
});

describe("the glossary states the rule", () => {
  it("defines Expected Fees as base only, late fee excluded", () => {
    const term = MONEY_GLOSSARY.expectedFees;

    expect(term.label).toBe("Expected Fees");
    expect(term.summary).toMatch(/never includes late fee/i);
    expect(term.source).toBe("v_workbook_student_financials.base_charge_total");
  });

  it("distinguishes Total Due (owed, late fee included) from Expected Fees", () => {
    const term = MONEY_GLOSSARY.totalDue;

    expect(term.source).toBe("v_workbook_student_financials.total_due");
    expect(term.detail).toMatch(/not the same as Expected Fees/i);
  });

  it("keeps late fee on its own three lines rather than folding it away", () => {
    expect(MONEY_GLOSSARY.lateFeeCharged.label).toBe("Late Fee (charged)");
    expect(MONEY_GLOSSARY.lateFeeWaived.source).toBe("student_late_fee_waivers");
    expect(MONEY_GLOSSARY.lateFeePending.source).toBe(
      "v_workbook_student_financials.late_fee_outstanding_amount",
    );
  });
});

describe("the JavaScript dashboard builder agrees", () => {
  const summarySource = readFileSync(
    path.join(process.cwd(), "src/lib", "dashboard", "summary.ts"),
    "utf8",
  );

  it("builds expected from base charges, never from a total that carries late fee", () => {
    expect(summarySource).toContain("sum + row.baseChargeTotal");
    expect(summarySource).toContain("existing.expectedAmount += row.baseCharge;");
    expect(summarySource).not.toContain("expectedAmount += row.totalCharge");
  });
});
