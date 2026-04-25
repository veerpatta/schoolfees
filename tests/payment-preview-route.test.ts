import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireStaffPermission = vi.fn();
const createClient = vi.fn();

vi.mock("@/lib/supabase/session", () => ({
  requireStaffPermission,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

function request(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

describe("payment preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireStaffPermission.mockResolvedValue({ appRole: "admin" });
  });

  it("returns a friendly readiness error when the preview RPC is unavailable", async () => {
    createClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "PGRST202",
          message: "Could not find the function public.preview_workbook_payment_allocation",
        },
      }),
    });

    const { GET } = await import("@/app/protected/payments/preview/route");
    const response = await GET(
      request(
        "/protected/payments/preview?studentId=00000000-0000-4000-8000-000000000000&paymentDate=2026-04-25",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toBe(
      "Payment preview needs a database update. Ask an admin to check System Readiness.",
    );
  });

  it("uses the date-aware payment preview RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    createClient.mockResolvedValue({ rpc });

    const { GET } = await import("@/app/protected/payments/preview/route");
    const response = await GET(
      request(
        "/protected/payments/preview?studentId=00000000-0000-4000-8000-000000000000&paymentDate=2026-07-20",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.notice).toBe("No pending dues for selected payment date.");
    expect(rpc).toHaveBeenCalledWith("preview_workbook_payment_allocation", {
      p_student_id: "00000000-0000-4000-8000-000000000000",
      p_payment_date: "2026-07-20",
    });
  });
});
