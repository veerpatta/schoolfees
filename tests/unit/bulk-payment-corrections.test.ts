import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FORBIDDEN_TABLES, OPERATIONS } from "../../scripts/bulk-apply-operations.mjs";
import {
  CORRECTION_OPS,
  PAYMENT_CORRECTION_OPERATION,
  planCorrection,
} from "../../scripts/bulk-apply-payment-corrections.mjs";

const repoRoot = process.cwd();
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

type PlanRow = Record<string, unknown>;
type Planned = {
  ok: boolean;
  skip?: boolean;
  kind?: string;
  why?: string;
  describe?: string;
  allocations?: Array<{ installmentId: string; amount: number }>;
  patch?: Record<string, unknown>;
};

const plan = (row: PlanRow, context: unknown) =>
  (planCorrection as (r: PlanRow, i: number, c: unknown) => Planned)(row, 0, context);

/** One receipt of ₹6,000 split across two installments, on the target session. */
function makeContext(overrides: Record<string, unknown> = {}) {
  const receipt = {
    id: "receipt-1",
    receipt_number: "SVP20260813-0002",
    student_id: "student-1",
    payment_date: "2026-08-13",
    payment_mode: "cash",
    total_amount: 6000,
    reference_number: null,
    notes: null,
    received_by: "Office",
  };

  return {
    sessionLabel: "TEST-2026-27",
    receipts: new Map([[receipt.receipt_number, receipt]]),
    allocationsByReceipt: new Map([
      [
        "receipt-1",
        [
          { paymentId: "pay-1", installmentId: "inst-1", dueDate: "2026-04-20", amount: 4000 },
          { paymentId: "pay-2", installmentId: "inst-2", dueDate: "2026-07-20", amount: 2000 },
        ],
      ],
    ]),
    sessionByReceipt: new Map([["receipt-1", "TEST-2026-27"]]),
    reversedByReceipt: new Map(),
    openRefundReceiptIds: new Set(),
    studentsById: new Map([
      ["student-1", { id: "student-1", admission_no: "TEST-CL8-001", full_name: "A" }],
    ]),
    studentsByAdmissionNo: new Map([
      ["TEST-CL8-001", { id: "student-1", admission_no: "TEST-CL8-001", full_name: "A" }],
      ["TEST-CL8-002", { id: "student-2", admission_no: "TEST-CL8-002", full_name: "B" }],
    ]),
    ...overrides,
  };
}

describe("the column-update engine still refuses every money table", () => {
  // The correction mode exists precisely BECAUSE this stays true: payments and
  // receipts cannot be UPDATEd by anyone, service role included, so corrections
  // append instead. If this ever loosens, the two mechanisms have merged and one
  // of them is wrong.
  it("keeps the four money tables forbidden", () => {
    for (const table of ["payments", "receipts", "payment_adjustments", "audit_logs"]) {
      expect(FORBIDDEN_TABLES).toContain(table);
    }
  });

  it("has no registry operation naming one", () => {
    for (const [name, operation] of Object.entries(
      OPERATIONS as Record<string, { table: string }>,
    )) {
      expect(FORBIDDEN_TABLES, `${name} writes a forbidden table`).not.toContain(operation.table);
    }
  });

  it("routes corrections through a separate mode, not the registry", () => {
    expect(PAYMENT_CORRECTION_OPERATION).toBe("payment-correction");
    expect(OPERATIONS).not.toHaveProperty(PAYMENT_CORRECTION_OPERATION);
  });
});

describe("planCorrection re-checks the world before it commits to anything", () => {
  it("refuses a receipt whose amount has moved since the dry run", () => {
    const result = plan(
      { op: "amount", receiptNumber: "SVP20260813-0002", fromAmount: 5000, toAmount: 3000 },
      makeContext(),
    );

    expect(result.ok).toBe(false);
    expect(result.why).toMatch(/is 6000, not the 5000 the plan expected/);
  });

  it("refuses a receipt from another session", () => {
    const result = plan(
      { op: "amount", receiptNumber: "SVP20260813-0002", fromAmount: 6000, toAmount: 3000 },
      makeContext({ sessionByReceipt: new Map([["receipt-1", "2026-27"]]) }),
    );

    expect(result.ok).toBe(false);
    expect(result.why).toMatch(/belongs to 2026-27, not TEST-2026-27/);
  });

  it("refuses a receipt that is already fully reversed", () => {
    const result = plan(
      { op: "amount", receiptNumber: "SVP20260813-0002", fromAmount: 6000, toAmount: 3000 },
      makeContext({ reversedByReceipt: new Map([["receipt-1", 6000]]) }),
    );

    expect(result.ok).toBe(false);
    expect(result.why).toMatch(/already fully reversed/);
  });

  it("stands aside for a refund already in flight", () => {
    const result = plan(
      { op: "amount", receiptNumber: "SVP20260813-0002", fromAmount: 6000, toAmount: 3000 },
      makeContext({ openRefundReceiptIds: new Set(["receipt-1"]) }),
    );

    expect(result.ok).toBe(false);
    expect(result.why).toMatch(/refund request in progress/);
  });

  it("skips a row that is already what the plan asks for", () => {
    const result = plan(
      { op: "amount", receiptNumber: "SVP20260813-0002", fromAmount: 6000, toAmount: 6000 },
      makeContext(),
    );

    expect(result.ok).toBe(true);
    expect(result.skip).toBe(true);
  });
});

describe("student-total corrections", () => {
  // An office register says "this child has paid Rs 8,600, not Rs 0". It never
  // says which receipt is wrong — so the harness has to work that out.
  function studentContext(overrides: Record<string, unknown> = {}) {
    return {
      sessionLabel: "2026-27",
      receipts: new Map(),
      allocationsByReceipt: new Map(),
      sessionByReceipt: new Map(),
      reversedByReceipt: new Map(),
      openRefundReceiptIds: new Set(),
      studentsById: new Map(),
      studentsByAdmissionNo: new Map([
        ["2682", { id: "stu-1", admission_no: "2682", full_name: "A" }],
      ]),
      financialsByStudentId: new Map([["stu-1", { student_id: "stu-1", total_paid: 10000 }]]),
      installmentsByStudentId: new Map([
        [
          "stu-1",
          [
            { installment_id: "i1", due_date: "2026-04-20", pending_amount: 2000, late_fee_pending: 1000 },
            { installment_id: "i2", due_date: "2026-07-20", pending_amount: 5000, late_fee_pending: 0 },
          ],
        ],
      ]),
      receiptsByStudentId: new Map([
        [
          "stu-1",
          [
            { id: "r-new", receipt_number: "SVP-NEW", payment_date: "2026-07-27", payment_mode: "cash", total_amount: 6000, liveAmount: 6000,
              allocations: [{ installmentId: "i1", amount: 6000, dueDate: "2026-04-20" }] },
            { id: "r-old", receipt_number: "SVP-OLD", payment_date: "2026-06-01", payment_mode: "cash", total_amount: 4000, liveAmount: 4000,
              allocations: [{ installmentId: "i2", amount: 4000, dueDate: "2026-07-20" }] },
          ],
        ],
      ]),
      ...overrides,
    };
  }

  const row = (extra: PlanRow) => ({
    op: "student-total",
    admissionNo: "2682",
    fromCollected: 10000,
    paymentDate: "2026-07-27",
    ...extra,
  });

  it("posts one new receipt for a shortfall, earliest due first", () => {
    const result = plan(row({ toCollected: 13000 }), studentContext());

    expect(result.ok).toBe(true);
    expect(result.kind).toBe("collect");
    expect(result.allocations).toEqual([
      { installmentId: "i1", amount: 2000 },
      { installmentId: "i2", amount: 1000 },
    ]);
  });

  it("never settles a late fee as if it were collection", () => {
    // i1 has 2000 of fees and 1000 of late fee. A 7000 shortfall must fill only
    // the 7000 of FEES across both installments and never reach the late fee.
    const result = plan(row({ toCollected: 17000 }), studentContext());

    expect(result.ok).toBe(true);
    expect(result.allocations?.reduce((a, b) => a + b.amount, 0)).toBe(7000);
  });

  it("refuses to invent an advance when the shortfall exceeds what is owed", () => {
    const result = plan(row({ toCollected: 20000 }), studentContext());

    expect(result.ok).toBe(false);
    expect(result.why).toMatch(/would be an advance/);
  });

  it("prefers the single receipt that matches an over-statement exactly", () => {
    // Taking back 4000 must reverse SVP-OLD alone. Newest-first would reverse
    // the 6000, come up short, take the 4000 too and repost 6000 — voiding two
    // receipts a parent may hold to achieve what one does.
    const result = plan(row({ toCollected: 6000 }), studentContext()) as Planned & {
      reverseReceipts?: Array<{ receipt_number: string }>;
      repost?: unknown;
    };

    expect(result.ok).toBe(true);
    expect(result.kind).toBe("takeback");
    expect(result.reverseReceipts?.map((r) => r.receipt_number)).toEqual(["SVP-OLD"]);
    expect(result.repost).toBeNull();
  });

  it("reverses newest-first and reposts the overshoot when nothing matches", () => {
    const result = plan(row({ toCollected: 7000 }), studentContext()) as Planned & {
      reverseReceipts?: Array<{ receipt_number: string }>;
      repost?: { amount: number };
    };

    expect(result.ok).toBe(true);
    expect(result.reverseReceipts?.map((r) => r.receipt_number)).toEqual(["SVP-NEW"]);
    expect(result.repost?.amount).toBe(3000);
  });

  it("prices the repost off the reversed receipt's own allocation, not a balance read", () => {
    // Reading balances here was wrong on live data: a reversal only ENQUEUES the
    // matview refresh, so the read returned the pre-reversal position - zero room
    // for a student who had just been fully paid - and the repost was abandoned.
    // A reversed receipt frees exactly what it allocated, which cannot be stale.
    const result = plan(row({ toCollected: 7000 }), studentContext()) as Planned & {
      repost?: { allocations?: Array<{ installmentId: string; amount: number }> };
    };

    expect(result.repost?.allocations).toEqual([
      { installmentId: "i1", amount: 6000, dueDate: "2026-04-20" },
    ]);

    // Checks for an actual READ, not the bare name — the comment explaining why
    // this went wrong on live data is worth keeping in the file.
    const source = read("scripts/bulk-apply-payment-corrections.mjs");
    const branch = source.slice(source.indexOf('if (change.kind === "takeback")'));
    const untilAudit = branch.slice(0, branch.indexOf("await writeAuditRow"));
    expect(untilAudit).not.toContain('.from("v_workbook_installment_balances")');
  });

  it("re-checks the live collected figure before doing anything", () => {
    const result = plan(row({ fromCollected: 9999, toCollected: 12000 }), studentContext());

    expect(result.ok).toBe(false);
    expect(result.why).toMatch(/has collected 10000, not the 9999/);
  });

  it("refuses to invent a payment date", () => {
    const result = plan(
      { op: "student-total", admissionNo: "2682", fromCollected: 10000, toCollected: 12000 },
      studentContext(),
    );

    expect(result.ok).toBe(false);
    expect(result.why).toMatch(/no payment date/);
  });
});

describe("reverse-only corrections", () => {
  // A duplicate receipt has no corrected version. `amount` cannot express it
  // either, because a receipt of ₹0 is not a receipt.
  it("reverse without posting any replacement", () => {
    const result = plan(
      { op: "reverse", receiptNumber: "SVP20260813-0002", fromAmount: 6000 },
      makeContext(),
    );

    expect(result.ok).toBe(true);
    expect(result.kind).toBe("reverse");
    expect(result.allocations).toBeUndefined();
    expect(result.describe).toMatch(/no replacement/);
  });

  it("still re-check the amount, so a moved row is not silently voided", () => {
    const result = plan(
      { op: "reverse", receiptNumber: "SVP20260813-0002", fromAmount: 5000 },
      makeContext(),
    );

    expect(result.ok).toBe(false);
    expect(result.why).toMatch(/is 6000, not the 5000/);
  });

  it("skip the repost RPC entirely on the apply path", () => {
    const source = read("scripts/bulk-apply-payment-corrections.mjs");
    const branch = source.slice(source.indexOf('if (change.kind === "reverse")'));
    const untilReturn = branch.slice(0, branch.indexOf("return {"));
    expect(untilReturn).not.toContain("post_corrected_payment");
  });
});

describe("amount corrections", () => {
  it("spread the corrected total over the original installments, earliest due first", () => {
    const result = plan(
      { op: "amount", receiptNumber: "SVP20260813-0002", fromAmount: 6000, toAmount: 3500 },
      makeContext(),
    );

    expect(result.ok).toBe(true);
    expect(result.kind).toBe("repost");
    // ₹3,500 fills INST 1's ₹4,000 slot and never reaches INST 2.
    expect(result.allocations).toEqual([{ installmentId: "inst-1", amount: 3500 }]);
  });

  it("refuse to grow a receipt", () => {
    // Taking MORE money is a payment, not a correction, and belongs at the desk
    // where a parent is present and a receipt gets printed.
    const result = plan(
      { op: "amount", receiptNumber: "SVP20260813-0002", fromAmount: 6000, toAmount: 9000 },
      makeContext(),
    );

    expect(result.ok).toBe(false);
    expect(result.why).toMatch(/larger than the original/);
  });
});

describe("student corrections", () => {
  it("require an explicit allocation, because the other child's installments are different rows", () => {
    const result = plan(
      {
        op: "student",
        receiptNumber: "SVP20260813-0002",
        fromAdmissionNo: "TEST-CL8-001",
        toAdmissionNo: "TEST-CL8-002",
      },
      makeContext(),
    );

    expect(result.ok).toBe(false);
    expect(result.why).toMatch(/needs an explicit "allocations" list/);
  });

  it("refuse when the receipt is not on the child the plan named", () => {
    const result = plan(
      {
        op: "student",
        receiptNumber: "SVP20260813-0002",
        fromAdmissionNo: "TEST-CL8-999",
        toAdmissionNo: "TEST-CL8-002",
        allocations: [{ installmentId: "inst-9", amount: 6000 }],
      },
      makeContext(),
    );

    expect(result.ok).toBe(false);
    expect(result.why).toMatch(/not the TEST-CL8-999 the plan expected/);
  });
});

describe("allocation corrections move money without changing it", () => {
  it("refuse an allocation that does not sum to the receipt", () => {
    const result = plan(
      {
        op: "allocation",
        receiptNumber: "SVP20260813-0002",
        allocations: [{ installmentId: "inst-2", amount: 5000 }],
      },
      makeContext(),
    );

    expect(result.ok).toBe(false);
    expect(result.why).toMatch(/must not change the amount/);
  });

  it("accept one that does", () => {
    const result = plan(
      {
        op: "allocation",
        receiptNumber: "SVP20260813-0002",
        allocations: [{ installmentId: "inst-2", amount: 6000 }],
      },
      makeContext(),
    );

    expect(result.ok).toBe(true);
    expect(result.allocations).toEqual([{ installmentId: "inst-2", amount: 6000 }]);
  });
});

describe("metadata corrections stay descriptive", () => {
  it("write only the three columns that carry no money", () => {
    const result = plan(
      { op: "metadata", receiptNumber: "SVP20260813-0002", referenceNumber: "UPI-889231" },
      makeContext(),
    );

    expect(result.ok).toBe(true);
    expect(result.kind).toBe("metadata");
    expect(result.patch).toEqual({ reference_number: "UPI-889231" });
  });

  it("refuse anything else, rather than silently ignoring it", () => {
    // A plan asking metadata to change the amount must fail loudly. Dropping the
    // field would report success for a correction that never happened.
    const result = plan(
      { op: "metadata", receiptNumber: "SVP20260813-0002", toAmount: 1 },
      makeContext(),
    );

    expect(result.ok).toBe(false);
    expect(result.why).toMatch(/may only write/);
  });

  it("refuse to set a discount payment mode through date-mode", () => {
    // `discount` is a write-off, and flipping a receipt into it moves rupees out
    // of collection and into close-outs without changing what anyone owes.
    const result = plan(
      { op: "date-mode", receiptNumber: "SVP20260813-0002", toPaymentMode: "discount" },
      makeContext(),
    );

    expect(result.ok).toBe(false);
    expect(result.why).toMatch(/write-off/);
  });
});

describe("post_corrected_payment migration", () => {
  const migrationsDir = join(repoRoot, "supabase", "migrations");
  const file = readdirSync(migrationsDir).find((name) =>
    name.endsWith("_bulk_payment_corrections.sql"),
  );
  const sql = file ? readFileSync(join(migrationsDir, file), "utf8") : "";

  it("exists", () => {
    expect(file).toBeTruthy();
  });

  it("is reachable by the service role alone — never a staff session", () => {
    // Any staff-permission arm would make it a second posting surface for humans
    // and break the "Payment Desk only" rule.
    expect(sql).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(sql).not.toContain("has_permission(");
    expect(sql).toMatch(/revoke all on function public\.post_corrected_payment[\s\S]*from authenticated/);
  });

  it("prices the repost off the LIVE snapshot, not the lagging matview", () => {
    // A correction runs immediately after a reversal, and the matview is up to
    // two minutes behind. Reading it would price the repost against balances
    // that still show the wrong receipt as paid.
    expect(sql).toContain("private.workbook_installment_snapshot(");
    expect(sql).not.toContain("v_workbook_installment_balances");
  });

  it("keeps the receipt number in the exact shape the desk's regex reads back", () => {
    // The desk derives the next number with '-([0-9]{4})$'. A correction number
    // of any other shape makes max() return 0 and the next real posting collide.
    expect(sql).toContain("lpad(v_daily_sequence::text, 4, '0')");
    expect(sql).toContain("'-([0-9]{4})$'");
  });

  it("is idempotent on client_request_id and takes the per-student lock", () => {
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended(");
    expect(sql).toMatch(/client_request_id is required/);
    expect(sql).toContain("r.client_request_id = p_client_request_id");
  });

  it("validates that every installment is the student's own", () => {
    expect(sql).toMatch(/does not belong to this student/);
    expect(sql).toMatch(/larger than what that installment still owes/);
  });

  it("leaves the posting-time snapshot columns blank", () => {
    // They are the balance the parent was told at the counter. A correction
    // posted months later was never told to anybody.
    expect(sql).toContain("pending_before_posting, pending_after_posting");
    expect(sql).toContain("0, 0, null, null");
  });
});

describe("receipts keep every money column immutable", () => {
  const migrationsDir = join(repoRoot, "supabase", "migrations");
  const file = readdirSync(migrationsDir).find((name) =>
    name.endsWith("_bulk_payment_corrections.sql"),
  );
  const sql = file ? readFileSync(join(migrationsDir, file), "utf8") : "";

  it("names each of them in the new guard", () => {
    for (const column of [
      "receipt_number",
      "student_id",
      "payment_date",
      "payment_mode",
      "total_amount",
      "created_by",
      "created_at",
      "client_request_id",
      "family_payment_id",
    ]) {
      expect(sql, `${column} is no longer protected`).toContain(`new.${column} is distinct from old.${column}`);
    }
  });

  it("still refuses DELETE outright", () => {
    expect(sql).toMatch(/tg_op = 'DELETE'[\s\S]{0,120}raise exception/);
  });

  it("leaves the shared unconditional guard alone for the other three tables", () => {
    // prevent_append_only_mutation() is shared with payments, payment_adjustments
    // and audit_logs. Relaxing it would have relaxed all four at once.
    expect(sql).not.toContain("create or replace function private.prevent_append_only_mutation");
  });
});

describe("the correction harness is wired into the CLI a reader will find", () => {
  const runner = read("scripts/bulk-apply.mjs");

  it("branches before the registry lookup and keeps every guard", () => {
    expect(runner).toContain("PAYMENT_CORRECTION_OPERATION");
    expect(runner).toContain('const apply = process.argv.includes("--apply")');
    expect(runner).toContain('const LIVE_SESSION_LABEL = "2026-27"');
    expect(runner).toContain("sessionLabel === LIVE_SESSION_LABEL && !live");
    // Corrections always move money, so the second opt-in is unconditional.
    expect(runner).toContain("(isPaymentCorrection || operation.feeImpact) && !allowFeeImpact");
  });

  it("documents the mode in --help", () => {
    expect(runner).toContain("describeCorrectionOps()");
  });

  it("drains the matview itself, and only asks the app for the half it cannot do", () => {
    const corrections = read("scripts/bulk-apply-payment-corrections.mjs");

    // The matview refresh RPC is granted to service_role, which this script
    // already holds. Routing it through the app route meant a missing
    // CRON_SECRET left BOTH halves undone when only one needed the app.
    expect(corrections).toContain("refresh_workbook_materialized_views_if_requested");
    expect(corrections).toContain("### Matviews refreshed");

    // …and it does so unconditionally, not inside the `if (secret)` branch.
    const refresh = corrections.slice(corrections.indexOf("async function revalidateAfterCorrections"));
    const drainAt = refresh.indexOf("refresh_workbook_materialized_views_if_requested");
    const secretGateAt = refresh.indexOf("if (!secret)");
    expect(drainAt).toBeGreaterThan(-1);
    expect(drainAt).toBeLessThan(secretGateAt);

    // revalidateTag only exists inside the deployed process, so this half does
    // need the route — and a skipped bust is reported, never swallowed.
    expect(corrections).toContain("/api/admin/revalidate-after-bulk");
    expect(corrections).toContain("CRON_SECRET");
    expect(corrections).toContain("### Cached pages NOT busted");
  });

  it("drains the matview before busting the tag in that route", () => {
    const route = read("app/api/admin/revalidate-after-bulk/route.ts");
    const drainAt = route.indexOf("await drainFinancialViewRefresh()");
    const bustAt = route.indexOf("revalidateSessionFinance(");
    expect(drainAt).toBeGreaterThan(-1);
    expect(drainAt).toBeLessThan(bustAt);
    expect(route).toContain("CRON_SECRET");
  });

  it("reverses before it reposts, and says so loudly if the repost then fails", () => {
    const corrections = read("scripts/bulk-apply-payment-corrections.mjs");

    // Scoped to each branch that does both. Comparing the first occurrence of
    // each RPC across the whole file broke the moment `collect` — which only
    // ever posts — was added above them.
    for (const branch of [
      'if (change.kind === "takeback")',
      "const { data: reversal, error: reversalError }",
    ]) {
      const from = corrections.indexOf(branch);
      expect(from, `branch not found: ${branch}`).toBeGreaterThan(-1);
      const body = corrections.slice(from);
      const reverseAt = body.indexOf('rpc("reverse_receipt_admin"');
      const repostAt = body.indexOf('rpc("post_corrected_payment"');
      expect(reverseAt, branch).toBeGreaterThan(-1);
      expect(reverseAt, branch).toBeLessThan(repostAt);
    }

    // A reversal is append-only and cannot be taken back, so a correction that
    // stopped halfway must never read as a tidy failure.
    expect(corrections).toContain("REVERSED BUT NOT REPOSTED");
    expect(corrections).toContain("REVERSED");
    expect(corrections).toContain("part-corrected");
  });

  it("writes its own audit row, since recordActivity() no-ops without a user", () => {
    const corrections = read("scripts/bulk-apply-payment-corrections.mjs");
    expect(corrections).toContain('.from("audit_logs").insert(');
    expect(corrections).toContain("_bulk_apply");
  });
});

describe("every correction op is described where an agent will look", () => {
  it("declares each op with the fields it needs, and how it is keyed", () => {
    const ops = CORRECTION_OPS as Record<
      string,
      { describe: string; needs: string[]; keyedBy?: string }
    >;
    expect(Object.keys(ops).sort()).toEqual(
      ["allocation", "amount", "date-mode", "metadata", "reverse", "student", "student-total"].sort(),
    );

    for (const [name, meta] of Object.entries(ops)) {
      expect(meta.describe, `${name} has no description`).toBeTruthy();

      // Two shapes of row, and the key decides which context gets loaded: a
      // receipt-keyed op names one receipt, `student-total` names a student and
      // lets the harness work out which receipts have to move.
      const keyField = meta.keyedBy === "admissionNo" ? "admissionNo" : "receiptNumber";
      expect(meta.needs, `${name} does not require its own key`).toContain(keyField);
    }
  });

  it("is documented in the agent workflow doc", () => {
    const doc = read("docs/workflows/agent-bulk-operations.md");
    expect(doc).toContain("payment-correction");
    expect(doc).toContain("reverse + repost");
  });
});
