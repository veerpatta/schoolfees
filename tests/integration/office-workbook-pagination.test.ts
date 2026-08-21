import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Page 2 of Student Dues used to come back almost empty.
 *
 * `sharedFilters` passed `limit: pageSize + 1` and `offset` down to
 * `getWorkbookStudentFinancials`, so the database returned exactly the page.
 * Then the same offset was sliced again in memory:
 *
 *     visibleRows.slice(offset, offset + pageSize)
 *
 * On page 1 offset is 0 and nothing is visibly wrong. On page 2 the database
 * returned rows 100-200 and the slice took elements 100-200 *of those hundred*,
 * yielding a single row -- while `totalRows` reported 101, so the pager claimed
 * there was nothing more to see. Any staff member reconciling dues past the
 * first hundred students was reading a truncated list.
 */

const getWorkbookStudentFinancials = vi.fn();
const getWorkbookTransactions = vi.fn();
const getStudentDirectoryIds = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/workbook/data", () => ({
  getWorkbookClassOptions: vi.fn(async () => []),
  getWorkbookStudentFinancials: (...args: unknown[]) => getWorkbookStudentFinancials(...args),
  getWorkbookTransactions: (...args: unknown[]) => getWorkbookTransactions(...args),
}));

vi.mock("@/lib/segments/directory", () => ({
  getStudentDirectoryIds: (...args: unknown[]) => getStudentDirectoryIds(...args),
}));

vi.mock("@/lib/fees/data", () => ({ getFeePolicySummary: vi.fn(async () => ({})) }));
vi.mock("@/lib/reports/data", () => ({
  getReportsPageData: vi.fn(async () => ({})),
  normalizeReportFilters: vi.fn((value: unknown) => value),
}));
// getBaseOfficeStudents merges students with no generated dues into these
// views. Empty here -- the fixtures above already carry generated rows.
vi.mock("@/platform/supabase/server", () => {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order"]) {
    builder[method] = () => builder;
  }
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve);
  return { createClient: vi.fn(async () => ({ from: () => builder })) };
});

const TOTAL_STUDENTS = 260;

function studentFixture(index: number) {
  return {
    studentId: `student-${String(index).padStart(4, "0")}`,
    studentName: `Student ${index}`,
    admissionNo: `SR-${index}`,
    classLabel: "Class 5",
    fatherName: null,
    fatherPhone: null,
    motherPhone: null,
    transportRouteId: null,
    transportRouteName: null,
    statusLabel: "OVERDUE",
    // Fees only, as the column has meant since the late-fee split.
    outstandingAmount: 1000,
    lateFeeOutstandingAmount: 0,
    // What the family actually owes, and what the dues view filters on. The
    // fixture predates the split and carried only the fees figure, so every
    // row read as "owes nothing" once the filter started asking for the total.
    totalOwedAmount: 1000,
    totalPaid: 0,
  };
}

const ALL_STUDENTS = Array.from({ length: TOTAL_STUDENTS }, (_, index) => studentFixture(index));

beforeEach(() => {
  vi.clearAllMocks();
  getWorkbookTransactions.mockResolvedValue([]);
  getStudentDirectoryIds.mockResolvedValue({ studentIds: [], totalCount: 0 });
  getWorkbookStudentFinancials.mockResolvedValue(ALL_STUDENTS);
});

/** The student views always carry rows + a pagination block. */
type PagedResult = {
  rows: Array<{ studentId: string }>;
  pagination: {
    totalRows: number | null;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    visibleEnd: number;
  };
};

async function loadStudentDues(page: number): Promise<PagedResult> {
  const { getOfficeWorkbookData } = await import("@/lib/transactions/dues");
  const result = await getOfficeWorkbookData({
    view: "student_dues",
    classId: "",
    sessionLabel: "TEST-2026-27",
    page,
    pageSize: 100,
  });
  return result as unknown as PagedResult;
}

describe("office workbook student paging", () => {
  it("does not window the student fetch at the database", async () => {
    await loadStudentDues(2);

    const call = getWorkbookStudentFinancials.mock.calls[0][0] as {
      limit: unknown;
      offset: unknown;
    };
    // A DB window here would be windowing the wrong set: the dues/overdue and
    // route/search passes below still filter it further.
    expect(call.limit).toBeNull();
    expect(call.offset).toBeUndefined();
  });

  it("returns a full page on page 2, not the tail of page 1", async () => {
    const result = await loadStudentDues(2);

    expect(result.rows).toHaveLength(100);
    expect(result.rows[0].studentId).toBe("student-0100");
  });

  it("reports the real scope total, not the page size", async () => {
    const result = await loadStudentDues(2);
    expect(result.pagination.totalRows).toBe(TOTAL_STUDENTS);
  });

  it("keeps paging honest at the last, partial page", async () => {
    const result = await loadStudentDues(3);
    expect(result.rows).toHaveLength(60);
    expect(result.pagination.hasNextPage).toBe(false);
    expect(result.pagination.hasPreviousPage).toBe(true);
    expect(result.pagination.visibleEnd).toBe(TOTAL_STUDENTS);
  });

  it("pages the first page as before", async () => {
    const result = await loadStudentDues(1);

    expect(result.rows).toHaveLength(100);
    expect(result.rows[0].studentId).toBe("student-0000");
  });
});

describe("segment scope", () => {
  it("is resolved once and handed to both the student and receipt reads", async () => {
    getStudentDirectoryIds.mockResolvedValue({
      studentIds: ["student-0001", "student-0002"],
      totalCount: 2,
    });

    const { getOfficeWorkbookData } = await import("@/lib/transactions/dues");
    await getOfficeWorkbookData({
      view: "student_dues",
      classId: "",
      sessionLabel: "TEST-2026-27",
      segments: ["oldBalanceDue"],
      page: 1,
    });

    expect(getStudentDirectoryIds).toHaveBeenCalledTimes(1);
    expect(
      (getWorkbookStudentFinancials.mock.calls[0][0] as { studentIds: string[] }).studentIds,
    ).toEqual(["student-0001", "student-0002"]);
    expect(
      (getWorkbookTransactions.mock.calls[0][0] as { studentIds: string[] }).studentIds,
    ).toEqual(["student-0001", "student-0002"]);
  });

  it("is null when no segment is selected, so nothing is narrowed", async () => {
    await loadStudentDues(1);

    expect(getStudentDirectoryIds).not.toHaveBeenCalled();
    expect(
      (getWorkbookStudentFinancials.mock.calls[0][0] as { studentIds: unknown }).studentIds,
    ).toBeNull();
  });
});
