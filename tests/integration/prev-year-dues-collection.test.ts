import { beforeEach, describe, expect, it, vi } from "vitest";

// Verifies the previous-year-dues export rows carry the student's enrollment
// status (joined from students), distinct from the carry-forward balance status.
const state = vi.hoisted(() => ({
  createClient: vi.fn(),
  byTable: {} as Record<string, { data: unknown[]; error: { code?: string; message: string } | null }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: state.createClient }));

class MockQuery {
  constructor(private table: string) {}
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
  then<T1 = unknown, T2 = never>(
    onfulfilled?: ((value: unknown) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    const response = state.byTable[this.table] ?? { data: [], error: null };
    return Promise.resolve(response).then(onfulfilled, onrejected);
  }
}

function seed(tables: Record<string, { data: unknown[]; error?: { code?: string; message: string } | null }>) {
  state.byTable = Object.fromEntries(
    Object.entries(tables).map(([table, value]) => [table, { data: value.data, error: value.error ?? null }]),
  );
}

describe("getPrevYearDuesCollectionRows", () => {
  beforeEach(() => {
    state.createClient.mockResolvedValue({ from: (table: string) => new MockQuery(table) });
    state.byTable = {};
  });

  it("attaches the student's enrollment status alongside the carry-forward balance status", async () => {
    seed({
      v_student_carry_forward_balances: {
        data: [
          {
            student_id: "stu-left",
            admission_no: "TEST-L1",
            student_name: "Left One",
            class_label: "Class 8",
            father_phone: "9000000001",
            source_session_label: "2025-26",
            target_session_label: "2026-27",
            fee_head: "tuition",
            original_amount: 5000,
            collected_amount: 1000,
            remaining_amount: 4000,
            balance_status: "pending",
            status: "active",
          },
        ],
      },
      students: { data: [{ id: "stu-left", status: "left" }] },
    });

    const { getPrevYearDuesCollectionRows } = await import("@/lib/prev-year-dues/data");
    const rows = await getPrevYearDuesCollectionRows("2026-27");

    expect(rows).toHaveLength(1);
    expect(rows[0].studentId).toBe("stu-left");
    expect(rows[0].studentStatus).toBe("left"); // enrollment status
    expect(rows[0].status).toBe("pending"); // carry-forward balance status
    expect(rows[0].remaining).toBe(4000);
    expect(rows[0].sourceSessionLabel).toBe("2025-26");
  });

  it("returns an empty list when there are no carry-forward balances", async () => {
    seed({ v_student_carry_forward_balances: { data: [] } });

    const { getPrevYearDuesCollectionRows } = await import("@/lib/prev-year-dues/data");
    await expect(getPrevYearDuesCollectionRows("2026-27")).resolves.toEqual([]);
  });
});
