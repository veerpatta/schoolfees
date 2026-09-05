import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getFeeSetupPageData = vi.fn();
const createClient = vi.fn();
const buildWorkbookInstallmentCharges = vi.fn();

vi.mock("@/modules/fees/domain/queries", () => ({ getFeeSetupPageData }));

vi.mock("@/modules/fees/data/policy", () => ({
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

vi.mock("@/modules/fees/domain/workbook", () => ({ buildWorkbookInstallmentCharges }));
vi.mock("@/platform/supabase/server", () => ({ createClient }));

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
      // No EMI repayment plans in these fixtures: the lock rules under test are
      // the paid/adjusted ones.
      if (table === "student_repayment_plan_items") {
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
 *
 * Since 20260905064847 the answer is simpler than the paid-floor allocator
 * that first fixed it: money settles the installments oldest-first at read
 * time, so a row carrying a payment is repriced like any other and the pool
 * re-settles. SR 660 is why -- Rs 7,600 paid before installment 1 was due
 * read "installment 3 Paid, installments 1 and 2 Overdue" after a fee edit,
 * because the receipt's pin froze the row it happened to land on.
 */
describe("a discount on a student who has already paid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFeeSetupPageData.mockResolvedValue(setupData);
  });

  it("writes the policy split to every row, paid or not", async () => {
    buildWorkbookInstallmentCharges.mockReturnValue({
      installmentCharges: [4500, 4500, 4500, 4500],
      grossBaseBeforeDiscount: 20000,
      discountApplied: 2000,
      baseTotalDue: 18000,
    });
    const updates = mockDb({
      installments: [installment(1, 5000), installment(2, 5000), installment(3, 5000), installment(4, 5000)],
      payments: [
        { installment_id: "inst-1", amount: 5000 },
        { installment_id: "inst-2", amount: 5000 },
        { installment_id: "inst-3", amount: 5000 },
      ],
    });

    const { generateSessionLedgersAction } = await import("@/modules/fees/data/generator");
    const result = await generateSessionLedgersAction({ scopedStudentIds: ["student-1"] });

    expect(updates.map((row) => row.id).sort()).toEqual(["inst-1", "inst-2", "inst-3", "inst-4"]);
    for (const update of updates) {
      expect(update.values.base_amount).toBe(4500);
    }
    expect(result.installmentsToUpdate).toBe(4);
    expect(result.feeDeltaTotal).toBe(-2000);
    // Nothing held, and 15,000 paid against 18,000 is not credit.
    expect(result.blockedInstallmentsForReview).toEqual([]);
    expect(result.studentsEndingInCredit).toEqual([]);
  });

  it("puts a fee rise on every row too -- a paid row is repriced, not re-billed", async () => {
    // The receipt keeps its own record of what it was written against; the
    // pool decides what is still owed, oldest row first.
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

    const { generateSessionLedgersAction } = await import("@/modules/fees/data/generator");
    const result = await generateSessionLedgersAction({ scopedStudentIds: ["student-1"] });

    expect(updates.map((row) => row.id).sort()).toEqual(["inst-1", "inst-2", "inst-3", "inst-4"]);
    const written = updates.reduce((total, row) => total + Number(row.values.base_amount), 0);
    expect(written).toBe(36000);
    expect(result.feeDeltaTotal).toBe(16000);
    expect(result.blockedInstallmentsForReview).toEqual([]);
  });

  it("reports the family who ends up in credit when the discount exceeds what they paid", async () => {
    // Fully paid year, then a discount bigger than the remaining balance. The
    // student is genuinely overpaid; the amount is surfaced so Finance
    // Controls can refund it, and the rows are still written to policy.
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

    const { previewLedgerGenerationDetailed } = await import("@/modules/fees/data/generator");
    const plan = await previewLedgerGenerationDetailed({ scopedStudentIds: ["student-1"] });

    expect(plan.installmentsToUpdate).toBe(4);
    expect(plan.studentsEndingInCredit).toEqual([
      {
        studentId: "student-1",
        admissionNo: "2261",
        fullName: "EKTA PALIWAL",
        creditAmount: 4000,
      },
    ]);
    expect(plan.creditTotal).toBe(4000);
  });

  it("still holds a moved due date on a paid row for review, whatever the amount", async () => {
    // The late fee is decided by what had been paid by the due date. Moving
    // the date re-runs that clock on money already handed over, and nothing
    // grandfathers the result -- so that one stays a decision.
    buildWorkbookInstallmentCharges.mockReturnValue({
      installmentCharges: [4500, 4500, 4500, 4500],
      grossBaseBeforeDiscount: 20000,
      discountApplied: 2000,
      baseTotalDue: 18000,
    });
    const rows = [installment(1, 5000), installment(2, 5000), installment(3, 5000), installment(4, 5000)];
    rows[0] = { ...rows[0]!, due_date: "2026-03-01" };
    mockDb({ installments: rows, payments: [{ installment_id: "inst-1", amount: 5000 }] });

    const { previewLedgerGenerationDetailed } = await import("@/modules/fees/data/generator");
    const plan = await previewLedgerGenerationDetailed({ scopedStudentIds: ["student-1"] });

    const held = plan.blockedInstallmentsForReview.find((row) => row.installmentNo === 1);
    expect(held?.reasonCode).toBe("due_date_changed");
    // The other three are written as policy says.
    expect(plan.installmentsToUpdate).toBe(3);
  });
});

describe("a stale label no longer blocks anything", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFeeSetupPageData.mockResolvedValue(setupData);
  });

  it("writes the whole row when a paid row's terms have drifted", async () => {
    // SR 2261 / 2259 / 2243 all carried rows labelled plainly "Installment 1"
    // (the generator now emits "Installment 1 (20-04-2026)") with
    // late_fee_flat_amount 0 against a policy of 1000. Under the old rule the
    // money was written and the terms preserved; now the terms come from
    // policy too, because the receipt is not the ledger's label.
    buildWorkbookInstallmentCharges.mockReturnValue({
      installmentCharges: [6750, 6750, 6750, 6750],
      grossBaseBeforeDiscount: 29000,
      discountApplied: 2000,
      baseTotalDue: 27000,
    });

    const stale = [installment(1, 7625), installment(2, 7125), installment(3, 7125), installment(4, 7125)].map(
      (row) => ({
        ...row,
        installment_label: `Installment ${row.installment_no}`, // no date suffix
        late_fee_flat_amount: 0, // policy says 1000
      }),
    );
    const updates = mockDb({
      installments: stale,
      payments: [
        { installment_id: "inst-1", amount: 7625 },
        { installment_id: "inst-2", amount: 7125 },
        { installment_id: "inst-3", amount: 7125 },
        { installment_id: "inst-4", amount: 5125 },
      ],
    });

    const { generateSessionLedgersAction } = await import("@/modules/fees/data/generator");
    const result = await generateSessionLedgersAction({ scopedStudentIds: ["student-1"] });

    const written = new Map(updates.map((row) => [row.id, row.values]));
    expect(written.get("inst-4")?.base_amount).toBe(6750);
    expect(written.get("inst-4")?.installment_label).toBe("Installment 4 (20-01-2027)");
    expect(written.get("inst-4")?.late_fee_flat_amount).toBe(1000);
    expect(result.installmentsToUpdate).toBe(4);
    expect(result.blockedInstallmentsForReview).toEqual([]);
  });

  it("writes a pure terms fix on a paid row, since no money moves and no receipt changes", async () => {
    buildWorkbookInstallmentCharges.mockReturnValue({
      installmentCharges: [5000, 5000, 5000, 5000],
      grossBaseBeforeDiscount: 20000,
      discountApplied: 0,
      baseTotalDue: 20000,
    });

    const stale = [installment(1, 5000), installment(2, 5000), installment(3, 5000), installment(4, 5000)].map(
      (row) => ({ ...row, installment_label: `Installment ${row.installment_no}`, late_fee_flat_amount: 0 }),
    );
    const updates = mockDb({ installments: stale, payments: [{ installment_id: "inst-1", amount: 5000 }] });

    const { generateSessionLedgersAction } = await import("@/modules/fees/data/generator");
    const result = await generateSessionLedgersAction({ scopedStudentIds: ["student-1"] });

    expect(result.blockedInstallmentsForReview).toEqual([]);
    expect(updates.map((row) => row.id)).toContain("inst-1");
    expect(result.feeDeltaTotal).toBe(0);
  });
});

/**
 * The mirror-image regression, found on live 2026-27 three months after it
 * started: a policy change that RAISES what a student owes.
 *
 * Eight students carried Rs 54,225 of transport that was never billed. A bus
 * route was added mid-year, the engine computed the higher total correctly, and
 * then could not write it anywhere -- every installment carried a payment, and
 * ANY increase on a row carrying money was refused. Under pooled settlement
 * there is no such thing as a row that cannot take a rise: the charge is
 * written and the family's money settles what it settles.
 */
describe("a fee rise on a student who has already paid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFeeSetupPageData.mockResolvedValue(setupData);
  });

  it("is written to every row, settled or not, and nothing evaporates", async () => {
    buildWorkbookInstallmentCharges.mockReturnValue({
      installmentCharges: [7500, 7500, 7500, 7500],
      grossBaseBeforeDiscount: 30000,
      discountApplied: 0,
      baseTotalDue: 30000,
    });
    const updates = mockDb({
      installments: [installment(1, 5000), installment(2, 5000), installment(3, 5000), installment(4, 5000)],
      payments: [
        { installment_id: "inst-1", amount: 5000 },
        { installment_id: "inst-2", amount: 5000 },
        { installment_id: "inst-3", amount: 5000 },
        { installment_id: "inst-4", amount: 5000 },
      ],
    });

    const { generateSessionLedgersAction } = await import("@/modules/fees/data/generator");
    const result = await generateSessionLedgersAction({ scopedStudentIds: ["student-1"] });

    const byId = new Map(updates.map((row) => [row.id, row.values]));
    for (const id of ["inst-1", "inst-2", "inst-3", "inst-4"]) {
      expect(byId.get(id)?.base_amount).toBe(7500);
    }
    expect(result.feeDeltaTotal).toBe(10000);
    expect(result.blockedInstallmentsForReview).toEqual([]);
    expect(result.studentsEndingInCredit).toEqual([]);
  });

  it("re-points a ledger left behind by a class move", async () => {
    // SR 2141 moved 12 Arts -> 12 Commerce and the installments kept pointing
    // at the old class. Both classes charged Rs 32,000, so no amount changed
    // and `differs()` -- which compared everything BUT class_id -- saw nothing to
    // do. Every per-class board billed the money to a class the student left.
    buildWorkbookInstallmentCharges.mockReturnValue({
      installmentCharges: [5000, 5000, 5000, 5000],
      grossBaseBeforeDiscount: 20000,
      discountApplied: 0,
      baseTotalDue: 20000,
    });
    const stale = [installment(1, 5000), installment(2, 5000), installment(3, 5000), installment(4, 5000)].map(
      (row) => ({ ...row, class_id: "class-old" }),
    );
    const updates = mockDb({ installments: stale, payments: [] });

    const { generateSessionLedgersAction } = await import("@/modules/fees/data/generator");
    await generateSessionLedgersAction({ scopedStudentIds: ["student-1"] });

    expect(updates).not.toHaveLength(0);
    for (const update of updates) {
      expect(update.values.class_id).toBe("class-1");
    }
  });
});
