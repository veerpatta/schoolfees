import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseState = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  fromCalls: [] as string[],
  inCalls: [] as Array<{ column: string; values: string[] }>,
  responses: [] as Array<{ data: unknown[] | null; error: { message: string; details?: string; code?: string } | null }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: supabaseState.createClient,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: supabaseState.createAdminClient,
}));

class MockQuery {
  select() {
    return this;
  }

  eq() {
    return this;
  }

  order() {
    return this;
  }

  in(column: string, values: string[]) {
    supabaseState.inCalls.push({ column, values });
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    const response = supabaseState.responses.shift() ?? { data: [], error: null };
    return Promise.resolve(response).then(onfulfilled, onrejected);
  }
}

function createMockSupabase() {
  return {
    from(tableName: string) {
      supabaseState.fromCalls.push(tableName);
      return new MockQuery();
    },
  };
}

function assignmentRow(studentId: string) {
  return {
    id: `assignment-${studentId}`,
    student_id: studentId,
    policy_id: "policy-rte",
    academic_session_label: "2026-27",
    is_active: true,
    reason: "Office approved",
    notes: null,
    before_tuition_amount: 38000,
    resulting_tuition_amount: 0,
    family_group_id: null,
    is_manual_override: false,
    manual_override_reason: null,
    applied_by: null,
    applied_at: "2026-05-14T00:00:00.000Z",
    policy_ref: {
      id: "policy-rte",
      academic_session_label: "2026-27",
      code: "rte",
      display_name: "RTE",
      calculation_type: "tuition_zero",
      fixed_tuition_amount: null,
      percentage: null,
      is_active: true,
      sort_order: 1,
      updated_at: null,
    },
    family_group_ref: null,
  };
}

describe("getStudentConventionalDiscountAssignments", () => {
  beforeEach(() => {
    supabaseState.createClient.mockResolvedValue(createMockSupabase());
    supabaseState.fromCalls = [];
    supabaseState.inCalls = [];
    supabaseState.responses = [];
  });

  it("returns an empty list without querying when the provided student list is empty", async () => {
    const { getStudentConventionalDiscountAssignments } = await import("@/lib/fees/conventional-discounts");

    await expect(
      getStudentConventionalDiscountAssignments({
        academicSessionLabel: "2026-27",
        studentIds: [],
      }),
    ).resolves.toEqual([]);

    expect(supabaseState.createClient).not.toHaveBeenCalled();
    expect(supabaseState.fromCalls).toEqual([]);
  });

  it("returns an empty list when no assignments exist for the requested students", async () => {
    supabaseState.responses = [{ data: [], error: null }];
    const { getStudentConventionalDiscountAssignments } = await import("@/lib/fees/conventional-discounts");

    await expect(
      getStudentConventionalDiscountAssignments({
        academicSessionLabel: "2026-27",
        studentIds: ["student-1", "student-2"],
      }),
    ).resolves.toEqual([]);

    expect(supabaseState.inCalls).toEqual([{ column: "student_id", values: ["student-1", "student-2"] }]);
  });

  it("chunks large student lists so optional assignment reads do not exceed request limits", async () => {
    const studentIds = Array.from({ length: 205 }, (_, index) => `student-${index + 1}`);
    supabaseState.responses = [
      { data: [assignmentRow("student-1")], error: null },
      { data: [assignmentRow("student-101")], error: null },
      { data: [], error: null },
    ];
    const { getStudentConventionalDiscountAssignments } = await import("@/lib/fees/conventional-discounts");

    const assignments = await getStudentConventionalDiscountAssignments({
      academicSessionLabel: "2026-27",
      studentIds,
    });

    expect(assignments.map((assignment) => assignment.studentId)).toEqual(["student-1", "student-101"]);
    expect(supabaseState.inCalls.map((call) => call.values.length)).toEqual([100, 100, 5]);
  });

  it("falls back to no display assignments for recoverable optional read failures", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    supabaseState.responses = [
      {
        data: null,
        error: {
          message: "TypeError: fetch failed",
          details: "Caused by: HeadersOverflowError: Headers Overflow Error (UND_ERR_HEADERS_OVERFLOW)",
        },
      },
    ];
    const { getStudentConventionalDiscountAssignments } = await import("@/lib/fees/conventional-discounts");

    await expect(
      getStudentConventionalDiscountAssignments({
        academicSessionLabel: "2026-27",
        studentIds: ["student-1"],
      }),
    ).resolves.toEqual([]);

    expect(warnSpy).toHaveBeenCalledWith(
      "Optional conventional discount assignments could not be loaded.",
      expect.objectContaining({ academicSessionLabel: "2026-27", studentIdCount: 1 }),
    );
  });

  it("still throws non-recoverable assignment read errors", async () => {
    supabaseState.responses = [{ data: null, error: { message: "permission denied", code: "42501" } }];
    const { getStudentConventionalDiscountAssignments } = await import("@/lib/fees/conventional-discounts");

    await expect(
      getStudentConventionalDiscountAssignments({
        academicSessionLabel: "2026-27",
        studentIds: ["student-1"],
      }),
    ).rejects.toThrow("Unable to load student conventional discounts: permission denied");
  });
});
