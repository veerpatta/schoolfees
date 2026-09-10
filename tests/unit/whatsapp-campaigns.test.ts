import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { renderNoticePreview } from "@/modules/whatsapp/domain/campaign-bodies";
import {
  ALL_CAMPAIGNS,
  APPROVED_CAMPAIGNS,
  campaignFor,
  campaignNameFor,
  describeCampaign,
  installmentPhrase,
  isCampaignApproved,
  LEDGER_QUOTED_SITUATIONS,
  ledgerLateFeePhrase,
  noticeValuesFrom,
  RUN_DATE_FREE_SITUATIONS,
  shortClassLabel,
  type NoticeSettings,
  type NoticeSituation,
  type NoticeSubject,
  type NoticeValues,
} from "@/modules/whatsapp/domain/campaigns";

/**
 * The two things here that cost real money when they break: the slot COUNT each
 * campaign expects, and the ORDER the values go in.
 *
 * A wrong count is refused by AiSensy with "Template params does not match the
 * campaign" — visible, annoying, free. A wrong *order* is worse: it sends
 * cleanly, and a parent reads their child's class where the amount should be.
 */

const VALUES: NoticeValues = {
  parentName: "Ramesh Lal Gurjar",
  studentName: "Aaradhya Gurjar",
  studentClass: "Class 2",
  installmentPhrase: "Installment 1 and 2",
  amountDue: 18250,
  receivedSoFar: 6500,
  balanceDue: 11750,
  lastDate: "25-08-2026",
  prevSessionLabel: "2025-26",
  prevYearBalance: 20000,
  lateFeePhrase: "Rs. 1,000 per installment",
  lateFeeApplied: 1000,
  totalToPay: 19250,
  promisedDate: "28-08-2026",
  promiseRecordedDate: "20-08-2026",
};

const SITUATIONS: readonly NoticeSituation[] = [
  "fee_due",
  "balance",
  "prevyear",
  "upcoming",
  "upcoming_final",
  "late_fee_applied",
  "promise_lapsed",
  "late_fee_waiver",
  "waiver_last_call",
  "overdue_final",
  "promise_due",
  "exam_clearance",
];

/**
 * The slot counts the registry document records, per campaign.
 *
 * v2 collapsed three shapes (6/6/5) into one 7-slot skeleton. Keeping the map
 * per-campaign rather than a single `7` is deliberate: it is the shape of this
 * table that catches a campaign being added with the wrong count.
 */
const EXPECTED_SLOTS: Record<string, number> = {
  vpps_app_fee_due_hi_v2: 7,
  vpps_app_fee_due_en_v2: 7,
  vpps_app_balance_hi_v2: 7,
  vpps_app_balance_en_v2: 7,
  vpps_app_prevyear_hi_v2: 7,
  vpps_app_prevyear_en_v2: 7,
  vpps_app_upcoming_hi_v3: 7,
  vpps_app_upcoming_en_v3: 7,
  vpps_app_upcoming_final_hi_v3: 7,
  vpps_app_upcoming_final_en_v3: 7,
  vpps_app_late_fee_applied_hi_v3: 7,
  vpps_app_late_fee_applied_en_v3: 7,
  vpps_app_promise_lapsed_hi_v3: 7,
  vpps_app_promise_lapsed_en_v3: 7,
  vpps_app_late_fee_waiver_hi_v4: 7,
  vpps_app_late_fee_waiver_en_v4: 7,
  vpps_app_waiver_last_call_hi_v4: 7,
  vpps_app_waiver_last_call_en_v4: 7,
  vpps_app_overdue_final_hi_v4: 7,
  vpps_app_overdue_final_en_v4: 7,
  vpps_app_promise_due_hi_v4: 7,
  vpps_app_promise_due_en_v4: 7,
  vpps_app_exam_clearance_hi_v4: 7,
  vpps_app_exam_clearance_en_v4: 7,
};

/**
 * The twenty-four that may actually be posted.
 *
 * Pinned as a LIST rather than a count, so approving a template is a visible
 * one-line diff in this file and never something that happens by a descriptor
 * being added with the wrong default. The eight `_v3` names joined on
 * 2026-09-04, the day Meta approved them and their AiSensy campaigns went Live;
 * the ten `_v4` on 2026-09-08, the day they were submitted.
 */
const APPROVED_NAMES = [
  "vpps_app_balance_en_v2",
  "vpps_app_balance_hi_v2",
  "vpps_app_exam_clearance_en_v4",
  "vpps_app_exam_clearance_hi_v4",
  "vpps_app_fee_due_en_v2",
  "vpps_app_fee_due_hi_v2",
  "vpps_app_late_fee_applied_en_v3",
  "vpps_app_late_fee_applied_hi_v3",
  "vpps_app_late_fee_waiver_en_v4",
  "vpps_app_late_fee_waiver_hi_v4",
  "vpps_app_overdue_final_en_v4",
  "vpps_app_overdue_final_hi_v4",
  "vpps_app_prevyear_en_v2",
  "vpps_app_prevyear_hi_v2",
  "vpps_app_promise_due_en_v4",
  "vpps_app_promise_due_hi_v4",
  "vpps_app_promise_lapsed_en_v3",
  "vpps_app_promise_lapsed_hi_v3",
  "vpps_app_upcoming_en_v3",
  "vpps_app_upcoming_final_en_v3",
  "vpps_app_upcoming_final_hi_v3",
  "vpps_app_upcoming_hi_v3",
  "vpps_app_waiver_last_call_en_v4",
  "vpps_app_waiver_last_call_hi_v4",
];

describe("the registered campaigns", () => {
  it("covers twelve situations in two languages, and nothing else", () => {
    expect(ALL_CAMPAIGNS).toHaveLength(24);
    expect(ALL_CAMPAIGNS.map((c) => c.campaignName).sort()).toEqual(
      Object.keys(EXPECTED_SLOTS).sort(),
    );
    expect([...new Set(ALL_CAMPAIGNS.map((c) => c.situation))].sort()).toEqual(
      [...SITUATIONS].sort(),
    );
  });

  it("marks approval explicitly on every descriptor", () => {
    // Never `approved: undefined`. A descriptor added without the field would
    // read as falsy and go quietly un-sendable, or - worse, if the default ever
    // flipped - send through a template Meta has not seen.
    for (const campaign of ALL_CAMPAIGNS) {
      expect(typeof campaign.approved).toBe("boolean");
    }
  });

  it("keeps exactly the live campaigns sendable", () => {
    expect(APPROVED_CAMPAIGNS.map((c) => c.campaignName).sort()).toEqual(APPROVED_NAMES);
  });

  it("hands out every approved campaign through every door", () => {
    // Through every door the screen and the send path use — so a notice cannot
    // be approved on one and pending on another.
    for (const campaign of APPROVED_CAMPAIGNS) {
      expect(isCampaignApproved(campaign.situation, campaign.language)).toBe(true);
      expect(campaignFor(campaign.situation, campaign.language).campaignName).toBe(
        campaign.campaignName,
      );
      expect(campaignNameFor(campaign.situation, campaign.language)).toBe(campaign.campaignName);
      expect(describeCampaign(campaign.situation, campaign.language)).toBe(campaign);
    }
  });

  it("has nothing pending, and the pending path still refuses to send", () => {
    // All twenty-four are Live since 2026-09-08. The refusal itself is still
    // exercised on a descriptor flipped off in memory: the send log is keyed
    // on the campaign name, so the screen still needs the name; the picker
    // still needs the descriptor to show the chip disabled; and only
    // `campaignFor` — the one path to sending — must refuse. The guard that
    // stops an unapproved notice reaching AiSensy is pinned separately in
    // tests/unit/whatsapp-send-guards.test.ts.
    expect(ALL_CAMPAIGNS.filter((campaign) => !campaign.approved)).toEqual([]);
    for (const campaign of ALL_CAMPAIGNS) {
      expect(campaignNameFor(campaign.situation, campaign.language)).toBe(campaign.campaignName);
      expect(describeCampaign(campaign.situation, campaign.language)).toBe(campaign);
    }
  });

  it("names the installments carrying the late fee, not the run's active set", () => {
    // The calendar's active pair on 2026-09-04 was [1, 2]. A family late only on
    // installment 2 was reading "Installment 1 and 2 / Fees pending: Rs. 9,125",
    // which is the one line a parent checks against their receipt book.
    const subject: NoticeSubject = {
      parentName: "Ramesh Lal Gurjar",
      studentName: "Aaradhya Gurjar",
      studentClass: "Class 2",
      dueAmount: 9125,
      totalPaid: 9125,
      balanceDue: 9125,
      prevYearBalance: 0,
      prevSessionLabel: null,
      lateFeeApplied: 1000,
      lateFeeInstallments: [2],
      overdueInstallments: [1, 2],
    };
    const settings = (situation: NoticeSettings["situation"]): NoticeSettings => ({
      situation,
      language: "en",
      installments: [1, 2, 3],
      lastDate: "20-10-2026",
      lateFeeAmount: 1000,
      lateFeeBasis: "per_installment",
    });

    // The ledger-quoted three name the installments the fee is ON.
    for (const situation of LEDGER_QUOTED_SITUATIONS) {
      expect(noticeValuesFrom(subject, settings(situation)).installmentPhrase).toBe(
        "Installment 2",
      );
    }
    // The overdue notice names the passed installments still owed on.
    expect(noticeValuesFrom(subject, settings("overdue_final")).installmentPhrase).toBe(
      "Installment 1 and 2",
    );
    // Every other notice is about the installments the OFFICE chose.
    expect(noticeValuesFrom(subject, settings("fee_due")).installmentPhrase).toBe(
      "Installment 1, 2 and 3",
    );
    expect(noticeValuesFrom(subject, settings("exam_clearance")).installmentPhrase).toBe(
      "Installment 1, 2 and 3",
    );
    // And a late fee with no installments recorded falls back rather than
    // printing an empty slot.
    expect(
      noticeValuesFrom({ ...subject, lateFeeInstallments: [] }, settings("late_fee_applied"))
        .installmentPhrase,
    ).toBe("Installment 1, 2 and 3");
  });

  it("follows the family's own overdue rows when the office ticked nothing", () => {
    /**
     * `installmentPhrase([])` does NOT render empty — it falls back to a
     * hardcoded "Installment 1 and 2" / "किश्त 1 एवं 2".
     *
     * That was harmless while every preset carried an installment set. Since
     * `fee_due`'s preset stopped carrying one (2026-09-10, when the audience
     * became overdue-driven rather than installment-driven), an untouched run
     * reaches here with `installments: []` — and without the fallback below,
     * every fee-due message would print "Installment 1 and 2" beside an amount
     * summed over whatever is actually overdue. Correct today, and wrong the
     * morning of 21 October, when installment 3 joins the total and the
     * sentence still names two rows. A figure that does not match the rows
     * named beside it is the message that arrives at the counter.
     */
    const subject: NoticeSubject = {
      parentName: "Ramesh Lal Gurjar",
      studentName: "Aaradhya Gurjar",
      studentClass: "Class 2",
      dueAmount: 15125,
      totalPaid: 0,
      balanceDue: 15125,
      prevYearBalance: 0,
      prevSessionLabel: null,
      lateFeeApplied: 0,
      lateFeeInstallments: [],
      overdueInstallments: [1, 2, 3],
    };
    const nothingTicked: NoticeSettings = {
      situation: "fee_due",
      language: "en",
      installments: [],
      lastDate: "20-11-2026",
      lateFeeAmount: 1000,
      lateFeeBasis: "per_installment",
    };

    expect(noticeValuesFrom(subject, nothingTicked).installmentPhrase).toBe(
      "Installment 1, 2 and 3",
    );
    // Hindi takes the same path, so the fallback cannot be language-specific.
    expect(
      noticeValuesFrom(subject, { ...nothingTicked, language: "hi" }).installmentPhrase,
    ).toBe("किश्त 1, 2 एवं 3");

    // And a family with nothing overdue at all still gets a readable slot
    // rather than an empty parameter, which WhatsApp refuses outright.
    expect(
      noticeValuesFrom({ ...subject, overdueInstallments: [] }, nothingTicked).installmentPhrase,
    ).toBe("Installment 1 and 2");
  });

  it("prints the family's own promised date on promise_due, never the run's", () => {
    const subject: NoticeSubject = {
      parentName: "Ramesh Lal Gurjar",
      studentName: "Aaradhya Gurjar",
      studentClass: "Class 2",
      dueAmount: 9125,
      totalPaid: 0,
      balanceDue: 9125,
      prevYearBalance: 0,
      prevSessionLabel: null,
      promisedOn: "2026-09-10",
      promiseContactedOn: "2026-09-05",
    };
    const settings: NoticeSettings = {
      situation: "promise_due",
      language: "en",
      installments: [1, 2],
      lastDate: "30-09-2026",
      lateFeeAmount: 1000,
      lateFeeBasis: "per_installment",
    };
    const values = noticeValuesFrom(subject, settings);
    expect(values.lastDate).toBe("10-09-2026");
    expect(values.promiseRecordedDate).toBe("05-09-2026");
    expect(describeCampaign("promise_due", "en")!.buildParams(values)).toEqual([
      "Ramesh Lal Gurjar",
      "Aaradhya Gurjar",
      "2",
      "05-09-2026",
      "9,125",
      "10-09-2026",
      "Rs. 1,000 per installment",
    ]);
    // Every other notice prints the run's date.
    expect(noticeValuesFrom(subject, { ...settings, situation: "fee_due" }).lastDate).toBe(
      "30-09-2026",
    );
  });

  it("lists exactly the notices that print no run date", () => {
    // `late_fee_applied` has no date slot; `promise_due` prints each family's
    // own. The waiver pair are deliberately NOT here — their slot 7 is the
    // office's waive-by date, and the guard must refuse one already gone.
    expect([...RUN_DATE_FREE_SITUATIONS]).toEqual(["late_fee_applied", "promise_due"]);
    expect([...LEDGER_QUOTED_SITUATIONS]).toEqual([
      "late_fee_applied",
      "late_fee_waiver",
      "waiver_last_call",
    ]);
  });

  it.each(Object.entries(EXPECTED_SLOTS))("%s sends exactly %i params", (name, slots) => {
    const campaign = ALL_CAMPAIGNS.find((entry) => entry.campaignName === name)!;
    expect(campaign.slotOrder).toHaveLength(slots);
    expect(campaign.buildParams(VALUES)).toHaveLength(slots);
    // The sample submitted to Meta must fill the same shape.
    expect(campaign.buildParams(campaign.sample)).toHaveLength(slots);
  });

  it("puts the values in the order the registry document records", () => {
    expect(campaignFor("fee_due", "en").buildParams(VALUES)).toEqual([
      "Ramesh Lal Gurjar",
      "Aaradhya Gurjar",
      "2",
      "Installment 1 and 2",
      "18,250",
      "25-08-2026",
      "Rs. 1,000 per installment",
    ]);

    expect(campaignFor("balance", "en").buildParams(VALUES)).toEqual([
      "Ramesh Lal Gurjar",
      "Aaradhya Gurjar",
      "2",
      "6,500",
      "11,750",
      "25-08-2026",
      "Rs. 1,000 per installment",
    ]);

    // prevyear went 5 -> 7: it gained a settle-by date and a late-fee line, in
    // that order, because a late fee with no date says nothing.
    expect(campaignFor("prevyear", "en").buildParams(VALUES)).toEqual([
      "Ramesh Lal Gurjar",
      "Aaradhya Gurjar",
      "2",
      "2025-26",
      "20,000",
      "25-08-2026",
      "Rs. 1,000 per installment",
    ]);
  });

  it("never puts a rupee glyph in a MONEY slot", () => {
    // The bodies print `रु.` / `Rs.` themselves, so a glyph in a money slot
    // arrives doubled. Slot 7 is the exception by design: it is a whole phrase
    // and supplies its own currency word, which is why it is composed rather
    // than assembled from a number in the template.
    for (const campaign of ALL_CAMPAIGNS) {
      const params = campaign.buildParams(VALUES);
      for (const param of params.slice(0, -1)) {
        expect(param).not.toContain("₹");
        expect(param).not.toContain("रु");
        expect(param).not.toContain("Rs.");
      }
    }
  });

  it("never sends an empty slot 7 — WhatsApp rejects an empty parameter", () => {
    for (const campaign of ALL_CAMPAIGNS) {
      const withoutPhrase = { ...VALUES, lateFeePhrase: undefined };
      const params = campaign.buildParams(withoutPhrase);
      expect(params).toHaveLength(7);
      expect(params[6]!.trim()).not.toBe("");
    }
  });

  it("keeps three slot skeletons and no more", () => {
    // The whole point of v2. Three shapes were three chances to get an order
    // wrong; one shape is checkable in a line.
    //
    // Two documented exceptions: `late_fee_applied` (three money slots, no
    // date) and the waiver pair (two ledger figures, then the waive-by date).
    // Each is asserted separately below rather than being allowed to widen
    // this set, so a FOURTH stray shape still fails here.
    const shared = new Set(
      ALL_CAMPAIGNS.filter(
        (c) => !(LEDGER_QUOTED_SITUATIONS as readonly string[]).includes(c.situation),
      ).map((c) => c.slotOrder.join(",")),
    );
    expect(shared.size).toBe(1);

    const waiver = new Set(
      ALL_CAMPAIGNS.filter(
        (c) => c.situation === "late_fee_waiver" || c.situation === "waiver_last_call",
      ).map((c) => c.slotOrder.join(",")),
    );
    expect(waiver.size).toBe(1);
    expect([...waiver][0]).toBe(
      "parentName,studentName,studentClass,contextLine,feesPending,lateFeeApplied,date",
    );
  });

  it("gives late_fee_applied its own skeleton, in ledger order", () => {
    // Fees, late fee, total - three separate slots because the ledger keeps them
    // in three separate columns. Folding the first two together in the message
    // would be the first place "a late fee is not a fee" broke.
    for (const language of ["hi", "en"] as const) {
      const campaign = describeCampaign("late_fee_applied", language)!;
      expect([...campaign.slotOrder]).toEqual([
        "parentName",
        "studentName",
        "studentClass",
        "contextLine",
        "feesPending",
        "lateFeeApplied",
        "totalToPay",
      ]);
      expect(campaign.buildParams(VALUES)).toEqual([
        "Ramesh Lal Gurjar",
        "Aaradhya Gurjar",
        "2",
        "Installment 1 and 2",
        "18,250",
        "1,000",
        "19,250",
      ]);
    }
  });

  it("makes the three figures on late_fee_applied add up", () => {
    // A total that disagreed with its own two lines is the one error a parent
    // is guaranteed to spot, and the sample is what a Meta reviewer reads.
    for (const language of ["hi", "en"] as const) {
      const campaign = describeCampaign("late_fee_applied", language)!;
      const [, , , , fees, lateFee, total] = campaign.buildParams(campaign.sample);
      const num = (value: string) => Number(value.replace(/,/g, ""));
      expect(num(fees) + num(lateFee)).toBe(num(total));
    }

    // And it is derived, not trusted: a caller handing over a stale total still
    // produces a message whose lines agree.
    const stale = describeCampaign("late_fee_applied", "en")!.buildParams({
      ...VALUES,
      amountDue: 9125,
      lateFeeApplied: 1000,
      totalToPay: 999999,
    });
    expect(stale[6]).toBe("10,125");
  });

  it("sends the waiver pair the ledger's two figures and then the date", () => {
    // Fees and the late fee stay separate for the same reason as above, and
    // the waive-by date sits where every other notice carries a late-fee
    // phrase. Both waiver notices send the identical seven values and differ
    // only in wording, exactly as the courtesy and firm pre-due notices do.
    for (const language of ["hi", "en"] as const) {
      const window = describeCampaign("late_fee_waiver", language)!;
      const lastCall = describeCampaign("waiver_last_call", language)!;
      expect(window.buildParams(VALUES)).toEqual([
        "Ramesh Lal Gurjar",
        "Aaradhya Gurjar",
        "2",
        "Installment 1 and 2",
        "18,250",
        "1,000",
        "25-08-2026",
      ]);
      expect(lastCall.buildParams(VALUES)).toEqual(window.buildParams(VALUES));
      expect(renderNoticePreview("late_fee_waiver", language, VALUES)).not.toBe(
        renderNoticePreview("waiver_last_call", language, VALUES),
      );
    }
  });

  it("puts the promised date in slot 4 and the new date in slot 6", () => {
    // The order carries the whole force of the notice: what was agreed, then
    // what is now being asked. Reversed, it reads as the school moving the date.
    expect(describeCampaign("promise_lapsed", "en")!.buildParams(VALUES)).toEqual([
      "Ramesh Lal Gurjar",
      "Aaradhya Gurjar",
      "2",
      "28-08-2026",
      "18,250",
      "25-08-2026",
      "Rs. 1,000 per installment",
    ]);
  });

  it("sends upcoming, upcoming_final, overdue_final and exam_clearance the same seven values", () => {
    // They differ only in wording. A slot difference between them would mean the
    // office reading one preview and a parent getting the other shape.
    for (const language of ["hi", "en"] as const) {
      const courtesy = describeCampaign("upcoming", language)!;
      for (const situation of ["upcoming_final", "overdue_final", "exam_clearance"] as const) {
        const other = describeCampaign(situation, language)!;
        expect(other.buildParams(VALUES)).toEqual(courtesy.buildParams(VALUES));
        expect(renderNoticePreview(situation, language, VALUES)).not.toBe(
          renderNoticePreview("upcoming", language, VALUES),
        );
      }
    }
  });

  it("matches hi and en on everything except the words", () => {
    for (const situation of SITUATIONS) {
      const hi = describeCampaign(situation, "hi")!;
      const en = describeCampaign(situation, "en")!;
      expect(hi.slotOrder).toEqual(en.slotOrder);
      expect(hi.buildParams(VALUES)).toEqual(en.buildParams(VALUES));
      expect(renderNoticePreview(situation, "hi", VALUES)).not.toBe(
        renderNoticePreview(situation, "en", VALUES),
      );
    }
  });

  it("words every English body differently, so Meta does not read them as duplicates", () => {
    const bodies = SITUATIONS.map((situation) => renderNoticePreview(situation, "en", VALUES));
    expect(new Set(bodies).size).toBe(bodies.length);
  });

  it("keeps every body free of promotional wording", () => {
    // `vpps_waiver_offer_hinglish` went UTILITY → MARKETING in fourteen minutes
    // on "Good news" and "avail". A payment term is not a promotion, and the
    // bodies must read that way to a reviewer.
    for (const situation of SITUATIONS) {
      const body = renderNoticePreview(situation, "en", VALUES)!.toLowerCase();
      for (const word of ["good news", "offer", "avail", "benefit", "discount"]) {
        expect(body).not.toContain(word);
      }
    }
  });

  it("refuses a combination that is not registered at all", () => {
    // Better a thrown error at the desk than a silent send through the wrong one.
    // Worded differently from the awaiting-approval case: this one is a bug.
    // @ts-expect-error deliberately invalid
    expect(() => campaignFor("waiver", "hi")).toThrow(/no whatsapp campaign is registered/i);
  });

  it("agrees with the registry document about campaign names", () => {
    const doc = readFileSync(
      join(process.cwd(), "docs/modules/whatsapp-campaign-registry.md"),
      "utf8",
    );
    // Whole-token, never `toContain`. Campaign names are prefixes of one another
    // once a version suffix exists — `vpps_app_fee_due_hi` is a prefix of
    // `vpps_app_fee_due_hi_v2` — so a substring check keeps passing through a
    // rename while enforcing nothing, which is exactly when it is needed.
    const named = new Set(doc.match(/vpps_app_[a-z0-9_]+/g) ?? []);
    for (const campaign of ALL_CAMPAIGNS) {
      expect([...named]).toContain(campaign.campaignName);
    }
  });

  it("previews the body the parent will actually read", () => {
    const preview = renderNoticePreview("fee_due", "hi", VALUES)!;
    expect(preview).toContain("फीस सूचना");
    expect(preview).toContain("कक्षा: 2");
    expect(preview).toContain("देय राशि: रु. 18,250");
    expect(preview).toContain("अंतिम तिथि: 25-08-2026");
    expect(preview).toContain("अंतिम तिथि के बाद विलंब शुल्क: Rs. 1,000 per installment");
    // The UPI link is part of the approved body, not a link the app adds.
    expect(preview).toContain("upi://pay?pa=shriveerpattassecsch.68347408@hdfcbank");

    // The waiver reads the ledger's late fee and the waive-by date.
    const waiver = renderNoticePreview("late_fee_waiver", "en", VALUES)!;
    expect(waiver).toContain("Late fee on this account: Rs. 1,000");
    expect(waiver).toContain("Last date without late fee: 25-08-2026");
    expect(waiver).not.toContain("Total to pay");
  });
});

describe("shortClassLabel", () => {
  it.each([
    ["Class 1", "1"],
    ["Class 10", "10"],
    ["Class 2", "2"],
  ])("strips the prefix the template already prints: %s → %s", (input, expected) => {
    expect(shortClassLabel(input)).toBe(expected);
  });

  it.each(["Nursery", "JKG", "SKG", "11 Science", "11 Arts", "12 Commerce"])(
    "leaves %s alone",
    (label) => {
      expect(shortClassLabel(label)).toBe(label);
    },
  );

  it("survives an empty label", () => {
    expect(shortClassLabel("")).toBe("");
  });
});

describe("installmentPhrase", () => {
  it.each([
    [[1, 2], "Installment 1 and 2"],
    [[1], "Installment 1"],
    [[3], "Installment 3"],
    [[1, 2, 3], "Installment 1, 2 and 3"],
  ])("%j reads as %s", (installments, expected) => {
    expect(installmentPhrase(installments as number[])).toBe(expected);
  });

  it("sorts and de-duplicates, so the phrase never reads '2 and 1'", () => {
    expect(installmentPhrase([2, 1, 2])).toBe("Installment 1 and 2");
  });
});

describe("the two late-fee modes", () => {
  /**
   * Which figure a parent is told, and where it came from.
   *
   * Until 2026-09-10 the TEMPLATE decided: `late_fee_applied` and the waiver
   * pair always read the ledger and hid the control, the other nine always used
   * the typed amount and could not read the ledger at all. Neither half was
   * reachable from the other. These pin both modes on both kinds of slot,
   * because every one of them is a number a parent will hold the school to.
   */
  const subject = {
    parentName: "Ramesh Lal",
    studentName: "Aaradhya",
    studentClass: "Class 2",
    dueAmount: 9125,
    totalPaid: 0,
    balanceDue: 9125,
    prevYearBalance: 0,
    prevSessionLabel: null,
  };

  const settings = {
    language: "en" as const,
    installments: [1, 2],
    lastDate: "20-09-2026",
    lateFeeAmount: 4000,
    lateFeeBasis: "per_installment" as const,
    policyLateFeeAmount: 1000,
  };

  it("quotes the family's OWN charged fee in ledger mode, on the numeric slot", () => {
    const values = noticeValuesFrom(
      { ...subject, lateFeeApplied: 2000 },
      { ...settings, situation: "late_fee_applied", lateFeeSource: "ledger" },
    );

    expect(values.lateFeeApplied).toBe(2000);
    // Fees and the late fee reach the message in separate slots; only the
    // total adds them.
    expect(values.totalToPay).toBe(9125 + 2000);
  });

  it("quotes the TYPED amount in custom mode, on that same slot", () => {
    // The lever the office asked for, on the three notices that never had it.
    const values = noticeValuesFrom(
      { ...subject, lateFeeApplied: 2000 },
      { ...settings, situation: "late_fee_applied", lateFeeSource: "custom" },
    );

    expect(values.lateFeeApplied).toBe(4000);
    expect(values.totalToPay).toBe(9125 + 4000);
  });

  it("states the school's own RATE in ledger mode when nothing is charged yet", () => {
    // A fee-due notice warns about a fee that has not accrued. Quoting this
    // family's own zero would tell them no late fee applies — the opposite of
    // what the notice is for.
    const values = noticeValuesFrom(
      { ...subject, lateFeeApplied: 0 },
      { ...settings, situation: "fee_due", lateFeeSource: "ledger" },
    );

    expect(values.lateFeePhrase).toContain("1,000");
    expect(values.lateFeePhrase).toContain("per installment");
  });

  it("states the family's own figure as one flat charge once the ledger has charged it", () => {
    // The ledger has already decided the amount, so a "per installment" rate
    // would be describing a different thing.
    const values = noticeValuesFrom(
      { ...subject, lateFeeApplied: 2000 },
      { ...settings, situation: "overdue_final", lateFeeSource: "ledger" },
    );

    expect(values.lateFeePhrase).toContain("2,000");
    expect(values.lateFeePhrase).not.toContain("per installment");
  });

  it("keeps the typed amount and basis in custom mode", () => {
    const values = noticeValuesFrom(
      { ...subject, lateFeeApplied: 2000 },
      { ...settings, situation: "fee_due", lateFeeSource: "custom" },
    );

    expect(values.lateFeePhrase).toContain("4,000");
    expect(values.lateFeePhrase).toContain("per installment");
  });

  it("falls back to the typed amount rather than to 'not charged' when no policy was threaded", () => {
    // A caller that forgot `policyLateFeeAmount` must not silently tell a
    // parent no late fee applies. That is the worse of the two failures.
    const values = noticeValuesFrom(
      { ...subject, lateFeeApplied: 0 },
      { ...settings, situation: "fee_due", lateFeeSource: "ledger", policyLateFeeAmount: 0 },
    );

    expect(values.lateFeePhrase).toContain("4,000");
  });

  it("never threatens a late fee on a carry-forward balance, in either mode", () => {
    // The ledger charges NOTHING on a carry-forward row — those carry a rate of
    // 0 deliberately — and Meta approved this template's sample as "Not
    // applicable on this amount". Ledger mode quoting the policy rate here
    // would threaten a charge that can never happen, and the drift warning
    // cannot see it: it returns early in ledger mode because nothing is typed.
    const values = noticeValuesFrom(
      { ...subject, lateFeeApplied: 0, prevYearBalance: 20000, prevSessionLabel: "2025-26" },
      { ...settings, situation: "prevyear", lateFeeSource: "ledger" },
    );

    expect(values.lateFeePhrase).not.toContain("1,000");
    expect(values.lateFeePhrase).not.toContain("4,000");
    // The "not charged" wording, never an empty string — WhatsApp rejects those.
    expect((values.lateFeePhrase ?? "").length).toBeGreaterThan(0);
  });

  it("behaves exactly as before when no mode is given", () => {
    // Every pre-2026-09-10 link and saved campaign arrives without one.
    const ledgerQuoted = noticeValuesFrom(
      { ...subject, lateFeeApplied: 2000 },
      { ...settings, situation: "late_fee_applied" },
    );
    expect(ledgerQuoted.lateFeeApplied).toBe(2000);

    const lever = noticeValuesFrom(
      { ...subject, lateFeeApplied: 2000 },
      { ...settings, situation: "fee_due" },
    );
    expect(lever.lateFeePhrase).toContain("4,000");
  });
});

describe("the ledger late-fee phrase has ONE definition", () => {
  /**
   * The send path and the screen's "What a parent reads" line both need it, and
   * for one deploy they each had their own copy: the message correctly said
   * "not charged" on a carry-forward balance while the preview beside it still
   * promised Rs 1,000 per installment. The office reads the preview to decide,
   * so the copy that was wrong was the one that mattered.
   */
  const base = {
    language: "en" as const,
    policyLateFeeAmount: 1000,
    fallbackAmount: 4000,
    fallbackBasis: "per_installment" as const,
  };

  it("never threatens a carry-forward balance", () => {
    const phrase = ledgerLateFeePhrase({ ...base, situation: "prevyear" });
    expect(phrase).not.toContain("1,000");
    expect(phrase).not.toContain("4,000");
    // Never empty — WhatsApp rejects an empty parameter.
    expect(phrase.length).toBeGreaterThan(0);
  });

  it("states the school's rate for a family with nothing charged yet", () => {
    const phrase = ledgerLateFeePhrase({ ...base, situation: "fee_due", charged: 0 });
    expect(phrase).toContain("1,000");
    expect(phrase).toContain("per installment");
  });

  it("states the family's own total as one flat charge once the ledger has one", () => {
    const phrase = ledgerLateFeePhrase({ ...base, situation: "overdue_final", charged: 2000 });
    expect(phrase).toContain("2,000");
    expect(phrase).not.toContain("per installment");
  });

  it("is the function the screen uses, not a second copy", () => {
    // A recomputed phrase in the picker is the bug this replaced.
    const picker = readFileSync(
      join(process.cwd(), "src/modules/whatsapp/ui/notice-picker.tsx"),
      "utf8",
    );
    expect(picker).toContain("ledgerLateFeePhrase({");
    expect(picker).not.toContain('lateFeePhrase(\n    filters.policyLateFeeAmount');
  });

  it("is what the message itself renders, too", () => {
    // Same rule, reached through noticeValuesFrom.
    const values = noticeValuesFrom(
      {
        parentName: "R",
        studentName: "A",
        studentClass: "Class 2",
        dueAmount: 9000,
        totalPaid: 0,
        balanceDue: 9000,
        prevYearBalance: 20000,
        prevSessionLabel: "2025-26",
        lateFeeApplied: 0,
      },
      {
        situation: "prevyear",
        language: "en",
        installments: [],
        lastDate: "30-09-2026",
        lateFeeAmount: 4000,
        lateFeeBasis: "per_installment",
        lateFeeSource: "ledger",
        policyLateFeeAmount: 1000,
      },
    );

    expect(values.lateFeePhrase).toBe(
      ledgerLateFeePhrase({ ...base, situation: "prevyear" }),
    );
  });
});
