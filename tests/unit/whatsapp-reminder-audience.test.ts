import { describe, expect, it } from "vitest";

import {
  DEFAULT_REMINDER_FILTERS,
  describeMissingFacts,
  loadReminderAudience,
} from "@/modules/whatsapp/domain/fee-reminders";
import {
  buildInstallmentCalendar,
  describeInstallmentTile,
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
 *
 * The audience is the installment TILES since 2026-09-10: which installments
 * a family still owes on, or last session's balance. Every case below asks
 * that question directly. The template never appears in an audience decision
 * here, and a test that needs `situation` to get a family on or off the list
 * is a test of the shape this replaced.
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

/** Tiles 1 and 2, owing on both — what the screen opens on in September. */
const filters = {
  ...DEFAULT_REMINDER_FILTERS,
  sessionLabel: SESSION,
  lastDate: "25-08-2026",
  lateFeeAmount: 1000,
  installments: [1, 2],
};

const load = (
  tables: Tables,
  overrides: Partial<typeof filters> = {},
  calendar?: InstallmentCalendar,
) =>
  loadReminderAudience(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stubClient(tables) as any,
    { ...filters, ...overrides },
    calendar,
  );

/** The Last-year tile. */
const LAST_YEAR = { lastYear: true, installments: [] as number[] };

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

describe("reminder audience — which tiles, which families", () => {
  // Nothing received: only the academic fee landed, so both installments stand.
  const owesEverything = student("owes", { total_paid: 500 });
  // Part paid: past the academic-fee threshold, cleared 1, still carrying 2.
  const partPaid = student("part", { total_paid: 9000, inst1_pending: 0, inst2_pending: 4000 });
  // Fully paid this year, but last year is still open.
  const prevOnly = student("prev", {
    total_paid: 20000,
    inst1_pending: 0,
    inst2_pending: 0,
  });

  const everyone = { financials: [owesEverything, partPaid, prevOnly] };
  const withCarryForward = { ...everyone, carryForward: [carried("prev", 20000)] };

  it("owing on both of 1 and 2 is the default, and quotes the fees on both", async () => {
    const audience = await load(everyone);

    expect(audience.candidates.map((c) => c.studentId)).toEqual(["owes"]);
    // 5000 + 4000 across the two selected tiles — derived, never chosen.
    expect(audience.candidates[0]!.dueAmount).toBe(9000);
  });

  it("'nothing paid yet' and 'part paid' partition the list, and never overlap", async () => {
    // The old fee_due / balance split, as one control. Measured at zero overlap
    // on the live session, and it must stay that way.
    const nothing = await load(everyone, { paid: "nothing" });
    expect(nothing.candidates.map((c) => c.studentId)).toEqual(["owes"]);

    const part = await load(everyone, { paid: "part", installmentMatch: "any" });
    expect(part.candidates.map((c) => c.studentId)).toEqual(["part"]);
    // Fees on the selected tiles — installment 1 is clear, so installment 2's.
    expect(part.candidates[0]!.dueAmount).toBe(4000);
    expect(part.candidates[0]!.totalPaid).toBe(9000);

    const overlap = nothing.candidates
      .map((c) => c.studentId)
      .filter((id) => part.candidates.some((c) => c.studentId === id));
    expect(overlap).toEqual([]);
  });

  it("Last year quotes what is LEFT of last session, not the original", async () => {
    const audience = await load(withCarryForward, LAST_YEAR);

    expect(audience.candidates.map((c) => c.studentId)).toEqual(["prev"]);
    expect(audience.candidates[0]!.dueAmount).toBe(20000);
    expect(audience.candidates[0]!.prevSessionLabel).toBe("2025-26");
  });

  it("drops a family whose carry-forward has been cleared", async () => {
    const audience = await load({ ...everyone, carryForward: [carried("prev", 0)] }, LAST_YEAR);

    expect(audience.candidates).toHaveLength(0);
  });

  it("lets one family qualify for a current-year tile AND Last year", async () => {
    // The 47-family case the send-log index was widened for.
    const both = {
      financials: [owesEverything],
      carryForward: [carried("owes", 12000)],
    };

    expect((await load(both)).candidates).toHaveLength(1);
    expect((await load(both, LAST_YEAR)).candidates).toHaveLength(1);
  });

  it("keeps the installment filter honest under 'any of them'", async () => {
    // Measured live: 87 of the 258 families on the old balance notice were fully
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

    const overdue = await load(tables, { installmentMatch: "any", installments: [1, 2] });
    expect(overdue.candidates.map((c) => c.studentId)).toEqual(["owes-2"]);

    // Add tile 3 and the second family comes back — the control works in both
    // directions, it is not a hardcoded "1 and 2".
    const everything = await load(tables, { installmentMatch: "any", installments: [1, 2, 3] });
    expect(everything.candidates.map((c) => c.studentId).sort()).toEqual(["later", "owes-2"]);

    // And the AMOUNT is the fees on the SELECTED tiles — installment 3's 6,000,
    // not the whole 12,000 balance. The message names the same rows it quotes.
    expect(everything.candidates.find((c) => c.studentId === "later")!.dueAmount).toBe(6000);
  });

  it("asks for EVERY selected tile under 'all', and at least one under 'any'", async () => {
    // Different questions, deliberately. "All" is the default the office chose:
    // on tiles 1 and 2 it means both still owed. Somebody who cleared 1 but
    // still owes 2 is exactly who "any" is for — "all" drops them.
    const clearedOne = student("half", { total_paid: 9000, inst1_pending: 0, inst2_pending: 4000 });

    const any = await load({ financials: [clearedOne] }, { installmentMatch: "any" });
    expect(any.candidates.map((c) => c.studentId)).toEqual(["half"]);

    const all = await load({ financials: [clearedOne] }, { installmentMatch: "all" });
    expect(all.candidates).toHaveLength(0);
  });

  it("ignores the installments on Last year, and last year's money on the installments", async () => {
    // Last session's balance has no installments. Selecting it is the whole
    // question; whatever tiles were on before are cleared by construction.
    const tables = {
      financials: [student("prev-only", { total_paid: 20000, inst1_pending: 0, inst2_pending: 0 })],
      carryForward: [carried("prev-only", 8000)],
    };

    const lastYear = await load(tables, LAST_YEAR);
    expect(lastYear.candidates.map((c) => c.studentId)).toEqual(["prev-only"]);
    expect(lastYear.candidates[0]!.dueAmount).toBe(8000);

    // Tile 1 alone: this family owes nothing on it, whatever last year says.
    const tileOne = await load(tables, { installments: [1] });
    expect(tileOne.candidates).toHaveLength(0);
  });

  it("never lets last year's balance into a current-year figure", async () => {
    // The ₹20,000 trap: outstanding_amount folds the carry-forward in, so a
    // notice built from it would bill last year twice.
    const audience = await load({
      financials: [owesEverything],
      carryForward: [carried("owes", 20000)],
    });

    expect(audience.candidates[0]!.dueAmount).toBe(9000);
    expect(audience.candidates[0]!.prevYearBalance).toBe(20000);
  });
});

describe("reminder audience — due or overdue is the calendar's fact", () => {
  it("labels a tile from the calendar, so nothing asks the office which it is", () => {
    expect(describeInstallmentTile(1, CALENDAR_INST2_DUE_SOON).label).toBe(
      "Overdue since 20-04-2026",
    );
    expect(describeInstallmentTile(2, CALENDAR_INST2_DUE_SOON).label).toBe("Due 20-07-2026");
  });

  it("selecting a passed tile IS the overdue list", async () => {
    // Installment 1 has passed (2026-04-20), installment 2 is six days out.
    // A family late on 1 is overdue; a family owing only 2 is not.
    const audience = await load(
      {
        financials: [
          student("behind", { inst1_pending: 5000, inst2_pending: 4000 }),
          student("on-time", { inst1_pending: 0, inst2_pending: 4000, total_paid: 5000 }),
        ],
      },
      { installments: [1] },
      CALENDAR_INST2_DUE_SOON,
    );

    expect(audience.candidates.map((c) => c.studentId)).toEqual(["behind"]);
    expect(audience.candidates[0]!.dueAmount).toBe(5000);
    expect(audience.candidates[0]!.overdueInstallments).toEqual([1]);
  });

  it("keeps a family already overdue off a courtesy list when asked to", async () => {
    // The old `upcoming` rule, opted into. A family late on installment 1 must
    // get the late-fee notice, not a polite note about installment 2 — sending
    // the courtesy one would tell them the school had not noticed.
    const tables = {
      financials: [
        student("soon", { inst1_pending: 0, inst2_pending: 4000, total_paid: 5000 }),
        student("behind", { inst1_pending: 5000, inst2_pending: 4000, total_paid: 0 }),
      ],
    };

    const courtesy = await load(tables, { installments: [2], skipOverdue: true }, CALENDAR_INST2_DUE_SOON);
    expect(courtesy.candidates.map((c) => c.studentId)).toEqual(["soon"]);
    // The figure is the tile alone — the bill that is about to fall due.
    expect(courtesy.candidates[0]!.dueAmount).toBe(4000);

    // Without the checkbox, everyone owing on 2 is on the list.
    const plain = await load(tables, { installments: [2] }, CALENDAR_INST2_DUE_SOON);
    expect(plain.candidates.map((c) => c.studentId).sort()).toEqual(["behind", "soon"]);
  });

  it("treats nothing as overdue when the session has no schedule", async () => {
    // A valid state, not a crash: Fee Setup has not been published yet. With
    // no dates, no installment has passed, so "skip already overdue" holds
    // nobody back and the tile reads "No due date on file".
    const audience = await load({ financials: [student("a")] }, { installments: [2], skipOverdue: true });
    expect(audience.candidates).toHaveLength(1);
    expect(audience.candidates[0]!.overdueInstallments).toEqual([]);
  });
});

describe("reminder audience — the late fee is read from the ledger, on the selected tiles", () => {
  it("'late fee: yes' takes only families the view says are carrying one", async () => {
    const audience = await load(
      {
        financials: [student("late"), student("clean")],
        installmentBalances: [lateFeeRow("late")],
      },
      { lateFee: "yes" },
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
        financials: [student("late", { inst1_pending: 9125 })],
        installmentBalances: [
          lateFeeRow("late", { pending_amount: 9125, late_fee_pending: 1000, total_pending: 10125 }),
        ],
      },
      { installments: [1], lateFee: "yes" },
    );

    const candidate = audience.candidates[0]!;
    expect(candidate.dueAmount).toBe(9125);
    expect(candidate.lateFeeApplied).toBe(1000);
    expect(candidate.dueAmount).not.toBe(10125);
  });

  it("sums a family late on more than one selected installment", async () => {
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
      { lateFee: "yes" },
    );

    const candidate = audience.candidates[0]!;
    expect(candidate.lateFeeApplied).toBe(2000);
    expect(candidate.dueAmount).toBe(9000);
    expect(candidate.lateFeeInstallments).toEqual([1, 2]);
  });

  it("scopes the late fee to the SELECTED tile, like the fees", async () => {
    // "Installment 2 only" for a family late on 1 and 2 must quote installment
    // 2's late fee beside installment 2's fees — not a two-installment late fee
    // beside one row's fees, which is what the message read until 2026-09-10.
    const tables = {
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
    };

    const tileTwo = await load(tables, { installments: [2] });
    expect(tileTwo.candidates[0]!.dueAmount).toBe(4000);
    expect(tileTwo.candidates[0]!.lateFeeApplied).toBe(1000);
    expect(tileTwo.candidates[0]!.lateFeeFeesPending).toBe(4000);
    expect(tileTwo.candidates[0]!.lateFeeInstallments).toEqual([2]);

    // And the filter reads the same scope: a fee on installment 1 does not
    // make a family "carrying a late fee" on a list about installment 3.
    const tileThree = await load(
      { financials: [student("late", { inst3_pending: 6000 })], installmentBalances: tables.installmentBalances },
      { installments: [3], lateFee: "yes" },
    );
    expect(tileThree.candidates).toHaveLength(0);
  });

  it("ignores a carry-forward row, which never accrues a late fee", async () => {
    // Carry-forward rows are created with a rate of 0 deliberately. One showing
    // a pending late fee is a data fault, not an audience.
    const audience = await load(
      {
        financials: [student("cf")],
        installmentBalances: [lateFeeRow("cf", { is_carry_forward: true })],
      },
      { lateFee: "yes" },
    );

    expect(audience.candidates).toHaveLength(0);
  });

  it("ignores a late fee on an installment the calendar says has not passed", async () => {
    // The message follows the date the parent can see. If the ledger and the
    // calendar disagree, saying nothing beats naming a date that has not gone.
    const audience = await load(
      {
        financials: [student("early")],
        installmentBalances: [lateFeeRow("early", { due_date: "2099-01-01" })],
      },
      { lateFee: "yes" },
    );

    expect(audience.candidates).toHaveLength(0);
  });

  it("keeps a family who owes only a late fee off the list until the minimum says otherwise", async () => {
    // Fees cleared, late fee still pending: the quoted figure is ₹0 and the ₹1
    // minimum has always excluded them. To reach them, set the minimum to 0 —
    // and the tile count says so, because it applies the minimum too.
    const tables = {
      financials: [student("paid-late", { inst1_pending: 0, inst2_pending: 0, total_paid: 9000 })],
      installmentBalances: [lateFeeRow("paid-late", { pending_amount: 0 })],
    };

    const withMinimum = await load(tables, { installments: [1], lateFee: "yes" });
    expect(withMinimum.candidates).toHaveLength(0);
    expect(withMinimum.skipped.belowMinimum).toBe(1);
    expect(withMinimum.tileCounts.byInstallment[0]).toBe(0);

    const noMinimum = await load(tables, { installments: [1], lateFee: "yes", minDueAmount: 0 });
    expect(noMinimum.candidates.map((c) => c.studentId)).toEqual(["paid-late"]);
    expect(noMinimum.candidates[0]!.dueAmount).toBe(0);
    expect(noMinimum.candidates[0]!.lateFeeApplied).toBe(1000);
  });
});

describe("reminder audience — promises", () => {
  it("'promise due today or tomorrow' finds exactly those families", async () => {
    const tomorrow = addDays(TODAY, 1);
    const audience = await load(
      {
        financials: [student("soon"), student("later")],
        contacts: [
          contact("soon", "promised_pay", tomorrow, "2026-07-03T18:30:00Z"),
          contact("later", "promised_pay", addDays(TODAY, 5)),
        ],
      },
      { promise: "due_soon" },
    );

    expect(audience.candidates.map((c) => c.studentId)).toEqual(["soon"]);
    expect(audience.candidates[0]!.promisedOn).toBe(tomorrow);
    // 18:30 UTC is midnight IST: "spoken on" names the IST day, 4 July.
    expect(audience.candidates[0]!.promiseContactedOn).toBe("2026-07-04");
    // Not held back as "inside a promise" — this list is about the promise.
    expect(audience.skipped.promiseOpen).toBe(0);
  });

  it("holds a family back from every ordinary list while their promise is live", async () => {
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

  it("does not hold a live promise back from the 'promise lapsed' list — it just is not lapsed", async () => {
    // The hold must not be what excludes them, or the list could never fire.
    const future = addDays(TODAY, 5);
    const audience = await load(
      {
        financials: [student("promised")],
        contacts: [contact("promised", "promised_pay", future)],
      },
      { promise: "lapsed" },
    );

    expect(audience.skipped.promiseOpen).toBe(0);
    expect(audience.candidates).toHaveLength(0);
  });

  it("takes a family whose promised date has gone with money still owing", async () => {
    const past = addDays(TODAY, -3);
    const audience = await load(
      {
        financials: [student("lapsed")],
        contacts: [contact("lapsed", "promised_pay", past)],
      },
      { promise: "lapsed" },
    );

    expect(audience.candidates.map((c) => c.studentId)).toEqual(["lapsed"]);
    expect(audience.candidates[0]!.promisedOn).toBe(past);
  });

  it("leaves out a family who paid after their promise lapsed", async () => {
    // The ledger is applied first, as always: nothing owing means the list is
    // not about them, whatever the contact log says.
    const past = addDays(TODAY, -3);
    const audience = await load(
      {
        financials: [
          student("paid", { inst1_pending: 0, inst2_pending: 0, total_paid: 9000 }),
        ],
        contacts: [contact("paid", "promised_pay", past)],
      },
      { promise: "lapsed" },
    );

    expect(audience.candidates).toHaveLength(0);
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
 * Each tile's number must be exactly who that tile alone would reach. A tile
 * that reads 201 and lands on 190 is a tile the office stops trusting, and the
 * whole card then goes back to being guesswork.
 */
describe("reminder audience — the tile counts", () => {
  const owesBoth = student("both"); // 5000 / 4000
  const owesTwo = student("two", { total_paid: 6000, inst1_pending: 0, inst2_pending: 4000 });
  const owesThree = student("three", {
    total_paid: 10000,
    inst1_pending: 0,
    inst2_pending: 0,
    inst3_pending: 6000,
  });
  const tables = {
    financials: [owesBoth, owesTwo, owesThree],
    carryForward: [carried("three", 2500)],
  };

  it("counts every tile in one pass, whichever tiles are selected", async () => {
    const audience = await load(tables);

    expect(audience.tileCounts).toEqual({ byInstallment: [1, 2, 1, 0], lastYear: 1 });
    // Only the selected tiles produce candidates: both of 1 and 2.
    expect(audience.candidates.map((c) => c.studentId)).toEqual(["both"]);
  });

  it("makes one selected tile's count equal the list", async () => {
    for (const installment of [1, 2, 3]) {
      const audience = await load(tables, { installments: [installment] });
      expect(audience.candidates).toHaveLength(audience.tileCounts.byInstallment[installment - 1]!);
    }
    const lastYear = await load(tables, LAST_YEAR);
    expect(lastYear.candidates).toHaveLength(lastYear.tileCounts.lastYear);
  });

  it("applies the narrowing controls to every tile's count", async () => {
    // "Part paid" drops the family who has paid nothing from every tile.
    const part = await load(tables, { paid: "part" });
    expect(part.tileCounts.byInstallment).toEqual([0, 1, 1, 0]);

    // A minimum drops a tile whose fees fall under it.
    const minimum = await load(tables, { minDueAmount: 5000 });
    expect(minimum.tileCounts.byInstallment).toEqual([1, 0, 1, 0]);
    expect(minimum.tileCounts.lastYear).toBe(0);
  });

  it("applies the class and the hold-backs before counting", async () => {
    const otherClass = await load(tables, { classId: "another-class" });
    expect(otherClass.tileCounts).toEqual({ byInstallment: [0, 0, 0, 0], lastYear: 0 });
    // The dropdown still offers the class the families ARE in.
    expect(otherClass.classOptions.map((option) => option.classId)).toEqual(["class-1"]);

    const heldBack = await load({
      ...tables,
      flags: [{ student_id: "both", whatsapp_cadence: "never", whatsapp_snoozed_until: null }],
    });
    expect(heldBack.tileCounts.byInstallment[0]).toBe(0);
    expect(heldBack.paused.map((family) => family.studentId)).toEqual(["both"]);
  });

  it("does not let a courtesy-list setting zero the overdue tiles", async () => {
    // "Skip already overdue" is dropped by the tile hrefs the moment a passed
    // tile is selected, so the counts must read it the same way — or every
    // overdue tile would read 0 while the office is looking at a courtesy list.
    const audience = await load(
      { financials: [student("behind")] },
      { installments: [2], skipOverdue: true },
      CALENDAR_INST2_DUE_SOON,
    );

    expect(audience.tileCounts.byInstallment[0]).toBe(1);
    expect(audience.tileCounts.byInstallment[1]).toBe(0);
    expect(audience.candidates).toHaveLength(0);
  });

  it("counts a hand-picked family on every tile, and an excluded one on none", async () => {
    const included = await load(tables, { includeStudentIds: ["three"] });
    // "three" owes nothing on 1 or 2, but named by hand they are on the list
    // whatever tile is selected — so every tile's number includes them.
    expect(included.tileCounts.byInstallment).toEqual([2, 3, 1, 1]);

    const excluded = await load(tables, { excludeStudentIds: ["both"] });
    expect(excluded.tileCounts.byInstallment[0]).toBe(0);
    expect(excluded.excludedByHand).toBe(1);
  });
});

/**
 * The unreachable list feeds two screens that want different breadths.
 *
 * `/protected/reminders/unreachable` wants EVERY family with no usable number:
 * a family with no phone is unreachable whichever tile is selected, and that
 * page exists to get the record fixed. The collection lists want only the ones
 * the current list is actually about.
 *
 * `matchesNotice` is how one array serves both. If it were ever implemented by
 * moving the push later in the loop, the unreachable page would silently shrink
 * — which is exactly what these tests exist to catch.
 */
describe("unreachable families", () => {
  const noPhone = (id: string, overrides: Record<string, unknown> = {}) =>
    student(id, { father_phone: null, mother_phone: null, ...overrides });

  it("lists a family with no number even when this list is not about them", async () => {
    const audience = await load({
      // Nothing pending on installments 1 and 2, so the default tiles are not
      // about them.
      financials: [noPhone("clear", { inst1_pending: 0, inst2_pending: 0 })],
    });

    expect(audience.unreachable.map((f) => f.studentId)).toEqual(["clear"]);
    expect(audience.unreachable[0]!.matchesNotice).toBe(false);
  });

  it("flags one the list IS about, so the collection list can pick it up", async () => {
    const audience = await load({ financials: [noPhone("owing")] });

    expect(audience.unreachable[0]!.matchesNotice).toBe(true);
  });

  it("does not count an unreachable family on any tile", async () => {
    // The counts are what the tiles show as reachable. A family we cannot
    // message must not inflate them.
    const audience = await load({ financials: [noPhone("owing")] });

    expect(audience.tileCounts).toEqual({ byInstallment: [0, 0, 0, 0], lastYear: 0 });
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

  it("respects the class filter when deciding whether the list is about them", async () => {
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
