import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A campaign saves the RULE, never the audience, and a run groups sends without
 * ever loosening the one-a-day guard. Both are properties of SQL and of one
 * action, and both are cheap to break by accident.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const MIGRATION = "supabase/migrations/20260822090000_whatsapp_campaigns_and_runs.sql";
/**
 * The run executor moved out of the action in Phase 3.
 *
 * There are two ways to start a run now — an admin pressing Send, and the
 * scheduled cron — and `executeReminderRun` is the single path both take. These
 * invariants are about the RUN, so they follow it: asserting them against the
 * action would now pass while proving nothing, because the action no longer
 * opens a run at all.
 */
const RUN_SENDER = "src/modules/whatsapp/data/run-sender.ts";
const STORE = "src/modules/whatsapp/data/campaign-store.ts";

describe("the run grouping key", () => {
  it("never joins the one-send-per-day unique index", () => {
    // THE money invariant. The unique index on
    // (student_id, session_label, sent_on, campaign_name) is what stops a family
    // being sent the same notice twice in one day. Adding run_id to it would let
    // a second run that same day message every one of them again.
    const sql = read(MIGRATION);

    const uniqueIndexes = sql
      .split("\n")
      .filter((line) => /create unique index/i.test(line));
    for (const line of uniqueIndexes) {
      expect(line).not.toMatch(/run_id/);
    }
    // And the migration must not redefine the guard at all.
    expect(sql).not.toMatch(/drop index[^\n]*student_day_campaign/i);
  });

  it("adds run_id as nullable, so the sends that predate runs survive", () => {
    const sql = read(MIGRATION);
    expect(sql).toMatch(/add column if not exists run_id uuid/);
    expect(sql).not.toMatch(/run_id uuid not null/);
  });

  it("never cascades a campaign delete into the send record", () => {
    // A run is evidence that parents were messaged. Deleting the campaign that
    // produced it must not erase that, which is why campaign_id is set null and
    // why the UI archives rather than deletes.
    const sql = read(MIGRATION);
    const campaignFk = sql
      .split("\n")
      .find((line) => line.includes("references public.whatsapp_campaigns(id)"));
    expect(campaignFk).toBeDefined();
    expect(campaignFk).toContain("on delete set null");
  });
});

describe("the outcome view", () => {
  it("applies both collection exclusions", () => {
    // The same two the dashboard applies. Without them a discount close-out and
    // a reversed receipt both read as a family responding to a reminder.
    const sql = read(MIGRATION);
    expect(sql).toContain("payment_mode <> 'discount'");
    expect(sql).toContain("v_receipt_reversal_totals");
  });

  it("counts money from receipts, not from the matview", () => {
    // `v_workbook_student_financials.last_payment_date` is one date, not a sum
    // since a moment, and it lags by up to two minutes.
    const sql = read(MIGRATION);
    expect(sql).toContain("from public.receipts");
    expect(sql).not.toContain("v_workbook_student_financials");
  });
});

describe("the send action", () => {
  it("opens the run before the first message", () => {
    // So a crash halfway leaves a record of what was attempted rather than
    // nothing at all.
    const source = read(RUN_SENDER);
    const openIndex = source.indexOf("openRun(");
    const sendIndex = source.indexOf("sendAisensyCampaignMessage(");
    expect(openIndex).toBeGreaterThan(-1);
    expect(sendIndex).toBeGreaterThan(-1);
    expect(openIndex).toBeLessThan(sendIndex);
  });

  it("stamps run_id on the claim, not after the provider call", () => {
    // The claim insert is the only write that happens before AiSensy is called.
    // Stamping later would lose the grouping for any send that failed.
    const source = read(RUN_SENDER);
    const claim = source.slice(
      source.indexOf('.from("whatsapp_reminder_sends")'),
      source.indexOf("sendAisensyCampaignMessage("),
    );
    expect(claim).toContain("run_id: runId");
  });

  it("records the phrase that went out, not the amount it came from", () => {
    // The campaign is editable; what a parent read is not.
    const source = read(RUN_SENDER);
    expect(source).toMatch(/lateFeePhrase: lateFeePhrase\(/);
  });

  it("treats run bookkeeping as best-effort", () => {
    // A bookkeeping failure must never stop the office sending, and must never
    // be reported as a failed send.
    const store = read(STORE);
    const openRun = store.slice(store.indexOf("export async function openRun"), store.indexOf("export async function closeRun"));
    expect(openRun).toContain("catch");
    expect(openRun).toContain("return null");
  });
});

describe("a saved campaign", () => {
  it("stores no audience — only the rule that derives one", () => {
    // The whole reason "families who paid drop off" needs nothing built.
    const store = read(STORE);
    const filters = store.slice(
      store.indexOf("export type SavedCampaignFilters"),
      store.indexOf("/** One press of Send"),
    );
    for (const banned of ["studentIds", "recipients", "candidates", "audience"]) {
      expect(filters).not.toContain(banned);
    }
    expect(filters).toContain("installments");
  });
});
