import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StudentListFilters } from "@/lib/students/types";

vi.mock("server-only", () => ({}));

const createClient = vi.fn();
const getFeePolicyForSession = vi.fn();
const getFeePolicySummary = vi.fn();

vi.mock("@/lib/fees/data", () => ({
  getFeePolicyForSession,
  getFeePolicySummary,
  getFeeSetupPageData: vi.fn(),
  upsertStudentFeeOverride: vi.fn(),
}));

vi.mock("@/lib/fees/conventional-discounts", () => ({
  getConventionalDiscountPolicies: vi.fn(async () => []),
  getStudentConventionalDiscountAssignments: vi.fn(async () => []),
  saveStudentConventionalDiscountAssignments: vi.fn(async () => undefined),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

type TableResult = { data: unknown; error: unknown; count?: number };

function makeQuery(result: TableResult) {
  const builder: Record<string, unknown> = {};
  const passthrough = () => builder;
  for (const method of [
    "select",
    "eq",
    "in",
    "gt",
    "ilike",
    "order",
    "range",
    "overlaps",
    "limit",
    "abortSignal",
  ]) {
    builder[method] = passthrough;
  }
  builder.maybeSingle = () => Promise.resolve(result);
  builder.single = () => Promise.resolve(result);
  builder.then = (resolve: (value: TableResult) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

function makeClient(resultsByTable: Record<string, TableResult>) {
  return {
    from: (table: string) => {
      const result = resultsByTable[table];
      if (!result) {
        throw new Error(`Unexpected table in sibling-timeout mock: ${table}`);
      }
      return makeQuery(result);
    },
  };
}

const SESSION = "TEST-2026-27";

const FILTERS: StudentListFilters = {
  query: "",
  classId: "",
  transportRouteId: "",
  status: "",
  sessionLabel: SESSION,
};

function baseStudentRow() {
  return {
    id: "student-timeout-1",
    admission_no: "TEST-TMO-001",
    full_name: "TEST Timeout Student",
    date_of_birth: null,
    status: "active",
    primary_phone: null,
    secondary_phone: null,
    updated_at: "2026-07-25T00:00:00Z",
    photo_path: null,
    class_ref: {
      id: "class-5",
      session_label: SESSION,
      status: "active",
      class_name: "Class 5",
      section: "A",
      stream_name: null,
    },
    route_ref: null,
  };
}

function clientWithSiblingError(error: unknown) {
  return makeClient({
    students: { data: [baseStudentRow()], error: null, count: 1 },
    v_workbook_student_financials: { data: [], error: null },
    student_fee_overrides: { data: [], error: null },
    v_workbook_installment_balances: { data: [], error: null },
    mv_student_sibling_groups: { data: null, error },
    student_family_members: { data: [], error: null },
  });
}

describe("sibling group load degrades instead of failing exports", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getFeePolicyForSession.mockResolvedValue({ lateFeeFlatAmount: 1000 });
    getFeePolicySummary.mockResolvedValue({ lateFeeFlatAmount: 1000 });
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  // Exports call getAllStudents, which walks every page; a statement timeout on
  // the sibling-group matview used to propagate and kill the whole export.
  it("falls back to no sibling pills on a Postgres statement timeout", async () => {
    createClient.mockResolvedValue(
      clientWithSiblingError({
        code: "57014",
        message: "canceling statement due to statement timeout",
      }),
    );

    const { getAllStudents } = await import("@/lib/students/data");
    const students = await getAllStudents(FILTERS);

    expect(students).toHaveLength(1);
    expect(students[0].siblingPill).toBeNull();
  });

  it("falls back when the timeout arrives with only a message and no code", async () => {
    createClient.mockResolvedValue(
      clientWithSiblingError({ message: "canceling statement due to statement timeout" }),
    );

    const { getAllStudents } = await import("@/lib/students/data");

    await expect(getAllStudents(FILTERS)).resolves.toHaveLength(1);
  });

  // postgrest-js converts an aborted fetch into an error object (not a rejection)
  // whose message carries the DOMException name, never "statement timeout".
  it("falls back when the client-side abort signal fires first", async () => {
    createClient.mockResolvedValue(
      clientWithSiblingError({
        code: "",
        message: "TimeoutError: The operation was aborted due to timeout",
        hint: "Request was aborted (timeout or manual cancellation)",
      }),
    );

    const { getAllStudents } = await import("@/lib/students/data");
    const students = await getAllStudents(FILTERS);

    expect(students).toHaveLength(1);
    expect(students[0].siblingPill).toBeNull();
  });

  it("still throws on a genuine sibling-group query error", async () => {
    createClient.mockResolvedValue(
      clientWithSiblingError({ code: "22P02", message: "invalid input syntax for type uuid" }),
    );

    const { getAllStudents } = await import("@/lib/students/data");

    await expect(getAllStudents(FILTERS)).rejects.toThrow(/Unable to load sibling group fields/);
  });
});
