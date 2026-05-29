import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { composeMorningBrief, type MorningBriefTranslator } from "@/lib/dashboard/morning-brief";

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

const messages = JSON.parse(
  readFileSync(join(process.cwd(), "messages", "en.json"), "utf-8"),
);

const t = createTranslator({
  locale: "en",
  messages,
  namespace: "Dashboard",
}) as unknown as MorningBriefTranslator;

describe("composeMorningBrief", () => {
  it("confirms an all-clear morning when nothing is pending", () => {
    const text = composeMorningBrief({ kpis: { ...ZERO_KPIS }, t });
    expect(text).toBe("All installments on track — nothing to chase today.");
  });

  it("confirms all-clear when there is pending money but no students to chase", () => {
    const text = composeMorningBrief({
      kpis: { ...ZERO_KPIS, totalPending: 50_000 },
      followUpCount: 0,
      t,
    });
    expect(text).toMatch(/nothing to chase today/);
  });

  it("frames the brief as a follow-up action with the pending amount and student count", () => {
    const text = composeMorningBrief({
      kpis: { ...ZERO_KPIS, totalPending: 1_234_500 },
      followUpCount: 47,
      t,
    });
    expect(text).toMatch(/Follow up with 47 students/);
    expect(text).toMatch(/₹12,34,500/);
  });

  it("pluralizes the student count", () => {
    const text = composeMorningBrief({
      kpis: { ...ZERO_KPIS, totalPending: 1_000 },
      followUpCount: 1,
      t,
    });
    expect(text).toMatch(/1 student(?!s)/);
  });

  it("names the installment and overdue status in the action", () => {
    const overdue = composeMorningBrief({
      kpis: { ...ZERO_KPIS, totalPending: 100_000 },
      followUpCount: 5,
      currentInstallment: {
        label: "Q1",
        dueDate: "20-04-2026",
        status: "overdue",
      },
      t,
    });
    expect(overdue).toMatch(/Q1 is overdue/);
    expect(overdue).toMatch(/follow up with 5 students/i);

    const dueToday = composeMorningBrief({
      kpis: { ...ZERO_KPIS, totalPending: 100_000 },
      followUpCount: 5,
      currentInstallment: {
        label: "Q2",
        dueDate: "20-07-2026",
        status: "due_today",
      },
      t,
    });
    expect(dueToday).toMatch(/Q2 is due today/);
  });

  it("includes the due date for an upcoming installment", () => {
    const text = composeMorningBrief({
      kpis: { ...ZERO_KPIS, totalPending: 100_000 },
      followUpCount: 5,
      currentInstallment: {
        label: "Q3",
        dueDate: "20-10-2026",
        status: "upcoming",
      },
      t,
    });
    expect(text).toMatch(/before Q3 \(due 20-10-2026\)/);
  });

  it("never produces an LLM-style hallucination — output is a deterministic concat", () => {
    const input = {
      kpis: { ...ZERO_KPIS, totalPending: 5000 },
      followUpCount: 3,
      t,
    } as const;
    expect(composeMorningBrief({ ...input })).toBe(composeMorningBrief({ ...input }));
  });
});
