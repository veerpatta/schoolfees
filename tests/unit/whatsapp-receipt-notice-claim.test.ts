import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const NOTICE = read("src/modules/whatsapp/data/receipt-notice.ts");
const AISENSY = read("src/modules/whatsapp/data/aisensy.ts");
const MIGRATION = read(
  "supabase/migrations/20260912165421_a_second_receipt_deserves_its_own_notice.sql",
);
const PAYMENTS_ACTION = read("src/app/protected/payments/actions.ts");

/**
 * A second receipt on the same day is a second receipt.
 *
 * `receipt-notice.ts` inserted its claim row without `sent_on`, so the column
 * defaulted to the IST date and collided with the DAY index — which was unique
 * on (student_id, session_label, sent_on, campaign_name, destination_role) and
 * NOT partial. A family paying twice in one day got one notice, and the 23505
 * was reported as "already sent for this receipt", which was untrue.
 *
 * `20260903172053_whatsapp_receipt_notices.sql:24-27` says the opposite is
 * intended. Invisible in production only because the feature is switched off.
 */
describe("a receipt notice claims on the receipt, not on the day", () => {
  it("states sent_on and notice_kind rather than leaning on a column default", () => {
    expect(NOTICE).toContain("sent_on: istTodayIso()");
    expect(NOTICE).toContain('notice_kind: "receipt"');
  });

  it("makes the day index partial so receipt-shaped notices skip it", () => {
    // The day index still guards reminders and covered_by_sibling rows, which
    // carry receipt_id is null. Receipt-shaped notices are guarded by the
    // receipt index alone — which is what the 2026-09-03 comment always meant.
    expect(MIGRATION).toMatch(
      /create unique index[\s\S]*whatsapp_reminder_sends_reminder_day_idx[\s\S]*where receipt_id is null/,
    );
    expect(MIGRATION).toContain(
      "drop index if exists public.whatsapp_reminder_sends_student_day_campaign_role_idx",
    );
  });

  it("re-keys the receipt index so a reversal can share the receipt", () => {
    // One receipt may legitimately produce one "payment received" and later one
    // "payment reversed". On the old (receipt_id) key the second collided with
    // the first and was reported as a duplicate.
    expect(MIGRATION).toMatch(
      /create unique index[\s\S]*whatsapp_reminder_sends_receipt_kind_idx[\s\S]*\(receipt_id, notice_kind\)/,
    );
    expect(MIGRATION).toContain("drop index if exists public.whatsapp_reminder_sends_receipt_idx");
  });

  it("keeps notice_kind NOT NULL, because NULLS DISTINCT would void the guard", () => {
    // A nullable notice_kind lets Postgres treat two rows with the same
    // receipt_id and a null kind as different — silently deleting the "one
    // notice per receipt, ever" guarantee the index exists to provide.
    expect(MIGRATION).toContain("add column if not exists notice_kind text not null default");
  });

  it("creates each new index before dropping the one it replaces", () => {
    // Dropping first leaves a window in which nothing stops a duplicate.
    const createReceipt = MIGRATION.indexOf("whatsapp_reminder_sends_receipt_kind_idx");
    const dropReceipt = MIGRATION.indexOf(
      "drop index if exists public.whatsapp_reminder_sends_receipt_idx",
    );
    const createDay = MIGRATION.indexOf("whatsapp_reminder_sends_reminder_day_idx");
    const dropDay = MIGRATION.indexOf(
      "drop index if exists public.whatsapp_reminder_sends_student_day_campaign_role_idx",
    );
    expect(createReceipt).toBeGreaterThan(-1);
    expect(createReceipt).toBeLessThan(dropReceipt);
    expect(createDay).toBeGreaterThan(-1);
    expect(createDay).toBeLessThan(dropDay);
  });

  it("backfills before building the index it feeds", () => {
    const backfill = MIGRATION.indexOf("set notice_kind = 'receipt'");
    const index = MIGRATION.indexOf("whatsapp_reminder_sends_receipt_kind_idx");
    expect(backfill).toBeGreaterThan(-1);
    expect(backfill).toBeLessThan(index);
  });
});

describe("a document header never becomes a body slot", () => {
  it("spreads media only when present, so body-only sends are unchanged", () => {
    // All 34 existing templates must keep sending exactly the six keys they
    // always did. JSON.stringify drops an undefined value either way — the
    // conditional spread is what makes that visible to a reviewer.
    expect(AISENSY).toContain("...(args.media");
    expect(AISENSY).not.toMatch(/media:\s*args\.media,/);
  });

  it("keeps media off templateParams", () => {
    // AiSensy enforces the template's parameter count exactly. A header is a
    // separate component with its own media parameter; adding filename as a
    // body slot is the mistake this pins against.
    const body = AISENSY.slice(AISENSY.indexOf("body: JSON.stringify"));
    expect(body).toContain("templateParams: args.templateParams");
    expect(body).not.toMatch(/templateParams:\s*\[[\s\S]*args\.media/);
  });
});

describe("the receipt notice is off the cashier's critical path", () => {
  it("sends from inside after(), and after the matview drain", () => {
    // A bare await in the action body runs BEFORE after(), so the balance
    // quoted could predate the payment — and it put a provider round trip, soon
    // a PDF render, in front of the cashier.
    const afterBlock = PAYMENTS_ACTION.slice(
      PAYMENTS_ACTION.indexOf("after(async () =>"),
      PAYMENTS_ACTION.indexOf("return {", PAYMENTS_ACTION.indexOf("after(async () =>")),
    );
    expect(afterBlock).toContain("drainFinancialViewRefresh()");
    expect(afterBlock).toContain("sendReceiptNotice({");
    expect(afterBlock.indexOf("drainFinancialViewRefresh()")).toBeLessThan(
      afterBlock.indexOf("sendReceiptNotice({"),
    );
  });

  it("still swallows every failure, so a WhatsApp hiccup cannot fail a posting", () => {
    expect(PAYMENTS_ACTION).toMatch(
      /try \{\s*await sendReceiptNotice\([\s\S]*?\} catch \(caught\) \{[\s\S]*?console\.warn/,
    );
  });

  it("declares a maxDuration, because after() work still runs in this route", () => {
    expect(read("src/app/protected/payments/page.tsx")).toContain("export const maxDuration = 60");
  });
});
