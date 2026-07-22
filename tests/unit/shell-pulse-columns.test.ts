import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SHELL_PULSE_FINANCIALS_COLUMNS } from "@/lib/dashboard/shell-metrics";

/**
 * Guards the sidebar "Day so far" card against a silent-zero regression.
 *
 * The card shipped filtering `balance_status` on
 * `v_workbook_student_financials` — a column that only exists on the
 * INSTALLMENT-level view. PostgREST returned an error, the code swallowed it,
 * and the card rendered ₹0 on every page for days without anything failing.
 *
 * These tests read the canonical schema so a wrong column name fails CI
 * instead of quietly zeroing the office's headline number.
 */

const schemaSql = readFileSync(
  join(process.cwd(), "supabase/schema.sql"),
  "utf8",
);

/**
 * Column list of the LAST definition of a relation in schema.sql (later
 * definitions supersede earlier ones — the file replays migration history).
 */
function selectedColumnsOf(relation: string): string {
  const marker = `create materialized view public.${relation} as`;
  const start = schemaSql.lastIndexOf(marker);
  expect(start, `${relation} must be defined in supabase/schema.sql`).toBeGreaterThan(-1);

  const next = schemaSql.indexOf("\ncreate ", start + marker.length);
  return schemaSql.slice(start, next === -1 ? undefined : next);
}

describe("shell pulse column contract", () => {
  const financials = selectedColumnsOf("v_workbook_student_financials");

  it.each(SHELL_PULSE_FINANCIALS_COLUMNS)(
    "v_workbook_student_financials exposes %s",
    (column) => {
      // Matches "... as <column>" or a bare projected column name.
      const pattern = new RegExp(`(\\bas\\s+${column}\\b|\\b${column}\\b)`);
      expect(pattern.test(financials)).toBe(true);
    },
  );

  it("does not read balance_status from the student-level view", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/dashboard/shell-metrics.ts"),
      "utf8",
    );

    expect(source).toContain("v_workbook_student_financials");
    // balance_status lives on v_workbook_installment_balances only. Match the
    // quoted query form so prose in comments doesn't trip the guard.
    expect(source).not.toContain('"balance_status"');
  });

  it("degrades per query so one failure cannot blank the other figure", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/dashboard/shell-metrics.ts"),
      "utf8",
    );

    // The original all-or-nothing guard zeroed today's money whenever the
    // defaulter count failed. Each side must fall back independently.
    expect(source).not.toMatch(/if \(\s*todayReceipts\.error \|\| \w+\.error\s*\)/);
    expect(source).toContain("todayReceipts.error");
    expect(source).toContain(".error ? 0 :");
  });
});
