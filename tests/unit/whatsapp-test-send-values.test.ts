import { describe, expect, it } from "vitest";

import {
  ALL_CAMPAIGNS,
  describeCampaign,
  type NoticeLanguage,
  type NoticeSituation,
  type NoticeValues,
} from "@/modules/whatsapp/domain/campaigns";
import {
  isMoneySlot,
  noticeValuesFromSlots,
  openingNoticeValues,
  SLOT_VALUE_KEYS,
  slotFormFromValues,
} from "@/modules/whatsapp/domain/test-send-values";

/** Approved or not — a pending notice is previewed and tested too. */
const campaignFor = (situation: NoticeSituation, language: NoticeLanguage) =>
  describeCampaign(situation, language)!;

/**
 * The test panel's fields and the action's send go through ONE mapping.
 *
 * Before this file existed, each carried its own copy covering three of the
 * seven notices; the other four fell into the previous-session branch and would
 * have posted a session label where the installment should be. A test send that
 * proves the wrong message is worse than no test send.
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

const SITUATIONS = Object.keys(SLOT_VALUE_KEYS) as NoticeSituation[];

describe("the test-send slot mapping", () => {
  it("covers every registered situation", () => {
    expect(SITUATIONS.sort()).toEqual(
      [...new Set(ALL_CAMPAIGNS.map((campaign) => campaign.situation))].sort(),
    );
  });

  it.each(SITUATIONS)("%s round-trips: what the panel previews is what the action sends", (situation) => {
    // values → form fields → values → params must equal values → params. If it
    // does not, the preview and the send disagree about the message.
    const campaign = campaignFor(situation, "en");
    const form = slotFormFromValues(situation, VALUES);
    const back = noticeValuesFromSlots(situation, form, campaign.sample);
    expect(campaign.buildParams(back)).toEqual(campaign.buildParams(VALUES));
  });

  it.each(SITUATIONS)("%s posts a field for every slot the campaign declares", (situation) => {
    // A slot with no field would silently send the sample for that slot on
    // every test, and staff could never prove that position.
    for (const language of ["hi", "en"] as const) {
      const form = slotFormFromValues(situation, VALUES);
      for (const slot of campaignFor(situation, language).slotOrder) {
        expect(Object.keys(form)).toContain(slot);
      }
    }
  });

  it("agrees with every skeleton about which slots are money", () => {
    for (const campaign of ALL_CAMPAIGNS) {
      for (const slot of campaign.slotOrder) {
        const expected = [
          "amount",
          "feesPending",
          "lateFeeApplied",
          "totalToPay",
        ].includes(slot) || (campaign.situation === "balance" && slot === "contextLine");
        expect(isMoneySlot(campaign.situation, slot)).toBe(expected);
      }
    }
  });

  it("keeps the promised date as text on promise_lapsed", () => {
    // Slot 4 is the date the family gave, not a rupee figure. Treating it as a
    // number would turn "28-08-2026" into 28.
    const values = noticeValuesFromSlots(
      "promise_lapsed",
      { contextLine: "28-08-2026", amount: "9125" },
      campaignFor("promise_lapsed", "en").sample,
    );
    expect(values.promisedDate).toBe("28-08-2026");
    expect(values.amountDue).toBe(9125);
    expect(isMoneySlot("promise_lapsed", "contextLine")).toBe(false);
  });

  it("reads the balance notice's context line as money", () => {
    const values = noticeValuesFromSlots(
      "balance",
      { contextLine: "6500", amount: "11750" },
      campaignFor("balance", "en").sample,
    );
    expect(values.receivedSoFar).toBe(6500);
    expect(values.balanceDue).toBe(11750);
  });

  it("gives late_fee_applied its three money slots, and the total still adds up when blank", () => {
    const campaign = campaignFor("late_fee_applied", "en");
    const values = noticeValuesFromSlots(
      "late_fee_applied",
      { contextLine: "Installment 2", feesPending: "9125", lateFeeApplied: "1000", totalToPay: "" },
      campaign.sample,
    );
    expect(values.installmentPhrase).toBe("Installment 2");
    expect(values.amountDue).toBe(9125);
    expect(values.lateFeeApplied).toBe(1000);
    // The builder derives the total from the two lines above it, so a blank or
    // stale total field cannot produce three lines that disagree.
    expect(campaign.buildParams(values).slice(4)).toEqual(["9,125", "1,000", "10,125"]);
  });

  it("falls back to the sample slot by slot, never to zero or an empty string", () => {
    const sample = campaignFor("fee_due", "en").sample;
    const values = noticeValuesFromSlots(
      "fee_due",
      { parentName: "  ", contextLine: "", amount: "abc", date: "", lateFeePhrase: undefined },
      sample,
    );
    expect(values.parentName).toBe(sample.parentName);
    expect(values.installmentPhrase).toBe(sample.installmentPhrase);
    expect(values.amountDue).toBe(sample.amountDue);
    expect(values.lastDate).toBe(sample.lastDate);
    expect(values.lateFeePhrase).toBe(sample.lateFeePhrase);

    // Zero and negative money are not a test of anything either.
    expect(noticeValuesFromSlots("fee_due", { amount: "0" }, sample).amountDue).toBe(sample.amountDue);
    expect(noticeValuesFromSlots("fee_due", { amount: "-5" }, sample).amountDue).toBe(sample.amountDue);
  });

  it("keeps the waiver's date as text, and its two figures as money", () => {
    const values = noticeValuesFromSlots(
      "late_fee_waiver",
      { contextLine: "Installment 2", feesPending: "9125", lateFeeApplied: "1000", date: "20-09-2026" },
      campaignFor("late_fee_waiver", "en").sample,
    );
    expect(values.amountDue).toBe(9125);
    expect(values.lateFeeApplied).toBe(1000);
    expect(values.lastDate).toBe("20-09-2026");
    expect(isMoneySlot("late_fee_waiver", "date")).toBe(false);
    expect(campaignFor("waiver_last_call", "en").buildParams(values).slice(4)).toEqual([
      "9,125",
      "1,000",
      "20-09-2026",
    ]);
  });

  it("keeps promise_due's 'spoken on' date as text in slot 4", () => {
    const values = noticeValuesFromSlots(
      "promise_due",
      { contextLine: "05-09-2026", amount: "9125", date: "10-09-2026" },
      campaignFor("promise_due", "en").sample,
    );
    expect(values.promiseRecordedDate).toBe("05-09-2026");
    expect(values.lastDate).toBe("10-09-2026");
    expect(isMoneySlot("promise_due", "contextLine")).toBe(false);
  });

  describe("openingNoticeValues", () => {
    const settings = {
      situation: "fee_due" as NoticeSituation,
      language: "en" as NoticeLanguage,
      installments: [1, 2],
      lastDate: "30-09-2026",
      lateFeeAmount: 500,
      lateFeeBasis: "per_installment" as const,
    };

    it("lays the screen's date and late fee over the Meta sample when the list is empty", () => {
      const values = openingNoticeValues(settings, null);
      expect(values.parentName).toBe(campaignFor("fee_due", "en").sample.parentName);
      expect(values.lastDate).toBe("30-09-2026");
      expect(values.lateFeePhrase).toBe("Rs. 500 per installment");
    });

    it("keeps the sample's own date on a notice that prints no run date", () => {
      // `promise_due`'s sample carries a date that agrees with its "spoken on"
      // line; the run's date would contradict it.
      const values = openingNoticeValues({ ...settings, situation: "promise_due" }, null);
      expect(values.lastDate).toBe(campaignFor("promise_due", "en").sample.lastDate);
      expect(values.promiseRecordedDate).toBe("05-09-2026");
    });

    it("projects the real top row through the send's own mapping", () => {
      const values = openingNoticeValues(settings, {
        parentName: "Sita Devi",
        studentName: "Riya",
        studentClass: "Class 3",
        dueAmount: 7000,
        totalPaid: 0,
        balanceDue: 7000,
        prevYearBalance: 0,
        prevSessionLabel: null,
      });
      expect(values.parentName).toBe("Sita Devi");
      expect(values.amountDue).toBe(7000);
      expect(values.installmentPhrase).toBe("Installment 1 and 2");
      expect(values.lastDate).toBe("30-09-2026");
    });
  });

  it("keeps what staff typed when it is usable", () => {
    const values = noticeValuesFromSlots(
      "upcoming",
      { parentName: "Sita Devi", contextLine: "Installment 3", amount: "9125", date: "20-10-2026" },
      campaignFor("upcoming", "en").sample,
    );
    expect(values.parentName).toBe("Sita Devi");
    expect(values.installmentPhrase).toBe("Installment 3");
    expect(values.amountDue).toBe(9125);
    expect(values.lastDate).toBe("20-10-2026");
  });
});
