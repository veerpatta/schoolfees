import { describe, expect, it } from "vitest";

import { DEFAULT_REMINDER_FILTERS, loadReminderAudience } from "@/modules/whatsapp/domain/fee-reminders";
import { addDays } from "@/modules/whatsapp/domain/reminder-cadence";

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
  carryForward?: unknown[];
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
        neq: () => builder,
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
          } else if (state.table === "v_student_carry_forward_balances") {
            data = tables.carryForward ?? [];
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

const filters = {
  ...DEFAULT_REMINDER_FILTERS,
  sessionLabel: SESSION,
  lastDate: "25-08-2026",
  lateFeeAmount: 1000,
};

const load = (tables: Tables, overrides: Partial<typeof filters> = {}) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadReminderAudience(stubClient(tables) as any, { ...filters, ...overrides });

/** A carry-forward row as v_student_carry_forward_balances returns it. */
function carried(studentId: string, remaining: number, source = "2025-26") {
  return {
    student_id: studentId,
    remaining_amount: remaining,
    source_session_label: source,
    status: "active",
  };
}

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

describe("reminder audience — which notice, which families", () => {
  // Nothing received: only the academic fee landed, so both installments stand.
  const owesEverything = student("owes", { total_paid: 500 });
  // Part paid: past the academic-fee threshold, still carrying installment 2.
  const partPaid = student("part", { total_paid: 9000, inst1_pending: 0, inst2_pending: 4000 });
  // Fully paid this year, but last year is still open.
  const prevOnly = student("prev", {
    total_paid: 20000,
    inst1_pending: 0,
    inst2_pending: 0,
  });

  const everyone = { financials: [owesEverything, partPaid, prevOnly] };
  const withCarryForward = { ...everyone, carryForward: [carried("prev", 20000)] };

  it("fee_due takes only the families who have paid nothing", async () => {
    const audience = await load(everyone, { situation: "fee_due" });

    expect(audience.candidates.map((c) => c.studentId)).toEqual(["owes"]);
    // 5000 + 4000 across the two selected installments.
    expect(audience.candidates[0]!.dueAmount).toBe(9000);
  });

  it("balance takes the families fee_due excludes, and never both", async () => {
    const audience = await load(everyone, { situation: "balance" });

    expect(audience.candidates.map((c) => c.studentId)).toEqual(["part"]);
    // What is still owed this session, and what has been received so far.
    expect(audience.candidates[0]!.dueAmount).toBe(4000);
    expect(audience.candidates[0]!.totalPaid).toBe(9000);

    // The two current-year notices partition the list — measured at zero
    // overlap on the live session, and it must stay that way.
    const feeDue = await load(everyone, { situation: "fee_due" });
    const overlap = feeDue.candidates
      .map((c) => c.studentId)
      .filter((id) => audience.candidates.some((c) => c.studentId === id));
    expect(overlap).toEqual([]);
  });

  it("prevyear quotes what is LEFT of last session, not the original", async () => {
    const audience = await load(withCarryForward, { situation: "prevyear" });

    expect(audience.candidates.map((c) => c.studentId)).toEqual(["prev"]);
    expect(audience.candidates[0]!.dueAmount).toBe(20000);
    expect(audience.candidates[0]!.prevSessionLabel).toBe("2025-26");
  });

  it("drops a family whose carry-forward has been cleared", async () => {
    const audience = await load(
      { ...everyone, carryForward: [carried("prev", 0)] },
      { situation: "prevyear" },
    );

    expect(audience.candidates).toHaveLength(0);
  });

  it("counts all three notices in one pass, whichever is selected", async () => {
    const audience = await load(withCarryForward, { situation: "fee_due" });

    expect(audience.counts).toEqual({ fee_due: 1, balance: 1, prevyear: 1 });
    // Only the selected one produces candidates.
    expect(audience.candidates).toHaveLength(1);
  });

  it("lets one family qualify for a current-year notice AND prev-year", async () => {
    // The 47-family case the send-log index was widened for.
    const both = {
      financials: [owesEverything],
      carryForward: [carried("owes", 12000)],
    };

    expect((await load(both, { situation: "fee_due" })).candidates).toHaveLength(1);
    expect((await load(both, { situation: "prevyear" })).candidates).toHaveLength(1);
  });

  it("keeps the installment filter honest on the balance notice", async () => {
    // Measured live: 87 of the 258 families on the balance notice were fully
    // paid up on installments 1 and 2 and owed only 3 and 4 — money not due
    // until October and January. The filter said "installments pending: 1 and 2"
    // and did nothing, so the office was chasing families who owed nothing yet.
    const owesOnTwo = student("owes-2", { total_paid: 9000, inst1_pending: 0, inst2_pending: 4000 });
    const notDueYet = student("later", {
      total_paid: 9000,
      inst1_pending: 0,
      inst2_pending: 0,
      inst3_pending: 6000,
      inst4_pending: 6000,
    });
    const tables = { financials: [owesOnTwo, notDueYet] };

    const overdue = await load(tables, { situation: "balance", installments: [1, 2] });
    expect(overdue.candidates.map((c) => c.studentId)).toEqual(["owes-2"]);

    // Widen the filter and the second family comes back — the control works in
    // both directions, it is not a hardcoded "1 and 2".
    const everything = await load(tables, { situation: "balance", installments: [1, 2, 3] });
    expect(everything.candidates.map((c) => c.studentId).sort()).toEqual(["later", "owes-2"]);

    // The AMOUNT is still the whole balance. The filter chooses who to chase;
    // the approved body says "Balance due", which means all of it.
    expect(everything.candidates.find((c) => c.studentId === "later")!.dueAmount).toBe(12000);
  });

  it("asks for ANY selected installment on balance, and ALL of them on fee_due", async () => {
    // Different questions, deliberately. On fee_due nothing has been received,
    // so "installments 1 and 2 are pending" means both. On balance the family
    // HAS paid something, and someone who cleared 1 but still owes 2 is exactly
    // who the notice is for — `every` would drop them.
    const clearedOne = student("half", { total_paid: 9000, inst1_pending: 0, inst2_pending: 4000 });
    const paidNothingOnOne = student("none-1", { total_paid: 0, inst1_pending: 0, inst2_pending: 4000 });

    const balance = await load({ financials: [clearedOne] }, { situation: "balance" });
    expect(balance.candidates.map((c) => c.studentId)).toEqual(["half"]);

    const feeDue = await load({ financials: [paidNothingOnOne] }, { situation: "fee_due" });
    expect(feeDue.candidates).toHaveLength(0);
  });

  it("leaves the previous-session notice alone — installments are not its business", async () => {
    // That balance is last year's. It has no installments, no due date and no
    // late fee, so the control is hidden on screen and ignored here.
    const tables = {
      financials: [student("prev-only", { total_paid: 20000, inst1_pending: 0, inst2_pending: 0 })],
      carryForward: [carried("prev-only", 8000)],
    };

    for (const installments of [[1, 2], [3], [1, 2, 3]]) {
      const audience = await load(tables, { situation: "prevyear", installments });
      expect(audience.candidates.map((c) => c.studentId)).toEqual(["prev-only"]);
      expect(audience.candidates[0]!.dueAmount).toBe(8000);
    }
  });

  it("never lets last year's balance into a current-year figure", async () => {
    // The ₹20,000 trap: outstanding_amount folds the carry-forward in, so a
    // fee_due notice built from it would bill last year twice.
    const audience = await load(
      { financials: [owesEverything], carryForward: [carried("owes", 20000)] },
      { situation: "fee_due" },
    );

    expect(audience.candidates[0]!.dueAmount).toBe(9000);
    expect(audience.candidates[0]!.prevYearBalance).toBe(20000);
  });
});
