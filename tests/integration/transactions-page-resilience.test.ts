import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getOfficeWorkbookData = vi.fn();
const getSetupWizardData = vi.fn();
const getStudentFormOptions = vi.fn();
const getFeePolicySummary = vi.fn();
const getOfficeWorkflowReadiness = vi.fn();
const getViewSessionCookie = vi.fn();
const resolveViewSession = vi.fn();
const requireAnyStaffPermission = vi.fn();
const hasStaffPermission = vi.fn();

const getSetupWizardDataLight = vi.fn();
const getWorkbookTransactions = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/workbook/data", () => ({
  getWorkbookTransactions,
}));

vi.mock("@/lib/transactions/dues", async () => {
  const actual = await vi.importActual<typeof import("@/lib/transactions/dues")>(
    "@/lib/transactions/dues",
  );

  return {
    ...actual,
    getOfficeWorkbookData,
  };
});

vi.mock("@/lib/setup/data", () => ({
  getSetupWizardData,
  getSetupWizardDataLight,
}));

vi.mock("@/lib/students/data", () => ({
  getStudentFormOptions,
}));

vi.mock("@/lib/fees/data", () => ({
  getFeePolicySummary,
}));

vi.mock("@/lib/office/readiness", () => ({
  getOfficeWorkflowReadiness,
}));

vi.mock("@/lib/session/cookie", () => ({
  getViewSessionCookie,
}));

vi.mock("@/lib/session/resolver", () => ({
  resolveViewSession,
}));

vi.mock("@/lib/supabase/session", () => ({
  requireAnyStaffPermission,
  hasStaffPermission,
}));

function setupPageData(sessionLabel: string) {
  requireAnyStaffPermission.mockResolvedValue({ appRole: "admin" });
  hasStaffPermission.mockReturnValue(true);
  getViewSessionCookie.mockResolvedValue(null);
  resolveViewSession.mockResolvedValue({
    sessionLabel,
    source: "query",
    isTest: sessionLabel.startsWith("TEST"),
  });
  getSetupWizardData.mockResolvedValue({});
  getSetupWizardDataLight.mockResolvedValue({});
  getOfficeWorkflowReadiness.mockReturnValue({
    reports: {
      isReady: true,
      title: "",
      detail: "",
      actionLabel: "",
      actionHref: "",
    },
  });
  getStudentFormOptions.mockResolvedValue({
    routeOptions: [],
    sessionOptions: [
      { value: "2025-26", label: "2025-26" },
      { value: "2026-27", label: "2026-27" },
      { value: "TEST-2026-27", label: "TEST-2026-27" },
    ],
  });
  getFeePolicySummary.mockResolvedValue({
    acceptedPaymentModes: [{ value: "cash", label: "Cash" }],
  });
  getOfficeWorkbookData.mockResolvedValue({
    view: "transactions",
    classOptions: [],
    rows: [],
    pagination: {
      page: 1,
      pageSize: 100,
      totalRows: null,
      visibleStart: 0,
      visibleEnd: 0,
      hasPreviousPage: false,
      hasNextPage: false,
    },
  });
  getWorkbookTransactions.mockResolvedValue([]);
}

describe("transactions page session resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders for a valid selected session", async () => {
    setupPageData("2026-27");

    const { default: TransactionsPage } = await import("@/app/protected/transactions/page");
    const element = await TransactionsPage({
      searchParams: Promise.resolve({ session: "2026-27" }),
    });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain("Transactions");
    expect(getOfficeWorkbookData).toHaveBeenCalledWith(
      expect.objectContaining({ sessionLabel: "2026-27" }),
    );
  });

  it("renders for an unknown selected session without throwing", async () => {
    setupPageData("UNKNOWN-2026-27");

    const { default: TransactionsPage } = await import("@/app/protected/transactions/page");
    const element = await TransactionsPage({
      searchParams: Promise.resolve({ session: "UNKNOWN-2026-27" }),
    });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain("Transactions");
    expect(getStudentFormOptions).toHaveBeenCalledWith({
      sessionLabel: "UNKNOWN-2026-27",
    });
  });
});
