import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ALL_CAMPAIGNS,
  describeCampaign,
} from "@/modules/whatsapp/domain/campaign-bodies-v3";
import {
  APPROVED_CAMPAIGNS,
  campaignFor,
  installmentPhrase,
  isCampaignApproved,
  shortClassLabel,
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
};

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
};

/**
 * The six that may actually be posted today.
 *
 * Pinned as a LIST rather than a count, so approving a template is a visible
 * one-line diff in this file and never something that happens by a descriptor
 * being added with the wrong default.
 */
const APPROVED_NAMES = [
  "vpps_app_balance_en_v2",
  "vpps_app_balance_hi_v2",
  "vpps_app_fee_due_en_v2",
  "vpps_app_fee_due_hi_v2",
  "vpps_app_prevyear_en_v2",
  "vpps_app_prevyear_hi_v2",
];

describe("the registered campaigns", () => {
  it("covers seven situations in two languages, and nothing else", () => {
    expect(ALL_CAMPAIGNS).toHaveLength(14);
    expect(ALL_CAMPAIGNS.map((c) => c.campaignName).sort()).toEqual(
      Object.keys(EXPECTED_SLOTS).sort(),
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

  it("keeps exactly the six live campaigns sendable", () => {
    expect(APPROVED_CAMPAIGNS.map((c) => c.campaignName).sort()).toEqual(APPROVED_NAMES);
  });

  it("refuses to hand out a campaign Meta has not approved", () => {
    // The v3 eight are written and disabled. `campaignFor` is the only door to
    // a send, so this is what stops one reaching AiSensy as
    // `400 Campaign does not exist.` with a run recording an attempt.
    expect(isCampaignApproved("upcoming", "hi")).toBe(false);
    expect(() => campaignFor("upcoming", "hi")).toThrow(/awaiting Meta approval/i);
    expect(() => campaignFor("late_fee_applied", "en")).toThrow(/awaiting Meta approval/i);

    // But the descriptor is still reachable, so the screen can show the notice,
    // preview its body and count its audience while refusing to send it.
    expect(describeCampaign("upcoming", "hi")?.campaignName).toBe("vpps_app_upcoming_hi_v3");
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

  it("keeps one slot skeleton across every notice but late_fee_applied", () => {
    // The whole point of v2. Three shapes were three chances to get an order
    // wrong; one shape is checkable in a line.
    //
    // `late_fee_applied` is the single documented exception: three money slots
    // and no date, because the fee has been charged rather than threatened. It
    // is asserted separately below rather than being allowed to widen this set,
    // so a SECOND stray shape still fails here.
    const shapes = new Set(
      ALL_CAMPAIGNS.filter((c) => c.situation !== "late_fee_applied").map((c) =>
        c.slotOrder.join(","),
      ),
    );
    expect(shapes.size).toBe(1);
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

  it("sends upcoming and upcoming_final the same seven values", () => {
    // They differ only in wording. A slot difference between them would mean the
    // office reading one preview and a parent getting the other shape.
    for (const language of ["hi", "en"] as const) {
      const courtesy = describeCampaign("upcoming", language)!;
      const firm = describeCampaign("upcoming_final", language)!;
      expect(courtesy.buildParams(VALUES)).toEqual(firm.buildParams(VALUES));
      expect(courtesy.renderPreview(VALUES)).not.toBe(firm.renderPreview(VALUES));
    }
  });

  it("matches hi and en on everything except the words", () => {
    for (const situation of [
      "fee_due",
      "balance",
      "prevyear",
      "upcoming",
      "upcoming_final",
      "late_fee_applied",
      "promise_lapsed",
    ] as const) {
      const hi = describeCampaign(situation, "hi")!;
      const en = describeCampaign(situation, "en")!;
      expect(hi.slotOrder).toEqual(en.slotOrder);
      expect(hi.buildParams(VALUES)).toEqual(en.buildParams(VALUES));
      expect(hi.renderPreview(VALUES)).not.toBe(en.renderPreview(VALUES));
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
    const preview = campaignFor("fee_due", "hi").renderPreview(VALUES);
    expect(preview).toContain("फीस सूचना");
    expect(preview).toContain("कक्षा: 2");
    expect(preview).toContain("देय राशि: रु. 18,250");
    expect(preview).toContain("अंतिम तिथि: 25-08-2026");
    expect(preview).toContain("अंतिम तिथि के बाद विलंब शुल्क: Rs. 1,000 per installment");
    // The UPI link is part of the approved body, not a link the app adds.
    expect(preview).toContain("upi://pay?pa=shriveerpattassecsch.68347408@hdfcbank");
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
