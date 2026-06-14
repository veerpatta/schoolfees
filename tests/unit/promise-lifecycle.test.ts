import { describe, expect, it } from "vitest";

import { resolvePromiseStatus } from "@/lib/defaulters/promise-lifecycle";
import type { DefaulterContactSummary } from "@/lib/defaulters/cadence";

function promisedPay(overrides: Partial<DefaulterContactSummary> = {}) {
  return {
    lastOutcome: "promised_pay",
    lastContactedAt: "2026-05-20T10:00:00+05:30",
    snoozeUntil: "2026-05-24",
    ...overrides,
  } satisfies DefaulterContactSummary;
}

describe("resolvePromiseStatus", () => {
  it("marks a promise kept when payment arrives after the promise was made", () => {
    expect(
      resolvePromiseStatus({
        summary: promisedPay(),
        lastPaymentDate: "2026-05-21",
        today: "2026-05-25",
      }),
    ).toBe("kept");
  });

  it("marks a promise broken after the promised date passes without payment", () => {
    expect(
      resolvePromiseStatus({
        summary: promisedPay(),
        lastPaymentDate: null,
        today: "2026-05-25",
      }),
    ).toBe("broken");
  });

  it("keeps future promises pending", () => {
    expect(
      resolvePromiseStatus({
        summary: promisedPay({ snoozeUntil: "2026-05-28" }),
        lastPaymentDate: null,
        today: "2026-05-25",
      }),
    ).toBe("pending");
  });

  it("returns null when there is no current payment promise", () => {
    expect(
      resolvePromiseStatus({
        summary: {
          lastOutcome: "reached",
          lastContactedAt: "2026-05-20T10:00:00+05:30",
          snoozeUntil: null,
        },
        lastPaymentDate: null,
        today: "2026-05-25",
      }),
    ).toBeNull();
  });
});
