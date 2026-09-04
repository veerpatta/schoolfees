import { describe, expect, it } from "vitest";

import {
  ALL_CAMPAIGNS,
  campaignFor,
  type NoticeSituation,
  type NoticeValues,
} from "@/modules/whatsapp/domain/campaigns";
import {
  isMoneySlot,
  noticeValuesFromSlots,
  SLOT_VALUE_KEYS,
  slotFormFromValues,
} from "@/modules/whatsapp/domain/test-send-values";

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
