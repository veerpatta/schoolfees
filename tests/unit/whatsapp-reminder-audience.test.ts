import { describe, expect, it } from "vitest";

import { DEFAULT_REMINDER_FILTERS, loadReminderAudience } from "@/lib/whatsapp/fee-reminders";
import { addDays } from "@/lib/whatsapp/reminder-cadence";

/**
 * Who actually gets messaged.
 *
 * `loadReminderAudience` takes its Supabase client as an argument, so the whole
 * decision — ledger first, then the office's own cadence — is testable with a
 * stub and no database. These rules decide whether a real parent is nagged
 * daily or never hears from us, and both failures look fine on screen.
 */

const SESSION = "TEST-2026-27";
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

type Tables = {
  financials?: unknown[];
  flags?: unknown[];
  sends?: unknown[];
};

/**
 * A chainable stand-in for the query builder. Every filter method returns the
 * same object; awaiting it resolves to the rows for whichever table `from()`
 * named. `whatsapp_reminder_sends` is read twice with different filters, so it
 * keys off whether `.order()` was called (the last-sent lookup) or not
 * (today's claims).
 */
function stubClient(tables: Tables) {
  return {
    from(table: string) {
      const state = { table, ordered: false, eqs: [] as Array<[string, unknown]> };
      const builder: Record<string, unknown> = {
        select: () => builder,
        lte: () => builder,
        eq: (column: string, value: unknown) => {
          state.eqs.push([column, value]);
          return builder;
        },
        order: () => {
          state.ordered = true;
          return builder;
        },
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          let data: unknown[] = [];
          if (state.table === "v_workbook_student_financials") data = tables.financials ?? [];
          else if (state.table === "student_collection_flags") {
            const wantsNoCall = state.eqs.some(([column]) => column === "no_call");
            data = wantsNoCall ? [] : (tables.flags ?? []);
          } else if (state.table === "whatsapp_reminder_sends") {
            data = state.ordered ? (tables.sends ?? []) : [];
          }
          return resolve({ data, error: null });
        },
      };
      return builder;
    },
  };
}

function student(id: string, overrides: Record<string, unknown> = {}) {
  return {
    student_id: id,
    admission_no: `TEST-${id}`,
    student_name: `Child ${id}`,
    father_name: `Parent ${id}`,
    father_phone: "9352205884",
    mother_phone: null,
    class_id: "class-1",
    class_label: "Class 1",
    record_status: "active",
    total_paid: 0,
    inst1_pending: 5000,
    inst2_pending: 4000,
    inst3_pending: 0,
    inst4_pending: 0,
    ...overrides,
  };
}

const filters = { ...DEFAULT_REMINDER_FILTERS, sessionLabel: SESSION };

const load = (tables: Tables) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadReminderAudience(stubClient(tables) as any, filters);

describe("reminder audience — the office's own settings", () => {
  it("puts everyone on every_run when no flag exists", async () => {
    const audience = await load({ financials: [student("a"), student("b")] });

    expect(audience.candidates.map((c) => c.studentId)).toEqual(["a", "b"]);
    expect(audience.paused).toHaveLength(0);
    expect(audience.candidates[0]!.cadence).toBe("every_run");
  });

  it("drops a `never` family and names them as paused", async () => {
    const audience = await load({
      financials: [student("a"), student("b")],
      flags: [{ student_id: "a", whatsapp_cadence: "never", whatsapp_snoozed_until: null }],
    });

    expect(audience.candidates.map((c) => c.studentId)).toEqual(["b"]);
    expect(audience.skipped.whatsappNever).toBe(1);
    expect(audience.paused[0]).toMatchObject({ studentId: "a", reason: "never", returnsOn: null });
  });

  it("holds a snoozed family until the date and returns them after", async () => {
    const future = addDays(TODAY, 3);
    const held = await load({
      financials: [student("a")],
      flags: [{ student_id: "a", whatsapp_cadence: "every_run", whatsapp_snoozed_until: future }],
    });
    expect(held.candidates).toHaveLength(0);
    expect(held.paused[0]).toMatchObject({ reason: "snoozed", returnsOn: future });

    const expired = await load({
      financials: [student("a")],
      flags: [
        {
          student_id: "a",
          whatsapp_cadence: "every_run",
          whatsapp_snoozed_until: addDays(TODAY, -1),
        },
      ],
    });
    expect(expired.candidates).toHaveLength(1);
    expect(expired.paused).toHaveLength(0);
  });

  it("keeps a family snoozed on the day the snooze expires, not before", async () => {
    const audience = await load({
      financials: [student("a")],
      flags: [{ student_id: "a", whatsapp_cadence: "every_run", whatsapp_snoozed_until: TODAY }],
    });

    // `snoozed_until = today` still means today, so they are held.
    expect(audience.candidates).toHaveLength(0);
  });

  it("measures a cadence gap from the last delivered send", async () => {
    const sentOn = addDays(TODAY, -3);

    const tooSoon = await load({
      financials: [student("a")],
      flags: [{ student_id: "a", whatsapp_cadence: "weekly", whatsapp_snoozed_until: null }],
      sends: [{ student_id: "a", sent_on: sentOn }],
    });
    expect(tooSoon.candidates).toHaveLength(0);
    expect(tooSoon.skipped.whatsappTooSoon).toBe(1);
    expect(tooSoon.paused[0]).toMatchObject({ reason: "too_soon", returnsOn: addDays(sentOn, 7) });

    const longEnough = await load({
      financials: [student("a")],
      flags: [{ student_id: "a", whatsapp_cadence: "weekly", whatsapp_snoozed_until: null }],
      sends: [{ student_id: "a", sent_on: addDays(TODAY, -8) }],
    });
    expect(longEnough.candidates).toHaveLength(1);
  });

  it("lets a weekly family through when nothing was ever sent", async () => {
    const audience = await load({
      financials: [student("a")],
      flags: [{ student_id: "a", whatsapp_cadence: "weekly", whatsapp_snoozed_until: null }],
      sends: [],
    });

    expect(audience.candidates).toHaveLength(1);
  });

  it("never holds back an every_run family, however recently they were messaged", async () => {
    const audience = await load({
      financials: [student("a")],
      flags: [{ student_id: "a", whatsapp_cadence: "every_run", whatsapp_snoozed_until: null }],
      sends: [{ student_id: "a", sent_on: TODAY }],
    });

    expect(audience.candidates).toHaveLength(1);
    expect(audience.skipped.whatsappTooSoon).toBe(0);
  });

  it("applies the ledger before the cadence, so a paid family is simply absent", async () => {
    // Nothing pending on installment 2 — they are out because of the ledger,
    // and must not be reported as "held back by your settings".
    const audience = await load({
      financials: [student("a", { inst2_pending: 0 })],
      flags: [{ student_id: "a", whatsapp_cadence: "never", whatsapp_snoozed_until: null }],
    });

    expect(audience.candidates).toHaveLength(0);
    expect(audience.paused).toHaveLength(0);
    expect(audience.skipped.installmentsClear).toBe(1);
    expect(audience.skipped.whatsappNever).toBe(0);
  });
});
