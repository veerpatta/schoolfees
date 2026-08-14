import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `balance_status` is computed in TWO places — the engine function and the
 * materialized view that used to call it before 20260520000000 inlined the
 * logic. Two copies drift, and this one did: 20260522030225 made a past-due
 * part-paid installment read 'overdue' in both, and a later rewrite of the
 * function silently put 'partial' back in front.
 *
 * It went unnoticed because the surfaces read the VIEW. The one consumer of
 * the function's status is preview_workbook_payment_allocation, which hands it
 * to the Payment Desk — so the desk was calling a row 'partial' that the
 * student page and Defaulters both called overdue. 105 live installments,
 * Rs 3,66,852.
 */
const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const SCHEMA = join(process.cwd(), "supabase/schema.sql");

function latestMigrationContaining(needle: string) {
  const defining = readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .filter((file) => readFileSync(join(MIGRATIONS, file), "utf8").includes(needle));

  expect(defining.length, `no migration contains ${needle}`).toBeGreaterThan(0);

  return readFileSync(join(MIGRATIONS, defining[defining.length - 1]), "utf8");
}

/** Both definitions live in schema.sql; slice to the one being asserted. */
function statusBranchOrder(sql: string, from: number) {
  const overdue = sql.indexOf("then 'overdue'", from);
  const partial = sql.indexOf("then 'partial'", from);

  expect(overdue, "no overdue branch found").toBeGreaterThan(-1);
  expect(partial, "no partial branch found").toBeGreaterThan(-1);

  return overdue < partial ? "overdue-first" : "partial-first";
}

describe("balance_status means the same thing in both definitions", () => {
  it("the engine function checks overdue before partial", () => {
    const schema = readFileSync(SCHEMA, "utf8").toLowerCase();
    const fnStart = schema.indexOf(
      "create or replace function private.workbook_installment_snapshot",
    );

    expect(fnStart).toBeGreaterThan(-1);
    expect(statusBranchOrder(schema, fnStart)).toBe("overdue-first");
  });

  it("the materialized view checks overdue before partial", () => {
    const schema = readFileSync(SCHEMA, "utf8").toLowerCase();
    const viewStart = schema.indexOf("v_workbook_installment_balances");

    expect(viewStart).toBeGreaterThan(-1);
    expect(statusBranchOrder(schema, viewStart)).toBe("overdue-first");
  });

  it("the migration asserts its own success rather than trusting a replace", () => {
    const sql = latestMigrationContaining(
      "balance_status still checks partial before overdue",
    );

    expect(sql).toContain("the two branches were not adjacent as expected");
    // Replaying it must be a no-op, not a second swap back.
    expect(sql).toContain("already ordered correctly");
  });
});
