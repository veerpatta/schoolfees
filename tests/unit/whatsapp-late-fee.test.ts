import { describe, expect, it } from "vitest";

import {
  describeLateFeeDrift,
  isLateFeeBasis,
  lateFeePhrase,
} from "@/modules/whatsapp/domain/late-fee";

/**
 * Slot {{7}} of every v2 notice.
 *
 * Two things here reach a parent and cannot be taken back: the wording, which
 * the school will be held to, and the guarantee that the slot is never empty —
 * WhatsApp rejects an empty parameter, so a blank would fail a whole run at the
 * provider rather than at the desk.
 */

describe("lateFeePhrase", () => {
  it.each([
    [1000, "per_installment", "en", "Rs. 1,000 per installment"],
    [1000, "per_installment", "hi", "रु. 1,000 प्रति किश्त"],
    [50, "per_day", "en", "Rs. 50 per day"],
    [50, "per_day", "hi", "रु. 50 प्रति दिन"],
    [1000, "flat", "en", "Rs. 1,000"],
    [1000, "flat", "hi", "रु. 1,000"],
    [0, "none", "en", "Not applicable on this amount"],
    [0, "none", "hi", "इस राशि पर लागू नहीं"],
  ] as const)("%i %s in %s reads %s", (amount, basis, language, expected) => {
    expect(lateFeePhrase(amount, basis, language)).toBe(expected);
  });

  it("matches the wording the registry document approved", () => {
    // These four strings were reviewed against the approved bodies. Changing one
    // means a template that says something the school did not agree to.
    expect(lateFeePhrase(1000, "per_installment", "en")).toBe("Rs. 1,000 per installment");
    expect(lateFeePhrase(1000, "per_installment", "hi")).toBe("रु. 1,000 प्रति किश्त");
  });

  it("never returns an empty string, whatever it is given", () => {
    const bases = ["per_installment", "per_day", "flat", "none"] as const;
    for (const basis of bases) {
      for (const language of ["hi", "en"] as const) {
        for (const amount of [0, -1, Number.NaN, 1000]) {
          expect(lateFeePhrase(amount, basis, language).trim()).not.toBe("");
        }
      }
    }
  });

  it("reads a zero or nonsense amount as 'not charged', never as Rs. 0", () => {
    // "Rs. 0 per installment" is worse than saying nothing — it invites an
    // argument about a number the school never meant.
    expect(lateFeePhrase(0, "per_installment", "en")).toBe("Not applicable on this amount");
    expect(lateFeePhrase(Number.NaN, "flat", "hi")).toBe("इस राशि पर लागू नहीं");
    expect(lateFeePhrase(-500, "per_day", "en")).toBe("Not applicable on this amount");
  });

  it("groups the amount and never doubles the currency word", () => {
    const phrase = lateFeePhrase(125000, "flat", "en");
    expect(phrase).toBe("Rs. 1,25,000");
    expect(phrase.match(/Rs\./g)).toHaveLength(1);
  });
});

describe("isLateFeeBasis", () => {
  it("accepts the four and refuses everything else", () => {
    for (const good of ["per_installment", "per_day", "flat", "none"]) {
      expect(isLateFeeBasis(good)).toBe(true);
    }
    for (const bad of ["per_week", "", null, undefined, 1000, {}]) {
      expect(isLateFeeBasis(bad)).toBe(false);
    }
  });
});

describe("describeLateFeeDrift", () => {
  const ledger = 1000;

  it("says nothing when the message matches the ledger", () => {
    expect(
      describeLateFeeDrift({
        amount: 1000,
        basis: "per_installment",
        ledgerAmount: ledger,
        isCarryForward: false,
      }),
    ).toBeNull();
  });

  it("warns when the amount differs", () => {
    const warning = describeLateFeeDrift({
      amount: 2500,
      basis: "per_installment",
      ledgerAmount: ledger,
      isCarryForward: false,
    });
    expect(warning).toContain("2,500");
    expect(warning).toContain("1,000");
  });

  it("warns when the basis differs, because the receipt will not match", () => {
    const warning = describeLateFeeDrift({
      amount: 50,
      basis: "per_day",
      ledgerAmount: ledger,
      isCarryForward: false,
    });
    expect(warning).toContain("per-day");
  });

  it("warns when the notice says none but the ledger charges", () => {
    const warning = describeLateFeeDrift({
      amount: 0,
      basis: "none",
      ledgerAmount: ledger,
      isCarryForward: false,
    });
    expect(warning).toContain("no late fee");
  });

  it("warns when a carry-forward notice threatens a fee that never accrues", () => {
    // Carry-forward rows carry a rate of 0 deliberately. Quoting one is allowed
    // — it is a lever — but the office should know the receipt will not show it.
    const warning = describeLateFeeDrift({
      amount: 1000,
      basis: "per_installment",
      ledgerAmount: ledger,
      isCarryForward: true,
    });
    expect(warning).toContain("carry-forward");
  });

  it("is quiet on a carry-forward notice that charges nothing", () => {
    expect(
      describeLateFeeDrift({
        amount: 0,
        basis: "none",
        ledgerAmount: ledger,
        isCarryForward: true,
      }),
    ).toBeNull();
  });

  it("never returns something that reads as a block", () => {
    // It is advice, not a refusal — the owner set this control deliberately.
    const warnings = [
      describeLateFeeDrift({ amount: 50, basis: "per_day", ledgerAmount: ledger, isCarryForward: false }),
      describeLateFeeDrift({ amount: 1, basis: "flat", ledgerAmount: ledger, isCarryForward: false }),
      describeLateFeeDrift({ amount: 999, basis: "per_installment", ledgerAmount: ledger, isCarryForward: true }),
    ].filter(Boolean) as string[];

    expect(warnings.length).toBeGreaterThan(0);
    for (const warning of warnings) {
      expect(warning).not.toMatch(/cannot|refus|blocked|not allowed/i);
    }
  });
});
