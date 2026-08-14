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

  it("never re-bills a paid row, and puts a fee rise on the unpaid ones", async () => {
    // A fee increase, not a discount, with installment 1 already paid.
    //
    // The paid row is left exactly as the receipt reported it. The increase
    // lands on the three rows carrying no money, so the year still totals
    // 36,000 — the earlier behaviour proposed 9,000 for the paid row, had it
    // refused, and quietly left the year 4,000 short.
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

    // The paid row is untouched — not written, and not flagged either, because
    // nothing was ever proposed for it.
    expect(updates.map((row) => row.id)).toEqual(["inst-2", "inst-3", "inst-4"]);
    expect(result.blockedInstallmentsForReview).toEqual([]);

    const written = updates.reduce((total, row) => total + Number(row.values.base_amount), 0);
    expect(written + 5000).toBe(36000);
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

describe("a stale label must not block a real discount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFeeSetupPageData.mockResolvedValue(setupData);
  });

  it("writes only the money when a paid row's terms have drifted", async () => {
    // SR 2261 / 2259 / 2243 all carried rows labelled plainly "Installment 1"
    // (the generator now emits "Installment 1 (20-04-2026)") with
    // late_fee_flat_amount 0 against a policy of 1000. Every paid row was
    // therefore structurally different, the whole row was refused, and a
    // Rs 2,000 discount had nowhere to land.
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

    const { generateSessionLedgersAction } = await import("@/lib/fees/generator");
    const result = await generateSessionLedgersAction({ scopedStudentIds: ["student-1"] });

    const written = new Map(updates.map((row) => [row.id, row.values]));
    // The discount lands on the only row with headroom.
    expect(written.get("inst-4")?.base_amount).toBe(5125);
    // …and the receipt's own terms are left exactly as printed.
    expect(written.get("inst-4")?.installment_label).toBe("Installment 4");
    expect(written.get("inst-4")?.late_fee_flat_amount).toBe(0);
    expect(result.installmentsToUpdate).toBeGreaterThan(0);
  });

  it("still refuses a pure terms rewrite when no money moves", async () => {
    // Same drifted label and late fee, but the amount is unchanged. Nothing is
    // gained by rewriting it and a parent's late-fee exposure would change, so
    // it stays a human decision.
    buildWorkbookInstallmentCharges.mockReturnValue({
      installmentCharges: [5000, 5000, 5000, 5000],
      grossBaseBeforeDiscount: 20000,
      discountApplied: 0,
      baseTotalDue: 20000,
    });

    const stale = [installment(1, 5000), installment(2, 5000), installment(3, 5000), installment(4, 5000)].map(
      (row) => ({ ...row, installment_label: `Installment ${row.installment_no}`, late_fee_flat_amount: 0 }),
    );
    mockDb({ installments: stale, payments: [{ installment_id: "inst-1", amount: 5000 }] });

    const { generateSessionLedgersAction } = await import("@/lib/fees/generator");
    const result = await generateSessionLedgersAction({ scopedStudentIds: ["student-1"] });

    expect(result.blockedInstallmentsForReview.map((row) => row.installmentNo)).toContain(1);
  });
});

/**
 * The mirror-image regression, found on live 2026-27 three months after it
 * started: a policy change that RAISES what a student owes.
 *
 * Eight students carried Rs 54,225 of transport that was never billed. A bus
 * route was added mid-year, the engine computed the higher total correctly, and
 * then could not write it anywhere — every installment carried a payment, and
 * ANY increase on a row carrying money was refused. The plan collapsed to no
 * change at all, so nothing was written, nothing was blocked, and nothing was
 * reported. The ledger simply asked for less than the policy, and every screen
 * agreed with the ledger.
 */
describe("a fee rise on a student who has already paid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFeeSetupPageData.mockResolvedValue(setupData);
  });

  it("lands on a partly-paid installment rather than evaporating", async () => {
    // SR 2608's shape: installments 1-3 settled, installment 4 carrying
    // Rs 3,100 of its Rs 4,000. No empty row exists anywhere.
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
        { installment_id: "inst-4", amount: 4000 },
      ],
    });

    const { generateSessionLedgersAction } = await import("@/lib/fees/generator");
    const result = await generateSessionLedgersAction({ scopedStudentIds: ["student-1"] });

    const byId = new Map(updates.map((row) => [row.id, row.values]));

    // The three settled rows are finished bills and do not move.
    for (const id of ["inst-1", "inst-2", "inst-3"]) {
      expect(byId.get(id)?.base_amount ?? 5000).toBe(5000);
    }
    // The whole Rs 10,000 rise (20,000 -> 30,000) lands on the one row still
    // owing. The receipt for Rs 4,000 stays true; only what remains owed moves,
    // from Rs 1,000 to Rs 11,000.
    expect(byId.get("inst-4")?.base_amount).toBe(15000);
    expect(result.underBilledStudents).toEqual([]);
    expect(result.underBilledTotal).toBe(0);
  });

  it("reports the shortfall when every installment is settled", async () => {
    // Nothing can absorb the rise without re-billing a finished installment,
    // so the engine writes nothing — and says so, which is the entire point.
    buildWorkbookInstallmentCharges.mockReturnValue({
      installmentCharges: [7500, 7500, 7500, 7500],
      grossBaseBeforeDiscount: 30000,
      discountApplied: 0,
      baseTotalDue: 30000,
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

    const { generateSessionLedgersAction } = await import("@/lib/fees/generator");
    const result = await generateSessionLedgersAction({ scopedStudentIds: ["student-1"] });

    expect(result.underBilledStudents).toHaveLength(1);
    expect(result.underBilledStudents[0]?.admissionNo).toBe("2261");
    expect(result.underBilledStudents[0]?.unbilledIncreaseAmount).toBe(10000);
    expect(result.underBilledTotal).toBe(10000);
  });

  it("re-points a ledger left behind by a class move", async () => {
    // SR 2141 moved 12 Arts -> 12 Commerce and the installments kept pointing
    // at the old class. Both classes charged Rs 32,000, so no amount changed
    // and `differs()` — which compared everything BUT class_id — saw nothing to
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

    const { generateSessionLedgersAction } = await import("@/lib/fees/generator");
    await generateSessionLedgersAction({ scopedStudentIds: ["student-1"] });

    expect(updates).not.toHaveLength(0);
    for (const update of updates) {
      expect(update.values.class_id).toBe("class-1");
    }
  });
});
