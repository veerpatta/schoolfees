import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getFeeSetupPageData } from "@/lib/fees/data";
import { resolveStudentPolicyBreakdown } from "@/lib/fees/policy";
import { buildWorkbookInstallmentCharges } from "@/lib/fees/workbook";
import { allocateChargesRespectingPaidFloors } from "@/lib/fees/paid-floor-allocation";
import type { FeeSetupPageData } from "@/lib/fees/types";

type GeneratorStudentRow = {
  id: string;
  admission_no: string;
  full_name: string;
  class_id: string;
  transport_route_id: string | null;
  status: "active" | "inactive" | "left" | "graduated";
  class_ref:
    | {
        class_name: string;
        section: string | null;
        stream_name: string | null;
        session_label: string;
        status: string;
      }
    | Array<{
        class_name: string;
        section: string | null;
        stream_name: string | null;
        session_label: string;
        status: string;
      }>
    | null;
};

type ExistingInstallmentRow = {
  id: string;
  student_id: string;
  class_id: string;
  fee_setting_id: string;
  student_fee_override_id: string | null;
  installment_no: number;
  installment_label: string;
  due_date: string;
  base_amount: number;
  transport_amount: number;
  discount_amount: number;
  amount_due: number;
  late_fee_flat_amount: number;
  status: "scheduled" | "waived" | "cancelled";
  is_carry_forward: boolean;
  is_emi_late_fee: boolean;
};

type InstallmentAmountRow = {
  installment_id: string;
  amount: number;
};

type InstallmentAdjustmentRow = {
  installment_id: string;
  amount_delta: number;
};

type PlannedInstallment = {
  student_id: string;
  class_id: string;
  fee_setting_id: string;
  student_fee_override_id: string | null;
  installment_no: number;
  installment_label: string;
  due_date: string;
  base_amount: number;
  transport_amount: number;
  discount_amount: number;
  late_fee_flat_amount: number;
  status: "scheduled";
};

type PlannedExistingUpdate = PlannedInstallment & {
  id: string;
};

type CancelPlan = {
  id: string;
};

export type LockedInstallmentReasonCode =
  | "fully_paid"
  | "partially_paid"
  | "adjustment_posted"
  // The row is part of an ACTIVE monthly EMI plan. A family agreed to a
  // specific opening balance and a specific monthly amount; repricing the row
  // underneath them would silently change either what they owe or how long
  // they pay for. Held for a human, who reschedules the plan or collects the
  // difference separately.
  | "in_repayment_plan";

export type BlockedInstallmentForReview = {
  installmentId: string;
  studentId: string;
  installmentNo: number;
  installmentLabel: string;
  dueDate: string;
  amountDue: number;
  paidAmount: number;
  adjustmentAmount: number;
  outstandingAmount: number;
  reasonCode: LockedInstallmentReasonCode;
  reasonLabel: string;
  actionNeeded: "update" | "cancel";
};

export type LedgerSkippedStudentReasonCode =
  | "SESSION_MISMATCH"
  | "ACTIVE_FEE_SETUP_MISSING"
  | "CLASS_FEE_MISSING"
  | "ROUTE_FEE_MISSING"
  | "CLASS_INACTIVE"
  | "STUDENT_NOT_ACTIVE"
  | "FEE_SETUP_INCOMPLETE"
  | "NO_INSTALLMENT_DATES"
  | "DISCOUNT_EXCEEDS_DUES"
  | "DATABASE_ERROR"
  | "UNKNOWN";

export type LedgerSkippedStudent = {
  studentId: string;
  admissionNo: string;
  fullName: string;
  classLabel: string;
  sessionLabel: string;
  reasonCode: LedgerSkippedStudentReasonCode;
  reasonMessage: string;
};

/**
 * A student whose discount was larger than everything they still owed. The
 * excess makes them genuinely overpaid: it surfaces as
 * `v_student_financial_state.credit_balance` / `refundable_amount` and is
 * settled through the existing Finance Controls refund flow.
 */
export type ResidualCreditStudent = {
  studentId: string;
  admissionNo: string;
  fullName: string;
  residualCreditAmount: number;
};

type LedgerSyncPlan = {
  academicSessionLabel: string;
  totalActiveStudents: number;
  studentsInAcademicSession: number;
  scopedStudents: number;
  studentsWithResolvedSettings: number;
  studentsMissingSettings: number;
  existingInstallments: number;
  installmentsToInsert: PlannedInstallment[];
  installmentsToUpdate: PlannedExistingUpdate[];
  installmentsToCancel: CancelPlan[];
  blockedInstallmentsForReview: BlockedInstallmentForReview[];
  residualCreditStudents: ResidualCreditStudent[];
  skippedStudents: LedgerSkippedStudent[];
  warnings: string[];
  errors: string[];
  expectedScheduledInstallments: number;
  affectedStudents: number;
};

export type LedgerGenerationPreview = Omit<
  LedgerSyncPlan,
  | "installmentsToInsert"
  | "installmentsToUpdate"
  | "installmentsToCancel"
  | "blockedInstallmentsForReview"
  | "residualCreditStudents"
  | "skippedStudents"
  | "warnings"
  | "errors"
> & {
  installmentsToInsert: number;
  installmentsToUpdate: number;
  installmentsToCancel: number;
  lockedInstallments: number;
  /** Total rupees that became refundable because a discount exceeded the balance. */
  residualCreditTotal: number;
};

export type LedgerGenerationResult = LedgerGenerationPreview & {
  blockedInstallmentsForReview: BlockedInstallmentForReview[];
  residualCreditStudents: ResidualCreditStudent[];
  skippedStudents: LedgerSkippedStudent[];
  warnings: string[];
  errors: string[];
};

type LedgerPlanOptions = {
  setupData?: FeeSetupPageData;
  scopedSessionLabel?: string;
  scopedStudentIds?: string[];
  useAdminClient?: boolean;
};

type LedgerClient = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;

function toSingleRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function splitAcrossInstallments(totalAmount: number, count: number) {
  const baseAmount = Math.floor(totalAmount / count);
  const remainder = totalAmount % count;

  return Array.from({ length: count }, (_, index) =>
    baseAmount + (index === 0 ? remainder : 0),
  );
}

function isMeaningfulResolvedConfig(payload: {
  annualTotal: number;
  feeSettingId: string | null;
}) {
  return payload.annualTotal > 0 && Boolean(payload.feeSettingId);
}

function differs(existing: ExistingInstallmentRow, next: PlannedInstallment) {
  return (
    existing.fee_setting_id !== next.fee_setting_id ||
    existing.student_fee_override_id !== next.student_fee_override_id ||
    existing.installment_label !== next.installment_label ||
    existing.due_date !== next.due_date ||
    existing.base_amount !== next.base_amount ||
    existing.transport_amount !== next.transport_amount ||
    existing.discount_amount !== next.discount_amount ||
    existing.late_fee_flat_amount !== next.late_fee_flat_amount ||
    existing.status !== "scheduled"
  );
}

function normalizeSessionLabel(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function buildClassLabel(value: {
  class_name?: string | null;
  section?: string | null;
  stream_name?: string | null;
} | null) {
  if (!value?.class_name) {
    return "Unknown class";
  }

  return [value.class_name, value.section ? `Section ${value.section}` : "", value.stream_name ?? ""]
    .filter(Boolean)
    .join(" - ");
}

function isNoTransportRoute(value: { routeName?: string | null; routeCode?: string | null }) {
  const normalized = `${value.routeName ?? ""} ${value.routeCode ?? ""}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  return normalized === "notransport" || normalized === "none" || normalized === "noroute";
}

function toSkippedStudent(
  student: GeneratorStudentRow,
  reasonCode: LedgerSkippedStudentReasonCode,
  reasonMessage: string,
): LedgerSkippedStudent {
  const classRef = toSingleRecord(student.class_ref);

  return {
    studentId: student.id,
    admissionNo: student.admission_no,
    fullName: student.full_name,
    classLabel: buildClassLabel(classRef),
    sessionLabel: classRef?.session_label ?? "Not set",
    reasonCode,
    reasonMessage,
  };
}

function dedupeSkippedStudents(rows: LedgerSkippedStudent[]) {
  const seen = new Set<string>();

  return rows.filter((row) => {
    const key = `${row.studentId}:${row.reasonCode}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function addToAmountMap(map: Map<string, number>, installmentId: string, amount: number) {
  map.set(installmentId, (map.get(installmentId) ?? 0) + amount);
}

/**
 * `installments.amount_due` is a generated column
 * (`(base_amount + transport_amount) - discount_amount`), so a planned row does
 * not carry it. Mirror the generation expression here.
 */
function plannedAmountDue(next: PlannedInstallment) {
  return next.base_amount + next.transport_amount - next.discount_amount;
}

/**
 * The fields that must never be rewritten under a row carrying money.
 *
 * Deliberately narrower than `differs()`. Moving `due_date` restarts the
 * late-fee clock on an installment a parent has already paid against; changing
 * the label or the late-fee amount rewrites what a printed receipt said. A
 * change to the amount alone is a different thing entirely — see
 * `classifyInstallmentLock`.
 *
 * `fee_setting_id` and `student_fee_override_id` are excluded on purpose. They
 * are bookkeeping pointers, not money, and `upsertStudentFeeOverride` mints a
 * NEW override row on most edits — including the ones for a discount. Treating
 * a changed override id as structural would re-block the exact case this is
 * here to unblock.
 */
function structurallyDiffers(existing: ExistingInstallmentRow, next: PlannedInstallment) {
  return (
    existing.installment_label !== next.installment_label ||
    existing.due_date !== next.due_date ||
    existing.late_fee_flat_amount !== next.late_fee_flat_amount ||
    existing.status !== "scheduled"
  );
}

type InstallmentLockDecision =
  | { kind: "free" }
  | { kind: "safe_reduction" }
  | {
      kind: "locked";
      reasonCode: LockedInstallmentReasonCode;
      reasonLabel: string;
      outstandingAmount: number;
    };

/**
 * May this row be CANCELLED outright?
 *
 * A different question from "may this amount be reduced". Cancelling a row that
 * carries a payment would orphan the receipt that points at it, so any money on
 * the row blocks it — the original all-or-nothing rule, unchanged.
 */
function classifyCancelLock(payload: {
  existingInstallment: ExistingInstallmentRow;
  paidAmount: number;
  adjustmentAmount: number;
  isInRepaymentPlan?: boolean;
}) {
  const { existingInstallment: existing, paidAmount, adjustmentAmount } = payload;
  const appliedForPlan = Math.max(paidAmount + adjustmentAmount, 0);

  // Cancelling a row a family is paying for monthly would drop it out of the
  // plan's opening balance without anybody deciding that.
  if (payload.isInRepaymentPlan) {
    return {
      isLocked: true as const,
      reasonCode: "in_repayment_plan" as const,
      reasonLabel: "Covered by an active EMI plan",
      outstandingAmount: Math.max(existing.amount_due - appliedForPlan, 0),
    };
  }

  if (paidAmount <= 0 && adjustmentAmount === 0) {
    return { isLocked: false as const, reasonCode: null, reasonLabel: null, outstandingAmount: existing.amount_due };
  }

  const appliedAmount = Math.max(paidAmount + adjustmentAmount, 0);
  const outstandingAmount = Math.max(existing.amount_due - appliedAmount, 0);

  if (paidAmount > 0) {
    return appliedAmount >= existing.amount_due
      ? { isLocked: true as const, reasonCode: "fully_paid" as const, reasonLabel: "Fully paid installment", outstandingAmount }
      : { isLocked: true as const, reasonCode: "partially_paid" as const, reasonLabel: "Partially paid installment", outstandingAmount };
  }

  return {
    isLocked: true as const,
    reasonCode: "adjustment_posted" as const,
    reasonLabel: "Installment has adjustment entries",
    outstandingAmount,
  };
}

/**
 * Decide whether a planned change may be written over an existing installment.
 *
 * This used to be a boolean: any row with a payment or an adjustment on it was
 * frozen outright. That protected receipts, but it also meant a discount
 * applied to a student who had paid anything did NOTHING — the plan was
 * discarded and the office was told "fee records updated" (SR 2261, Rs 2,000
 * discount against installments untouched for two and a half months).
 *
 * The distinction that was missing: a REDUCTION down to — never below — what
 * has already been applied is safe. No receipt changes; the row simply stops
 * asking for money the school has decided to forgo. An INCREASE on a row
 * someone has already paid against is a re-bill and stays locked.
 */
function classifyInstallmentLock(payload: {
  existingInstallment: ExistingInstallmentRow;
  plannedInstallment: PlannedInstallment;
  paidAmount: number;
  adjustmentAmount: number;
  isInRepaymentPlan?: boolean;
}): InstallmentLockDecision {
  const existing = payload.existingInstallment;
  const paidAmount = payload.paidAmount;
  const adjustmentAmount = payload.adjustmentAmount;

  // An EMI row is locked in BOTH directions, unlike the paid-row rule below.
  // A reduction is normally safe because no receipt moves — but here the
  // family has agreed to clear a specific opening balance over a specific
  // number of months, and quietly shrinking a covered charge changes the deal.
  // Unchanged plans stay free: only a real difference is held.
  if (
    payload.isInRepaymentPlan &&
    (plannedAmountDue(payload.plannedInstallment) !== existing.amount_due ||
      structurallyDiffers(existing, payload.plannedInstallment))
  ) {
    return {
      kind: "locked",
      reasonCode: "in_repayment_plan",
      reasonLabel: "Covered by an active EMI plan",
      outstandingAmount: Math.max(
        existing.amount_due - Math.max(paidAmount + adjustmentAmount, 0),
        0,
      ),
    };
  }

  if (paidAmount <= 0 && adjustmentAmount === 0) {
    return { kind: "free" };
  }

  const appliedAmount = Math.max(paidAmount + adjustmentAmount, 0);
  const outstandingAmount = Math.max(existing.amount_due - appliedAmount, 0);
  const locked = (
    reasonCode: LockedInstallmentReasonCode,
    reasonLabel: string,
  ): InstallmentLockDecision => ({ kind: "locked", reasonCode, reasonLabel, outstandingAmount });

  const lockedForMoney = () => {
    if (paidAmount > 0) {
      return appliedAmount >= existing.amount_due
        ? locked("fully_paid", "Fully paid installment")
        : locked("partially_paid", "Partially paid installment");
    }

    return locked("adjustment_posted", "Installment has adjustment entries");
  };

  // A re-bill. Never automatic, whatever else is different.
  if (plannedAmountDue(payload.plannedInstallment) > existing.amount_due) {
    return lockedForMoney();
  }

  // Same charge, only the terms differ — a pure rewrite of what a receipt said.
  // No money moves, so there is nothing worth the risk: hold it for a human.
  if (
    plannedAmountDue(payload.plannedInstallment) === existing.amount_due &&
    structurallyDiffers(existing, payload.plannedInstallment)
  ) {
    return lockedForMoney();
  }

  // A reduction. The allocator has already floored the planned amount at what
  // was applied to this row, so it is safe to write.
  //
  // This is allowed even when the label, due date or late-fee amount have
  // drifted — the caller writes ONLY the money and preserves those fields.
  // Refusing the whole row on a stale label was blocking real discounts: three
  // students carried rows labelled "Installment 1" (the generator now emits
  // "Installment 1 (20-04-2026)") with late_fee_flat_amount 0 against a policy
  // of 1000, so every paid row was structurally different and a Rs 2,000
  // discount had nowhere to land. Moving the money is the safe half; changing
  // a parent's late-fee exposure is the half that still needs a human.
  return { kind: "safe_reduction" };
}

function summarizePlan(plan: LedgerSyncPlan): LedgerGenerationPreview {
  return {
    academicSessionLabel: plan.academicSessionLabel,
    totalActiveStudents: plan.totalActiveStudents,
    studentsInAcademicSession: plan.studentsInAcademicSession,
    scopedStudents: plan.scopedStudents,
    studentsWithResolvedSettings: plan.studentsWithResolvedSettings,
    studentsMissingSettings: plan.studentsMissingSettings,
    existingInstallments: plan.existingInstallments,
    installmentsToInsert: plan.installmentsToInsert.length,
    installmentsToUpdate: plan.installmentsToUpdate.length,
    installmentsToCancel: plan.installmentsToCancel.length,
    lockedInstallments: plan.blockedInstallmentsForReview.length,
    residualCreditTotal: plan.residualCreditStudents.reduce(
      (total, row) => total + row.residualCreditAmount,
      0,
    ),
    expectedScheduledInstallments: plan.expectedScheduledInstallments,
    affectedStudents: plan.affectedStudents,
  };
}

async function buildLedgerSyncPlan(options: LedgerPlanOptions = {}): Promise<LedgerSyncPlan> {
  const supabase: LedgerClient = options.useAdminClient ? createAdminClient() : await createClient();
  const setupData =
    options.setupData ??
    (await getFeeSetupPageData({
      sessionLabel: options.scopedSessionLabel,
      useAdmin: options.useAdminClient,
    }));
  const scopedStudentIdSet = options.scopedStudentIds
    ? new Set(options.scopedStudentIds)
    : null;

  let studentsQuery = supabase
    .from("students")
    .select(
      "id, admission_no, full_name, class_id, transport_route_id, status, class_ref:classes(class_name, section, stream_name, session_label, status)",
    );

  if (scopedStudentIdSet) {
    studentsQuery = studentsQuery.in("id", [...scopedStudentIdSet]);
  } else {
    studentsQuery = studentsQuery.eq("status", "active");
  }

  const { data: studentsRaw, error: studentsError } = await studentsQuery;

  if (studentsError) {
    throw new Error(studentsError.message);
  }

  const loadedStudents = (studentsRaw ?? []) as GeneratorStudentRow[];
  const activeStudents = loadedStudents.filter((student) => student.status === "active");
  const activeFeeSetupSession = setupData.globalPolicy.academicSessionLabel.trim();
  const skippedStudents: LedgerSkippedStudent[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!activeFeeSetupSession) {
    warnings.push("Fee Setup is incomplete for this year.");
    loadedStudents.forEach((student) => {
      skippedStudents.push(
        toSkippedStudent(
          student,
          "ACTIVE_FEE_SETUP_MISSING",
          "Fee Setup is incomplete for this year.",
        ),
      );
    });
  }

  if (setupData.globalPolicy.installmentSchedule.length === 0) {
    warnings.push("Fee Setup has no installment dates for this year.");
    loadedStudents.forEach((student) => {
      skippedStudents.push(
        toSkippedStudent(
          student,
          "NO_INSTALLMENT_DATES",
          "Fee Setup has no installment dates for this year.",
        ),
      );
    });
  }

  const sessionStudents = loadedStudents.filter((student) => {
    const classRef = toSingleRecord(student.class_ref);
    const classSessionMatches =
      normalizeSessionLabel(classRef?.session_label) === normalizeSessionLabel(activeFeeSetupSession);
    const classIsActive = classRef?.status === "active";

    if (!classSessionMatches) {
      skippedStudents.push(
        toSkippedStudent(
          student,
          "SESSION_MISMATCH",
          `This student is in ${classRef?.session_label || "another year"}, but Fee Setup is active for ${activeFeeSetupSession || "this year"}.`,
        ),
      );
      return false;
    }

    if (!classIsActive) {
      skippedStudents.push(
        toSkippedStudent(
          student,
          "CLASS_INACTIVE",
          `${buildClassLabel(classRef)} is inactive, so dues were not prepared.`,
        ),
      );
      return false;
    }

    return true;
  });
  const scopedStudents = scopedStudentIdSet
    ? sessionStudents.filter((student) => scopedStudentIdSet.has(student.id))
    : sessionStudents;
  const studentIds = scopedStudents.map((student) => student.id);

  let existingInstallments: ExistingInstallmentRow[] = [];
  const paymentTotalsByInstallment = new Map<string, number>();
  const adjustmentTotalsByInstallment = new Map<string, number>();
  // Installments covered by an ACTIVE EMI plan. Regeneration must not reprice
  // them behind the family's back — see classifyInstallmentLock.
  const repaymentPlanInstallmentIds = new Set<string>();

  if (studentIds.length > 0) {
    const { data: installmentsRaw, error: installmentsError } = await supabase
      .from("installments")
      .select(
        "id, student_id, class_id, fee_setting_id, student_fee_override_id, installment_no, installment_label, due_date, base_amount, transport_amount, discount_amount, amount_due, late_fee_flat_amount, status, is_carry_forward, is_emi_late_fee",
      )
      .in("student_id", studentIds);

    if (installmentsError) {
      throw new Error(installmentsError.message);
    }

    existingInstallments = (installmentsRaw ?? []) as ExistingInstallmentRow[];
    const installmentIds = existingInstallments.map((row) => row.id);

    if (installmentIds.length > 0) {
      // Chunk into batches of 200 to stay under PostgREST URL length limit.
      // 200 UUIDs (~37 chars each + commas) ≈ 7.4 KB url; safely under typical 8 KB limits.
      const CHUNK = 200;
      const paymentsRawAll: InstallmentAmountRow[] = [];
      const adjustmentsRawAll: InstallmentAdjustmentRow[] = [];
      for (let i = 0; i < installmentIds.length; i += CHUNK) {
        const slice = installmentIds.slice(i, i + CHUNK);
        const [
          { data: paymentsRaw, error: paymentsError },
          { data: adjustmentsRaw, error: adjustmentsError },
        ] = await Promise.all([
          supabase
            .from("payments")
            .select("installment_id, amount")
            .in("installment_id", slice),
          supabase
            .from("payment_adjustments")
            .select("installment_id, amount_delta")
            .in("installment_id", slice),
        ]);

        if (paymentsError) {
          throw new Error(paymentsError.message);
        }

        if (adjustmentsError) {
          throw new Error(adjustmentsError.message);
        }

        paymentsRawAll.push(...((paymentsRaw ?? []) as InstallmentAmountRow[]));
        adjustmentsRawAll.push(...((adjustmentsRaw ?? []) as InstallmentAdjustmentRow[]));
      }

      paymentsRawAll.forEach((row) => {
        addToAmountMap(paymentTotalsByInstallment, row.installment_id, row.amount);
      });

      adjustmentsRawAll.forEach((row) => {
        addToAmountMap(adjustmentTotalsByInstallment, row.installment_id, row.amount_delta);
      });

      const { data: planItemsRaw } = await supabase
        .from("student_repayment_plan_items")
        .select("installment_id, student_repayment_plans!inner(lifecycle)")
        .eq("student_repayment_plans.lifecycle", "active")
        .in("student_id", studentIds);

      (planItemsRaw ?? []).forEach((row) => {
        repaymentPlanInstallmentIds.add(String(row.installment_id));
      });
    }
  }

  const classDefaultMap = new Map(setupData.classDefaults.map((item) => [item.classId, item]));
  const routeDefaultMap = new Map(setupData.transportDefaults.map((item) => [item.id, item]));
  const studentOverrideMap = new Map(setupData.studentOverrides.map((item) => [item.studentId, item]));
  const conventionalDiscountAssignmentMap = new Map<
    string,
    typeof setupData.conventionalDiscountAssignments
  >();
  const conventionalDiscountAssignments = setupData.conventionalDiscountAssignments ?? [];
  conventionalDiscountAssignments.forEach((assignment) => {
    const existing = conventionalDiscountAssignmentMap.get(assignment.studentId) ?? [];
    existing.push(assignment);
    conventionalDiscountAssignmentMap.set(assignment.studentId, existing);
  });
  const existingInstallmentMap = new Map(
    existingInstallments.map((item) => [`${item.student_id}::${item.installment_no}`, item]),
  );

  const installmentsToInsert: PlannedInstallment[] = [];
  const installmentsToUpdate: PlannedExistingUpdate[] = [];
  const installmentsToCancel: CancelPlan[] = [];
  const blockedInstallmentsForReview: BlockedInstallmentForReview[] = [];
  const residualCreditStudents: ResidualCreditStudent[] = [];
  const affectedStudentIds = new Set<string>();
  let studentsWithResolvedSettings = 0;
  let expectedScheduledInstallments = 0;

  for (const student of scopedStudents) {
    if (student.status !== "active") {
      skippedStudents.push(
        toSkippedStudent(
          student,
          "STUDENT_NOT_ACTIVE",
          "This student is not active, so dues were not prepared.",
        ),
      );

      existingInstallments
        .filter((row) => row.student_id === student.id)
        // Carry-forward (previous-year dues) lines are never auto-cancelled by
        // ledger regeneration — they represent a real prior balance, not a
        // current-policy installment. A missed-EMI late fee is the same kind of
        // thing: a charge the school levied, not something fee policy produces.
        .filter((row) => !row.is_carry_forward && !row.is_emi_late_fee)
        .forEach((row) => {
          if (row.status === "cancelled") {
            return;
          }

          const paidAmount = paymentTotalsByInstallment.get(row.id) ?? 0;
          const adjustmentAmount = adjustmentTotalsByInstallment.get(row.id) ?? 0;
          const lock = classifyCancelLock({
            existingInstallment: row,
            paidAmount,
            adjustmentAmount,
            isInRepaymentPlan: repaymentPlanInstallmentIds.has(row.id),
          });

          if (lock.isLocked) {
            blockedInstallmentsForReview.push({
              installmentId: row.id,
              studentId: row.student_id,
              installmentNo: row.installment_no,
              installmentLabel: row.installment_label,
              dueDate: row.due_date,
              amountDue: row.amount_due,
              paidAmount,
              adjustmentAmount,
              outstandingAmount: lock.outstandingAmount,
              reasonCode: lock.reasonCode,
              reasonLabel: lock.reasonLabel,
              actionNeeded: "cancel",
            });
            affectedStudentIds.add(student.id);
            return;
          }

          installmentsToCancel.push({ id: row.id });
          affectedStudentIds.add(student.id);
        });
      continue;
    }

    const classDefault = classDefaultMap.get(student.class_id) ?? null;
    const routeDefault = student.transport_route_id
      ? (routeDefaultMap.get(student.transport_route_id) ?? null)
      : null;
    const studentOverride = studentOverrideMap.get(student.id) ?? null;
    const conventionalDiscountAssignments =
      conventionalDiscountAssignmentMap.get(student.id) ?? [];
    const resolved = resolveStudentPolicyBreakdown({
      policy: setupData.globalPolicy,
      schoolDefault: setupData.schoolDefault,
      classDefault,
      routeDefault,
      studentOverride,
      conventionalDiscountAssignments,
      hasTransportRoute: Boolean(student.transport_route_id),
    });
    const tuitionAmount =
      resolved.breakdown.coreHeads.find((item) => item.id === "tuition_fee")?.amount ?? 0;
    const transportAmount =
      resolved.breakdown.coreHeads.find((item) => item.id === "transport_fee")?.amount ?? 0;
    const baseAmount = resolved.breakdown.annualTotal - transportAmount;
    const discountAmount = studentOverride?.discountAmount ?? 0;
    const feeSettingId = classDefault?.id ?? null;

    if (setupData.globalPolicy.installmentSchedule.length === 0) {
      skippedStudents.push(
        toSkippedStudent(
          student,
          "NO_INSTALLMENT_DATES",
          "Fee Setup has no installment dates for this year.",
        ),
      );
      continue;
    }

    if (!feeSettingId) {
      skippedStudents.push(
        toSkippedStudent(
          student,
          "CLASS_FEE_MISSING",
          `${buildClassLabel(toSingleRecord(student.class_ref))} does not have a fee amount in Fee Setup for ${activeFeeSetupSession}.`,
        ),
      );
      continue;
    }

    if (
      student.transport_route_id &&
      routeDefault &&
      !isNoTransportRoute(routeDefault) &&
      routeDefault.annualFeeAmount === null &&
      routeDefault.defaultInstallmentAmount <= 0
    ) {
      skippedStudents.push(
        toSkippedStudent(
          student,
          "ROUTE_FEE_MISSING",
          `Route fee is missing for ${routeDefault.routeName}.`,
        ),
      );
      continue;
    }

    if (
      !isMeaningfulResolvedConfig({
        annualTotal: resolved.breakdown.annualTotal,
        feeSettingId,
      })
    ) {
      skippedStudents.push(
        toSkippedStudent(
          student,
          "FEE_SETUP_INCOMPLETE",
          `Fee Setup is incomplete for ${buildClassLabel(toSingleRecord(student.class_ref))} in ${activeFeeSetupSession}.`,
        ),
      );
      continue;
    }

    const grossBaseBeforeDiscount = resolved.breakdown.grossBaseBeforeDiscount ??
      (tuitionAmount + transportAmount + (resolved.breakdown.academicFeeAmount ?? 0) + (resolved.breakdown.otherAdjustmentAmount ?? 0));
    // Compare the discount the resolver ACTUALLY applied, not the raw override
    // column. Patch C backfilled each student's conventional amount into
    // student_fee_overrides.discount_amount, and the resolver nets that portion
    // back out (policy.ts:1714-1718) — so for a student carrying two policies
    // the raw column can exceed the post-conventional total while the effective
    // owner discount is zero. Comparing the raw column skipped SR 2243
    // outright ("discount 8500 exceeds annual total 6500") and left a real
    // Rs 2,500 over-charge in place.
    const effectiveDiscountApplied = resolved.breakdown.discountApplied ?? discountAmount;
    if (grossBaseBeforeDiscount < effectiveDiscountApplied) {
      skippedStudents.push(
        toSkippedStudent(
          student,
          "DISCOUNT_EXCEEDS_DUES",
          `Discount for student (${effectiveDiscountApplied}) exceeds the annual total (${grossBaseBeforeDiscount}).`,
        ),
      );
      continue;
    }

    const resolvedFeeSettingId = feeSettingId as string;
    studentsWithResolvedSettings += 1;
    expectedScheduledInstallments += setupData.globalPolicy.installmentCount;

    const isWorkbook = resolved.breakdown.calculationModel === "workbook_v1";
    const workbookCharges = isWorkbook
      ? buildWorkbookInstallmentCharges({
          installmentCount: setupData.globalPolicy.installmentCount,
          tuitionFee: tuitionAmount,
          transportFee: transportAmount,
          academicFee: resolved.breakdown.academicFeeAmount,
          otherAdjustmentAmount: resolved.breakdown.otherAdjustmentAmount,
          discountAmount: resolved.breakdown.discountApplied,
          academicFeeDistribution: setupData.globalPolicy.academicFeeDistribution,
        })
      : null;
    const baseAmounts = isWorkbook
      ? workbookCharges!.installmentCharges
      : splitAcrossInstallments(
          Math.max(baseAmount, 0),
          setupData.globalPolicy.installmentCount,
        );
    const transportAmounts = isWorkbook
      ? Array.from({ length: setupData.globalPolicy.installmentCount }, () => 0)
      : splitAcrossInstallments(
          Math.max(transportAmount, 0),
          setupData.globalPolicy.installmentCount,
        );
    const discountAmounts = isWorkbook
      ? Array.from({ length: setupData.globalPolicy.installmentCount }, () => 0)
      : splitAcrossInstallments(
          Math.max(discountAmount, 0),
          setupData.globalPolicy.installmentCount,
        );

    // Re-split so a REDUCTION lands on unpaid headroom instead of being thrown
    // away because some installment already carries a payment. Without this a
    // discount applied to a student who had paid anything changed nothing at
    // all — see lib/fees/paid-floor-allocation.ts.
    const plannedNetCharges = baseAmounts.map(
      (base, index) => (base ?? 0) + (transportAmounts[index] ?? 0) - (discountAmounts[index] ?? 0),
    );
    const allocation = allocateChargesRespectingPaidFloors({
      plannedCharges: plannedNetCharges,
      plannedTotal: plannedNetCharges.reduce((total, value) => total + value, 0),
      rows: Array.from({ length: setupData.globalPolicy.installmentCount }, (_, index) => {
        const existingRow = existingInstallmentMap.get(`${student.id}::${index + 1}`);

        return {
          index,
          existingAmountDue: existingRow?.amount_due ?? 0,
          // paymentTotalsByInstallment sums payments without the receipts join,
          // so discount-mode close-outs are included. That raises the floor,
          // which is the conservative direction: a written-off row is not
          // reduced further.
          appliedAmount: existingRow
            ? Math.max(
                (paymentTotalsByInstallment.get(existingRow.id) ?? 0) +
                  (adjustmentTotalsByInstallment.get(existingRow.id) ?? 0),
                0,
              )
            : 0,
        };
      }),
    });

    if (allocation.residualCreditAmount > 0) {
      residualCreditStudents.push({
        studentId: student.id,
        admissionNo: student.admission_no,
        fullName: student.full_name,
        residualCreditAmount: allocation.residualCreditAmount,
      });
    }

    setupData.globalPolicy.installmentSchedule.forEach((schedule, index) => {
      // The allocator works in NET terms. Transport and per-row discount stay
      // as planned; the adjustment is taken on base_amount, which is where the
      // workbook engine already folds the annual discount (see below).
      const allocatedNet = allocation.charges[index] ?? 0;
      const plannedNet = plannedNetCharges[index] ?? 0;
      const allocationDelta = allocatedNet - plannedNet;
      const plannedInstallment = {
        student_id: student.id,
        class_id: student.class_id,
        fee_setting_id: resolvedFeeSettingId,
        student_fee_override_id: studentOverride?.id ?? null,
        installment_no: index + 1,
        installment_label: `${schedule.label} (${schedule.dueDateLabel})`,
        due_date: schedule.dueDate,
        base_amount: Math.max((baseAmounts[index] ?? 0) + allocationDelta, 0),
        transport_amount: transportAmounts[index] ?? 0,
        discount_amount: discountAmounts[index] ?? 0,
        late_fee_flat_amount: resolved.lateFeeFlatAmount,
        status: "scheduled" as const,
      };
      const existingInstallment = existingInstallmentMap.get(
        `${student.id}::${plannedInstallment.installment_no}`,
      );

      if (!existingInstallment) {
        installmentsToInsert.push(plannedInstallment);
        affectedStudentIds.add(student.id);
        return;
      }

      if (!differs(existingInstallment, plannedInstallment)) {
        return;
      }

      const paidAmount = paymentTotalsByInstallment.get(existingInstallment.id) ?? 0;
      const adjustmentAmount = adjustmentTotalsByInstallment.get(existingInstallment.id) ?? 0;
      const lock = classifyInstallmentLock({
        existingInstallment,
        plannedInstallment,
        paidAmount,
        adjustmentAmount,
        isInRepaymentPlan: repaymentPlanInstallmentIds.has(existingInstallment.id),
      });

      if (lock.kind === "locked") {
        blockedInstallmentsForReview.push({
          installmentId: existingInstallment.id,
          studentId: existingInstallment.student_id,
          installmentNo: existingInstallment.installment_no,
          installmentLabel: existingInstallment.installment_label,
          dueDate: existingInstallment.due_date,
          amountDue: existingInstallment.amount_due,
          paidAmount,
          adjustmentAmount,
          outstandingAmount: lock.outstandingAmount,
          reasonCode: lock.reasonCode,
          reasonLabel: lock.reasonLabel,
          actionNeeded: "update",
        });
        affectedStudentIds.add(student.id);
        return;
      }

      // On a row that carries money, a reduction writes ONLY the money. The
      // label, due date and late-fee amount are what the parent's receipt
      // reported and what the late-fee clock runs on, so they are preserved
      // verbatim — see classifyInstallmentLock.
      const carriesMoney = paidAmount > 0 || adjustmentAmount !== 0;
      installmentsToUpdate.push({
        id: existingInstallment.id,
        ...plannedInstallment,
        ...(lock.kind === "safe_reduction" && carriesMoney
          ? {
              installment_label: existingInstallment.installment_label,
              due_date: existingInstallment.due_date,
              late_fee_flat_amount: existingInstallment.late_fee_flat_amount,
            }
          : {}),
      });
      affectedStudentIds.add(student.id);
    });

    existingInstallments
      .filter((row) => row.student_id === student.id)
      .filter((row) => row.installment_no > setupData.globalPolicy.installmentCount)
      // Carry-forward (previous-year dues) lines use a sentinel installment_no
      // (>= 90) so they sort ahead of real dues, but they must NOT be swept up
      // by the "extra installment" cancel pass — they are a deliberate balance.
      // EMI late fees sit in the 101-199 band for the same reason.
      .filter((row) => !row.is_carry_forward && !row.is_emi_late_fee)
      .forEach((row) => {
        if (row.status === "cancelled") {
          return;
        }

        const paidAmount = paymentTotalsByInstallment.get(row.id) ?? 0;
        const adjustmentAmount = adjustmentTotalsByInstallment.get(row.id) ?? 0;
        const lock = classifyCancelLock({
          existingInstallment: row,
          paidAmount,
          adjustmentAmount,
          isInRepaymentPlan: repaymentPlanInstallmentIds.has(row.id),
        });

        if (lock.isLocked && lock.reasonCode && lock.reasonLabel) {
          blockedInstallmentsForReview.push({
            installmentId: row.id,
            studentId: row.student_id,
            installmentNo: row.installment_no,
            installmentLabel: row.installment_label,
            dueDate: row.due_date,
            amountDue: row.amount_due,
            paidAmount,
            adjustmentAmount,
            outstandingAmount: lock.outstandingAmount,
            reasonCode: lock.reasonCode,
            reasonLabel: lock.reasonLabel,
            actionNeeded: "cancel",
          });
          affectedStudentIds.add(student.id);
          return;
        }

        installmentsToCancel.push({ id: row.id });
        affectedStudentIds.add(student.id);
      });
  }

  return {
    academicSessionLabel: setupData.globalPolicy.academicSessionLabel,
    totalActiveStudents: activeStudents.length,
    studentsInAcademicSession: sessionStudents.length,
    scopedStudents: scopedStudents.length,
    studentsWithResolvedSettings,
    studentsMissingSettings: Math.max(scopedStudents.length - studentsWithResolvedSettings, 0),
    existingInstallments: existingInstallments.length,
    installmentsToInsert,
    installmentsToUpdate,
    installmentsToCancel,
    blockedInstallmentsForReview,
    residualCreditStudents,
    skippedStudents: dedupeSkippedStudents(skippedStudents),
    warnings,
    errors,
    expectedScheduledInstallments,
    affectedStudents: affectedStudentIds.size,
  };
}

async function applyBatchedUpdates<T>(
  values: T[],
  handler: (value: T) => Promise<void>,
  batchSize = 50,
) {
  for (let index = 0; index < values.length; index += batchSize) {
    const batch = values.slice(index, index + batchSize);
    await Promise.all(batch.map((value) => handler(value)));
  }
}

export async function previewLedgerGeneration(
  options: LedgerPlanOptions = {},
): Promise<LedgerGenerationPreview> {
  return summarizePlan(await buildLedgerSyncPlan(options));
}

export async function previewLedgerGenerationDetailed(
  options: LedgerPlanOptions = {},
): Promise<LedgerGenerationResult> {
  const plan = await buildLedgerSyncPlan(options);

  return {
    ...summarizePlan(plan),
    blockedInstallmentsForReview: plan.blockedInstallmentsForReview,
    residualCreditStudents: plan.residualCreditStudents,
    skippedStudents: plan.skippedStudents,
    warnings: plan.warnings,
    errors: plan.errors,
  };
}

export async function generateSessionLedgersAction(
  options: LedgerPlanOptions = {},
): Promise<LedgerGenerationResult> {
  const supabase: LedgerClient = options.useAdminClient ? createAdminClient() : await createClient();
  const plan = await buildLedgerSyncPlan(options);

  if (plan.installmentsToInsert.length > 0) {
    const batchSize = 100;

    for (let index = 0; index < plan.installmentsToInsert.length; index += batchSize) {
      const batch = plan.installmentsToInsert.slice(index, index + batchSize);
      const { error } = await supabase.from("installments").insert(batch);

      if (error) {
        throw new Error(error.message);
      }
    }
  }

  await applyBatchedUpdates(plan.installmentsToUpdate, async (item) => {
    const { id, ...values } = item;
    const { error } = await supabase.from("installments").update(values).eq("id", id);

    if (error) {
      throw new Error(error.message);
    }
  });

  await applyBatchedUpdates(plan.installmentsToCancel, async (item) => {
    const { error } = await supabase
      .from("installments")
      .update({ status: "cancelled" })
      .eq("id", item.id);

    if (error) {
      throw new Error(error.message);
    }
  });
  return {
    ...summarizePlan(plan),
    blockedInstallmentsForReview: plan.blockedInstallmentsForReview,
    residualCreditStudents: plan.residualCreditStudents,
    skippedStudents: plan.skippedStudents,
    warnings: plan.warnings,
    errors: plan.errors,
  };
}
