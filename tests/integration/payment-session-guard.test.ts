import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getFeePolicySummary = vi.fn();
const getStudentDetail = vi.fn();
const createClient = vi.fn();

vi.mock("@/lib/fees/data", () => ({
  getFeePolicySummary,
  getFeePolicyForSession: vi.fn(async (sessionLabel: string) => ({
    academicSessionLabel: sessionLabel,
    receiptPrefix: sessionLabel === "2025-26" ? "SVP25" : "SVP",
    acceptedPaymentModes: [{ value: "cash", label: "Cash" }],
  })),
}));

vi.mock("@/lib/students/data", () => ({
  getStudentDetail,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

vi.mock("@/lib/system-sync/finance-sync", () => ({
  prepareDuesForStudentsAutomatically: vi.fn(),
}));

function countClient() {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockResolvedValue({ count: 4, error: null }),
    })),
  };
}

describe("payment session guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFeePolicySummary.mockResolvedValue({
      academicSessionLabel: "2026-27",
      receiptPrefix: "SVP",
      acceptedPaymentModes: [{ value: "cash", label: "Cash" }],
    });
  });

  it("preflight accepts old-year students when the working session is 2025-26", async () => {
    getStudentDetail.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      classSessionLabel: "2025-26",
      status: "active",
    });
    createClient
      .mockResolvedValueOnce(countClient())
      .mockResolvedValueOnce({
        rpc: vi.fn().mockResolvedValue({
          data: [
            {
              installment_id: "00000000-0000-4000-8000-000000000101",
              installment_no: 1,
              installment_label: "Installment 1",
              due_date: "2025-04-20",
              total_charge: 1000,
              paid_amount: 0,
              adjustment_amount: 0,
              raw_late_fee: 0,
              waiver_applied: 0,
              final_late_fee: 0,
              pending_amount: 1000,
              balance_status: "pending",
            },
          ],
          error: null,
        }),
      });

    const { preflightPaymentPosting } = await import("@/lib/payments/data");

    await expect(
      preflightPaymentPosting({
        studentId: "00000000-0000-4000-8000-000000000001",
        sessionLabel: "2025-26",
        paymentDate: "2026-05-15",
        paymentAmount: 500,
        paymentMode: "cash",
        referenceNumber: null,
      }),
    ).resolves.toMatchObject({
      activeFeeSetupSession: "2025-26",
      studentClassSession: "2025-26",
      reason: "preflight_passed",
    });
  });

  it("preflight rejects when student year and working session differ", async () => {
    getStudentDetail.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      classSessionLabel: "2025-26",
      status: "active",
    });
    createClient.mockResolvedValueOnce(countClient());

    const { preflightPaymentPosting } = await import("@/lib/payments/data");

    await expect(
      preflightPaymentPosting({
        studentId: "00000000-0000-4000-8000-000000000001",
        sessionLabel: "2026-27",
        paymentDate: "2026-05-15",
        paymentAmount: 500,
        paymentMode: "cash",
        referenceNumber: null,
      }),
    ).rejects.toThrow("Student belongs to another academic year.");
  });
});
