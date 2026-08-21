import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A student who left owing money still owes it.
 *
 * The school rule has two halves:
 *
 *   left, nothing ever collected -> their dues are not collected either, and
 *                                   come out of expected;
 *   left, something collected    -> the rest of their dues must still be
 *                                   collected.
 *
 * The first half was already handled by the ledger: withdrawing a student
 * cancels every clean unpaid installment, so a leaver who never paid has no
 * dues at all. Twenty-five such students in the live session carry 100 cancelled
 * installments between them and contribute exactly zero.
 *
 * The second half was broken in the reporting layer. Filtering on
 * `record_status = 'active'` dropped the three leavers who HAD paid — and whose
 * installments were therefore retained — hiding Rs 17,250 of collectable money
 * and, worse, making them unchaseable: they vanished from Defaulters entirely.
 */

const MIGRATION = readFileSync(
  path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260808210000_left_students_with_payments_stay_collectable.sql",
  ),
  "utf8",
);

const WORKBOOK = readFileSync(
  path.join(process.cwd(), "src/modules/fees/data/queries.ts"),
  "utf8",
);

const DEFAULTERS = readFileSync(
  path.join(process.cwd(), "src/modules/defaulters/data/queries.ts"),
  "utf8",
);

describe("money scope keeps departed students who have paid", () => {
  it("widens the dashboard money KPIs beyond record_status", () => {
    expect(MIGRATION).toContain("(record_status = ''active'' or total_paid > 0)");
  });

  it("widens the split RPC the same way, ignoring discount write-offs as 'paid'", () => {
    // A write-off is not money collected, so it must not keep a leaver in scope.
    expect(MIGRATION).toContain("r.payment_mode <> 'discount'");
    expect(MIGRATION).toMatch(/s\.status = 'active'\s*or exists \(/);
  });

  it("leaves the headcount alone — a leaver is not on the roll", () => {
    expect(MIGRATION).toMatch(/total_students stays active-only/);
  });

  it("asserts in-migration that leavers who never paid contribute nothing", () => {
    expect(MIGRATION).toMatch(
      /Departed students who never paid still carry % of expected fee/,
    );
  });

  it("asserts in-migration that the departed-but-paid still owe", () => {
    expect(MIGRATION).toMatch(/Expected departed-but-paid students to still owe something/);
  });
});

describe("the shared activeOnly filter follows the same rule", () => {
  it("means financially in scope, not merely on the roll", () => {
    expect(WORKBOOK).toContain('query.or("record_status.eq.active,total_paid.gt.0")');
    expect(WORKBOOK).not.toContain('query.eq("record_status", "active")');
  });
});

describe("defaulters can chase a leaver who part-paid", () => {
  it("includes left students in the follow-up query", () => {
    // The population moved from an inline list to a named constant in
    // lib/students/populations.ts, where its "why" is documented. Same rows.
    expect(DEFAULTERS).toContain('.in("status", [...DEFAULTER_CALL_LIST_STATUSES])');
    expect(DEFAULTERS).not.toContain('.eq("status", "active")');
  });

  it("relies on cancelled installments to keep non-payers out, not on a status filter", () => {
    expect(DEFAULTERS).toMatch(/withdrawing a student cancels their clean\s*\/\/ unpaid installments/);
  });
});
