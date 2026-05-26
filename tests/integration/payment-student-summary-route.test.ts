import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireStaffPermission = vi.fn();
const getPaymentDeskStudentSummary = vi.fn();

vi.mock("@/lib/supabase/session", () => ({
  requireStaffPermission,
}));

vi.mock("@/lib/payments/data", () => ({
  getPaymentDeskStudentSummary,
}));

function request(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

describe("payment student summary route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireStaffPermission.mockResolvedValue({ appRole: "admin" });
    getPaymentDeskStudentSummary.mockResolvedValue({
      student: null,
      issue: null,
      latestReceipt: null,
      suggestedDefaultAmount: null,
      paymentDate: "2026-05-18",
    });
  });

  it("accepts normal v4 student UUIDs from the Payment Desk index", async () => {
    const { GET } = await import("@/app/protected/payments/student-summary/route");
    const response = await GET(
      request(
        "/protected/payments/student-summary?studentId=c98d3184-2060-4a80-9c77-0657a928b7dd&paymentDate=2026-05-18&includeLatestReceipt=true&session=TEST-2026-27",
      ),
    );

    expect(response.status).toBe(200);
    expect(getPaymentDeskStudentSummary).toHaveBeenCalledWith({
      studentId: "c98d3184-2060-4a80-9c77-0657a928b7dd",
      paymentDate: "2026-05-18",
      sessionLabel: "TEST-2026-27",
      autoPrepareMissingDues: true,
      includeLatestReceipt: true,
      includeBreakdown: true,
    });
  });

  it("defaults paymentDate to today (Asia/Kolkata) when only studentId is supplied", async () => {
    const { GET } = await import("@/app/protected/payments/student-summary/route");
    const response = await GET(
      request(
        "/protected/payments/student-summary?studentId=c98d3184-2060-4a80-9c77-0657a928b7dd",
      ),
    );

    expect(response.status).toBe(200);
    expect(getPaymentDeskStudentSummary).toHaveBeenCalledTimes(1);
    const call = getPaymentDeskStudentSummary.mock.calls[0]?.[0] as { paymentDate: string };
    expect(call.paymentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rejects requests without a valid studentId", async () => {
    const { GET } = await import("@/app/protected/payments/student-summary/route");
    const response = await GET(request("/protected/payments/student-summary"));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/student/i);
    expect(getPaymentDeskStudentSummary).not.toHaveBeenCalled();
  });
});
