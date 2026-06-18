import { beforeEach, describe, expect, it, vi } from "vitest";

// Read model over existing views; the DB is mocked and routed by table name.
const state = vi.hoisted(() => ({
  createClient: vi.fn(),
  byTable: {} as Record<string, { data: unknown[]; error: null | { message: string } }>,
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
  in() {
    return this;
  }
  gt() {
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

function createMockSupabase() {
  return { from: (table: string) => new MockQuery(table) };
}

function seed(tables: Record<string, unknown[]>) {
  state.byTable = Object.fromEntries(
    Object.entries(tables).map(([table, data]) => [table, { data, error: null }]),
  );
}

const leftStudent = {
  id: "stu-left",
  admission_no: "TEST-L1",
  full_name: "Left Student",
  father_name: "Father One",
  primary_phone: "9000000001",
  status: "left",
  class_id: "class-8",
  class_ref: { class_name: "Class 8", section: "A", stream_name: null },
};

const graduatedStudent = {
  id: "stu-grad",
  admission_no: "TEST-G1",
  full_name: "Graduated Student",
  father_name: "Father Two",
  primary_phone: "9000000002",
  status: "graduated",
  class_id: "class-12",
  class_ref: { class_name: "Class 12", section: null, stream_name: "Science" },
};

describe("getRecoveryQueue", () => {
  beforeEach(() => {
    state.createClient.mockResolvedValue(createMockSupabase());
    state.byTable = {};
  });

  it("returns an empty queue when no student has left owing", async () => {
    seed({ students: [] });
    const { getRecoveryQueue } = await import("@/lib/recovery/data");

    const data = await getRecoveryQueue();

    expect(data.totalStudents).toBe(0);
    expect(data.totalRemaining).toBe(0);
    expect(data.rows).toEqual([]);
  });

  it("aggregates pending dues per left student and flags carry-forward", async () => {
    seed({
      students: [leftStudent, graduatedStudent],
      v_workbook_installment_balances: [
        {
          installment_id: "inst-1",
          student_id: "stu-left",
          installment_label: "Installment 3",
          due_date: "2026-10-20",
          session_label: "2026-27",
          pending_amount: 5000,
          last_payment_date: "2026-09-01",
        },
        {
          installment_id: "inst-2",
          student_id: "stu-grad",
          installment_label: "Old Balance (2025-26)",
          due_date: "2026-04-20",
          session_label: "2026-27",
          pending_amount: 12000,
          last_payment_date: null,
        },
      ],
      installments: [
        { id: "inst-1", is_carry_forward: false, source_session_label: null, carry_forward_balance_id: null },
        {
          id: "inst-2",
          is_carry_forward: true,
          source_session_label: "2025-26",
          carry_forward_balance_id: "cfb-1",
        },
      ],
    });
    const { getRecoveryQueue } = await import("@/lib/recovery/data");

    const data = await getRecoveryQueue();

    expect(data.totalStudents).toBe(2);
    expect(data.totalRemaining).toBe(17000);
    // Sorted by largest outstanding -> graduated student first.
    expect(data.rows[0]?.studentId).toBe("stu-grad");
    expect(data.rows[0]?.hasCarryForward).toBe(true);
    expect(data.rows[0]?.carryForwardBalanceIds).toEqual(["cfb-1"]);
    expect(data.rows[0]?.sourceSessionLabel).toBe("2025-26");
    expect(data.rows[1]?.studentId).toBe("stu-left");
    expect(data.rows[1]?.hasCarryForward).toBe(false);
    expect(data.statusCounts).toEqual({ left: 1, graduated: 1, inactive: 0 });
    expect(data.classOptions).toHaveLength(2);
  });

  it("excludes a left student whose balances net to zero pending", async () => {
    seed({
      students: [leftStudent],
      v_workbook_installment_balances: [],
      installments: [],
    });
    const { getRecoveryQueue } = await import("@/lib/recovery/data");

    const data = await getRecoveryQueue();
    expect(data.rows).toEqual([]);
  });

  it("filters by status", async () => {
    seed({
      students: [leftStudent, graduatedStudent],
      v_workbook_installment_balances: [
        {
          installment_id: "inst-1",
          student_id: "stu-left",
          installment_label: "Installment 3",
          due_date: "2026-10-20",
          session_label: "2026-27",
          pending_amount: 5000,
          last_payment_date: null,
        },
        {
          installment_id: "inst-2",
          student_id: "stu-grad",
          installment_label: "Installment 2",
          due_date: "2026-07-20",
          session_label: "2026-27",
          pending_amount: 12000,
          last_payment_date: null,
        },
      ],
      installments: [
        { id: "inst-1", is_carry_forward: false, source_session_label: null, carry_forward_balance_id: null },
        { id: "inst-2", is_carry_forward: false, source_session_label: null, carry_forward_balance_id: null },
      ],
    });
    const { getRecoveryQueue } = await import("@/lib/recovery/data");

    const data = await getRecoveryQueue({ statuses: ["left"] });
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]?.studentId).toBe("stu-left");
    // statusCounts reflect the full pre-filter set so the filter chips stay accurate.
    expect(data.statusCounts).toEqual({ left: 1, graduated: 1, inactive: 0 });
  });
});

describe("getStudentRecoveryDues", () => {
  beforeEach(() => {
    state.createClient.mockResolvedValue(createMockSupabase());
    state.byTable = {};
  });

  it("returns a single left student's recoverable position", async () => {
    seed({
      students: [leftStudent],
      v_workbook_installment_balances: [
        {
          installment_id: "inst-1",
          student_id: "stu-left",
          installment_label: "Installment 3",
          due_date: "2026-10-20",
          session_label: "2026-27",
          pending_amount: 5000,
          last_payment_date: null,
        },
      ],
      installments: [
        { id: "inst-1", is_carry_forward: false, source_session_label: null, carry_forward_balance_id: null },
      ],
    });
    const { getStudentRecoveryDues } = await import("@/lib/recovery/data");

    const row = await getStudentRecoveryDues("stu-left");
    expect(row?.studentId).toBe("stu-left");
    expect(row?.totalRemaining).toBe(5000);
    expect(row?.collectable).toBe(true);
    expect(row?.dues).toHaveLength(1);
  });

  it("returns null for a blank id", async () => {
    const { getStudentRecoveryDues } = await import("@/lib/recovery/data");
    expect(await getStudentRecoveryDues("   ")).toBeNull();
  });
});
