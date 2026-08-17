import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Reversing a receipt of any age.
 *
 * The 10-minute undo (`undo_recent_payment`) covers a mis-click at the counter.
 * This covers the mistake found a week later — wrong child, wrong amount,
 * entered twice — where no cash ever moved, so the refund workflow would be
 * recording an event that never happened.
 *
 * Like the undo tests next door, the guards live in SQL, so these are
 * static-content assertions on the migration plus wiring assertions on the app
 * layer.
 */

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationFile = readdirSync(migrationsDir).find((name) =>
  name.endsWith("_admin_can_reverse_any_receipt.sql"),
);

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("reverse_receipt_admin migration", () => {
  it("exists in supabase/migrations", () => {
    expect(migrationFile).toBeTruthy();
  });

  const sql = migrationFile ? readFileSync(join(migrationsDir, migrationFile), "utf8") : "";

  it("gates on its own admin-only permission, not payments:adjust", () => {
    expect(sql).toContain("has_permission('payments:reverse_any')");
    expect(sql).not.toContain("has_permission('payments:adjust')");
  });

  it("also admits the service role, so the headless bulk path can call it", () => {
    // has_permission needs auth.uid(), which is null under the service role, so
    // without this arm every scripted correction would fail the guard.
    expect(sql).toContain("coalesce(auth.role(), '') <> 'service_role'");
  });

  it("has NO time window — that is the entire point of it", () => {
    const withoutComments = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");

    expect(withoutComments).not.toMatch(/interval\s+'\d+\s+minute/);
    expect(withoutComments).not.toContain("created_at < now()");
  });

  it("refuses to run without a reason", () => {
    // Unlike undo there is no default: the explanation is the only record of why
    // a collected figure went down.
    expect(sql).toContain("coalesce(trim(p_reason), '') = ''");
    expect(sql).toMatch(/A reason is required/);
  });

  it("takes the per-student advisory lock with the posting RPC's key scheme", () => {
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended(");
  });

  it("reverses the REMAINING headroom per payment, never the gross amount", () => {
    // A receipt already carrying a partial refund must reverse cleanly down to
    // zero rather than being refused (undo's behaviour) or over-reversed.
    expect(sql).toContain("select sum(a.amount_delta)");
    expect(sql).toContain("as available");
    expect(sql).toContain("continue when pay.available <= 0");
    expect(sql).not.toContain("-pay.amount");
  });

  it("stops rather than writing a no-op when nothing is left", () => {
    expect(sql).toMatch(/already fully reversed/);
  });

  it("stands aside for a refund that is already in flight", () => {
    expect(sql).toContain("status <> 'rejected'");
    expect(sql).toMatch(/refund request in progress/);
  });

  it("tags its rows so the correction-review queue can tell them apart", () => {
    // The queue filters out only 'refund_request:', so 'admin_reversal:' rows
    // fall through into it — a second pair of eyes on every one.
    expect(sql).toContain("'admin_reversal:' || p_receipt_id::text");
    expect(sql).toContain("'reversal'");

    const queue = read("lib/finance-controls/data.ts");
    expect(queue).toContain('(row.notes ?? "").startsWith("refund_request:")');
  });

  it("reports the counter concessions it did NOT undo", () => {
    // receipt_adjustments is append-only and has no negative-delta path, so a
    // quick discount or waiver survives the reversal. The caller has to be able
    // to say so instead of implying a cleaner reversal than actually happened.
    expect(sql).toContain("concession_amount");
    expect(sql).toContain("from public.receipt_adjustments");
  });

  it("never touches payments or receipts", () => {
    expect(sql).not.toMatch(/update\s+public\.(payments|receipts)/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.(payments|receipts)/i);
  });

  it("locks down execute grants", () => {
    expect(sql).toMatch(
      /revoke all on function public\.reverse_receipt_admin\(uuid, text\) from public/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.reverse_receipt_admin\(uuid, text\) to authenticated/,
    );
  });
});

describe("reverseReceiptAdmin data layer", () => {
  const source = read("lib/payments/data.ts");

  it("calls the RPC via the user-JWT client, never the service-role admin client", () => {
    const fn = source.slice(source.indexOf("export async function reverseReceiptAdmin"));
    const body = fn.slice(0, fn.indexOf("\nasync function"));
    expect(body).toContain('supabase.rpc("reverse_receipt_admin"');
    expect(body).toContain("await createClient()");
    expect(body).not.toContain("createAdminClient");
  });
});

describe("reverseReceiptAdminAction server action", () => {
  const source = read("app/protected/payments/actions.ts");
  const fn = source.slice(source.indexOf("export async function reverseReceiptAdminAction"));

  it("requires payments:reverse_any upstream of the RPC (defense-in-depth)", () => {
    expect(fn).toContain('requireStaffPermission("payments:reverse_any")');
    expect(fn).toContain("reverseReceiptAdmin({ receiptId, reason })");
  });

  it("refuses an empty reason before it reaches the database", () => {
    expect(fn).toContain("Choose why this receipt is being reversed.");
    expect(fn).toContain("Add a short note explaining the reversal.");
  });

  it("busts the session tag and drains the matview, in that order", () => {
    expect(fn).toContain("revalidateSessionFinance(");
    expect(fn).toContain("revalidateAfterPaymentPosting(");
    expect(fn).toContain('kind: "payment_reversed"');

    // Drain first: the reversal only ENQUEUES the refresh, so measuring or
    // rendering before it lands shows stale dues for up to two minutes.
    const drainAt = fn.indexOf("drainFinancialViewRefresh()");
    const publishAt = fn.indexOf("publishOfficeSyncEvent(");
    expect(drainAt).toBeGreaterThan(-1);
    expect(drainAt).toBeLessThan(publishAt);
  });
});

describe("the two correction paths never appear together", () => {
  const page = read("app/protected/receipts/[receiptId]/page.tsx");

  it("offers undo inside the window and the admin reversal only after it", () => {
    expect(page).toContain("isUndoWindowOpen(receipt.createdAt)");
    expect(page).toContain("&& undoWindowOpen");
    expect(page).toContain("&& !undoWindowOpen");
  });

  it("hides both once the receipt is already fully reversed", () => {
    expect(page).toContain("!receipt.isVoided && undoWindowOpen");
    expect(page).toContain("!receipt.isVoided && !undoWindowOpen");
  });
});

describe("the unguarded per-row reversal backdoor is closed", () => {
  it("drops reversal from the manual ledger adjustment form", () => {
    const client = read("components/ledger/ledger-client.tsx");
    const options = client.slice(
      client.indexOf("const adjustmentTypeOptions"),
      client.indexOf("];", client.indexOf("const adjustmentTypeOptions")),
    );
    expect(options).not.toContain('value: "reversal"');
  });

  it("and refuses it server-side with a pointer to the receipt-level path", () => {
    // A per-payment-row reversal could leave a receipt PARTLY reversed, which
    // isReceiptReversed then counts at face value on every board.
    const actions = read("app/protected/ledger/actions.ts");
    expect(actions).toContain('normalized === "reversal"');
    expect(actions).toMatch(/Reversing is done on the whole receipt/);
  });
});
