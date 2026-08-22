import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ALL_CAMPAIGNS,
  campaignFor,
  installmentPhrase,
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
};

describe("the six approved campaigns", () => {
  it("covers three situations in two languages, and nothing else", () => {
    expect(ALL_CAMPAIGNS).toHaveLength(6);
    expect(ALL_CAMPAIGNS.map((c) => c.campaignName).sort()).toEqual(
      Object.keys(EXPECTED_SLOTS).sort(),
    );
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

  it("keeps one slot skeleton across all six", () => {
    // The whole point of v2. Three shapes were three chances to get an order
    // wrong; one shape is checkable in a line.
    const shapes = new Set(ALL_CAMPAIGNS.map((c) => c.slotOrder.join(",")));
    expect(shapes.size).toBe(1);
  });

  it("matches hi and en on everything except the words", () => {
    for (const situation of ["fee_due", "balance", "prevyear"] as const) {
      const hi = campaignFor(situation, "hi");
      const en = campaignFor(situation, "en");
      expect(hi.slotOrder).toEqual(en.slotOrder);
      expect(hi.buildParams(VALUES)).toEqual(en.buildParams(VALUES));
      expect(hi.renderPreview(VALUES)).not.toBe(en.renderPreview(VALUES));
    }
  });

  it("refuses a combination that has no approved template", () => {
    // Better a thrown error at the desk than a silent send through the wrong one.
    // @ts-expect-error deliberately invalid
    expect(() => campaignFor("waiver", "hi")).toThrow();
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
