import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  describeFamilyCampaign,
  FAMILY_CAMPAIGNS,
} from "@/modules/whatsapp/domain/campaign-bodies-v3";

import {
  childrenLine,
  chooseDestinations,
  describeFamilyRun,
  ESCALATE_TO_SECOND_NUMBER_AFTER,
  groupIntoFamilies,
  resolveFamilyLanguage,
  type FamilyMemberInput,
} from "@/modules/whatsapp/domain/family-grouping";

/**
 * One phone, one message.
 *
 * A parent with three children was getting three messages within a few seconds:
 * three times the cost, and three times the nagging for one family who owes one
 * total. Every rule here decides either what a real parent reads or what the
 * school is billed, so all of them are pinned.
 */

function member(overrides: Partial<FamilyMemberInput> = {}): FamilyMemberInput {
  return {
    studentId: "s1",
    studentName: "Aaradhya Gurjar",
    studentClass: "Class 2",
    parentName: "Ramesh Lal Gurjar",
    destination: "+919352205884",
    dueAmount: 9000,
    preferredLanguage: null,
    sentCount: 0,
    secondaryDestination: null,
    ...overrides,
  };
}

describe("childrenLine", () => {
  it("names each child with the class the rest of the message uses", () => {
    // `Class ` is stripped exactly as slot 3 strips it, so the line reads the
    // same way as the body around it.
    expect(
      childrenLine([
        { studentName: "Aaradhya", studentClass: "Class 2" },
        { studentName: "Bhavya", studentClass: "Class 5" },
      ]),
    ).toBe("Aaradhya (2), Bhavya (5)");
  });

  it("leaves the unprefixed class labels alone", () => {
    expect(
      childrenLine([
        { studentName: "Kavya", studentClass: "Nursery" },
        { studentName: "Dev", studentClass: "11 Science" },
      ]),
    ).toBe("Kavya (Nursery), Dev (11 Science)");
  });

  it("falls back to the bare name rather than printing an empty bracket", () => {
    expect(childrenLine([{ studentName: "Aaradhya", studentClass: "" }])).toBe("Aaradhya");
  });
});

describe("resolveFamilyLanguage", () => {
  it("follows the run when the family has never said", () => {
    const resolved = resolveFamilyLanguage([{ preferredLanguage: null }], "hi");
    expect(resolved).toEqual({ language: "hi", isOverride: false });
  });

  it("keeps the family's own language when the run disagrees", () => {
    // The run's language is a DEFAULT. A family who reads English keeps English
    // through a Hindi run, because the preference is about them.
    const resolved = resolveFamilyLanguage([{ preferredLanguage: "en" }], "hi");
    expect(resolved).toEqual({ language: "en", isOverride: true });
  });

  it("does not call it an override when the family and the run agree", () => {
    const resolved = resolveFamilyLanguage([{ preferredLanguage: "hi" }], "hi");
    expect(resolved).toEqual({ language: "hi", isOverride: false });
  });

  it("takes the first stated preference, since siblings share one message", () => {
    const resolved = resolveFamilyLanguage(
      [{ preferredLanguage: null }, { preferredLanguage: "en" }],
      "hi",
    );
    expect(resolved.language).toBe("en");
  });
});

describe("chooseDestinations", () => {
  it("uses one number until the family has ignored two delivered notices", () => {
    for (let sentCount = 0; sentCount < ESCALATE_TO_SECOND_NUMBER_AFTER; sentCount += 1) {
      expect(
        chooseDestinations({ primary: "+91111", secondary: "+91222", sentCount }),
      ).toEqual([{ destination: "+91111", role: "primary" }]);
    }
  });

  it("adds the other parent on the third notice", () => {
    expect(
      chooseDestinations({
        primary: "+91111",
        secondary: "+91222",
        sentCount: ESCALATE_TO_SECOND_NUMBER_AFTER,
      }),
    ).toEqual([
      { destination: "+91111", role: "primary" },
      { destination: "+91222", role: "secondary" },
    ]);
  });

  it("never escalates when there is no second number", () => {
    expect(
      chooseDestinations({ primary: "+91111", secondary: null, sentCount: 9 }),
    ).toEqual([{ destination: "+91111", role: "primary" }]);
  });

  it("treats the same digits in both fields as one number", () => {
    // Father and mother rows carrying the same number is common. Billing the
    // school twice to reach one handset is not an escalation, it is a bug.
    expect(
      chooseDestinations({ primary: "+91111", secondary: "+91111", sentCount: 9 }),
    ).toEqual([{ destination: "+91111", role: "primary" }]);
  });

  it("never returns more than two, however long a family holds out", () => {
    const chosen = chooseDestinations({
      primary: "+91111",
      secondary: "+91222",
      sentCount: 50,
    });
    expect(chosen).toHaveLength(2);
  });
});

describe("groupIntoFamilies", () => {
  it("puts one message on a phone that carries three children", () => {
    const families = groupIntoFamilies(
      [
        member({ studentId: "a", studentName: "Aaradhya", dueAmount: 9000 }),
        member({ studentId: "b", studentName: "Bhavya", studentClass: "Class 5", dueAmount: 4000 }),
        member({ studentId: "c", studentName: "Kavya", studentClass: "Nursery", dueAmount: 2000 }),
      ],
      "hi",
    );

    expect(families).toHaveLength(1);
    const family = families[0]!;
    expect(family.members).toHaveLength(3);
    expect(family.destinations).toHaveLength(1);
    // One family, one total.
    expect(family.totalAmount).toBe(15000);
    expect(family.childrenLine).toBe("Aaradhya (2), Bhavya (5), Kavya (Nursery)");
  });

  it("makes the biggest debt the spokesperson, whatever order it arrived in", () => {
    // The fallback names ONE child. It should be the one the office would have
    // led with, not whichever row happened to sort first.
    const families = groupIntoFamilies(
      [
        member({ studentId: "small", studentName: "Kavya", dueAmount: 2000 }),
        member({ studentId: "big", studentName: "Aaradhya", dueAmount: 9000 }),
      ],
      "hi",
    );

    const family = families[0]!;
    expect(family.spokesperson.studentId).toBe("big");
    expect(family.spokesperson.isSpokesperson).toBe(true);
    expect(family.covered.map((m) => m.studentId)).toEqual(["small"]);
    expect(family.covered[0]!.isSpokesperson).toBe(false);
  });

  it("keeps separate phones as separate families", () => {
    const families = groupIntoFamilies(
      [
        member({ studentId: "a", destination: "+91111" }),
        member({ studentId: "b", destination: "+91222" }),
      ],
      "hi",
    );

    expect(families).toHaveLength(2);
    expect(families.every((family) => family.members.length === 1)).toBe(true);
    expect(families.every((family) => family.covered.length === 0)).toBe(true);
  });

  it("escalates on the family's longest history, not the newest sibling's", () => {
    // A child who joined this term has been messaged nothing. If the family's
    // clock reset to zero every time a sibling was added, a family who has
    // ignored five notices would never reach the second number.
    const families = groupIntoFamilies(
      [
        member({ studentId: "old", sentCount: 4, secondaryDestination: "+91222" }),
        member({ studentId: "new", sentCount: 0, secondaryDestination: "+91222" }),
      ],
      "hi",
    );

    expect(families[0]!.destinations).toHaveLength(2);
  });

  it("carries the family's language onto the family, not the run's", () => {
    const families = groupIntoFamilies(
      [
        member({ studentId: "a", preferredLanguage: null }),
        member({ studentId: "b", preferredLanguage: "en" }),
      ],
      "hi",
    );

    expect(families[0]!.language).toBe("en");
    expect(families[0]!.languageIsOverride).toBe(true);
  });
});

describe("describeFamilyRun", () => {
  it("counts messages billed, not students owing", () => {
    // The office used to read "171 families" and be billed for 171 messages.
    // With siblings grouped the two differ, and the one that costs money is the
    // one worth showing before Send.
    const families = groupIntoFamilies(
      [
        member({ studentId: "a", destination: "+91111", dueAmount: 9000 }),
        member({ studentId: "b", destination: "+91111", dueAmount: 4000 }),
        member({ studentId: "c", destination: "+91222", dueAmount: 3000 }),
      ],
      "hi",
    );

    expect(describeFamilyRun(families)).toEqual({
      messages: 2,
      students: 3,
      familiesWithSiblings: 1,
      secondNumberSends: 0,
    });
  });

  it("counts a second number as a second billed message", () => {
    const families = groupIntoFamilies(
      [member({ studentId: "a", sentCount: 5, secondaryDestination: "+91999" })],
      "hi",
    );

    const summary = describeFamilyRun(families);
    expect(summary.messages).toBe(2);
    expect(summary.students).toBe(1);
    expect(summary.secondNumberSends).toBe(1);
  });
});

describe("the family campaigns", () => {
  it("declares eight, none of them approved", () => {
    // Written and ready to submit. Until Meta says otherwise, `sendFamily`
    // falls back to the spokesperson's per-child notice once per phone.
    expect(FAMILY_CAMPAIGNS).toHaveLength(8);
    expect(FAMILY_CAMPAIGNS.every((entry) => entry.approved === false)).toBe(true);
    expect(FAMILY_CAMPAIGNS.every((entry) => entry.audience === "family")).toBe(true);
  });

  it("sends five slots, in the order the registry document records", () => {
    // Five, not seven: a family notice names the children and quotes ONE total,
    // so there is no per-child installment phrase and no per-child figure.
    for (const campaign of FAMILY_CAMPAIGNS) {
      expect(campaign.slotOrder).toHaveLength(5);
      expect(campaign.buildParams(campaign.sample)).toHaveLength(5);
    }

    expect(
      describeFamilyCampaign("fee_due", "en")!.buildParams({
        parentName: "Ramesh Lal Gurjar",
        childrenLine: "Aaradhya (2), Bhavya (5)",
        totalAmount: 22375,
        lastDate: "20-10-2026",
        lateFeePhrase: "Rs. 1,000 per installment",
      }),
    ).toEqual([
      "Ramesh Lal Gurjar",
      "Aaradhya (2), Bhavya (5)",
      "22,375",
      "20-10-2026",
      "Rs. 1,000 per installment",
    ]);
  });

  it("never puts a rupee glyph in the money slot", () => {
    // The body prints `रु.` / `Rs.` itself, so a glyph in the value arrives
    // doubled — the same rule as the per-student notices.
    for (const campaign of FAMILY_CAMPAIGNS) {
      const total = campaign.buildParams(campaign.sample)[2]!;
      expect(total).not.toContain("₹");
      expect(total).not.toContain("Rs.");
      expect(total).not.toContain("रु");
    }
  });

  it("never sends an empty late-fee slot", () => {
    for (const campaign of FAMILY_CAMPAIGNS) {
      const params = campaign.buildParams({ ...campaign.sample, lateFeePhrase: undefined });
      expect(params[4]!.trim()).not.toBe("");
    }
  });

  it("names one campaign per situation and language, and nothing else", () => {
    expect(FAMILY_CAMPAIGNS.map((entry) => entry.campaignName).sort()).toEqual([
      "vpps_app_family_balance_en_v3",
      "vpps_app_family_balance_hi_v3",
      "vpps_app_family_fee_due_en_v3",
      "vpps_app_family_fee_due_hi_v3",
      "vpps_app_family_late_fee_applied_en_v3",
      "vpps_app_family_late_fee_applied_hi_v3",
      "vpps_app_family_upcoming_en_v3",
      "vpps_app_family_upcoming_hi_v3",
    ]);
  });

  it("words each situation differently, so Meta does not read them as duplicates", () => {
    const bodies = FAMILY_CAMPAIGNS.filter((entry) => entry.language === "en").map((entry) =>
      entry.renderPreview(entry.sample),
    );
    expect(new Set(bodies).size).toBe(bodies.length);
  });

  it("agrees with the registry document about campaign names", () => {
    const doc = readFileSync(
      join(process.cwd(), "docs/modules/whatsapp-campaign-registry.md"),
      "utf8",
    );
    const named = new Set(doc.match(/vpps_app_[a-z0-9_]+/g) ?? []);
    for (const campaign of FAMILY_CAMPAIGNS) {
      expect([...named]).toContain(campaign.campaignName);
    }
  });
});
