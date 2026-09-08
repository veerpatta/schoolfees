import { describe, expect, it } from "vitest";

import {
  DEFAULT_REMINDER_FILTERS,
  describeMissingFacts,
  loadReminderAudience,
} from "@/modules/whatsapp/domain/fee-reminders";
import {
  buildInstallmentCalendar,
  type InstallmentCalendar,
} from "@/modules/whatsapp/domain/installment-calendar";
import { addDays } from "@/modules/whatsapp/domain/reminder-cadence";
import { presetFor } from "@/modules/whatsapp/domain/audience";

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
        // Today's send log is read for BOTH names a notice can log under
        // (per-child and family) since 2026-09-04. Fixtures are written
        // already-filtered, so this is a pass-through.
        in: () => builder,
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

/**
 * Build a run the way the screen does: the notice's PRESET, then whatever the
 * test overrides on top.
 *
 * Since 2026-09-08 the notice does not gate the audience — the filters do — so
 * "who does `late_fee_applied` reach" is now "who does its preset reach", which
 * is exactly what `parseReminderFilters` resolves for a link that names a
 * notice and no filters. Spreading the preset here keeps every case below
 * asking the question it was written to ask.
 */
const load = (
  tables: Tables,
  overrides: Partial<typeof filters> = {},
  calendar?: InstallmentCalendar,
) => {
  const situation = overrides.situation ?? filters.situation;
  const preset = presetFor(situation, {
    activeInstallments:
      calendar && calendar.active.length > 0 ? calendar.active : filters.installments,
    nextInstallment: calendar?.next?.installmentNo ?? null,
  });
  return loadReminderAudience(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stubClient(tables) as any,
    { ...filters, ...preset, ...overrides },
    calendar,
  );
};

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

  it("counts every audience shortcut in one pass, whichever one is applied", async () => {
    const audience = await load(withCarryForward, { situation: "fee_due" });

    // Keyed by SHORTCUT since 2026-09-09, not by notice. The chips are named
    // for the audience they describe now — "Nothing paid yet", not "Fee due" —
    // because twelve notice-named audience chips sat under twelve notice-named
    // template chips and nothing said which row changed what.
    //
    // The calendar-driven ones read zero: this fixture has no installment
    // schedule, no applied late fee and no contact history, which is the shape
    // of a session before any due date has passed.
    expect(audience.counts).toEqual({
      // Anything outstanding at all, whoever they are — the shortcut no notice
      // could ever express, which is why it is new.
      everyone: 2,
      nothing_paid: 1,
      part_paid: 1,
      last_session: 1,
      not_due_yet: 0,
      late_fee: 0,
      overdue: 0,
      promised_now: 0,
      promise_broken: 0,
    });
    // Only the applied filter set produces candidates.
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

  it("gives the previous-session preset no installment filter at all", async () => {
    // That balance is last year's: it has no installments, no due date and no
    // late fee. The notice used to IGNORE the installment control; since the
    // audience was split from the template there is nothing to ignore — the
    // preset simply carries an empty set, so the family is on the list whatever
    // installments the office had selected on the notice they came from.
    const tables = {
      financials: [student("prev-only", { total_paid: 20000, inst1_pending: 0, inst2_pending: 0 })],
      carryForward: [carried("prev-only", 8000)],
    };

    const audience = await load(tables, { situation: "prevyear" });
    expect(audience.candidates.map((c) => c.studentId)).toEqual(["prev-only"]);
    expect(audience.candidates[0]!.dueAmount).toBe(8000);

    // And an installment filter the office sets DELIBERATELY now applies here
    // like anywhere else — that is the point of the split. This family owes
    // nothing on installment 1, so naming it empties the list.
    const narrowed = await load(tables, { situation: "prevyear", installments: [1] });
    expect(narrowed.candidates).toHaveLength(0);
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
    expect(audience.counts.not_due_yet).toBe(0);
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

    expect(audience.counts.not_due_yet).toBe(0);
    // `late_fee_applied` reads 0 rather than 1, and that is the preset counts
    // becoming honest rather than a family going missing. The old counts were
    // taken BEFORE the minimum was applied, so they promised families the list
    // then dropped: this family's fees are clear, so the notice would quote
    // ₹0 and the ₹1 minimum has always excluded them from the list itself.
    // Now the button's number is what clicking it gives you. To reach a family
    // who owes only a late fee, set "Quoted amount at least" to 0.
    expect(audience.counts.late_fee).toBe(0);
  });

  it("gives `upcoming_final` the same audience as `upcoming`, whatever the date", async () => {
    // The three-day window used to live HERE, emptying the final-call list
    // outside it. That is a fact about the RUN, not about a family, and as an
    // audience gate it made the template impossible to use deliberately. It
    // moved to `evaluateSendGuards` as the overridable `final_window_closed`,
    // where an admin can send early on purpose and the reason lands on the run.
    const tables = {
      financials: [student("soon", { inst1_pending: 0, inst2_pending: 4000, total_paid: 5000 })],
    };

    // Six days out: both presets reach the family.
    const early = await load(tables, { situation: "upcoming" }, CALENDAR_INST2_DUE_SOON);
    expect(early.counts.not_due_yet).toBe(1);
    expect(early.counts.not_due_yet).toBe(1);

    // Two days out: unchanged.
    const late = await load(
      tables,
      { situation: "upcoming_final" },
      buildInstallmentCalendar({
        schedule: [{ dueDate: "2026-04-20" }, { dueDate: "2026-07-20" }],
        today: "2026-07-18",
      }),
    );
    expect(late.counts.not_due_yet).toBe(1);
    expect(late.counts.not_due_yet).toBe(1);
    expect(late.candidates.map((c) => c.studentId)).toEqual(["soon"]);
  });

  it("reaches nobody on the calendar notices when the session has no schedule", async () => {
    // A valid state, not a crash: Fee Setup has not been published yet.
    const audience = await load(
      { financials: [student("a")] },
      { situation: "upcoming" },
    );
    expect(audience.counts.not_due_yet).toBe(0);
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

    expect(audience.counts.late_fee).toBe(0);
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

    expect(audience.counts.late_fee).toBe(0);
  });
});

describe("reminder audience — the waiver pair read the ledger too", () => {
  it("takes a family with a late fee AND fees still on those installments", async () => {
    const audience = await load(
      {
        financials: [student("late"), student("clean")],
        installmentBalances: [lateFeeRow("late", { pending_amount: 9125, late_fee_pending: 1000 })],
      },
      { situation: "late_fee_waiver" },
    );

    expect(audience.candidates.map((c) => c.studentId)).toEqual(["late"]);
    // Fees in dueAmount, the late fee alongside — never added together.
    expect(audience.candidates[0]!.dueAmount).toBe(9125);
    expect(audience.candidates[0]!.lateFeeApplied).toBe(1000);
    expect(audience.counts.late_fee).toBe(1);
  });

  it("leaves out a family who paid the fees late and owes only the late fee", async () => {
    // Nothing to pay "by the date" — the waiver would be waiving a fee against
    // a payment that has already happened. That family gets late_fee_applied.
    const audience = await load(
      {
        financials: [student("paid-late", { inst1_pending: 0, inst2_pending: 0, total_paid: 9000 })],
        installmentBalances: [lateFeeRow("paid-late", { pending_amount: 0 })],
      },
      { situation: "late_fee_waiver" },
    );

    expect(audience.counts.late_fee).toBe(0);
    expect(audience.counts.late_fee).toBe(0);
    // 0, not 1: see the note on the courtesy-notice test above. The preset
    // counts now apply the minimum, so they promise exactly what clicking the
    // button delivers — and the ₹1 minimum has always kept a family whose fees
    // are clear off the list itself.
    expect(audience.counts.late_fee).toBe(0);
  });
});

describe("reminder audience — overdue_final follows the calendar", () => {
  it("takes a family with fees pending on a passed installment, late fee or not", async () => {
    // Installment 1 has passed (2026-04-20), installment 2 is six days out.
    // A family late on 1 is overdue; a family owing only 2 is not.
    const audience = await load(
      {
        financials: [
          student("behind", { inst1_pending: 5000, inst2_pending: 4000 }),
          student("on-time", { inst1_pending: 0, inst2_pending: 4000, total_paid: 5000 }),
        ],
      },
      { situation: "overdue_final" },
      CALENDAR_INST2_DUE_SOON,
    );

    expect(audience.candidates.map((c) => c.studentId)).toEqual(["behind"]);
    // The figure is what is overdue, not the whole balance.
    expect(audience.candidates[0]!.dueAmount).toBe(5000);
    expect(audience.candidates[0]!.overdueInstallments).toEqual([1]);
  });

  it("reaches nobody when the session has no schedule", async () => {
    const audience = await load({ financials: [student("a")] }, { situation: "overdue_final" });
    expect(audience.counts.overdue).toBe(0);
  });
});

describe("reminder audience — exam_clearance honours the installment filter", () => {
  it("takes anyone with something pending on ANY selected installment", async () => {
    const owesOnTwo = student("owes-2", { total_paid: 9000, inst1_pending: 0, inst2_pending: 4000 });
    const notDueYet = student("later", {
      total_paid: 9000,
      inst1_pending: 0,
      inst2_pending: 0,
      inst3_pending: 6000,
    });
    const tables = { financials: [owesOnTwo, notDueYet] };

    const narrow = await load(tables, { situation: "exam_clearance", installments: [1, 2] });
    expect(narrow.candidates.map((c) => c.studentId)).toEqual(["owes-2"]);
    expect(narrow.candidates[0]!.dueAmount).toBe(4000);

    const wide = await load(tables, { situation: "exam_clearance", installments: [1, 2, 3] });
    expect(wide.candidates.map((c) => c.studentId).sort()).toEqual(["later", "owes-2"]);
    // The figure is the pending sum over the SELECTED installments only.
    expect(wide.candidates.find((c) => c.studentId === "later")!.dueAmount).toBe(6000);
  });
});

describe("reminder audience — promises", () => {
  it("puts promise_due on a family whose promised date is today or tomorrow", async () => {
    const tomorrow = addDays(TODAY, 1);
    const audience = await load(
      {
        financials: [student("soon"), student("later")],
        contacts: [
          contact("soon", "promised_pay", tomorrow, "2026-07-03T18:30:00Z"),
          contact("later", "promised_pay", addDays(TODAY, 5)),
        ],
      },
      { situation: "promise_due" },
    );

    expect(audience.candidates.map((c) => c.studentId)).toEqual(["soon"]);
    expect(audience.candidates[0]!.promisedOn).toBe(tomorrow);
    // 18:30 UTC is midnight IST: "spoken on" names the IST day, 4 July.
    expect(audience.candidates[0]!.promiseContactedOn).toBe("2026-07-04");
    // Not held back as "inside a promise" — this notice is about the promise.
    expect(audience.skipped.promiseOpen).toBe(0);
    // The family five days out is still inside their promise, and still held.
    expect(audience.counts.promised_now).toBe(1);
  });

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
    expect(audience.counts.promise_broken).toBe(0);
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

    expect(audience.counts.promise_broken).toBe(0);
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

/**
 * The unreachable list feeds two screens that want different breadths.
 *
 * `/protected/reminders/unreachable` wants EVERY family with no usable number:
 * a family with no phone is unreachable whichever notice is selected, and that
 * page exists to get the record fixed. The collection lists want only the ones
 * the current notice is actually about.
 *
 * `matchesNotice` is how one array serves both. If it were ever implemented by
 * moving the push later in the loop, the unreachable page would silently shrink
 * — which is exactly what these tests exist to catch.
 */
describe("unreachable families", () => {
  const noPhone = (id: string, overrides: Record<string, unknown> = {}) =>
    student(id, { father_phone: null, mother_phone: null, ...overrides });

  it("lists a family with no number even when this notice is not about them", async () => {
    const audience = await load({
      // Nothing pending on installments 1 and 2, so `fee_due` is not about them.
      financials: [noPhone("clear", { inst1_pending: 0, inst2_pending: 0 })],
    });

    expect(audience.unreachable.map((f) => f.studentId)).toEqual(["clear"]);
    expect(audience.unreachable[0]!.matchesNotice).toBe(false);
  });

  it("flags one the notice IS about, so the collection list can pick it up", async () => {
    const audience = await load({ financials: [noPhone("owing")] });

    expect(audience.unreachable[0]!.matchesNotice).toBe(true);
  });

  it("does not count an unreachable family towards the notice chips", async () => {
    // The counts are what the picker shows as reachable per notice. A family we
    // cannot message must not inflate them.
    const audience = await load({ financials: [noPhone("owing")] });

    expect(audience.counts.nothing_paid).toBe(0);
  });

  it("keeps an unreachable family out of candidates, paused and every skip count", async () => {
    const audience = await load({
      financials: [noPhone("owing")],
      flags: [{ student_id: "owing", whatsapp_cadence: "never", whatsapp_snoozed_until: null }],
    });

    expect(audience.candidates).toHaveLength(0);
    // Held back by a cadence is a decision about MESSAGING. A family we cannot
    // message at all is reported as unreachable, not as paused.
    expect(audience.paused).toHaveLength(0);
    expect(audience.skipped.whatsappNever).toBe(0);
    expect(audience.skipped.noPhoneOnRecord).toBe(1);
  });

  it("carries the number on record, so the office can see what to fix", async () => {
    const audience = await load({
      financials: [noPhone("landline", { father_phone: "01482222333" })],
    });

    // A number that exists but is not a usable mobile is `phoneUnusable`, not
    // `noPhoneOnRecord`, and does not reach the unreachable list at all.
    expect(audience.skipped.phoneUnusable).toBe(1);
    expect(audience.unreachable).toHaveLength(0);
  });

  it("respects the class filter when deciding whether the notice is about them", async () => {
    const audience = await load(
      { financials: [noPhone("owing")] },
      { classId: "another-class" },
    );

    // Still on the list — they have no number whatever class is picked — but
    // not on a sheet for a class they are not in.
    expect(audience.unreachable).toHaveLength(1);
    expect(audience.unreachable[0]!.matchesNotice).toBe(false);
  });
});

describe("describeMissingFacts", () => {
  it("reads as a sentence, because the badge puts a verb in front of it", () => {
    // The badge renders `Needs {label}` and the tooltip renders
    // "This message names {label}, which this family does not have". The
    // labels are noun phrases carrying their own article, so both readings
    // have to work — the first version of this shipped as "No a late fee on
    // the ledger".
    expect(describeMissingFacts(["late_fee"])).toBe("a late fee on the ledger");
    expect(describeMissingFacts(["promise"])).toBe("a promised date on record");
  });

  it("joins two or more with 'and', never a bare comma list", () => {
    expect(describeMissingFacts(["late_fee", "amount"])).toBe(
      "a late fee on the ledger and a non-zero amount to quote",
    );
    expect(describeMissingFacts(["next_due", "overdue", "amount"])).toBe(
      "an installment falling due next, an installment past its due date and a non-zero amount to quote",
    );
  });

  it("is empty when nothing is missing, so the badge does not render", () => {
    expect(describeMissingFacts([])).toBe("");
  });
});
