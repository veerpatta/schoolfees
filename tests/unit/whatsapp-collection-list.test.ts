import { describe, expect, it } from "vitest";

import {
  AMOUNT_BANDS,
  bandFor,
  buildCollectionRows,
  COLLECTION_STATUS_LABELS,
  groupCollectionRows,
  isCollectionGroupBy,
  renderAllCollectionsText,
  renderCollectionText,
  toExportRow,
} from "@/modules/whatsapp/domain/collection-list";
import type {
  PausedFamily,
  ReminderAudience,
  ReminderCandidate,
} from "@/modules/whatsapp/domain/fee-reminders";

function candidate(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    studentId: "s1",
    admissionNo: "TEST-001",
    studentName: "Aaradhya Gurjar",
    parentName: "Ramesh Lal Gurjar",
    studentClass: "Class 2",
    classId: "c2",
    classSortOrder: 5,
    transportRoute: "Route A",
    transportFeeAmount: 14000,
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
    overdueInstallments: [],
    promisedOn: null,
    promiseContactedOn: null,
    preferredLanguage: null,
    secondaryDestination: null,
    sentCount: 0,
    includedByHand: false,
    missingFacts: [],
    ...overrides,
  };
}

function paused(overrides: Partial<PausedFamily> = {}): PausedFamily {
  return {
    studentId: "p1",
    admissionNo: "TEST-900",
    studentName: "Bhavya Sharma",
    studentClass: "Class 5",
    classSortOrder: 8,
    transportRoute: null,
    transportFeeAmount: 0,
    parentName: "Suresh Sharma",
    destination: "+919999999999",
    reason: "snoozed",
    cadence: "weekly",
    returnsOn: "2026-09-14",
    dueAmount: 8000,
    ...overrides,
  };
}

function audience(overrides: Partial<ReminderAudience> = {}): ReminderAudience {
  return {
    candidates: [],
    skipped: {
      installmentsClear: 0,
      leftAndNeverPaid: 0,
      noCallFlagged: 0,
      rteStudent: 0,
      belowMinimum: 0,
      noPhoneOnRecord: 0,
      phoneUnusable: 0,
      whatsappNever: 0,
      whatsappSnoozed: 0,
      whatsappTooSoon: 0,
      promiseOpen: 0,
    },
    excludedByHand: 0,
    unreachable: [],
    paused: [],
    classOptions: [],
    counts: {
      upcoming: 0,
      upcoming_final: 0,
      fee_due: 0,
      balance: 0,
      late_fee_applied: 0,
      promise_lapsed: 0,
      prevyear: 0,
      late_fee_waiver: 0,
      waiver_last_call: 0,
      overdue_final: 0,
      promise_due: 0,
      exam_clearance: 0,
    },
    noticeGaps: {
      upcoming: 0,
      upcoming_final: 0,
      fee_due: 0,
      balance: 0,
      late_fee_applied: 0,
      promise_lapsed: 0,
      prevyear: 0,
      late_fee_waiver: 0,
      waiver_last_call: 0,
      overdue_final: 0,
      promise_due: 0,
      exam_clearance: 0,
    },
    ...overrides,
  };
}

describe("amount bands", () => {
  it("puts each boundary in exactly one band", () => {
    for (const band of AMOUNT_BANDS) {
      expect(bandFor(band.min).key).toBe(band.key);
      if (Number.isFinite(band.max)) {
        expect(bandFor(band.max).key).toBe(band.key);
      }
    }
  });

  it("keeps a zero or negative balance out of the five collection bands", () => {
    // A paused family can carry 0 on a notice they do not qualify for. Falling
    // into "Up to Rs. 5,000" would put them on a sheet as money to collect.
    expect(bandFor(0).key).toBe("b0");
    expect(bandFor(-100).key).toBe("b0");
    expect(bandFor(1).key).toBe("b1");
  });

  it("spells its labels through currency.ts, without a glyph react-pdf lacks", () => {
    const labels = AMOUNT_BANDS.map((band) => band.label);

    expect(labels[0]).toBe("Up to Rs. 5,000");
    expect(labels[1]).toBe("Rs. 5,001 - 10,000");
    expect(labels.at(-1)).toBe("Above Rs. 30,000");
    // A band label heads a PDF page, and Helvetica has no rupee glyph.
    for (const label of labels) expect(label).not.toContain("₹");
  });

  it("covers the live spread rather than piling into two buckets", () => {
    // The shape this was measured against on 2026-09-07: 53 / 71 / 176 / 133 / 46.
    const sample = [3000, 7000, 15000, 25000, 40000];
    expect(new Set(sample.map((value) => bandFor(value).key)).size).toBe(5);
  });
});

describe("buildCollectionRows", () => {
  it("marks a family already messaged today rather than dropping them", () => {
    const rows = buildCollectionRows(
      audience({
        candidates: [candidate({ sentToday: { status: "sent", at: "2026-09-07T09:00:00Z" } })],
      }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("sent_today");
  });

  it("carries a paused family onto the list with the reason in words", () => {
    const rows = buildCollectionRows(audience({ paused: [paused()] }));

    expect(rows[0]!.status).toBe("paused_snoozed");
    expect(rows[0]!.statusDetail).toContain("2026-09-14");
    // They are held back from a MESSAGE, not from owing the money.
    expect(rows[0]!.dueAmount).toBe(8000);
  });

  it("maps every pause reason to its own status", () => {
    const reasons: Array<PausedFamily["reason"]> = [
      "never",
      "snoozed",
      "too_soon",
      "promise_open",
    ];
    const rows = buildCollectionRows(
      audience({
        paused: reasons.map((reason, index) =>
          paused({ studentId: `p${index}`, reason }),
        ),
      }),
    );

    expect(rows.map((row) => row.status)).toEqual([
      "paused_never",
      "paused_snoozed",
      "paused_too_soon",
      "paused_promise",
    ]);
  });

  it("includes an unreachable family only when the notice is about them", () => {
    const base = {
      studentId: "u1",
      admissionNo: "TEST-800",
      studentName: "Chirag Meena",
      studentClass: "Class 1",
      classSortOrder: 4,
      transportRoute: null,
      transportFeeAmount: 0,
      parentName: "Mahesh Meena",
      phoneOnRecord: "12345",
      dueAmount: 5000,
    };

    expect(
      buildCollectionRows(audience({ unreachable: [{ ...base, matchesNotice: false }] })),
    ).toHaveLength(0);

    const rows = buildCollectionRows(
      audience({ unreachable: [{ ...base, matchesNotice: true }] }),
    );
    expect(rows[0]!.status).toBe("unreachable");
    expect(rows[0]!.phone).toBeNull();
    // The office needs to see what IS on the record in order to fix it.
    expect(rows[0]!.statusDetail).toContain("12345");
  });
});

describe("groupCollectionRows", () => {
  it("orders classes by the school's own order, not alphabetically", () => {
    const rows = buildCollectionRows(
      audience({
        candidates: [
          candidate({ studentId: "a", studentClass: "11 Arts", classSortOrder: 14 }),
          candidate({ studentId: "b", studentClass: "Nursery", classSortOrder: 1 }),
          candidate({ studentId: "c", studentClass: "Class 2", classSortOrder: 5 }),
        ],
      }),
    );

    expect(groupCollectionRows(rows, "class").map((group) => group.label)).toEqual([
      "Nursery",
      "Class 2",
      "11 Arts",
    ]);
  });

  it("puts the no-transport bucket last", () => {
    // Around 200 of 510 students are on no transport. Sorted naively that
    // bucket leads the page, and a route in-charge opens on everybody who does
    // not use the bus.
    const rows = buildCollectionRows(
      audience({
        candidates: [
          // transportFeeAmount 0 — a genuine walker. With a charge they would
          // belong in the custom bucket, which is a different test.
          candidate({ studentId: "a", transportRoute: null, transportFeeAmount: 0 }),
          candidate({ studentId: "b", transportRoute: "Zzz Village" }),
          candidate({ studentId: "c", transportRoute: "Aaa Colony" }),
        ],
      }),
    );

    const labels = groupCollectionRows(rows, "route").map((group) => group.label);
    expect(labels[0]).toBe("Aaa Colony");
    expect(labels.at(-1)).toBe("No transport");
  });

  it("gives a custom-transport student their own bucket, not the walkers'", () => {
    // The bug this exists to kill. 3 live students are charged transport
    // through student_fee_overrides with NO route — Rs 29,500 a year between
    // them — and they were filed under "No route (walk-in)", so a route
    // in-charge was never handed their names.
    const rows = buildCollectionRows(
      audience({
        candidates: [
          candidate({ studentId: "a", transportRoute: null, transportFeeAmount: 14000 }),
          candidate({ studentId: "b", transportRoute: null, transportFeeAmount: 0 }),
        ],
      }),
    );

    const groups = groupCollectionRows(rows, "route");
    const custom = groups.find((group) => group.label === "Custom amount (no route)");

    expect(custom).toBeDefined();
    expect(custom!.rows.map((row) => row.studentId)).toEqual(["a"]);
    // And the one genuinely not on transport is somewhere else entirely.
    expect(custom!.rows.some((row) => row.studentId === "b")).toBe(false);
  });

  it("does not treat the 'No Transport' placeholder route as a route", () => {
    // 8 live students sit on a real transport_routes row literally NAMED
    // "No Transport", seeded at Rs 0. Grouped naively that produced a route
    // sheet headed "No Transport" beside a separate "No route" sheet: two
    // buckets meaning the same thing.
    const rows = buildCollectionRows(
      audience({
        candidates: [
          candidate({ studentId: "a", transportRoute: "No Transport", transportFeeAmount: 0 }),
          candidate({ studentId: "b", transportRoute: null, transportFeeAmount: 0 }),
        ],
      }),
    );

    const labels = groupCollectionRows(rows, "route").map((group) => group.label);

    expect(labels).toEqual(["No transport"]);
    expect(labels).not.toContain("No Transport");
  });

  it("still bills a sentinel-route student who carries a custom amount", () => {
    // The nastiest shape: on the placeholder route AND charged an override.
    // Reading either field alone gets this student wrong.
    const rows = buildCollectionRows(
      audience({
        candidates: [
          candidate({ studentId: "a", transportRoute: "No Transport", transportFeeAmount: 9500 }),
        ],
      }),
    );

    expect(groupCollectionRows(rows, "route")[0]!.label).toBe("Custom amount (no route)");
  });

  it("sorts real routes first, then custom amounts, then the walkers", () => {
    const rows = buildCollectionRows(
      audience({
        candidates: [
          candidate({ studentId: "a", transportRoute: null, transportFeeAmount: 0 }),
          candidate({ studentId: "b", transportRoute: null, transportFeeAmount: 12000 }),
          candidate({ studentId: "c", transportRoute: "Amet Bus", transportFeeAmount: 14000 }),
        ],
      }),
    );

    expect(groupCollectionRows(rows, "route").map((group) => group.label)).toEqual([
      "Amet Bus",
      "Custom amount (no route)",
      "No transport",
    ]);
  });

  it("orders amount bands largest first", () => {
    const rows = buildCollectionRows(
      audience({
        candidates: [
          candidate({ studentId: "a", dueAmount: 3000 }),
          candidate({ studentId: "b", dueAmount: 40000 }),
        ],
      }),
    );

    expect(groupCollectionRows(rows, "amount")[0]!.label).toContain("Above");
  });

  it("totals each group and sorts the biggest debt to the top of the sheet", () => {
    const rows = buildCollectionRows(
      audience({
        candidates: [
          candidate({ studentId: "a", dueAmount: 1000 }),
          candidate({ studentId: "b", dueAmount: 9000 }),
        ],
      }),
    );

    const [group] = groupCollectionRows(rows, "class");
    expect(group!.total).toBe(10000);
    expect(group!.rows.map((row) => row.dueAmount)).toEqual([9000, 1000]);
  });

  it("gives every group a stable url-safe key so ?scope= keeps working", () => {
    const rows = buildCollectionRows(
      audience({ candidates: [candidate({ studentClass: "11 Science" })] }),
    );

    const [group] = groupCollectionRows(rows, "class");
    expect(group!.key).toBe("class-11-science");
    expect(group!.key).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("renderCollectionText", () => {
  it("names the list, the total and every student, flagging anyone not plainly collectable", () => {
    const rows = buildCollectionRows(
      audience({ candidates: [candidate()], paused: [paused({ studentClass: "Class 2" })] }),
    );
    const [group] = groupCollectionRows(rows, "class");
    const text = renderCollectionText(group!);

    expect(text).toContain("Class 2");
    expect(text).toContain("2 students");
    expect(text).toContain("Aaradhya Gurjar");
    expect(text).toContain(COLLECTION_STATUS_LABELS.paused_snoozed);
    // A plainly collectable row carries no bracketed note.
    // Grouped by currency.ts, so the message and the heading agree.
    expect(text).toContain("Aaradhya Gurjar (TEST-001) - Rs. 13,250 - +917976199548\n");
  });
});

describe("renderAllCollectionsText", () => {
  const built = () =>
    groupCollectionRows(
      buildCollectionRows(
        audience({
          candidates: [
            candidate({ studentId: "a", studentClass: "Nursery", classSortOrder: 1, dueAmount: 5000 }),
            candidate({ studentId: "b", studentClass: "Class 2", classSortOrder: 5, dueAmount: 3000 }),
          ],
        }),
      ),
      "class",
    );

  it("opens with what the whole list adds up to", () => {
    const text = renderAllCollectionsText(built(), {
      title: "Fees pending",
      sessionLabel: "TEST-2026-27",
    });

    expect(text).toContain("Fees pending - session TEST-2026-27");
    expect(text).toContain("2 students across 2 lists");
    expect(text).toContain("Rs. 8,000 outstanding");
  });

  it("keeps every group's own heading, so the block reads like the sheet", () => {
    const text = renderAllCollectionsText(built(), {
      title: "Fees pending",
      sessionLabel: "TEST-2026-27",
    });

    expect(text).toContain("Nursery - fees pending");
    expect(text).toContain("Class 2 - fees pending");
  });

  it("names every student the groups hold", () => {
    const groups = built();
    const text = renderAllCollectionsText(groups, {
      title: "Fees pending",
      sessionLabel: "TEST-2026-27",
    });

    for (const group of groups) {
      for (const row of group.rows) expect(text).toContain(row.studentName);
    }
  });

  it("formats a group identically alone and inside the whole list", () => {
    // The per-group Copy and the whole-list Copy must not drift: one is built
    // on the other precisely so a class cannot read two ways.
    const groups = built();
    const text = renderAllCollectionsText(groups, {
      title: "Fees pending",
      sessionLabel: "TEST-2026-27",
    });

    expect(text).toContain(renderCollectionText(groups[0]!));
  });
});

describe("toExportRow", () => {
  it("leaves amounts as numbers so the spreadsheet can sum its own money column", () => {
    const row = toExportRow(buildCollectionRows(audience({ candidates: [candidate()] }))[0]!);

    expect(row["Amount owed"]).toBe(13250);
    expect(typeof row["Amount owed"]).toBe("number");
  });

  it("names the transport charge beside the route, because a route has no one rate", () => {
    // Live: three of Amet City's 63 students carry an override and pay
    // Rs 10,000 / Rs 5,700 / Rs 10,000 against a standard Rs 7,000.
    const row = toExportRow(
      buildCollectionRows(
        audience({
          candidates: [candidate({ transportRoute: "Amet City", transportFeeAmount: 10000 })],
        }),
      )[0]!,
    );

    expect(row["Route"]).toBe("Amet City");
    expect(row["Transport fee"]).toBe(10000);
  });

  it("spells out a custom arrangement in the Route column rather than leaving it blank", () => {
    const row = toExportRow(
      buildCollectionRows(
        audience({
          candidates: [candidate({ transportRoute: null, transportFeeAmount: 14000 })],
        }),
      )[0]!,
    );

    expect(String(row["Route"])).toContain("Custom transport");
    expect(row["Transport fee"]).toBe(14000);
  });

  it("keeps Collected and Signature blank for the person holding the sheet", () => {
    const row = toExportRow(buildCollectionRows(audience({ candidates: [candidate()] }))[0]!);

    expect(row["Collected"]).toBe("");
    expect(row["Signature"]).toBe("");
  });

  it("gives every row the identical key set", () => {
    // json_to_sheet takes its headers from the FIRST row's keys only, so a row
    // with fewer keys silently drops columns from the whole sheet.
    const rows = buildCollectionRows(
      audience({
        candidates: [candidate()],
        paused: [paused()],
        unreachable: [
          {
            studentId: "u1",
            admissionNo: "TEST-800",
            studentName: "Chirag Meena",
            studentClass: "Class 1",
            classSortOrder: 4,
            transportRoute: null,
            transportFeeAmount: 0,
            parentName: "Mahesh Meena",
            phoneOnRecord: null,
            dueAmount: 5000,
            matchesNotice: true,
          },
        ],
      }),
    ).map(toExportRow);

    const first = JSON.stringify(Object.keys(rows[0]!));
    for (const row of rows) {
      expect(JSON.stringify(Object.keys(row))).toBe(first);
    }
  });
});

describe("isCollectionGroupBy", () => {
  it("refuses a hand-edited value rather than throwing", () => {
    expect(isCollectionGroupBy("class")).toBe(true);
    expect(isCollectionGroupBy("route")).toBe(true);
    expect(isCollectionGroupBy("amount")).toBe(true);
    expect(isCollectionGroupBy("everything")).toBe(false);
    expect(isCollectionGroupBy(null)).toBe(false);
  });
});
