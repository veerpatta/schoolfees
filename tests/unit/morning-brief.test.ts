import { describe, expect, it } from "vitest";

import { composeMorningBrief } from "@/lib/dashboard/morning-brief";

const ZERO_KPIS = {
  totalStudents: 0,
  totalExpectedFees: 0,
  totalCollected: 0,
  totalPending: 0,
  overdueAmount: 0,
  todaysCollection: 0,
  thisMonthCollection: 0,
  receiptsToday: 0,
  collectionRate: 0,
} as const;

describe("composeMorningBrief", () => {
  it("greets a quiet morning when nothing is collected and nothing pending", () => {
    const text = composeMorningBrief({ kpis: { ...ZERO_KPIS } });
    expect(text).toContain("Today: no collections yet.");
  });

  it("composes the collected line with pluralization", () => {
    const oneReceipt = composeMorningBrief({
      kpis: { ...ZERO_KPIS, todaysCollection: 10_000, receiptsToday: 1 },
    });
    expect(oneReceipt).toMatch(/1 receipt(?!s)/);

    const many = composeMorningBrief({
      kpis: { ...ZERO_KPIS, todaysCollection: 84_200, receiptsToday: 12 },
    });
    expect(many).toMatch(/12 receipts/);
  });

  it("uses the caller's curated pending phrase when supplied", () => {
    const text = composeMorningBrief({
      kpis: { ...ZERO_KPIS, totalPending: 1_000_000 },
      pendingPhrase: "47 students still owe Q1.",
    });
    expect(text).toContain("47 students still owe Q1.");
    // The fallback "pending across the school" line should NOT appear.
    expect(text).not.toMatch(/still pending across the school/);
  });

  it("falls back to total pending when no curated phrase is supplied", () => {
    const text = composeMorningBrief({
      kpis: { ...ZERO_KPIS, totalPending: 1_234_500 },
    });
    expect(text).toMatch(/still pending across the school/);
  });

  it("appends a curated installment status when one is current", () => {
    const overdue = composeMorningBrief({
      kpis: { ...ZERO_KPIS },
      currentInstallment: {
        label: "Q1",
        dueDate: "20-04-2026",
        status: "overdue",
      },
    });
    expect(overdue).toMatch(/Q1 is overdue/);

    const today = composeMorningBrief({
      kpis: { ...ZERO_KPIS },
      currentInstallment: {
        label: "Q2",
        dueDate: "20-07-2026",
        status: "due_today",
      },
    });
    expect(today).toMatch(/Q2 is due today\./);
  });

  it("never produces an LLM-style hallucination — output is a deterministic concat", () => {
    const a = composeMorningBrief({
      kpis: { ...ZERO_KPIS, todaysCollection: 5000, receiptsToday: 1 },
    });
    const b = composeMorningBrief({
      kpis: { ...ZERO_KPIS, todaysCollection: 5000, receiptsToday: 1 },
    });
    expect(a).toBe(b);
  });
});
