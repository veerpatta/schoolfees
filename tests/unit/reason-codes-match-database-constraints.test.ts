import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The reason-code unions in TypeScript must be a subset of the CHECK
 * constraints that store them.
 *
 * Both drifted apart in production and both failed the same way: a CHECK
 * violation aborts the whole INSERT, so the break lands on exactly the workflow
 * the newer code was written to serve.
 *
 *   - `config_change_blocked_installments` never allowed 'in_repayment_plan',
 *     so any Fee Setup publish touching an EMI-covered installment failed
 *     outright — an EMI plan being precisely the case where a family has asked
 *     for their bill to be handled carefully.
 *   - `ledger_regeneration_rows` never allowed 'discount_reduces_unpaid', the
 *     code emitted for the rows the discount fix exists to write.
 *
 * Nothing connected the two sides, so adding a code was a silent, deployable
 * mistake. This test is that connection. It reads the source rather than the
 * live database on purpose: it has to fail in CI, before the migration and the
 * code can disagree in production.
 */

const repoRoot = path.resolve(__dirname, "..", "..");

function read(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

/**
 * String-literal members of a union, between `declaration` and the next `;`.
 *
 * Comments are stripped BEFORE looking for that `;`. These unions carry a
 * paragraph of reasoning per member and prose contains semicolons — scanning
 * the raw text stopped mid-comment and silently returned a short list, which
 * would have made this whole test pass while checking three of four codes.
 */
function unionMembers(source: string, declaration: string) {
  const start = source.indexOf(declaration);
  expect(start, `could not find ${declaration}`).toBeGreaterThan(-1);

  const body = source
    .slice(start + declaration.length)
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const end = body.indexOf(";");
  expect(end, `could not find the end of ${declaration}`).toBeGreaterThan(-1);

  return [...body.slice(0, end).matchAll(/"([a-z_]+)"/g)].map((match) => match[1]!);
}

/** Codes allowed by a `check (reason_code = any (array[...]))` clause. */
function constraintCodes(sql: string, constraintName: string) {
  const start = sql.indexOf(constraintName);
  expect(start, `could not find ${constraintName}`).toBeGreaterThan(-1);

  const body = sql.slice(start);
  const arrayStart = body.indexOf("array[");
  const arrayEnd = body.indexOf("]", arrayStart);
  expect(arrayStart, `${constraintName} has no array[...]`).toBeGreaterThan(-1);

  return [...body.slice(arrayStart, arrayEnd).matchAll(/'([a-z_]+)'/g)].map((match) => match[1]!);
}

const migration = read(
  "supabase/migrations/20260814090000_widen_blocked_installment_reason_codes.sql",
);

describe("reason codes the code emits are storable", () => {
  it("every LockedInstallmentReasonCode is allowed by config_change_blocked_installments", () => {
    const declared = unionMembers(
      read("src/modules/fees/data/generator.ts"),
      "export type LockedInstallmentReasonCode =",
    );
    const allowed = constraintCodes(
      migration,
      "config_change_blocked_installments_reason_code_check",
    );

    expect(declared.length).toBeGreaterThan(0);
    // 'in_repayment_plan' is the one that was missing. Named explicitly so a
    // future edit that drops it fails here rather than in the office.
    expect(declared).toContain("in_repayment_plan");
    expect(allowed).toEqual(expect.arrayContaining(declared));
  });

  it("every regeneration reason_code is allowed by ledger_regeneration_rows", () => {
    const declared = unionMembers(read("src/modules/fees/data/regeneration.ts"), "  reason_code:");
    const allowed = constraintCodes(migration, "ledger_regeneration_rows_reason_code_check");

    expect(declared.length).toBeGreaterThan(0);
    expect(declared).toContain("discount_reduces_unpaid");
    expect(declared).toContain("charge_rise_on_unsettled");
    expect(allowed).toEqual(expect.arrayContaining(declared));
  });
});
