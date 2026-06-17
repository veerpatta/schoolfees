import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StudentListFilters } from "@/lib/students/types";

vi.mock("server-only", () => ({}));

const createClient = vi.fn();
const getFeePolicyForSession = vi.fn();
const getFeePolicySummary = vi.fn();

// Only the fee-policy resolvers and the (unused-on-this-path) passthroughs are
// needed from lib/fees/data; the rest of getStudents() goes through createClient.
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

// Minimal chainable Supabase query stub: every filter/builder method returns the
// same builder, and awaiting it (or calling maybeSingle/single) resolves the
// pre-seeded result for that table.
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
        throw new Error(`Unexpected table in student-list mock: ${table}`);
      }
      return makeQuery(result);
    },
  };
}

const SESSION = "2026-27";

function baseStudentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "student-aridaman",
    admission_no: "TEST-ARI-001",
    full_name: "ARIDAMAN",
    date_of_birth: null,
    status: "active",
    primary_phone: null,
    secondary_phone: null,
    updated_at: "2026-06-17T00:00:00Z",
    photo_path: null,
    class_ref: {
      id: "class-5",
      session_label: SESSION,
      status: "active",
      class_name: "Class 5",
      section: null,
      stream_name: null,
    },
    route_ref: null,
    ...overrides,
  };
}

const FILTERS: StudentListFilters = {
  query: "",
  sessionLabel: SESSION,
  classId: "",
  transportRouteId: "",
  status: "",
};

describe("getStudents — candidate (accruing) late fee on the list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFeePolicyForSession.mockResolvedValue({ lateFeeFlatAmount: 1000 });
    getFeePolicySummary.mockResolvedValue({ lateFeeFlatAmount: 1000 });
  });

  it("surfaces the flat late fee for a never-paid overdue installment the matview stores as 0", async () => {
    createClient.mockResolvedValue(
      makeClient({
        students: { data: [baseStudentRow()], error: null, count: 1 },
        v_workbook_student_financials: {
          data: [
            {
              student_id: "student-aridaman",
              student_status_label: "Old",
              outstanding_amount: 5000,
              late_fee_total: 0,
              status_label: "OVERDUE",
              next_due_date: "2026-04-20",
            },
          ],
          error: null,
        },
        student_fee_overrides: { data: [], error: null },
        v_workbook_installment_balances: {
          data: [
            {
              student_id: "student-aridaman",
              installment_no: 1,
              installment_label: "Installment 1",
              base_charge: 5000,
              paid_amount: 0,
              adjustment_amount: 0,
              final_late_fee: 0,
              pending_amount: 5000,
              balance_status: "overdue",
            },
          ],
          error: null,
        },
        v_student_sibling_groups: { data: [], error: null },
        student_family_members: { data: [], error: null },
      }),
    );

    const { getStudents } = await import("@/lib/students/data");
    const students = await getStudents(FILTERS);

    expect(students).toHaveLength(1);
    // The matview stores final_late_fee = 0, but the row must still show the
    // ₹1,000 accruing late fee so the list badge matches the profile + waive cap.
    expect(students[0].pendingLateFeeAmount).toBe(1000);
    expect(getFeePolicyForSession).toHaveBeenCalledWith(SESSION);
  });

  it("excludes carry-forward (previous-year) installments from the accruing late fee", async () => {
    createClient.mockResolvedValue(
      makeClient({
        students: { data: [baseStudentRow()], error: null, count: 1 },
        v_workbook_student_financials: {
          data: [
            {
              student_id: "student-aridaman",
              student_status_label: "Old",
              outstanding_amount: 4000,
              late_fee_total: 0,
              status_label: "OVERDUE",
            },
          ],
          error: null,
        },
        student_fee_overrides: { data: [], error: null },
        v_workbook_installment_balances: {
          data: [
            {
              student_id: "student-aridaman",
              installment_no: 0,
              installment_label: "Previous year tuition balance from 2025-26",
              base_charge: 4000,
              paid_amount: 0,
              adjustment_amount: 0,
              final_late_fee: 0,
              pending_amount: 4000,
              balance_status: "overdue",
            },
          ],
          error: null,
        },
        v_student_sibling_groups: { data: [], error: null },
        student_family_members: { data: [], error: null },
      }),
    );

    const { getStudents } = await import("@/lib/students/data");
    const students = await getStudents(FILTERS);

    expect(students).toHaveLength(1);
    expect(students[0].pendingLateFeeAmount).toBe(0);
  });

  it("nets the student's late-fee waiver pool against the accruing amount", async () => {
    createClient.mockResolvedValue(
      makeClient({
        students: { data: [baseStudentRow()], error: null, count: 1 },
        v_workbook_student_financials: {
          data: [
            {
              student_id: "student-aridaman",
              student_status_label: "Old",
              outstanding_amount: 5000,
              late_fee_total: 0,
              status_label: "OVERDUE",
            },
          ],
          error: null,
        },
        student_fee_overrides: {
          data: [{ student_id: "student-aridaman", late_fee_waiver_amount: 1000 }],
          error: null,
        },
        v_workbook_installment_balances: {
          data: [
            {
              student_id: "student-aridaman",
              installment_no: 1,
              installment_label: "Installment 1",
              base_charge: 5000,
              paid_amount: 0,
              adjustment_amount: 0,
              final_late_fee: 0,
              pending_amount: 5000,
              balance_status: "overdue",
            },
          ],
          error: null,
        },
        v_student_sibling_groups: { data: [], error: null },
        student_family_members: { data: [], error: null },
      }),
    );

    const { getStudents } = await import("@/lib/students/data");
    const students = await getStudents(FILTERS);

    // A ₹1,000 waiver pool fully absorbs the single ₹1,000 accruing late fee.
    expect(students[0].pendingLateFeeAmount).toBe(0);
  });
});
