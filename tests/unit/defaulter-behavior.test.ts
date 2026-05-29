import { describe, expect, it } from "vitest";

import {
  classifyPaymentBehavior,
  type BehaviorInput,
} from "@/lib/defaulters/behavior";

const base: BehaviorInput = {
  installmentsPaidOnTime: 0,
  installmentsPaidLate: 0,
  overdueInstallmentCount: 0,
  daysOverdue: 0,
  noAnswerStreak: 0,
};

describe("classifyPaymentBehavior", () => {
  it("flags non_responsive once the no-answer streak hits the threshold", () => {
    expect(
      classifyPaymentBehavior({ ...base, installmentsPaidOnTime: 3, noAnswerStreak: 3 }),
    ).toBe("non_responsive");
  });

  it("non_responsive wins over payment history (calls dominate)", () => {
    // A historically reliable payer who stops answering still routes to its own bucket.
    expect(
      classifyPaymentBehavior({ ...base, installmentsPaidOnTime: 4, noAnswerStreak: 4 }),
    ).toBe("non_responsive");
  });

  it("returns new when there is no payment history and shallow arrears", () => {
    expect(classifyPaymentBehavior({ ...base, overdueInstallmentCount: 1, daysOverdue: 10 })).toBe(
      "new",
    );
  });

  it("returns chronic when nothing is paid and arrears are deep", () => {
    expect(classifyPaymentBehavior({ ...base, overdueInstallmentCount: 2 })).toBe("chronic");
    expect(classifyPaymentBehavior({ ...base, daysOverdue: 75 })).toBe("chronic");
  });

  it("returns reliable when most paid installments were on time", () => {
    expect(
      classifyPaymentBehavior({
        ...base,
        installmentsPaidOnTime: 3,
        installmentsPaidLate: 1,
        overdueInstallmentCount: 1,
        daysOverdue: 5,
      }),
    ).toBe("reliable");
  });

  it("returns delays_but_pays when most paid installments landed late", () => {
    expect(
      classifyPaymentBehavior({
        ...base,
        installmentsPaidOnTime: 1,
        installmentsPaidLate: 2,
        overdueInstallmentCount: 1,
        daysOverdue: 20,
      }),
    ).toBe("delays_but_pays");
  });

  it("downgrades an otherwise-reliable payer who broke a promise", () => {
    const reliableInput: BehaviorInput = {
      ...base,
      installmentsPaidOnTime: 3,
      installmentsPaidLate: 0,
      overdueInstallmentCount: 1,
      daysOverdue: 5,
    };
    expect(classifyPaymentBehavior(reliableInput)).toBe("reliable");
    expect(classifyPaymentBehavior({ ...reliableInput, brokenPromise: true })).toBe("delays_but_pays");
  });

  it("escalates a payer to chronic when deeply overdue despite some history", () => {
    expect(
      classifyPaymentBehavior({
        ...base,
        installmentsPaidOnTime: 2,
        installmentsPaidLate: 1,
        overdueInstallmentCount: 2,
        daysOverdue: 120,
      }),
    ).toBe("chronic");
  });
});
