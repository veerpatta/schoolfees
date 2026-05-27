import { describe, expect, it } from "vitest";

import {
  formatInr,
  formatRupeesParts,
  type FormatInrOptions,
} from "@/lib/helpers/currency";
import {
  formatDateTimeIst,
  formatMediumDate,
  formatMonthYear,
  formatShortDate,
  formatTimeIst,
  formatTodayBadge,
} from "@/lib/helpers/date";
import {
  MONEY_GLOSSARY,
  MONEY_GLOSSARY_ORDER,
  getMoneyTerm,
} from "@/lib/money/glossary";

describe("formatInr", () => {
  it("returns the configured fallback for null/undefined/NaN", () => {
    expect(formatInr(null)).toBe("—");
    expect(formatInr(undefined)).toBe("—");
    expect(formatInr(Number.NaN)).toBe("—");
    expect(formatInr(null, { fallback: "" })).toBe("");
    expect(formatInr(undefined, { fallback: "N/A" })).toBe("N/A");
  });

  it("renders whole rupees in en-IN locale with the ₹ glyph", () => {
    expect(formatInr(0)).toBe("₹0");
    expect(formatInr(1)).toBe("₹1");
    expect(formatInr(1000)).toBe("₹1,000");
    expect(formatInr(100000)).toBe("₹1,00,000"); // Indian grouping
    expect(formatInr(38000)).toBe("₹38,000");
  });

  it("uses ASCII hyphen-minus for negatives — matches Intl en-IN currency default", () => {
    // This invariant is enforced by tests/ui/student-fee-breakup-display.test.tsx
    // which asserts "-₹32,000" (U+002D). Anything else here will silently
    // break that screenshot.
    expect(formatInr(-32000)).toBe("-₹32,000");
    expect(formatInr(-1)).toBe("-₹1");
  });

  it("renders the leading + only when signed=true and value is positive", () => {
    expect(formatInr(1000, { signed: true })).toBe("+₹1,000");
    expect(formatInr(0, { signed: true })).toBe("₹0");
    expect(formatInr(-1000, { signed: true })).toBe("-₹1,000");
  });

  it("renders paise when showPaise=true", () => {
    expect(formatInr(1234.56, { showPaise: true })).toBe("₹1,234.56");
    expect(formatInr(1234, { showPaise: true })).toBe("₹1,234.00");
  });

  it("renders compact form K/L/Cr when compact=true", () => {
    expect(formatInr(999, { compact: true })).toBe("₹999");
    expect(formatInr(1500, { compact: true })).toBe("₹1.5K");
    expect(formatInr(150000, { compact: true })).toBe("₹1.5L");
    expect(formatInr(15000000, { compact: true })).toBe("₹1.5Cr");
  });

  it("never emits the alternate Rs. literal — every figure carries the ₹ glyph", () => {
    const samples: number[] = [0, 1, 100, 1234, -567, 100000];
    for (const value of samples) {
      const result = formatInr(value);
      expect(result).not.toContain("Rs");
      expect(result).toContain("₹");
    }
  });

  it("formatRupeesParts decomposes value into sign/symbol/integer/paise", () => {
    expect(formatRupeesParts(38000)).toMatchObject({
      sign: "",
      symbol: "₹",
      integer: "38,000",
      paise: null,
    });
    expect(formatRupeesParts(-100, { signed: true })).toMatchObject({
      sign: "-",
      integer: "100",
    });
    expect(formatRupeesParts(12.5, { showPaise: true })).toMatchObject({
      sign: "",
      integer: "12",
      paise: "50",
    });
    expect(formatRupeesParts(null)).toMatchObject({ fallback: "—" });
  });

  it("all options together work without interference", () => {
    const opts: FormatInrOptions = { signed: true, showPaise: false };
    expect(formatInr(12345, opts)).toBe("+₹12,345");
  });
});

describe("date helpers", () => {
  // 28 May 2026 13:35 UTC → 19:05 IST (1900-2000 IST window)
  const sample = "2026-05-28T13:35:00.000Z";

  it("returns the configured fallback for null/empty/invalid", () => {
    expect(formatShortDate(null)).toBe("—");
    expect(formatShortDate("")).toBe("—");
    expect(formatShortDate("not-a-date")).toBe("—");
    expect(formatMediumDate(null)).toBe("—");
    expect(formatDateTimeIst(null)).toBe("—");
    expect(formatTimeIst(null)).toBe("—");
    expect(formatTodayBadge(null)).toBe("—");
    expect(formatMonthYear(null)).toBe("—");
  });

  it("respects the custom fallback override", () => {
    expect(formatShortDate(null, "n/a")).toBe("n/a");
    expect(formatDateTimeIst(null, "")).toBe("");
  });

  it("renders dates in en-IN format with Asia/Kolkata timezone", () => {
    // The exact string depends on Intl tables, so we just check the
    // recognizable shape — day, short month, year.
    const short = formatShortDate(sample);
    expect(short).toMatch(/^\d{1,2} \w{3} 2026$/);

    const dateTime = formatDateTimeIst(sample);
    expect(dateTime).toMatch(/2026/);
    expect(dateTime).toMatch(/(am|pm)/i);

    const time = formatTimeIst(sample);
    expect(time).toMatch(/(am|pm)/i);

    const monthYear = formatMonthYear(sample);
    expect(monthYear).toMatch(/^\w+ 2026$/);
  });
});

describe("money glossary", () => {
  it("every term in MONEY_GLOSSARY appears in MONEY_GLOSSARY_ORDER exactly once", () => {
    const keys = Object.keys(MONEY_GLOSSARY).sort();
    const order = [...MONEY_GLOSSARY_ORDER].sort();
    expect(order).toEqual(keys);
  });

  it("getMoneyTerm returns the term object for each key", () => {
    for (const key of MONEY_GLOSSARY_ORDER) {
      const term = getMoneyTerm(key);
      expect(term.key).toBe(key);
      expect(term.label.length).toBeGreaterThan(0);
      expect(term.summary.length).toBeGreaterThan(0);
      expect(term.detail.length).toBeGreaterThan(0);
    }
  });

  it("covers the must-have money labels — the user's clarity contract", () => {
    // These are the labels the user explicitly listed as the clarity goal:
    // how much is due, paid, discounted, late-fee, late-fee waived, when,
    // and by whom. If any of these terms goes missing, the contract is
    // broken — fail loudly.
    const required: Array<keyof typeof MONEY_GLOSSARY> = [
      "totalDue",
      "totalPaid",
      "outstanding",
      "balanceDue",
      "balanceAfterReceipt",
      "discountManual",
      "discountConventional",
      "discountCloseout",
      "lateFeeCharged",
      "lateFeeWaived",
      "lateFeePending",
      "paymentDate",
      "createdAt",
      "postedBy",
      "receivedBy",
      "adjustmentPositive",
      "adjustmentNegative",
    ];
    for (const key of required) {
      expect(MONEY_GLOSSARY[key]).toBeDefined();
    }
  });

  it("disambiguates the three different 'discount' concepts that staff confuse", () => {
    // discount-manual: student_fee_overrides.discount_amount
    // discount-conventional: RTE / Staff / 3rd-child
    // discount-closeout: payment_mode = 'discount'
    // All three must be present with unique summaries.
    const manual = MONEY_GLOSSARY.discountManual;
    const conventional = MONEY_GLOSSARY.discountConventional;
    const closeout = MONEY_GLOSSARY.discountCloseout;

    expect(manual.summary).not.toBe(conventional.summary);
    expect(conventional.summary).not.toBe(closeout.summary);
    expect(closeout.summary).not.toBe(manual.summary);

    // The labels must each contain the word "discount" so the glossary
    // search surfaces them.
    expect(manual.label.toLowerCase()).toContain("discount");
    expect(conventional.label.toLowerCase()).toContain("discount");
    expect(closeout.label.toLowerCase()).toContain("discount");
  });
});
