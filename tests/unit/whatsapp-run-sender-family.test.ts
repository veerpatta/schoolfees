import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReminderCandidate, ReminderFilters } from "@/modules/whatsapp/domain/fee-reminders";

/**
 * What `executeReminderRun` actually posts, now that the family templates are
 * Live (2026-09-04).
 *
 * The pure choice — family template or per-child — is pinned in
 * tests/unit/whatsapp-family-notice.test.ts. This runs the executor itself
 * against a stub client and a mocked provider, because the thing that costs
 * money is the ROW it claims and the PARAMS it posts, and only the executor
 * builds those.
 */

const send = vi.fn();
vi.mock("@/modules/whatsapp/data/aisensy", () => ({
  sendAisensyCampaignMessage: (args: unknown) => send(args),
}));
vi.mock("@/modules/whatsapp/data/campaign-store", () => ({
  openRun: async () => "run-1",
  closeRun: async () => undefined,
}));
vi.mock("@/modules/activity/data/events", () => ({
  recordActivity: async () => undefined,
}));

import { executeReminderRun } from "@/modules/whatsapp/data/run-sender";

type Insert = { table: string; rows: Record<string, unknown>[] };

/** Captures every insert; answers claims with an id and everything else with nothing. */
function stubClient(inserts: Insert[]) {
  return {
    from(table: string) {
      const builder = {
        insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
          const list = Array.isArray(rows) ? rows : [rows];
          inserts.push({ table, rows: list });
          const chain = {
            select: () => chain,
            single: async () => ({ data: { id: `${table}-${inserts.length}` }, error: null }),
            then: (resolve: (value: { error: null }) => unknown) => resolve({ error: null }),
          };
          return chain;
        },
        update: () => ({ eq: async () => ({ error: null }) }),
      };
      return builder;
    },
  };
}

function candidate(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    studentId: "s1",
    admissionNo: "TEST-001",
    studentName: "Aaradhya Gurjar",
    parentName: "Ramesh Lal Gurjar",
    studentClass: "Class 2",
    classId: null,
    destination: "+917976199548",
    usedMotherPhone: false,
    dueAmount: 13250,
    totalPaid: 0,
    balanceDue: 13250,
    prevYearBalance: 0,
    prevSessionLabel: null,
    sentToday: null,
    cadence: "weekly",
    snoozedUntil: null,
    lastSentOn: null,
    lateFeeApplied: 0,
    lateFeeFeesPending: 0,
    lateFeeInstallments: [],
    promisedOn: null,
    preferredLanguage: null,
    secondaryDestination: null,
    sentCount: 0,
    ...overrides,
  };
}

function filters(overrides: Partial<ReminderFilters> = {}): ReminderFilters {
  return {
    sessionLabel: "TEST-2026-27",
    maxTotalPaid: 0,
    installments: [1, 2],
    minDueAmount: 1,
    classId: null,
    includeRte: false,
    situation: "fee_due",
    language: "hi",
    lastDate: "20-10-2026",
    lateFeeAmount: 1000,
    lateFeeBasis: "per_installment",
    preDueWindowDays: 10,
    ...overrides,
  };
}

async function run(
  candidates: ReminderCandidate[],
  overrides: Partial<ReminderFilters> = {},
  oneMessagePerFamily?: boolean,
) {
  const inserts: Insert[] = [];
  const outcome = await executeReminderRun({
    supabase: stubClient(inserts),
    candidates,
    filters: filters(overrides),
    sessionLabel: "TEST-2026-27",
    today: "2026-09-04",
    lastDateIso: "2026-10-20",
    campaignName: "vpps_app_fee_due_hi_v2",
    campaignId: null,
    staffId: "staff-1",
    source: "manual",
    scheduledFor: null,
    oneMessagePerFamily,
  });
  const sendRows = inserts
    .filter((entry) => entry.table === "whatsapp_reminder_sends")
    .flatMap((entry) => entry.rows);
  return { outcome, sendRows };
}

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ ok: true, status: 200, messageId: "msg-1" });
});

describe("executeReminderRun with the family templates Live", () => {
  it("sends a two-child phone ONE family message, and logs both children under its name", async () => {
    const { outcome, sendRows } = await run([
      candidate({ studentId: "a", dueAmount: 13250 }),
      candidate({
        studentId: "b",
        admissionNo: "TEST-002",
        studentName: "Bhavya Gurjar",
        studentClass: "Class 5",
        dueAmount: 9125,
      }),
    ]);

    expect(send).toHaveBeenCalledTimes(1);
    const posted = send.mock.calls[0]![0] as { campaignName: string; templateParams: string[] };
    expect(posted.campaignName).toBe("vpps_app_family_fee_due_hi_v3");
    expect(posted.templateParams).toEqual([
      "Ramesh Lal Gurjar",
      "Aaradhya Gurjar (2), Bhavya Gurjar (5)",
      "22,375",
      "20-10-2026",
      "रु. 1,000 प्रति किश्त",
    ]);

    // The claim quotes what the MESSAGE quotes — the family's total — under the
    // family campaign's name, so the bill reconciles per campaign.
    const claim = sendRows.find((row) => row.status === "pending")!;
    expect(claim.student_id).toBe("a");
    expect(claim.campaign_name).toBe("vpps_app_family_fee_due_hi_v3");
    expect(claim.due_amount).toBe(22375);
    expect(claim.template_params).toHaveLength(5);
    expect(claim.run_id).toBe("run-1");

    // The sibling is covered under the SAME name, with their own share.
    const covered = sendRows.find((row) => row.status === "covered_by_sibling")!;
    expect(covered.student_id).toBe("b");
    expect(covered.campaign_name).toBe("vpps_app_family_fee_due_hi_v3");
    expect(covered.due_amount).toBe(9125);
    expect(covered.provider_message_id).toBe("msg-1");

    expect(outcome.sent).toBe(1);
    expect(outcome.moneyQuoted).toBe(22375);
    expect(outcome.messagesAttempted).toBe(1);
  });

  it("sends a one-child phone the per-child notice with seven slots", async () => {
    const { sendRows } = await run([candidate()]);

    expect(send).toHaveBeenCalledTimes(1);
    const posted = send.mock.calls[0]![0] as { campaignName: string; templateParams: string[] };
    expect(posted.campaignName).toBe("vpps_app_fee_due_hi_v2");
    expect(posted.templateParams).toHaveLength(7);
    expect(sendRows[0]!.due_amount).toBe(13250);
  });

  it("keeps siblings on the per-child notice where the family template cannot be filled", async () => {
    // `late_fee_applied` has a family template Meta approved, but its date and
    // total slots have no clean source in a run — domain/family-notice.ts.
    await run(
      [
        candidate({ studentId: "a", lateFeeApplied: 1000, lateFeeInstallments: [2] }),
        candidate({ studentId: "b", lateFeeApplied: 1000, lateFeeInstallments: [2] }),
      ],
      { situation: "late_fee_applied", language: "en" },
    );

    expect(send).toHaveBeenCalledTimes(1);
    const posted = send.mock.calls[0]![0] as { campaignName: string; templateParams: string[] };
    expect(posted.campaignName).toBe("vpps_app_late_fee_applied_en_v3");
    // And the context line names the installment carrying the fee, not [1, 2].
    expect(posted.templateParams[3]).toBe("Installment 2");
  });

  it("follows the family's language, not the run's", async () => {
    await run([
      candidate({ studentId: "a", preferredLanguage: "en" }),
      candidate({ studentId: "b" }),
    ]);
    const posted = send.mock.calls[0]![0] as { campaignName: string; templateParams: string[] };
    expect(posted.campaignName).toBe("vpps_app_family_fee_due_en_v3");
    expect(posted.templateParams[4]).toBe("Rs. 1,000 per installment");
  });

  it("sends every child their own message when the office switches grouping off", async () => {
    // `app_settings.whatsapp_one_message_per_family = 'false'` — the way every
    // run before 2026-09-05 went. Two siblings on one phone: two per-child
    // messages, two claims, nobody `covered_by_sibling`.
    const { outcome, sendRows } = await run(
      [
        candidate({ studentId: "a", dueAmount: 13250 }),
        candidate({ studentId: "b", studentName: "Bhavya Gurjar", dueAmount: 9125 }),
      ],
      {},
      false,
    );

    expect(send).toHaveBeenCalledTimes(2);
    for (const call of send.mock.calls) {
      const posted = call[0] as { campaignName: string; templateParams: string[] };
      expect(posted.campaignName).toBe("vpps_app_fee_due_hi_v2");
      expect(posted.templateParams).toHaveLength(7);
    }
    expect(sendRows.filter((row) => row.status === "covered_by_sibling")).toHaveLength(0);
    expect(sendRows.map((row) => row.due_amount).sort()).toEqual([13250, 9125].sort());
    expect(outcome.sent).toBe(2);
    expect(outcome.moneyQuoted).toBe(22375);
  });

  it("never re-messages a family already logged today, under either name", async () => {
    // The unique index only knows one campaign name at a time. A sibling who
    // paid at noon turns a two-child family into a one-child one, and the
    // per-child name would claim cleanly for a parent who read the family
    // message this morning. `sentToday` is read against both names; this is
    // where it is honoured.
    const { outcome } = await run([
      candidate({ studentId: "a", sentToday: { status: "sent", at: "2026-09-04T04:30:00Z" } }),
    ]);

    expect(send).not.toHaveBeenCalled();
    expect(outcome.alreadySentToday).toBe(1);
    expect(outcome.sent).toBe(0);
    expect(outcome.messagesAttempted).toBe(0);
  });
});
