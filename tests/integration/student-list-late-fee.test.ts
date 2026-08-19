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
function makeQuery(result: TableResult, filterLog?: string[]) {
  const builder: Record<string, unknown> = {};
  const passthrough = () => builder;
  for (const method of [
    "select",
    "eq",
    "in",
    "ilike",
    "order",
    "range",
    "overlaps",
    "limit",
    "abortSignal",
  ]) {
    builder[method] = passthrough;
  }
  // Recorded rather than passed through, so a test can assert WHICH column the
  // query narrowed on. That matters here: the students list used to filter the
  // installment read to `pending_amount > 0`, which is fees only, so a row whose
  // fees were settled and whose late fee was not never reached the mapper at all.
  for (const method of ["gt", "or"]) {
    builder[method] = (...args: unknown[]) => {
      filterLog?.push(`${method}(${args.map(String).join(", ")})`);
      return builder;
    };
  }
  builder.maybeSingle = () => Promise.resolve(result);
  builder.single = () => Promise.resolve(result);
  builder.then = (resolve: (value: TableResult) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

function makeClient(
  resultsByTable: Record<string, TableResult>,
  filtersByTable?: Record<string, string[]>,
) {
  const withDefaults: Record<string, TableResult> = {
    // Every student-list load reads this to decide the "Late fee waived" badge.
    // Not what these tests are about; a test that cares overrides it.
    v_student_manual_late_fee_waivers: { data: [], error: null },
    // Same for the EMI badge: no plans in these fixtures.
    v_student_repayment_plan_status: { data: [], error: null },
    ...resultsByTable,
  };

  return {
    from: (table: string) => {
      const result = withDefaults[table];
      if (!result) {
        throw new Error(`Unexpected table in student-list mock: ${table}`);
      }
      if (filtersByTable && !filtersByTable[table]) {
        filtersByTable[table] = [];
      }
      return makeQuery(result, filtersByTable?.[table]);
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
  segments: [],
  sort: "name",
};

describe("getStudents — pending late fee on the list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFeePolicyForSession.mockResolvedValue({ lateFeeFlatAmount: 1000 });
    getFeePolicySummary.mockResolvedValue({ lateFeeFlatAmount: 1000 });
  });

  // Rewritten for the unified late-fee rule (migration 20260808140000). The list
  // used to add a TypeScript-computed "candidate" late fee on top of the matview
  // because the matview only materialized a fee once a payment landed late. Both
  // engines now charge an overdue installment its flat fee, so the matview is the
  // whole truth — and adding anything on top would double-count a waived charge.
  it("takes the pending late fee straight from the matview", async () => {
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
              final_late_fee: 1000,
              pending_amount: 6000,
              balance_status: "overdue",
            },
          ],
          error: null,
        },
        student_family_members: { data: [], error: null },
      }),
    );

    const { getStudents } = await import("@/lib/students/data");
    const students = await getStudents(FILTERS);

    expect(students).toHaveLength(1);
    expect(students[0].pendingLateFeeAmount).toBe(1000);
  });

  // The live regression. Since the late-fee split (20260812120000)
  // `pending_amount` is FEES ONLY, and `balance_status` reads 'paid' as soon as
  // the fees are clear even while the late fee is not. The list did two things
  // that both keyed on the fees column: it filtered the query to
  // `pending_amount > 0`, so this row was never fetched at all, and it derived
  // the figure as min(final_late_fee, pending_amount), which is 0 here. Two real
  // students on 2026-27 showed Rs 0 against Rs 1,000 owed.
  //
  // school-rules.md: "Once charged it stays owed until it is paid or explicitly
  // waived. Clearing the fees afterwards does not remove it."
  it("still reports the late fee once the fees on that installment are paid", async () => {
    const filters: Record<string, string[]> = {};
    createClient.mockResolvedValue(
      makeClient({
        students: { data: [baseStudentRow()], error: null, count: 1 },
        v_workbook_student_financials: {
          data: [
            {
              student_id: "student-aridaman",
              student_status_label: "Old",
              outstanding_amount: 0,
              late_fee_total: 1000,
              status_label: "PAID",
              next_due_date: null,
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
              paid_amount: 5000,
              adjustment_amount: 0,
              final_late_fee: 1000,
              // Fees settled...
              pending_amount: 0,
              // ...late fee not.
              late_fee_pending: 1000,
              balance_status: "paid",
            },
          ],
          error: null,
        },
        student_family_members: { data: [], error: null },
      }, filters),
    );

    const { getStudents } = await import("@/lib/students/data");
    const students = await getStudents(FILTERS);

    expect(students[0].pendingLateFeeAmount).toBe(1000);
    // And it is still not a fees figure — nothing here is overdue.
    expect(students[0].overdueAmount).toBe(0);

    // The other half of the same bug: the row has to be FETCHED. A bare
    // `pending_amount > 0` narrows the read to students who still owe fees,
    // which is precisely the set this student is not in.
    const installmentFilters = filters.v_workbook_installment_balances ?? [];
    expect(installmentFilters.join(" ")).toContain("late_fee_pending");
    expect(installmentFilters).not.toContain("gt(pending_amount, 0)");
  });

  // The grandfathering guard. An overdue installment whose late fee has been
  // fully waived reads final_late_fee = 0 while still being balance_status =
  // "overdue" — exactly the pair the deleted candidate helper keyed on. If it
  // ever comes back, this fails.
  it("shows no late fee for an overdue installment whose fee is fully waived", async () => {
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
        student_family_members: { data: [], error: null },
      }),
    );

    const { getStudents } = await import("@/lib/students/data");
    const students = await getStudents(FILTERS);

    expect(students[0].pendingLateFeeAmount).toBe(0);
    // The per-render fee-policy fetch existed only to feed the candidate calc.
    expect(getFeePolicyForSession).not.toHaveBeenCalled();
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
        student_family_members: { data: [], error: null },
      }),
    );

    const { getStudents } = await import("@/lib/students/data");
    const students = await getStudents(FILTERS);

    // A ₹1,000 waiver pool fully absorbs the single ₹1,000 accruing late fee.
    expect(students[0].pendingLateFeeAmount).toBe(0);
  });
});
