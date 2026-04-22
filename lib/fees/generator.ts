import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getFeeSetupPageData } from "@/lib/fees/data";
import { resolveStudentPolicyBreakdown } from "@/lib/fees/policy";
import type { FeeSetupPageData } from "@/lib/fees/types";

type GeneratorStudentRow = {
  id: string;
  class_id: string;
  transport_route_id: string | null;
  class_ref:
    | {
        session_label: string;
      }
    | Array<{
        session_label: string;
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
  | "adjustment_posted";

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
  expectedScheduledInstallments: number;
  affectedStudents: number;
};

export type LedgerGenerationPreview = Omit<
  LedgerSyncPlan,
  "installmentsToInsert" | "installmentsToUpdate" | "installmentsToCancel" | "blockedInstallmentsForReview"
> & {
  installmentsToInsert: number;
  installmentsToUpdate: number;
  installmentsToCancel: number;
  lockedInstallments: number;
};

export type LedgerGenerationResult = LedgerGenerationPreview & {
  blockedInstallmentsForReview: BlockedInstallmentForReview[];
};

type LedgerPlanOptions = {
  setupData?: FeeSetupPageData;
  scopedStudentIds?: string[];
};

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

function addToAmountMap(map: Map<string, number>, installmentId: string, amount: number) {
  map.set(installmentId, (map.get(installmentId) ?? 0) + amount);
}

function classifyInstallmentLock(payload: {
  existingInstallment: ExistingInstallmentRow;
  paidAmount: number;
  adjustmentAmount: number;
}) {
  const paidAmount = payload.paidAmount;
  const adjustmentAmount = payload.adjustmentAmount;

  if (paidAmount <= 0 && adjustmentAmount === 0) {
    return {
      isLocked: false as const,
      reasonCode: null,
      reasonLabel: null,
      outstandingAmount: payload.existingInstallment.amount_due,
    };
  }

  const appliedAmount = Math.max(paidAmount + adjustmentAmount, 0);
  const outstandingAmount = Math.max(payload.existingInstallment.amount_due - appliedAmount, 0);

  if (paidAmount > 0) {
    if (appliedAmount >= payload.existingInstallment.amount_due) {
      return {
        isLocked: true as const,
        reasonCode: "fully_paid" as const,
        reasonLabel: "Fully paid installment",
        outstandingAmount,
      };
    }

    return {
      isLocked: true as const,
      reasonCode: "partially_paid" as const,
      reasonLabel: "Partially paid installment",
      outstandingAmount,
    };
  }

  return {
    isLocked: true as const,
    reasonCode: "adjustment_posted" as const,
    reasonLabel: "Installment has adjustment entries",
    outstandingAmount,
  };
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
    expectedScheduledInstallments: plan.expectedScheduledInstallments,
    affectedStudents: plan.affectedStudents,
  };
}

async function buildLedgerSyncPlan(options: LedgerPlanOptions = {}): Promise<LedgerSyncPlan> {
  const supabase = await createClient();
  const setupData = options.setupData ?? (await getFeeSetupPageData());
  const scopedStudentIdSet = options.scopedStudentIds
    ? new Set(options.scopedStudentIds)
    : null;

  const { data: activeStudentsRaw, error: studentsError } = await supabase
    .from("students")
    .select("id, class_id, transport_route_id, class_ref:classes(session_label)")
    .eq("status", "active");

  if (studentsError) {
    throw new Error(studentsError.message);
  }

  const activeStudents = (activeStudentsRaw ?? []) as GeneratorStudentRow[];
  const sessionStudents = activeStudents.filter((student) => {
    const classRef = toSingleRecord(student.class_ref);
    return classRef?.session_label === setupData.globalPolicy.academicSessionLabel;
  });
  const scopedStudents = scopedStudentIdSet
    ? sessionStudents.filter((student) => scopedStudentIdSet.has(student.id))
    : sessionStudents;
  const studentIds = scopedStudents.map((student) => student.id);

  let existingInstallments: ExistingInstallmentRow[] = [];
  const paymentTotalsByInstallment = new Map<string, number>();
  const adjustmentTotalsByInstallment = new Map<string, number>();

  if (studentIds.length > 0) {
    const { data: installmentsRaw, error: installmentsError } = await supabase
      .from("installments")
      .select(
        "id, student_id, class_id, fee_setting_id, student_fee_override_id, installment_no, installment_label, due_date, base_amount, transport_amount, discount_amount, amount_due, late_fee_flat_amount, status",
      )
      .in("student_id", studentIds);

    if (installmentsError) {
      throw new Error(installmentsError.message);
    }

    existingInstallments = (installmentsRaw ?? []) as ExistingInstallmentRow[];
    const installmentIds = existingInstallments.map((row) => row.id);

    if (installmentIds.length > 0) {
      const [
        { data: paymentsRaw, error: paymentsError },
        { data: adjustmentsRaw, error: adjustmentsError },
      ] = await Promise.all([
        supabase
          .from("payments")
          .select("installment_id, amount")
          .in("installment_id", installmentIds),
        supabase
          .from("payment_adjustments")
          .select("installment_id, amount_delta")
          .in("installment_id", installmentIds),
      ]);

      if (paymentsError) {
        throw new Error(paymentsError.message);
      }

      if (adjustmentsError) {
        throw new Error(adjustmentsError.message);
      }

      ((paymentsRaw ?? []) as InstallmentAmountRow[]).forEach((row) => {
        addToAmountMap(paymentTotalsByInstallment, row.installment_id, row.amount);
      });

      ((adjustmentsRaw ?? []) as InstallmentAdjustmentRow[]).forEach((row) => {
        addToAmountMap(adjustmentTotalsByInstallment, row.installment_id, row.amount_delta);
      });
    }
  }

  const classDefaultMap = new Map(setupData.classDefaults.map((item) => [item.classId, item]));
  const routeDefaultMap = new Map(setupData.transportDefaults.map((item) => [item.id, item]));
  const studentOverrideMap = new Map(setupData.studentOverrides.map((item) => [item.studentId, item]));
  const existingInstallmentMap = new Map(
    existingInstallments.map((item) => [`${item.student_id}::${item.installment_no}`, item]),
  );

  const installmentsToInsert: PlannedInstallment[] = [];
  const installmentsToUpdate: PlannedExistingUpdate[] = [];
  const installmentsToCancel: CancelPlan[] = [];
  const blockedInstallmentsForReview: BlockedInstallmentForReview[] = [];
  const affectedStudentIds = new Set<string>();
  let studentsWithResolvedSettings = 0;
  let expectedScheduledInstallments = 0;

  for (const student of scopedStudents) {
    const classDefault = classDefaultMap.get(student.class_id) ?? null;
    const routeDefault = student.transport_route_id
      ? (routeDefaultMap.get(student.transport_route_id) ?? null)
      : null;
    const studentOverride = studentOverrideMap.get(student.id) ?? null;
    const resolved = resolveStudentPolicyBreakdown({
      policy: setupData.globalPolicy,
      schoolDefault: setupData.schoolDefault,
      classDefault,
      routeDefault,
      studentOverride,
      hasTransportRoute: Boolean(student.transport_route_id),
    });
    const transportAmount =
      resolved.breakdown.coreHeads.find((item) => item.id === "transport_fee")?.amount ?? 0;
    const baseAmount = resolved.breakdown.annualTotal - transportAmount;
    const discountAmount = studentOverride?.discountAmount ?? 0;
    const feeSettingId = classDefault?.id ?? null;

    if (
      !isMeaningfulResolvedConfig({
        annualTotal: resolved.breakdown.annualTotal,
        feeSettingId,
      })
    ) {
      continue;
    }

    if (baseAmount + transportAmount < discountAmount) {
      throw new Error(
        `Discount for a student in class ${student.class_id} exceeds the configured annual total.`,
      );
    }

    const resolvedFeeSettingId = feeSettingId as string;
    studentsWithResolvedSettings += 1;
    expectedScheduledInstallments += setupData.globalPolicy.installmentCount;

    const baseAmounts = splitAcrossInstallments(
      Math.max(baseAmount, 0),
      setupData.globalPolicy.installmentCount,
    );
    const transportAmounts = splitAcrossInstallments(
      Math.max(transportAmount, 0),
      setupData.globalPolicy.installmentCount,
    );
    const discountAmounts = splitAcrossInstallments(
      Math.max(discountAmount, 0),
      setupData.globalPolicy.installmentCount,
    );

    setupData.globalPolicy.installmentSchedule.forEach((schedule, index) => {
      const plannedInstallment = {
        student_id: student.id,
        class_id: student.class_id,
        fee_setting_id: resolvedFeeSettingId,
        student_fee_override_id: studentOverride?.id ?? null,
        installment_no: index + 1,
        installment_label: `${schedule.label} (${schedule.dueDateLabel})`,
        due_date: schedule.dueDate,
        base_amount: baseAmounts[index] ?? 0,
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
        paidAmount,
        adjustmentAmount,
      });

      if (lock.isLocked && lock.reasonCode && lock.reasonLabel) {
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

      installmentsToUpdate.push({
        id: existingInstallment.id,
        ...plannedInstallment,
      });
      affectedStudentIds.add(student.id);
    });

    existingInstallments
      .filter((row) => row.student_id === student.id)
      .filter((row) => row.installment_no > setupData.globalPolicy.installmentCount)
      .forEach((row) => {
        if (row.status === "cancelled") {
          return;
        }

        const paidAmount = paymentTotalsByInstallment.get(row.id) ?? 0;
        const adjustmentAmount = adjustmentTotalsByInstallment.get(row.id) ?? 0;
        const lock = classifyInstallmentLock({
          existingInstallment: row,
          paidAmount,
          adjustmentAmount,
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
  };
}

export async function generateSessionLedgersAction(
  options: LedgerPlanOptions = {},
): Promise<LedgerGenerationResult> {
  const supabase = await createClient();
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
  };
}
