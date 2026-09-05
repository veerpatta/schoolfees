import { ON_ROLL_STATUSES } from "@/modules/students/domain/populations";
import "server-only";

import { fetchInChunks } from "@/platform/helpers/chunk";
import { createAdminClient } from "@/platform/supabase/admin";
import { createClient } from "@/platform/supabase/server";
import { getFeeSetupPageData } from "@/modules/fees/domain/queries";
import { resolveStudentPolicyBreakdown } from "@/modules/fees/data/policy";
import { buildWorkbookInstallmentCharges } from "@/modules/fees/domain/workbook";
import type { FeeSetupPageData } from "@/modules/fees/domain/types";

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

/**
 * Bookkeeping pointers corrected on a row that is otherwise held for review.
 *
 * Deliberately not a `PlannedExistingUpdate` with the money copied across:
 * nothing on this shape can change an amount, a label, a due date or a status,
 * so a future edit cannot turn a pointer fix into a re-bill by accident.
 */
type InstallmentRepoint = {
  id: string;
  class_id: string;
  fee_setting_id: string;
  student_fee_override_id: string | null;
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
  | "in_repayment_plan"
  // The due date is moving on a row the family has paid against. Since money
  // settles oldest-first at read time (20260905090000) that is the ONE thing a
  // fee edit may not do to a paid row on its own: the late fee is decided by
  // what had been paid by the due date, so moving it re-runs that clock
  // retroactively and nothing grandfathers the result.
  | "due_date_changed";

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
 * A student the planned split leaves OVERPAID: everything the family has
 * settled exceeds what the year now charges. Money settles the installments
 * oldest-first at read time, so nothing on the ledger needs a decision — the
 * excess surfaces as `v_student_financial_state.credit_balance` /
 * `refundable_amount` and is handed back through Finance Controls. Reported so
 * the office hears about it now rather than in March.
 */
export type StudentEndingInCredit = {
  studentId: string;
  admissionNo: string;
  fullName: string;
  creditAmount: number;
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
  installmentsToRepoint: InstallmentRepoint[];
  installmentsToCancel: CancelPlan[];
  blockedInstallmentsForReview: BlockedInstallmentForReview[];
  studentsEndingInCredit: StudentEndingInCredit[];
  /**
   * Sum over every row written or inserted of (planned charge − current
   * charge). Positive means the change bills more in total; negative less.
   */
  feeDeltaTotal: number;
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
  | "installmentsToRepoint"
  | "installmentsToCancel"
  | "blockedInstallmentsForReview"
  | "studentsEndingInCredit"
  | "skippedStudents"
  | "warnings"
  | "errors"
> & {
  installmentsToInsert: number;
  installmentsToUpdate: number;
  /** Rows whose class/fee-setting pointer was corrected without touching money. */
  installmentsToRepoint: number;
  installmentsToCancel: number;
  lockedInstallments: number;
  /** Total rupees families end up in credit by, because they paid more than the new charge. */
  creditTotal: number;
};

export type LedgerGenerationResult = LedgerGenerationPreview & {
  blockedInstallmentsForReview: BlockedInstallmentForReview[];
  studentsEndingInCredit: StudentEndingInCredit[];
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
    // A class move leaves the ledger pointing at the class the student has
    // left. `fee_setting_id` catches it whenever the two classes price
    // differently, which is why SR 2448 (Class 4 -> Class 5, Rs 19,500 vs
    // Rs 20,000) surfaced as drift — but SR 2141 (12 Arts -> 12 Commerce, both
    // Rs 32,000) stayed stale and invisible. Compare the class itself so the
    // pointer is corrected whether or not the money moved.
    existing.class_id !== next.class_id ||
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
  | { kind: "write" }
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

  // The paid branches classify on the NET, not the gross. A fully reversed
  // installment carries paidAmount > 0 and an equal negative adjustment; gross
  // classification reported it to staff as "Partially paid installment" when
  // nothing is applied to it at all. It falls through to adjustment_posted
  // below instead — still locked (the ledger history is real and worth a
  // human look), but described as what it is.
  if (paidAmount > 0 && appliedAmount > 0) {
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
 * Since 20260905090000 money settles the installments oldest-first at read
 * time, whatever installment a receipt was pinned to. A row carrying money is
 * therefore no longer a frozen bill: repricing it moves nothing a receipt said
 * (the receipt keeps its own record of where it was written), it only changes
 * what the year charges and lets the pool re-settle. The generator writes the
 * policy's split to every row it can, which is what makes a fee edit automatic
 * instead of a Session Health chore. Before this, a row with a payment on it
 * was frozen at its old charge and the rest of the year was redrawn around it
 * — SR 660 read installment 3 "Paid" and installments 1 and 2 "Overdue" on
 * Rs 7,600 paid before installment 1 was due.
 *
 * Two things still need a person:
 *
 *   - An ACTIVE EMI plan covers the row. A family agreed to a specific opening
 *     balance over a specific number of months; changing the covered charge
 *     changes the deal, in either direction.
 *   - The DUE DATE is moving on a row the family has paid against. The late
 *     fee is decided by what had been paid by the due date, so moving it
 *     re-runs that clock retroactively, and nothing grandfathers the result.
 */
function classifyInstallmentLock(payload: {
  existingInstallment: ExistingInstallmentRow;
  plannedInstallment: PlannedInstallment;
  paidAmount: number;
  adjustmentAmount: number;
  isInRepaymentPlan?: boolean;
}): InstallmentLockDecision {
  const existing = payload.existingInstallment;
  const appliedAmount = Math.max(payload.paidAmount + payload.adjustmentAmount, 0);
  const outstandingAmount = Math.max(existing.amount_due - appliedAmount, 0);

  if (
    payload.isInRepaymentPlan &&
    (plannedAmountDue(payload.plannedInstallment) !== existing.amount_due ||
      structurallyDiffers(existing, payload.plannedInstallment))
  ) {
    return {
      kind: "locked",
      reasonCode: "in_repayment_plan",
      reasonLabel: "Covered by an active EMI plan",
      outstandingAmount,
    };
  }

  const carriesMoney = payload.paidAmount > 0 || payload.adjustmentAmount !== 0;
  if (carriesMoney && existing.due_date !== payload.plannedInstallment.due_date) {
    return {
      kind: "locked",
      reasonCode: "due_date_changed",
      reasonLabel: "Due date would move on an installment carrying money",
      outstandingAmount,
    };
  }

  return { kind: "write" };
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
    installmentsToRepoint: plan.installmentsToRepoint.length,
    installmentsToCancel: plan.installmentsToCancel.length,
    lockedInstallments: plan.blockedInstallmentsForReview.length,
    creditTotal: plan.studentsEndingInCredit.reduce((total, row) => total + row.creditAmount, 0),
    feeDeltaTotal: plan.feeDeltaTotal,
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
    studentsQuery = studentsQuery.in("status", [...ON_ROLL_STATUSES]);
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
    // Chunked for the same reason the installment-id queries below are: this
    // filter carries one UUID per student, and the live 2026-27 session has
    // 507 of them -- about 19 KB of URL against a PostgREST limit nearer 8 KB.
    // Unchunked it did not return an error, it failed at the transport with
    // `TypeError: fetch failed`, which surfaced as a blank panel on Reports
    // after a ten-second wait.
    const { data: installmentsRaw, error: installmentsError } = await fetchInChunks<ExistingInstallmentRow>(
      studentIds,
      200,
      (chunk) =>
        supabase
          .from("installments")
          .select(
            "id, student_id, class_id, fee_setting_id, student_fee_override_id, installment_no, installment_label, due_date, base_amount, transport_amount, discount_amount, amount_due, late_fee_flat_amount, status, is_carry_forward, is_emi_late_fee",
          )
          .in("student_id", chunk),
    );

    if (installmentsError) {
      throw new Error(
        installmentsError instanceof Error
          ? installmentsError.message
          : String((installmentsError as { message?: string })?.message ?? installmentsError),
      );
    }

    existingInstallments = installmentsRaw as ExistingInstallmentRow[];
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
  const installmentsToRepoint: InstallmentRepoint[] = [];
  const installmentsToCancel: CancelPlan[] = [];
  const blockedInstallmentsForReview: BlockedInstallmentForReview[] = [];
  const studentsEndingInCredit: StudentEndingInCredit[] = [];
  let feeDeltaTotal = 0;
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

    // The policy's own split, written as it stands. Money settles the
    // installments oldest-first at read time (20260905090000), so a row that
    // carries a payment is repriced like any other and the pool re-settles;
    // the one thing worth knowing up front is a family the new total leaves
    // overpaid, which becomes credit_balance and a Finance Controls refund.
    const plannedNetCharges = baseAmounts.map(
      (base, index) => (base ?? 0) + (transportAmounts[index] ?? 0) - (discountAmounts[index] ?? 0),
    );
    const plannedTotal = plannedNetCharges.reduce((total, value) => total + value, 0);
    const studentRows = existingInstallments.filter(
      (row) => row.student_id === student.id && row.status !== "cancelled",
    );
    const settledPool = studentRows.reduce(
      (total, row) =>
        total +
        Math.max(
          (paymentTotalsByInstallment.get(row.id) ?? 0) +
            (adjustmentTotalsByInstallment.get(row.id) ?? 0),
          0,
        ),
      0,
    );
    // Rows outside the planned slots -- carry-forward, EMI late fees -- keep
    // their own charge and absorb the pool first, so they count as capacity.
    const chargeOutsidePlan = studentRows
      .filter((row) => row.installment_no > setupData.globalPolicy.installmentCount)
      .reduce((total, row) => total + row.amount_due, 0);
    const creditAmount = settledPool - (plannedTotal + chargeOutsidePlan);

    if (creditAmount > 0) {
      studentsEndingInCredit.push({
        studentId: student.id,
        admissionNo: student.admission_no,
        fullName: student.full_name,
        creditAmount,
      });
    }

    setupData.globalPolicy.installmentSchedule.forEach((schedule, index) => {
      const plannedInstallment = {
        student_id: student.id,
        class_id: student.class_id,
        fee_setting_id: resolvedFeeSettingId,
        student_fee_override_id: studentOverride?.id ?? null,
        installment_no: index + 1,
        installment_label: `${schedule.label} (${schedule.dueDateLabel})`,
        due_date: schedule.dueDate,
        base_amount: Math.max(baseAmounts[index] ?? 0, 0),
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
        feeDeltaTotal += plannedAmountDue(plannedInstallment);
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

        // A block is about MONEY and about what a receipt said. It should not
        // also freeze the bookkeeping pointers, which are neither.
        //
        // SR 2141 moved 12 Arts -> 12 Commerce with both classes at Rs 32,000.
        // The amount was already right, so the only differences were the stale
        // label and the class — and the label, correctly, holds the row for a
        // human. That held the class pointer hostage too, so every per-class
        // board kept billing this student's Rs 32,500 to a class they had left,
        // and re-running the ledger could never fix it.
        //
        // Writing the pointers alongside the block changes no money: amount_due
        // is generated from base/transport/discount, and none of those move.
        const pointersDiffer =
          existingInstallment.class_id !== plannedInstallment.class_id ||
          existingInstallment.fee_setting_id !== plannedInstallment.fee_setting_id ||
          existingInstallment.student_fee_override_id !==
            plannedInstallment.student_fee_override_id;

        if (pointersDiffer) {
          // A separate list, not an `installmentsToUpdate` entry with the money
          // fields copied across. The type then makes the guarantee instead of
          // the author remembering it: there is no field on this row that can
          // change an amount, a label, a due date or a status.
          installmentsToRepoint.push({
            id: existingInstallment.id,
            class_id: plannedInstallment.class_id,
            fee_setting_id: plannedInstallment.fee_setting_id,
            student_fee_override_id: plannedInstallment.student_fee_override_id,
          });
        }

        return;
      }

      // The whole row, money or not: label, due date (unchanged, or the lock
      // above held it) and late-fee rate all come from policy. The receipt keeps
      // its own record of what it was written against.
      feeDeltaTotal += plannedAmountDue(plannedInstallment) - existingInstallment.amount_due;
      installmentsToUpdate.push({
        id: existingInstallment.id,
        ...plannedInstallment,
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
    installmentsToRepoint,
    installmentsToCancel,
    blockedInstallmentsForReview,
    studentsEndingInCredit,
    feeDeltaTotal,
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
    studentsEndingInCredit: plan.studentsEndingInCredit,
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

  await applyBatchedUpdates(plan.installmentsToRepoint, async (item) => {
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
    studentsEndingInCredit: plan.studentsEndingInCredit,
    skippedStudents: plan.skippedStudents,
    warnings: plan.warnings,
    errors: plan.errors,
  };
}
