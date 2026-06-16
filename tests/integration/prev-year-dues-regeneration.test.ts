import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getFeeSetupPageData = vi.fn();
const createClient = vi.fn();

vi.mock("@/lib/fees/data", () => ({ getFeeSetupPageData }));

vi.mock("@/lib/fees/policy", () => ({
  resolveStudentPolicyBreakdown: vi.fn(() => ({
    lateFeeFlatAmount: 1000,
    breakdown: {
      annualTotal: 12000,
      academicFeeAmount: 0,
      otherAdjustmentAmount: 0,
      discountApplied: 0,
      grossBaseBeforeDiscount: 12000,
      calculationModel: "workbook_v1",
      coreHeads: [
        { id: "tuition_fee", amount: 12000 },
        { id: "transport_fee", amount: 0 },
      ],
    },
  })),
}));

vi.mock("@/lib/fees/workbook", () => ({
  buildWorkbookInstallmentCharges: vi.fn(() => ({
    installmentCharges: [3000, 3000, 3000, 3000],
  })),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient }));

function queryResult<T>(data: T) {
  return {
    in() {
      return this;
    },
    select() {
      return this;
    },
    eq() {
      return this;
    },
    then(resolve: (value: { data: T; error: null }) => void) {
      return Promise.resolve({ data, error: null }).then(resolve);
    },
  };
}

const setupData = {
  globalPolicy: {
    academicSessionLabel: "2026-27",
    installmentCount: 4,
    academicFeeDistribution: null,
    installmentSchedule: [
      { label: "Installment 1", dueDate: "2026-04-20", dueDateLabel: "20 April" },
      { label: "Installment 2", dueDate: "2026-07-20", dueDateLabel: "20 July" },
      { label: "Installment 3", dueDate: "2026-10-20", dueDateLabel: "20 October" },
      { label: "Installment 4", dueDate: "2027-01-20", dueDateLabel: "20 January" },
    ],
  },
  schoolDefault: {},
  classDefaults: [{ id: "fee-1", classId: "class-1" }],
  transportDefaults: [],
  studentOverrides: [],
  conventionalDiscountAssignments: [],
};

// The four in-sync policy installments matching exactly what the generator
// would plan (so they need no insert/update).
function policyInstallments() {
  return setupData.globalPolicy.installmentSchedule.map((schedule, index) => ({
    id: `inst-${index + 1}`,
    student_id: "student-1",
    class_id: "class-1",
    fee_setting_id: "fee-1",
    student_fee_override_id: null,
    installment_no: index + 1,
    installment_label: `${schedule.label} (${schedule.dueDateLabel})`,
    due_date: schedule.dueDate,
    base_amount: 3000,
    transport_amount: 0,
    discount_amount: 0,
    amount_due: 3000,
    late_fee_flat_amount: 1000,
    status: "scheduled" as const,
    is_carry_forward: false,
  }));
}

function carryForwardRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "inst-cf",
    student_id: "student-1",
    class_id: "class-1",
    fee_setting_id: "fee-1",
    student_fee_override_id: null,
    installment_no: 99,
    installment_label: "Previous year tuition balance (2025-26)",
    due_date: "2026-04-01",
    base_amount: 9000,
    transport_amount: 0,
    discount_amount: 0,
    amount_due: 9000,
    late_fee_flat_amount: 0,
    status: "scheduled" as const,
    is_carry_forward: true,
    ...overrides,
  };
}

function buildClient(installmentRows: unknown[], cancelledIds: string[]) {
  return {
    from(table: string) {
      if (table === "students") {
        return {
          select: () =>
            queryResult([
              {
                id: "student-1",
                admission_no: "A100",
                full_name: "Test Student",
                class_id: "class-1",
                transport_route_id: null,
                status: "active",
                class_ref: {
                  class_name: "Class 1",
                  section: null,
                  stream_name: null,
                  session_label: "2026-27",
                  status: "active",
                },
              },
            ]),
        };
      }
      if (table === "installments") {
        return {
          select: () => queryResult(installmentRows),
          insert: vi.fn(() => Promise.resolve({ error: null })),
          update: (values: { status?: string }) => ({
            eq: (_col: string, id: string) => {
              if (values.status === "cancelled") {
                cancelledIds.push(id);
              }
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === "payments" || table === "payment_adjustments") {
        return { select: () => queryResult([]) };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe("ledger regeneration preserves carry-forward dues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFeeSetupPageData.mockResolvedValue(setupData);
  });

  it("never cancels an unpaid carry-forward (is_carry_forward) line", async () => {
    const cancelledIds: string[] = [];
    createClient.mockResolvedValue(
      buildClient([...policyInstallments(), carryForwardRow()], cancelledIds),
    );

    const { generateSessionLedgersAction } = await import("@/lib/fees/generator");
    const result = await generateSessionLedgersAction({ scopedStudentIds: ["student-1"] });

    expect(result.installmentsToInsert).toBe(0);
    expect(result.installmentsToUpdate).toBe(0);
    expect(result.installmentsToCancel).toBe(0);
    expect(cancelledIds).not.toContain("inst-cf");
    expect(cancelledIds).toHaveLength(0);
  });

  it("control: an unpaid NON-carry-forward extra installment IS cancelled", async () => {
    const cancelledIds: string[] = [];
    const extra = carryForwardRow({
      id: "inst-extra",
      installment_no: 5,
      installment_label: "Stray installment",
      is_carry_forward: false,
    });
    createClient.mockResolvedValue(
      buildClient([...policyInstallments(), extra], cancelledIds),
    );

    const { generateSessionLedgersAction } = await import("@/lib/fees/generator");
    const result = await generateSessionLedgersAction({ scopedStudentIds: ["student-1"] });

    expect(result.installmentsToCancel).toBe(1);
    expect(cancelledIds).toContain("inst-extra");
  });
});
