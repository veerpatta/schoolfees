import { describe, expect, it } from "vitest";

import {
  amountInWordsEnglish,
  amountInWordsEnglishFormal,
  englishAmountWords,
} from "@/platform/helpers/amount-in-words";

/**
 * These strings were printed on receipts before this helper existed — the phone
 * slip built them one way, the two A4 receipt documents another. Extracting the
 * shared code must not move a single character of either, because a parent can
 * be holding one of those receipts while the office prints a statement.
 *
 * The two renderings differ in casing AND in how compound tens join: the phone
 * slip hyphenates ("twenty-one"), the A4 documents space ("Twenty One").
 */
describe("englishAmountWords", () => {
  it("returns nothing for zero, so each caller states its own zero wording", () => {
    expect(englishAmountWords(0)).toBe("");
    expect(englishAmountWords(0, { style: "title" })).toBe("");
  });

  it("hyphenates compound tens in sentence style", () => {
    expect(englishAmountWords(1)).toBe("one");
    expect(englishAmountWords(21)).toBe("twenty-one");
    expect(englishAmountWords(99)).toBe("ninety-nine");
    expect(englishAmountWords(121)).toBe("one hundred twenty-one");
  });

  it("spaces compound tens in title style", () => {
    expect(englishAmountWords(1, { style: "title" })).toBe("One");
    expect(englishAmountWords(21, { style: "title" })).toBe("Twenty One");
    expect(englishAmountWords(99, { style: "title" })).toBe("Ninety Nine");
    expect(englishAmountWords(121, { style: "title" })).toBe("One Hundred Twenty One");
  });

  it("groups in the Indian system: crore, lakh, thousand", () => {
    expect(englishAmountWords(1_100)).toBe("one thousand one hundred");
    expect(englishAmountWords(11_100)).toBe("eleven thousand one hundred");
    expect(englishAmountWords(125_000)).toBe("one lakh twenty-five thousand");
    expect(englishAmountWords(11_65_255)).toBe(
      "eleven lakh sixty-five thousand two hundred fifty-five",
    );
    expect(englishAmountWords(1_00_00_000, { style: "title" })).toBe("One Crore");
  });

  it("clamps negatives and rounds fractions to whole rupees", () => {
    expect(englishAmountWords(-50)).toBe("");
    expect(englishAmountWords(99.4)).toBe("ninety-nine");
    expect(englishAmountWords(99.6)).toBe("one hundred");
  });
});

describe("amountInWordsEnglish — the phone receipt's wording", () => {
  it("renders zero", () => {
    expect(amountInWordsEnglish(0)).toBe("Rupees zero only");
  });

  it("wraps the sentence-style words", () => {
    expect(amountInWordsEnglish(11_100)).toBe("Rupees eleven thousand one hundred only");
    expect(amountInWordsEnglish(38_000)).toBe("Rupees thirty-eight thousand only");
  });

  it("takes the absolute value, matching the slip it replaced", () => {
    expect(amountInWordsEnglish(-1_000)).toBe("Rupees one thousand only");
  });
});

describe("amountInWordsEnglishFormal — the A4 documents' wording", () => {
  it("renders zero", () => {
    expect(amountInWordsEnglishFormal(0)).toBe("Zero Rupees Only");
  });

  it("wraps the title-style words", () => {
    expect(amountInWordsEnglishFormal(11_100)).toBe("Eleven Thousand One Hundred Rupees Only");
    expect(amountInWordsEnglishFormal(1_21_500)).toBe(
      "One Lakh Twenty One Thousand Five Hundred Rupees Only",
    );
  });

  it("clamps negatives rather than saying a family owes minus something", () => {
    expect(amountInWordsEnglishFormal(-1_000)).toBe("Zero Rupees Only");
  });
});
