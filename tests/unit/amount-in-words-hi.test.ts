import { describe, expect, it } from "vitest";

import { amountInWordsHindi } from "@/lib/helpers/amount-in-words-hi";

describe("amountInWordsHindi", () => {
  it("renders zero", () => {
    expect(amountInWordsHindi(0)).toBe("शून्य रुपये मात्र");
  });

  it("renders single and compound 1–99 words", () => {
    expect(amountInWordsHindi(1)).toBe("एक रुपये मात्र");
    expect(amountInWordsHindi(21)).toBe("इक्कीस रुपये मात्र");
    expect(amountInWordsHindi(99)).toBe("निन्यानवे रुपये मात्र");
  });

  it("renders hundreds, thousands, and lakhs with Indian grouping", () => {
    expect(amountInWordsHindi(100)).toBe("एक सौ रुपये मात्र");
    expect(amountInWordsHindi(1100)).toBe("एक हज़ार एक सौ रुपये मात्र");
    expect(amountInWordsHindi(11100)).toBe("ग्यारह हज़ार एक सौ रुपये मात्र");
    expect(amountInWordsHindi(125000)).toBe("एक लाख पच्चीस हज़ार रुपये मात्र");
  });

  it("clamps negatives and rounds fractions to whole rupees", () => {
    expect(amountInWordsHindi(-50)).toBe("शून्य रुपये मात्र");
    expect(amountInWordsHindi(99.4)).toBe("निन्यानवे रुपये मात्र");
    expect(amountInWordsHindi(99.6)).toBe("एक सौ रुपये मात्र");
  });
});
