import { describe, expect, it } from "vitest";

import {
  suggestPhoneLabel,
  type PhoneResponsiveness,
} from "@/lib/defaulters/cadence";

function stat(partial: Partial<PhoneResponsiveness> & { label: string }): PhoneResponsiveness {
  return {
    attempts: 0,
    reached: 0,
    noAnswerStreak: 0,
    lastReachedAt: null,
    ...partial,
  };
}

describe("suggestPhoneLabel", () => {
  it("returns null when there is no per-number signal", () => {
    expect(suggestPhoneLabel(undefined)).toBeNull();
    expect(suggestPhoneLabel({})).toBeNull();
    expect(suggestPhoneLabel({ Father: stat({ label: "Father", attempts: 0 }) })).toBeNull();
  });

  it("prefers the number with the most recent reached outcome", () => {
    const perNumber = {
      Father: stat({ label: "Father", attempts: 5, reached: 1, lastReachedAt: "2026-05-01T10:00:00Z" }),
      Mother: stat({ label: "Mother", attempts: 2, reached: 1, lastReachedAt: "2026-05-20T10:00:00Z" }),
    };
    expect(suggestPhoneLabel(perNumber)).toBe("Mother");
  });

  it("falls back to the best answer-rate when no one has been reached", () => {
    const perNumber = {
      Father: stat({ label: "Father", attempts: 6, reached: 0, noAnswerStreak: 6 }),
      Mother: stat({ label: "Mother", attempts: 4, reached: 0, noAnswerStreak: 2 }),
    };
    // Equal (zero) answer rate → shortest no-answer streak wins.
    expect(suggestPhoneLabel(perNumber)).toBe("Mother");
  });

  it("suggests the only number that has ever answered", () => {
    const perNumber = {
      Father: stat({ label: "Father", attempts: 4, reached: 0, noAnswerStreak: 4 }),
      Mother: stat({ label: "Mother", attempts: 3, reached: 2, lastReachedAt: "2026-05-10T09:00:00Z" }),
    };
    expect(suggestPhoneLabel(perNumber)).toBe("Mother");
  });

  it("honors preferred order on a tie", () => {
    const perNumber = {
      Father: stat({ label: "Father", attempts: 2, reached: 1 }),
      Mother: stat({ label: "Mother", attempts: 2, reached: 1 }),
    };
    expect(suggestPhoneLabel(perNumber, ["Father", "Mother"])).toBe("Father");
    expect(suggestPhoneLabel(perNumber, ["Mother", "Father"])).toBe("Mother");
  });
});
