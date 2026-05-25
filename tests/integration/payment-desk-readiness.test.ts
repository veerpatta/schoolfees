import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createClient = vi.fn();
const getFeePolicyForSession = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

vi.mock("@/lib/fees/data", () => ({
  getFeePolicyForSession,
  getFeePolicySummary: vi.fn(),
}));

function makeClassesQuery(payload: {
  data?: Array<{ id: string }>;
  error?: { message: string };
  throwError?: Error;
}) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn(),
  };

  if (payload.throwError) {
    query.limit.mockRejectedValue(payload.throwError);
  } else {
    query.limit.mockResolvedValue({
      data: payload.data ?? [{ id: "class-1" }],
      error: payload.error ?? null,
    });
  }

  return query;
}

describe("payment desk readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFeePolicyForSession.mockResolvedValue({
      id: "policy-1",
      academicSessionLabel: "TEST-2026-27",
    });
    createClient.mockResolvedValue({
      from: vi.fn(() => makeClassesQuery({ data: [{ id: "class-1" }] })),
    });
  });

  it("payment_desk_renders_when_conventional_discounts_fetch_fails", async () => {
    const { getPaymentDeskReadiness } = await import("@/lib/payments/data");

    const readiness = await getPaymentDeskReadiness({
      sessionLabel: "TEST-2026-27",
      staffAppRole: "accountant",
      canWritePayments: true,
    });

    expect(readiness.canPostPayments).toBe(true);
    expect(readiness.blockingReason).toBeNull();
  });

  it("payment_desk_readiness_is_crash_isolated", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    getFeePolicyForSession.mockRejectedValue(new Error("fetch failed"));
    createClient.mockResolvedValue({
      from: vi.fn(() => makeClassesQuery({ throwError: new Error("fetch failed") })),
    });
    const { getPaymentDeskReadiness } = await import("@/lib/payments/data");

    const readiness = await getPaymentDeskReadiness({
      sessionLabel: "TEST-2026-27",
      staffAppRole: "admin",
      canWritePayments: true,
    });

    expect(readiness.canPostPayments).toBe(true);
    expect(readiness.canRepairOrPrepareDues).toBe(true);
    expect(readiness.blockingReason).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "Payment Desk readiness check failed.",
      expect.objectContaining({
        sessionLabel: "TEST-2026-27",
        message: "fetch failed",
      }),
    );
  });

  it("payment_desk_readiness_blocks_when_policy_missing", async () => {
    getFeePolicyForSession.mockResolvedValue({
      id: null,
      academicSessionLabel: "TEST-2026-27",
    });
    const { getPaymentDeskReadiness } = await import("@/lib/payments/data");

    const readiness = await getPaymentDeskReadiness({
      sessionLabel: "TEST-2026-27",
      staffAppRole: "accountant",
      canWritePayments: true,
    });

    expect(readiness.canPostPayments).toBe(false);
    expect(readiness.blockingReason?.actionHref).toBe("/protected/fee-setup");
  });

  it("payment_desk_readiness_blocks_when_no_active_classes", async () => {
    createClient.mockResolvedValue({
      from: vi.fn(() => makeClassesQuery({ data: [] })),
    });
    const { getPaymentDeskReadiness } = await import("@/lib/payments/data");

    const readiness = await getPaymentDeskReadiness({
      sessionLabel: "TEST-2026-27",
      staffAppRole: "accountant",
      canWritePayments: true,
    });

    expect(readiness.canPostPayments).toBe(false);
    expect(readiness.blockingReason?.actionHref).toBe("/protected/admin-tools");
  });

  it("payment_desk_readiness_reports_read_only_for_non_writers", async () => {
    const { getPaymentDeskReadiness } = await import("@/lib/payments/data");

    const readiness = await getPaymentDeskReadiness({
      sessionLabel: "TEST-2026-27",
      staffAppRole: "view_only",
      canWritePayments: false,
    });

    expect(readiness.canPostPayments).toBe(false);
    expect(readiness.blockingReason?.title).toBe("Read-only access.");
    expect(readiness.blockingReason?.actionLabel).toBeNull();
  });

  it("payment_desk_page_no_longer_imports_setup_wizard_data", () => {
    const page = readFileSync(
      join(process.cwd(), "app/protected/payments/page.tsx"),
      "utf8",
    );

    expect(page).not.toContain("getSetupWizardData");
    expect(page).not.toContain('from "@/lib/setup/data"');
  });
});
