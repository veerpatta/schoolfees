import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// The undo feature is a SECURITY DEFINER RPC + a thin app layer. The RPC's
// guards live in SQL, so these are static-content assertions on the migration
// (pattern: post-payment-cleanup-migration tests) plus wiring assertions on
// the app layer.

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationFile = readdirSync(migrationsDir).find((name) =>
  name.endsWith("_undo_recent_payment.sql"),
);

describe("undo_recent_payment migration", () => {
  it("exists in supabase/migrations", () => {
    expect(migrationFile).toBeTruthy();
  });

  const sql = migrationFile
    ? readFileSync(join(migrationsDir, migrationFile), "utf8")
    : "";

  it("guards on the admin-only payments:adjust permission", () => {
    expect(sql).toContain("has_permission('payments:adjust')");
  });

  it("enforces the 10-minute window with a friendly redirect to the refund workflow", () => {
    expect(sql).toContain("interval '10 minutes'");
    expect(sql).toMatch(/Undo window has passed/);
    expect(sql).toMatch(/refund workflow/i);
  });

  it("takes the per-student advisory lock with the posting RPC's key scheme", () => {
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended(");
  });

  it("refuses receipts that already have adjustments or an open refund request", () => {
    expect(sql).toMatch(/already has adjustments/);
    expect(sql).toMatch(/refund request in progress/);
    expect(sql).toContain("status <> 'rejected'");
  });

  it("inserts full-amount reversals tagged with the payment_undo notes marker", () => {
    expect(sql).toContain("'reversal'");
    expect(sql).toContain("-pay.amount");
    expect(sql).toContain("'payment_undo:' || p_receipt_id::text");
  });

  it("locks down execute grants", () => {
    expect(sql).toMatch(/revoke all on function public\.undo_recent_payment\(uuid, text\) from public/);
    expect(sql).toMatch(/grant execute on function public\.undo_recent_payment\(uuid, text\) to authenticated/);
  });
});

describe("undoRecentPayment data layer", () => {
  const source = readFileSync(join(process.cwd(), "lib", "payments", "data.ts"), "utf8");

  it("calls the RPC via the user-JWT client (never the service-role admin client)", () => {
    const fn = source.slice(source.indexOf("export async function undoRecentPayment"));
    const body = fn.slice(0, fn.indexOf("\nasync function"));
    expect(body).toContain('supabase.rpc("undo_recent_payment"');
    expect(body).toContain("await createClient()");
    expect(body).not.toContain("createAdminClient");
  });
});

describe("undoRecentPaymentAction server action", () => {
  const source = readFileSync(
    join(process.cwd(), "app", "protected", "payments", "actions.ts"),
    "utf8",
  );

  it("requires payments:adjust upstream of the RPC (defense-in-depth)", () => {
    const fn = source.slice(source.indexOf("export async function undoRecentPaymentAction"));
    expect(fn).toContain('requireStaffPermission("payments:adjust")');
    expect(fn).toContain("undoRecentPayment({");
  });

  it("revalidates finance surfaces and records the undo in the activity log", () => {
    const fn = source.slice(source.indexOf("export async function undoRecentPaymentAction"));
    expect(fn).toContain("revalidateSessionFinance(");
    expect(fn).toContain("revalidateAfterPaymentPosting(");
    expect(fn).toContain('kind: "payment_undone"');
  });
});

describe("receipt VOID derivation", () => {
  const source = readFileSync(join(process.cwd(), "lib", "receipts", "data.ts"), "utf8");

  it("derives isVoided from reversal adjustments instead of mutating the receipt", () => {
    expect(source).toContain('.eq("adjustment_type", "reversal")');
    expect(source).toMatch(/isVoided = receipt\.total_amount > 0 && reversedAmount >= receipt\.total_amount/);
  });
});
