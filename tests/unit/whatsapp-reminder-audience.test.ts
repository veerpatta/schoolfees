import { describe, expect, it } from "vitest";

import { DEFAULT_REMINDER_FILTERS, loadReminderAudience } from "@/modules/whatsapp/domain/fee-reminders";
import {
  buildInstallmentCalendar,
  type InstallmentCalendar,
} from "@/modules/whatsapp/domain/installment-calendar";
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
  /** `v_workbook_installment_balances`, already filtered to late_fee_pending > 0. */
  installmentBalances?: unknown[];
  /** `defaulter_contacts`, newest first — the loader trusts that ordering. */
  contacts?: unknown[];
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
        // The applied-late-fee read scopes with `.gt("late_fee_pending", 0)`;
        // fixtures are written already-filtered, so this is a pass-through.
        gt: () => builder,
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
          } else if (state.table === "v_workbook_installment_balances") {
            data = tables.installmentBalances ?? [];
          } else if (state.table === "defaulter_contacts") {
            data = tables.contacts ?? [];
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

const load = (
  tables: Tables,
  overrides: Partial<typeof filters> = {},
  calendar?: InstallmentCalendar,
) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadReminderAudience(stubClient(tables) as any, { ...filters, ...overrides }, calendar);

/**
 * A calendar with installment 1 already passed and installment 2 six days out.
 *
 * Anchored to a fixed `today` rather than the real clock: these rules decide who
 * is messaged, and a test that passes in September and fails in November is
 * worse than no test.
 */
const CALENDAR_INST2_DUE_SOON = buildInstallmentCalendar({
  schedule: [{ dueDate: "2026-04-20" }, { dueDate: "2026-07-20" }],
  today: "2026-07-14",
});

/** A late-fee row as `v_workbook_installment_balances` returns it. */
function lateFeeRow(
  studentId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    student_id: studentId,
    installment_no: 1,
    due_date: "2026-04-20",
    pending_amount: 5000,
    late_fee_pending: 1000,
    late_fee_status: "pending",
    total_pending: 6000,
    is_carry_forward: false,
    ...overrides,
  };
}

/** A contact row as `defaulter_contacts` returns it, newest first. */
function contact(
  studentId: string,
  outcome: string,
  snoozeUntil: string | null,
  contactedAt = "2026-07-01T10:00:00Z",
) {
  return {
    student_id: studentId,
    outcome,
    snooze_until: snoozeUntil,
    contacted_at: contactedAt,
  };
}

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

    // The four calendar-driven notices are counted in the same pass and read
    // zero here: this fixture has no installment schedule, no applied late fee
    // and no contact history, which is exactly the shape of a session before any
    // due date has passed.
    expect(audience.counts).toEqual({
      fee_due: 1,
      balance: 1,
      prevyear: 1,
      upcoming: 0,
      upcoming_final: 0,
      late_fee_applied: 0,
      promise_lapsed: 0,
    });
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


describe("reminder audience — the calendar decides the installments", () => {
  it("puts a family on `upcoming` when the next installment is pending and nothing is behind", async () => {
    const audience = await load(
      {
        financials: [
          student("soon", { inst1_pending: 0, inst2_pending: 4000, total_paid: 5000 }),
        ],
      },
      { situation: "upcoming", installments: [2] },
      CALENDAR_INST2_DUE_SOON,
    );

    expect(audience.candidates.map((c) => c.studentId)).toEqual(["soon"]);
    // The figure is the NEXT installment alone, not the whole balance: the
    // courtesy notice asks for the bill that is about to fall due.
    expect(audience.candidates[0]!.dueAmount).toBe(4000);
  });

  it("keeps a family already overdue off the courtesy notice", async () => {
    // The whole point of "nothing overdue". A family late on installment 1 must
    // get the late-fee notice, not a polite note about installment 2 — sending
    // the courtesy one would tell them the school had not noticed.
    const audience = await load(
      {
        financials: [
          student("behind", { inst1_pending: 5000, inst2_pending: 4000, total_paid: 0 }),
        ],
      },
      { situation: "upcoming", installments: [2] },
      CALENDAR_INST2_DUE_SOON,
    );

    expect(audience.candidates).toHaveLength(0);
    expect(audience.counts.upcoming).toBe(0);
  });

  it("keeps a family off the courtesy notice while a late fee is on the account", async () => {
    // Fees cleared but the late fee still pending: the ledger says this family
    // is late, so the courtesy wording would be wrong even though every
    // installment reads zero.
    const audience = await load(
      {
        financials: [
          student("fee-owing", { inst1_pending: 0, inst2_pending: 4000, total_paid: 5000 }),
        ],
        installmentBalances: [lateFeeRow("fee-owing", { pending_amount: 0 })],
      },
      { situation: "upcoming", installments: [2] },
      CALENDAR_INST2_DUE_SOON,
    );

    expect(audience.counts.upcoming).toBe(0);
    expect(audience.counts.late_fee_applied).toBe(1);
  });

  it("holds `upcoming_final` shut until three days out", async () => {
    const tables = {
      financials: [student("soon", { inst1_pending: 0, inst2_pending: 4000, total_paid: 5000 })],
    };

    // Six days out: the courtesy notice is available, the firm one is not.
    const early = await load(tables, { situation: "upcoming", installments: [2] }, CALENDAR_INST2_DUE_SOON);
    expect(early.counts.upcoming).toBe(1);
    expect(early.counts.upcoming_final).toBe(0);

    // Two days out: both.
    const late = await load(
      tables,
      { situation: "upcoming_final", installments: [2] },
      buildInstallmentCalendar({
        schedule: [{ dueDate: "2026-04-20" }, { dueDate: "2026-07-20" }],
        today: "2026-07-18",
      }),
    );
    expect(late.counts.upcoming).toBe(1);
    expect(late.counts.upcoming_final).toBe(1);
    expect(late.candidates.map((c) => c.studentId)).toEqual(["soon"]);
  });

  it("reaches nobody on the calendar notices when the session has no schedule", async () => {
    // A valid state, not a crash: Fee Setup has not been published yet.
    const audience = await load(
      { financials: [student("a")] },
      { situation: "upcoming" },
    );
    expect(audience.counts.upcoming).toBe(0);
    expect(audience.candidates).toHaveLength(0);
  });
});

describe("reminder audience — late_fee_applied reads the ledger", () => {
  it("takes only families the view says are carrying a pending late fee", async () => {
    const audience = await load(
      {
        financials: [student("late"), student("clean")],
        installmentBalances: [lateFeeRow("late")],
      },
      { situation: "late_fee_applied" },
    );

    expect(audience.candidates.map((c) => c.studentId)).toEqual(["late"]);
    expect(audience.candidates[0]!.lateFeeApplied).toBe(1000);
  });

  it("quotes FEES in dueAmount, never fees plus the late fee", async () => {
    // `pending_amount` is fees only and `late_fee_pending` is the late fee. They
    // reach the message in separate slots because an unpaid late fee has never
    // made a family a defaulter here, and folding them together in the one place
    // a parent reads would be the first crack in that rule.
    const audience = await load(
      {
        financials: [student("late")],
        installmentBalances: [
          lateFeeRow("late", { pending_amount: 9125, late_fee_pending: 1000, total_pending: 10125 }),
        ],
      },
      { situation: "late_fee_applied" },
    );

    const candidate = audience.candidates[0]!;
    expect(candidate.dueAmount).toBe(9125);
    expect(candidate.lateFeeApplied).toBe(1000);
    expect(candidate.dueAmount).not.toBe(10125);
  });

  it("sums a family late on more than one installment", async () => {
    const audience = await load(
      {
        financials: [student("late")],
        installmentBalances: [
          lateFeeRow("late", { installment_no: 1, pending_amount: 5000, late_fee_pending: 1000 }),
          lateFeeRow("late", {
            installment_no: 2,
            due_date: "2026-07-20",
            pending_amount: 4000,
            late_fee_pending: 1000,
          }),
        ],
      },
      { situation: "late_fee_applied" },
    );

    const candidate = audience.candidates[0]!;
    expect(candidate.lateFeeApplied).toBe(2000);
    expect(candidate.dueAmount).toBe(9000);
    expect(candidate.lateFeeInstallments).toEqual([1, 2]);
  });

  it("ignores a carry-forward row, which never accrues a late fee", async () => {
    // Carry-forward rows are created with a rate of 0 deliberately. One showing
    // a pending late fee is a data fault, not an audience.
    const audience = await load(
      {
        financials: [student("cf")],
        installmentBalances: [lateFeeRow("cf", { is_carry_forward: true })],
      },
      { situation: "late_fee_applied" },
    );

    expect(audience.counts.late_fee_applied).toBe(0);
  });

  it("ignores a late fee on an installment the calendar says has not passed", async () => {
    // The message follows the date the parent can see. If the ledger and the
    // calendar disagree, saying nothing beats naming a date that has not gone.
    const audience = await load(
      {
        financials: [student("early")],
        installmentBalances: [lateFeeRow("early", { due_date: "2099-01-01" })],
      },
      { situation: "late_fee_applied" },
    );

    expect(audience.counts.late_fee_applied).toBe(0);
  });
});

describe("reminder audience — promises", () => {
  it("holds a family back from every other notice while their promise is live", async () => {
    const future = addDays(TODAY, 5);
    const audience = await load({
      financials: [student("promised"), student("other")],
      contacts: [contact("promised", "promised_pay", future)],
    });

    expect(audience.candidates.map((c) => c.studentId)).toEqual(["other"]);
    expect(audience.skipped.promiseOpen).toBe(1);

    // Named in the held-back list with the date, because a decision you cannot
    // see is a decision you cannot reverse.
    const held = audience.paused.find((family) => family.studentId === "promised");
    expect(held?.reason).toBe("promise_open");
    expect(held?.returnsOn).toBe(future);
  });

  it("still lets promise_lapsed through to a family with a live promise", async () => {
    // Not that it reaches them — a live promise has not lapsed — but the hold
    // must not be what excludes them, or the notice could never fire.
    const future = addDays(TODAY, 5);
    const audience = await load(
      {
        financials: [student("promised")],
        contacts: [contact("promised", "promised_pay", future)],
      },
      { situation: "promise_lapsed" },
    );

    expect(audience.skipped.promiseOpen).toBe(0);
    expect(audience.counts.promise_lapsed).toBe(0);
  });

  it("takes a family whose promised date has gone with money still owing", async () => {
    const past = addDays(TODAY, -3);
    const audience = await load(
      {
        financials: [student("lapsed")],
        contacts: [contact("lapsed", "promised_pay", past)],
      },
      { situation: "promise_lapsed" },
    );

    expect(audience.candidates.map((c) => c.studentId)).toEqual(["lapsed"]);
    expect(audience.candidates[0]!.promisedOn).toBe(past);
  });

  it("leaves out a family who paid after their promise lapsed", async () => {
    // The ledger is applied first, as always: nothing owing means the notice is
    // not about them, whatever the contact log says.
    const past = addDays(TODAY, -3);
    const audience = await load(
      {
        financials: [
          student("paid", { inst1_pending: 0, inst2_pending: 0, total_paid: 9000 }),
        ],
        contacts: [contact("paid", "promised_pay", past)],
      },
      { situation: "promise_lapsed" },
    );

    expect(audience.counts.promise_lapsed).toBe(0);
  });

  it("reads only the LATEST contact, so a later call ends an older promise", async () => {
    // `defaulter_contacts` is append-only and the loader is handed rows
    // newest-first. A "no answer" after a promise is the office recording that
    // the promise stopped holding, and it must not leave the family held back.
    const future = addDays(TODAY, 5);
    const audience = await load({
      financials: [student("moved-on")],
      contacts: [
        contact("moved-on", "no_answer", null, "2026-07-05T10:00:00Z"),
        contact("moved-on", "promised_pay", future, "2026-07-01T10:00:00Z"),
      ],
    });

    expect(audience.skipped.promiseOpen).toBe(0);
    expect(audience.candidates.map((c) => c.studentId)).toEqual(["moved-on"]);
  });
});
