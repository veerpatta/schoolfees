import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Money settles the installments oldest-first at read time (20260905090000).
 *
 * The rule lives in SQL, twice, and the two copies must be byte-identical
 * under normalisation: `20260812001114` string-patched one engine and EMI
 * late fees were invisible to half the app for four days. These assertions
 * read the newest migration carrying the marker, so a later rewrite is held
 * to the same shape.
 */
const MIGRATIONS = join(process.cwd(), "supabase/migrations");

function latestMigrationContaining(needle: string) {
  const defining = readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .filter((file) => readFileSync(join(MIGRATIONS, file), "utf8").includes(needle));

  expect(defining.length, `no migration contains ${needle}`).toBeGreaterThan(0);

  return readFileSync(join(MIGRATIONS, defining[defining.length - 1]), "utf8");
}

/** Comments gone, whitespace collapsed, case folded -- the mirror-drift normaliser. */
function normalise(text: string) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function markedBlocks(sql: string, open: string, close: string) {
  const blocks: string[] = [];
  let cursor = 0;
  for (;;) {
    const start = sql.indexOf(open, cursor);
    if (start === -1) break;
    const end = sql.indexOf(close, start + open.length);
    expect(end, `unterminated ${open}`).toBeGreaterThan(-1);
    blocks.push(sql.slice(start, end));
    cursor = end + close.length;
  }
  return blocks;
}

const sql = latestMigrationContaining(">>> SHARED POOLED SETTLEMENT RULE <<<");

describe("the pooled settlement rule", () => {
  it("is written twice and the two copies are the same rule", () => {
    const copies = markedBlocks(
      sql,
      ">>> SHARED POOLED SETTLEMENT RULE <<<",
      "<<< SHARED POOLED SETTLEMENT RULE >>>",
    );
    expect(copies).toHaveLength(2);
    expect(normalise(copies[0])).toBe(normalise(copies[1]));
  });

  it("carries the late-fee CASE once per engine, inside the walk", () => {
    const copies = markedBlocks(
      sql,
      ">>> SHARED POOLED SETTLEMENT RULE <<<",
      "<<< SHARED POOLED SETTLEMENT RULE >>>",
    );
    for (const copy of copies) {
      expect(copy.match(/>>> SHARED LATE FEE RULE <<</g)).toHaveLength(1);
      expect(copy).toContain("union all");
      // The pooled on-time test: paid by the due date, minus what the rows
      // ahead absorb, covers this row's base.
      expect(copy).toContain(
        "when step.pool_by_due_amount >= walk.capacity_after + step.base_charge then 0",
      );
      // Fees first, then the late fee, on each row.
      expect(copy).toContain("least(settled.settled_amount, settled.base_charge)::integer as fee_settled_amount");
    }
    // `with recursive` opens the CTE list in both engines.
    expect(sql.match(/with recursive session_policy as \(/g)).toHaveLength(2);
  });

  it("pools per student AND session, in the counter's order", () => {
    expect(sql.match(/partition by rolled\.student_id, rolled\.session_label/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain(
      "order by rolled.plan_priority, rolled.due_date, rolled.installment_no, rolled.installment_id",
    );
    // plan_priority mirrors post_student_payment_with_adjustments: active plan rows first.
    expect(sql).toContain("and plan_row.lifecycle = 'active'");
  });

  it("keeps the pin as the pin and derives the read from the pool", () => {
    // total_paid = sum(applied_amount) must not move; settled_amount is new.
    expect(sql).toContain("settled_amount, fee_settled_amount, late_fee_settled_amount,");
    expect(sql).toContain("greatest(base_charge - fee_settled_amount, 0)::integer as pending_amount");
    expect(sql).toContain("greatest(final_late_fee - late_fee_settled_amount, 0)::integer as late_fee_pending");
    // The forward-only spill is gone; nothing reads the old effective_settled.
    expect(sql).not.toContain("effective_settled");
    expect(sql).not.toContain("SHARED SURPLUS SPILL RULE");
  });

  it("checks overdue before partial in both engines", () => {
    for (const engine of ["current_date > due_date then 'overdue'", "p_as_of_date > final_split.due_date then 'overdue'"]) {
      const at = sql.indexOf(engine);
      expect(at, engine).toBeGreaterThan(-1);
      expect(sql.indexOf("then 'partial'", at)).toBeGreaterThan(at);
    }
  });

  it("snapshots before the drop, grandfathers every rise, and asserts the invariants", () => {
    const snapshot = sql.indexOf("create table public.settlement_pool_change_snapshot");
    const drop = sql.indexOf("drop materialized view public.v_workbook_installment_balances cascade");
    expect(snapshot).toBeGreaterThan(-1);
    expect(drop).toBeGreaterThan(snapshot);

    expect(sql).toContain("'grandfather'");
    expect(sql).toContain("where bal.final_late_fee > snap.final_late_fee");
    expect(sql).toContain("still charge more late fee than before");
    expect(sql).toContain("where per-row dues disagree with charge - settled");
    expect(sql).toContain("read settled behind a row that still owes");
    expect(sql).toContain("changed a pinned figure");
  });

  it("rewrites the student financials rollup off the pin, with asserted anchors", () => {
    expect(sql).toContain(
      "'GREATEST(v_workbook_installment_balances.base_charge - v_workbook_installment_balances.applied_amount - v_workbook_installment_balances.discount_closeout_amount, 0)'",
    );
    expect(sql).toContain("'v_workbook_installment_balances.pending_amount'");
    expect(sql).toContain("'v_workbook_installment_balances.settled_amount > 0'");
    expect(sql).toContain("still recomputes pending from the pin after substitution");
  });

  it("lets the generator hold a paid row only for an EMI plan or a moved due date", () => {
    expect(sql).toContain("'in_repayment_plan', 'due_date_changed'");
    expect(sql).toContain("'due_date_changed'\n      ]");
  });
});

describe("the TypeScript side reads the pool, not the pin", () => {
  const read = (relative: string) => readFileSync(join(process.cwd(), relative), "utf8");

  it("the balances mapper exposes settledAmount and the due-amounts helper prefers the engine figure", () => {
    expect(read("src/modules/fees/data/queries.ts")).toContain("settledAmount,");
    expect(read("src/modules/fees/domain/due-amounts.ts")).toContain("row.pendingAmount ?? row.feesPending");
  });

  it("the student page and the receipt status read settledAmount", () => {
    expect(read("src/app/protected/students/[studentId]/page.tsx")).toContain("<Money value={item.settledAmount}");
    expect(read("src/modules/receipts/data/queries.ts")).toContain("paid: feeSettled,");
  });

  it("the desk sorts plan rows first, as the posting RPC does", () => {
    expect(read("src/modules/payments/domain/allocation.ts")).toContain("planPriority");
  });

  it("the generator no longer freezes a row for carrying money", () => {
    const generator = read("src/modules/fees/data/generator.ts");
    expect(generator).not.toContain("paid-floor-allocation");
    expect(generator).not.toContain("safe_reduction");
    expect(generator).toContain('reasonCode: "due_date_changed"');
    const preview = read("src/modules/fees/data/regeneration.ts");
    expect(preview).not.toContain("paid-floor-allocation");
    expect(preview).toContain('code: "due_date_changed" as const');
  });
});
