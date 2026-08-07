import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getFeeSetupPageData = vi.fn();
const createClient = vi.fn();
const buildWorkbookInstallmentCharges = vi.fn();

vi.mock("@/lib/fees/data", () => ({ getFeeSetupPageData }));

vi.mock("@/lib/fees/policy", () => ({
  resolveStudentPolicyBreakdown: vi.fn(() => ({
    lateFeeFlatAmount: 1000,
    breakdown: {
      annualTotal: 18000,
      academicFeeAmount: 0,
      otherAdjustmentAmount: 0,
      discountApplied: 2000,
      grossBaseBeforeDiscount: 20000,
      calculationModel: "workbook_v1",
      coreHeads: [
        { id: "tuition_fee", amount: 20000 },
        { id: "transport_fee", amount: 0 },
      ],
    },
  })),
}));

vi.mock("@/lib/fees/workbook", () => ({ buildWorkbookInstallmentCharges }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

function queryResult<T>(data: T) {
  return {
    in() {
      return this;
    },
    select() {
      return this;
    },
    then(resolve: (value: { data: T; error: null }) => void) {
      return Promise.resolve({ data, error: null }).then(resolve);
    },
  };
}

const SCHEDULE = [
  { label: "Installment 1", dueDate: "2026-04-20", dueDateLabel: "20-04-2026" },
  { label: "Installment 2", dueDate: "2026-07-20", dueDateLabel: "20-07-2026" },
  { label: "Installment 3", dueDate: "2026-10-20", dueDateLabel: "20-10-2026" },
  { label: "Installment 4", dueDate: "2027-01-20", dueDateLabel: "20-01-2027" },
];

const setupData = {
  globalPolicy: {
    academicSessionLabel: "2026-27",
    installmentCount: 4,
    installmentSchedule: SCHEDULE,
    academicFeeDistribution: "first_installment",
  },
  schoolDefault: {},
  classDefaults: [
    { id: "fee-1", classId: "class-1", sessionLabel: "2026-27", annualTuitionFee: 20000 },
  ],
  transportDefaults: [],
  studentOverrides: [],
};

const STUDENT_ROW = {
  id: "student-1",
  admission_no: "2261",
  full_name: "EKTA PALIWAL",
  class_id: "class-1",
  transport_route_id: null,
  status: "active",
  class_ref: {
    class_name: "Class 8",
    section: null,
    stream_name: null,
    session_label: "2026-27",
    status: "active",
  },
};

function installment(no: number, amountDue: number) {
  return {
    id: `inst-${no}`,
    student_id: "student-1",
    class_id: "class-1",
    fee_setting_id: "fee-1",
    student_fee_override_id: null,
    installment_no: no,
    installment_label: `${SCHEDULE[no - 1]!.label} (${SCHEDULE[no - 1]!.dueDateLabel})`,
    due_date: SCHEDULE[no - 1]!.dueDate,
    base_amount: amountDue,
    transport_amount: 0,
    discount_amount: 0,
    amount_due: amountDue,
    late_fee_flat_amount: 1000,
    status: "scheduled" as const,
    is_carry_forward: false,
  };
}

type CapturedUpdate = { id: string; values: Record<string, unknown> };

/**
 * Wire the supabase mock with a fixed ledger and payment picture, and capture
 * what the generator actually writes back. `previewLedgerGenerationDetailed`
 * only returns counts, so the amounts have to be read off the update calls.
 */
function mockDb(payload: {
  installments: ReturnType<typeof installment>[];
  payments: Array<{ installment_id: string; amount: number }>;
}) {
  const updates: CapturedUpdate[] = [];

  createClient.mockResolvedValue({
    from(table: string) {
      if (table === "students") {
        return { select: () => queryResult([STUDENT_ROW]) };
      }
      if (table === "installments") {
        return {
          select: () => queryResult(payload.installments),
          insert: () => Promise.resolve({ error: null }),
          update: (values: Record<string, unknown>) => ({
            eq: (_column: string, id: string) => {
              updates.push({ id, values });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === "payments") {
        return { select: () => queryResult(payload.payments) };
      }
      if (table === "payment_adjustments") {
        return { select: () => queryResult([]) };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  });

  return updates;
}

/**
 * The regression this file exists for: SR 2261 EKTA PALIWAL had a Rs 2,000
 * discount recorded on 2026-08-07 against installments last written on
 * 2026-05-24. Every installment carried a payment, so the old
 * `classifyInstallmentLock` froze all four, the whole plan was discarded, and
 * the office was told "Student updated and fee records updated."
 */
describe("a discount on a student who has already paid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFeeSetupPageData.mockResolvedValue(setupData);
  });

  it("comes off the unpaid installment instead of being silently dropped", async () => {
    // 20,000 gross becomes 18,000 after the discount.
    buildWorkbookInstallmentCharges.mockReturnValue({
      installmentCharges: [4500, 4500, 4500, 4500],
      grossBaseBeforeDiscount: 20000,
      discountApplied: 2000,
      baseTotalDue: 18000,
    });
    const updates = mockDb({
      installments: [installment(1, 5000), installment(2, 5000), installment(3, 5000), installment(4, 5000)],
      // First three paid in full, the fourth still open.
      payments: [
        { installment_id: "inst-1", amount: 5000 },
        { installment_id: "inst-2", amount: 5000 },
        { installment_id: "inst-3", amount: 5000 },
      ],
    });

    const { generateSessionLedgersAction } = await import("@/lib/fees/generator");
    const result = await generateSessionLedgersAction({ scopedStudentIds: ["student-1"] });

    // The old behaviour: zero updates, everything frozen, silent success.
    expect(result.installmentsToUpdate).toBeGreaterThan(0);

    const byId = new Map(updates.map((row) => [row.id, row.values]));
    // The three paid rows keep their charge — a receipt reported those amounts.
    for (const id of ["inst-1", "inst-2", "inst-3"]) {
      const values = byId.get(id);
      if (values) {
        expect(values.base_amount, `${id} must not drop below what was paid`).toBe(5000);
      }
    }
    // The whole Rs 2,000 lands on the still-open installment.
    expect(byId.get("inst-4")?.base_amount).toBe(3000);

    // Nothing was held for review, and no phantom credit was invented.
    expect(result.blockedInstallmentsForReview).toEqual([]);
    expect(result.residualCreditStudents).toEqual([]);
  });

  it("still refuses to RAISE a charge on a row someone has paid against", async () => {
    // A fee increase, not a discount. The row carries money, so re-billing it
    // has to stay a human decision.
    buildWorkbookInstallmentCharges.mockReturnValue({
      installmentCharges: [9000, 9000, 9000, 9000],
      grossBaseBeforeDiscount: 36000,
      discountApplied: 0,
      baseTotalDue: 36000,
    });
    const updates = mockDb({
      installments: [installment(1, 5000), installment(2, 5000), installment(3, 5000), installment(4, 5000)],
      payments: [{ installment_id: "inst-1", amount: 5000 }],
    });

    const { generateSessionLedgersAction } = await import("@/lib/fees/generator");
    const result = await generateSessionLedgersAction({ scopedStudentIds: ["student-1"] });

    const blocked = result.blockedInstallmentsForReview.find((row) => row.installmentNo === 1);
    expect(blocked).toMatchObject({ reasonCode: "fully_paid", actionNeeded: "update" });
    // The paid row was never written; the untouched rows still update normally.
    expect(updates.map((row) => row.id)).toEqual(["inst-2", "inst-3", "inst-4"]);
  });

  it("reports a refundable credit when the discount exceeds everything still owed", async () => {
    // Fully paid year, then a discount bigger than the remaining balance. The
    // student is genuinely overpaid; the amount must be surfaced rather than
    // quietly clamped, so Finance Controls can refund it.
    buildWorkbookInstallmentCharges.mockReturnValue({
      installmentCharges: [4000, 4000, 4000, 4000],
      grossBaseBeforeDiscount: 20000,
      discountApplied: 4000,
      baseTotalDue: 16000,
    });
    mockDb({
      installments: [installment(1, 5000), installment(2, 5000), installment(3, 5000), installment(4, 5000)],
      payments: [
        { installment_id: "inst-1", amount: 5000 },
        { installment_id: "inst-2", amount: 5000 },
        { installment_id: "inst-3", amount: 5000 },
        { installment_id: "inst-4", amount: 5000 },
      ],
    });

    const { previewLedgerGenerationDetailed } = await import("@/lib/fees/generator");
    const plan = await previewLedgerGenerationDetailed({ scopedStudentIds: ["student-1"] });

    expect(plan.residualCreditStudents).toEqual([
      {
        studentId: "student-1",
        admissionNo: "2261",
        fullName: "EKTA PALIWAL",
        residualCreditAmount: 4000,
      },
    ]);
  });

  it("leaves a moved due date on a paid row for review, whatever the amount", async () => {
    // Shifting a due date restarts the late-fee clock on an installment a
    // parent has already paid against. That is not a discount.
    buildWorkbookInstallmentCharges.mockReturnValue({
      installmentCharges: [4500, 4500, 4500, 4500],
      grossBaseBeforeDiscount: 20000,
      discountApplied: 2000,
      baseTotalDue: 18000,
    });
    const rows = [installment(1, 5000), installment(2, 5000), installment(3, 5000), installment(4, 5000)];
    rows[0] = { ...rows[0]!, due_date: "2026-03-01" };
    mockDb({ installments: rows, payments: [{ installment_id: "inst-1", amount: 5000 }] });

    const { previewLedgerGenerationDetailed } = await import("@/lib/fees/generator");
    const plan = await previewLedgerGenerationDetailed({ scopedStudentIds: ["student-1"] });

    expect(plan.blockedInstallmentsForReview.map((row) => row.installmentNo)).toContain(1);
  });
});
