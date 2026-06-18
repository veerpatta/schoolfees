import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConventionalDiscountCalculationType } from "@/lib/fees/types";

// Exercises the admin-client write path of upsertConventionalDiscountPolicies — in
// particular the fallback-backed save: getConventionalDiscountPolicies hands the UI
// the three built-ins with id:null when a session has no persisted rows yet, and the
// save must persist them (as built-ins) rather than reject them.

type UpsertCall = { values: Record<string, unknown>; options: unknown };

const state = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  upsertCalls: [] as UpsertCall[],
  updateCalls: [] as Array<Record<string, unknown>>,
  responses: [] as Array<{ data: unknown[] | null; error: { message: string } | null }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: state.createAdminClient }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

class MockQuery {
  select() {
    return this;
  }
  eq() {
    return this;
  }
  neq() {
    return this;
  }
  in() {
    return this;
  }
  order() {
    return this;
  }
  update(values: Record<string, unknown>) {
    state.updateCalls.push(values);
    return this;
  }
  upsert(values: Record<string, unknown>, options: unknown) {
    state.upsertCalls.push({ values, options });
    return this;
  }
  maybeSingle() {
    const response = state.responses.shift() ?? { data: [], error: null };
    const single = Array.isArray(response.data) ? response.data[0] ?? null : response.data;
    return Promise.resolve({ data: single, error: response.error });
  }
  then<T1 = unknown, T2 = never>(
    onfulfilled?: ((value: unknown) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    const response = state.responses.shift() ?? { data: [], error: null };
    return Promise.resolve(response).then(onfulfilled, onrejected);
  }
}

function createMockSupabase() {
  return {
    from() {
      return new MockQuery();
    },
  };
}

function builtinInput(
  code: string,
  calculationType: ConventionalDiscountCalculationType,
  extra: { percentage?: number | null; fixedTuitionAmount?: number | null } = {},
) {
  return {
    id: null,
    code,
    displayName: code,
    calculationType,
    fixedTuitionAmount: extra.fixedTuitionAmount ?? null,
    percentage: extra.percentage ?? null,
    isActive: true,
    sortOrder: 1,
  };
}

describe("upsertConventionalDiscountPolicies", () => {
  beforeEach(() => {
    state.createAdminClient.mockReturnValue(createMockSupabase());
    state.upsertCalls = [];
    state.updateCalls = [];
    state.responses = [];
  });

  it("persists fallback built-ins (id:null) as built-in instead of rejecting them", async () => {
    // No existing rows -> the form submitted the fallback built-ins with id:null.
    state.responses = [{ data: [], error: null }];
    const { upsertConventionalDiscountPolicies } = await import("@/lib/fees/conventional-discounts");

    await expect(
      upsertConventionalDiscountPolicies({
        academicSessionLabel: "TEST-2026-27",
        policies: [
          builtinInput("rte", "tuition_zero"),
          builtinInput("staff_child", "tuition_percentage", { percentage: 50 }),
          builtinInput("third_child", "tuition_fixed_amount", { fixedTuitionAmount: 6000 }),
        ],
      }),
    ).resolves.not.toThrow();

    expect(state.upsertCalls).toHaveLength(3);
    expect(state.upsertCalls.map((call) => call.values.code)).toEqual([
      "rte",
      "staff_child",
      "third_child",
    ]);
    expect(state.upsertCalls.every((call) => call.values.is_builtin === true)).toBe(true);
  });

  it("persists a new custom policy as not built-in", async () => {
    state.responses = [{ data: [], error: null }];
    const { upsertConventionalDiscountPolicies } = await import("@/lib/fees/conventional-discounts");

    await upsertConventionalDiscountPolicies({
      academicSessionLabel: "TEST-2026-27",
      policies: [
        {
          id: null,
          // The UI slugifies free text; the write path lower-cases and validates it.
          code: "Sports_Quota",
          displayName: "Sports Quota",
          calculationType: "tuition_percentage",
          fixedTuitionAmount: null,
          percentage: 25,
          isActive: true,
          sortOrder: 4,
        },
      ],
    });

    expect(state.upsertCalls).toHaveLength(1);
    // Code is lower-cased and the custom policy is flagged as not built-in.
    expect(state.upsertCalls[0].values.code).toBe("sports_quota");
    expect(state.upsertCalls[0].values.is_builtin).toBe(false);
  });

  it("blocks renaming an existing built-in policy", async () => {
    // Existing persisted built-in row.
    state.responses = [{ data: [{ id: "p-rte", code: "rte", is_builtin: true }], error: null }];
    const { upsertConventionalDiscountPolicies } = await import("@/lib/fees/conventional-discounts");

    await expect(
      upsertConventionalDiscountPolicies({
        academicSessionLabel: "TEST-2026-27",
        policies: [
          {
            id: "p-rte",
            code: "rte_special",
            displayName: "RTE Special",
            calculationType: "tuition_zero",
            fixedTuitionAmount: null,
            percentage: null,
            isActive: true,
            sortOrder: 1,
          },
        ],
      }),
    ).rejects.toThrow(/cannot be renamed/);

    expect(state.upsertCalls).toHaveLength(0);
    expect(state.updateCalls).toHaveLength(0);
  });
});
