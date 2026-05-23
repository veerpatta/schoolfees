import { beforeEach, describe, expect, it, vi } from "vitest";

const after = vi.fn((callback: () => void | Promise<void>) => {
  void callback();
});
const prepareDuesForStudentsAutomatically = vi.fn(async () => ({
  readyForPaymentCount: 2,
}));
const revalidateSessionFinance = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("next/server", () => ({
  after,
}));

vi.mock("@/lib/system-sync/finance-sync", () => ({
  prepareDuesForStudentsAutomatically,
}));

vi.mock("@/lib/system-sync/finance-revalidation", () => ({
  revalidateSessionFinance,
}));

describe("dashboard auto-prepare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("schedules background dues prep for write staff when installment rows are missing", async () => {
    const { scheduleDashboardAutoPrepare } = await import("@/lib/dashboard/data");

    scheduleDashboardAutoPrepare({
      canAutoPrepareDues: true,
      sessionLabel: "2026-27",
      health: {
        studentsMissingInstallmentRows: 2,
        studentsMissingInstallments: [
          {
            studentId: "student-1",
            admissionNo: "SR-1",
            fullName: "Student One",
            sessionLabel: "2026-27",
          },
          {
            studentId: "student-2",
            admissionNo: "SR-2",
            fullName: "Student Two",
            sessionLabel: "2026-27",
          },
        ],
      },
    });

    expect(after).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(prepareDuesForStudentsAutomatically).toHaveBeenCalledWith({
        studentIds: ["student-1", "student-2"],
        reason: "Dashboard auto-prepare",
      });
    });
    expect(revalidateSessionFinance).toHaveBeenCalledWith("2026-27", [
      "student-1",
      "student-2",
    ]);
  });

  it("does not schedule auto-prepare without fee write access", async () => {
    const { scheduleDashboardAutoPrepare } = await import("@/lib/dashboard/data");

    scheduleDashboardAutoPrepare({
      canAutoPrepareDues: false,
      sessionLabel: "2026-27",
      health: {
        studentsMissingInstallmentRows: 1,
        studentsMissingInstallments: [
          {
            studentId: "student-1",
            admissionNo: "SR-1",
            fullName: "Student One",
            sessionLabel: "2026-27",
          },
        ],
      },
    });

    expect(after).not.toHaveBeenCalled();
  });
});
