import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { summarizeBatchRows, type PrevYearImportRowView } from "@/lib/prev-year-dues/data";

const row = (overrides: Partial<PrevYearImportRowView>): PrevYearImportRowView => ({
  id: Math.random().toString(36),
  rowIndex: 0,
  sourceAdmissionNo: null,
  sourceName: null,
  prevYearDue: null,
  ownerDecision: "confirm",
  matchMethod: "admission_no",
  matchedStudentId: null,
  matchedAdmissionNo: null,
  appliedInstallmentId: null,
  appliedAmount: null,
  status: "applied",
  skipReason: null,
  ...overrides,
});

describe("summarizeBatchRows", () => {
  it("counts applied / skipped / error / pending and sums applied amounts", () => {
    const rows = [
      row({ status: "applied", appliedAmount: 1000 }),
      row({ status: "applied", appliedAmount: 2500 }),
      row({ status: "skipped", ownerDecision: "write_off", skipReason: "write-off" }),
      row({ status: "pending", ownerDecision: "pending" }),
      row({ status: "error", skipReason: "duplicate" }),
    ];
    const out = summarizeBatchRows(rows);
    expect(out.applied).toBe(2);
    expect(out.appliedSubtotal).toBe(3500);
    expect(out.skipped).toBe(1);
    expect(out.pending).toBe(1);
    expect(out.error).toBe(1);
    // skipped + pending + error rows surface in notApplied for follow-up
    expect(out.notApplied).toHaveLength(3);
  });

  it("returns an all-zero breakdown for no rows", () => {
    const out = summarizeBatchRows([]);
    expect(out.applied).toBe(0);
    expect(out.appliedSubtotal).toBe(0);
    expect(out.notApplied).toHaveLength(0);
  });
});
