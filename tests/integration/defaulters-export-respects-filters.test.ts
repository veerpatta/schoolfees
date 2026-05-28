import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getFeePolicySummary = vi.fn();
const getWorkbookStudentFinancials = vi.fn();
const getWorkbookInstallmentRows = vi.fn();
const getStudentFormOptions = vi.fn();
const getWorkbookClassOptions = vi.fn();
const createClient = vi.fn();
const getCacheSafeClient = vi.fn();
const cacheSafeUnstableCache = vi.fn((fn: unknown) => fn);

vi.mock("@/lib/fees/data", () => ({
  getFeePolicySummary,
}));

vi.mock("@/lib/workbook/data", () => ({
  getWorkbookStudentFinancials,
  getWorkbookInstallmentRows,
  getWorkbookClassOptions,
}));

vi.mock("@/lib/students/data", () => ({
  getStudentFormOptions,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

vi.mock("@/lib/supabase/cache-safe", () => ({
  cacheSafeUnstableCache,
  getCacheSafeClient,
}));

beforeEach(() => {
  vi.clearAllMocks();
  getFeePolicySummary.mockResolvedValue({ academicSessionLabel: "TEST-2026-27" });
  getStudentFormOptions.mockResolvedValue({ routeOptions: [], resolvedSessionLabel: "TEST-2026-27" });
  getWorkbookClassOptions.mockResolvedValue([]);
  getWorkbookInstallmentRows.mockResolvedValue([]);
});

function buildFinancialRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    studentId: "s-1",
    classId: "c-1",
    classLabel: "Class 1",
    admissionNo: "SR001",
    studentName: "Asha Sharma",
    fatherName: "Mr. Sharma",
    fatherPhone: "9000000001",
    studentStatusLabel: "Old" as const,
    transportRouteId: "route-uuid-1",
    transportRouteName: "Route A",
    totalDue: 10000,
    totalPaid: 4000,
    outstandingAmount: 6000,
    nextDueDate: "2026-07-20",
    nextDueAmount: 3000,
    lastPaymentDate: "2026-05-10",
    inst1Pending: 0,
    inst2Pending: 3000,
    inst3Pending: 3000,
    inst4Pending: 0,
    statusLabel: "PARTLY PAID" as const,
    discountAmount: 0,
    lateFeeWaiverAmount: 0,
    lateFeeTotal: 1000,
    overdueInstallmentCount: 1,
    ...overrides,
  };
}

describe("getDefaulterExportRows — honours filters (audit 1.7)", () => {
  it("returns only rows with outstanding > 0 and respects search query", async () => {
    getWorkbookStudentFinancials.mockResolvedValue([
      buildFinancialRow({ studentId: "s-1", studentName: "Asha Sharma", outstandingAmount: 6000 }),
      buildFinancialRow({ studentId: "s-2", studentName: "Rahul Verma", outstandingAmount: 0 }),
      buildFinancialRow({ studentId: "s-3", studentName: "Priya Singh", outstandingAmount: 9000 }),
    ]);

    const { getDefaulterExportRows } = await import("@/lib/defaulters/data");
    const rows = await getDefaulterExportRows(
      {
        classId: "",
        transportRouteId: "",
        overdue: "",
        minPendingAmount: "",
        searchQuery: "priya",
      },
      "TEST-2026-27",
    );

    expect(rows.map((r) => r.studentId)).toEqual(["s-3"]);
  });

  it("filters by classId via the workbook layer (passed through)", async () => {
    getWorkbookStudentFinancials.mockResolvedValue([
      buildFinancialRow({ studentId: "s-1", outstandingAmount: 5000 }),
    ]);

    const { getDefaulterExportRows } = await import("@/lib/defaulters/data");
    await getDefaulterExportRows(
      {
        classId: "class-uuid-1",
        transportRouteId: "",
        overdue: "",
        minPendingAmount: "",
        searchQuery: "",
      },
      "TEST-2026-27",
    );

    expect(getWorkbookStudentFinancials).toHaveBeenCalledWith({
      classId: "class-uuid-1",
      sessionLabel: "TEST-2026-27",
    });
  });

  it("filters by transportRouteId in-memory", async () => {
    getWorkbookStudentFinancials.mockResolvedValue([
      buildFinancialRow({ studentId: "s-1", transportRouteId: "route-a", outstandingAmount: 6000 }),
      buildFinancialRow({ studentId: "s-2", transportRouteId: "route-b", outstandingAmount: 4000 }),
    ]);

    const { getDefaulterExportRows } = await import("@/lib/defaulters/data");
    const rows = await getDefaulterExportRows(
      {
        classId: "",
        transportRouteId: "route-b",
        overdue: "",
        minPendingAmount: "",
        searchQuery: "",
      },
      "TEST-2026-27",
    );

    expect(rows.map((r) => r.studentId)).toEqual(["s-2"]);
  });

  it("enforces minPendingAmount", async () => {
    getWorkbookStudentFinancials.mockResolvedValue([
      buildFinancialRow({ studentId: "s-1", outstandingAmount: 1000 }),
      buildFinancialRow({ studentId: "s-2", outstandingAmount: 8000 }),
    ]);

    const { getDefaulterExportRows } = await import("@/lib/defaulters/data");
    const rows = await getDefaulterExportRows(
      {
        classId: "",
        transportRouteId: "",
        overdue: "",
        minPendingAmount: "5000",
        searchQuery: "",
      },
      "TEST-2026-27",
    );

    expect(rows.map((r) => r.studentId)).toEqual(["s-2"]);
  });

  it("returns rows sorted by totalPending desc then name asc", async () => {
    getWorkbookStudentFinancials.mockResolvedValue([
      buildFinancialRow({ studentId: "s-1", studentName: "Zoya", outstandingAmount: 6000 }),
      buildFinancialRow({ studentId: "s-2", studentName: "Asha", outstandingAmount: 6000 }),
      buildFinancialRow({ studentId: "s-3", studentName: "Mira", outstandingAmount: 9000 }),
    ]);

    const { getDefaulterExportRows } = await import("@/lib/defaulters/data");
    const rows = await getDefaulterExportRows(
      {
        classId: "",
        transportRouteId: "",
        overdue: "",
        minPendingAmount: "",
        searchQuery: "",
      },
      "TEST-2026-27",
    );

    expect(rows.map((r) => r.fullName)).toEqual(["Mira", "Asha", "Zoya"]);
  });
});
