import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getFeeSetupPageData } from "@/lib/fees/data";
import { resolveStudentPolicyBreakdown } from "@/lib/fees/policy";

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
  late_fee_flat_amount: number;
  status: "scheduled" | "waived" | "cancelled";
};

type InstallmentRelationRow = {
  installment_id: string;
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

type LedgerSyncPlan = {
  academicSessionLabel: string;
  totalActiveStudents: number;
  studentsInAcademicSession: number;
  studentsWithResolvedSettings: number;
  studentsMissingSettings: number;
  existingInstallments: number;
  installmentsToInsert: PlannedInstallment[];
  installmentsToUpdate: PlannedExistingUpdate[];
  installmentsToCancel: CancelPlan[];
  lockedInstallments: number;
  expectedScheduledInstallments: number;
};

export type LedgerGenerationPreview = Omit<
  LedgerSyncPlan,
  "installmentsToInsert" | "installmentsToUpdate" | "installmentsToCancel"
> & {
  installmentsToInsert: number;
  installmentsToUpdate: number;
  installmentsToCancel: number;
};

type LedgerGenerationResult = LedgerGenerationPreview;

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

function hasLockedActivity(
  installmentId: string,
  paymentInstallmentIds: Set<string>,
  adjustmentInstallmentIds: Set<string>,
) {
  return (
    paymentInstallmentIds.has(installmentId) ||
    adjustmentInstallmentIds.has(installmentId)
  );
}

function differs(
  existing: ExistingInstallmentRow,
  next: PlannedInstallment,
) {
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

async function buildLedgerSyncPlan(): Promise<LedgerSyncPlan> {
  const supabase = await createClient();
  const setupData = await getFeeSetupPageData();
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
  const studentIds = sessionStudents.map((student) => student.id);

  let existingInstallments: ExistingInstallmentRow[] = [];
  let paymentRelationRows: InstallmentRelationRow[] = [];
  let adjustmentRelationRows: InstallmentRelationRow[] = [];

  if (studentIds.length > 0) {
    const { data: installmentsRaw, error: installmentsError } = await supabase
      .from("installments")
      .select(
        "id, student_id, class_id, fee_setting_id, student_fee_override_id, installment_no, installment_label, due_date, base_amount, transport_amount, discount_amount, late_fee_flat_amount, status",
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
          .select("installment_id")
          .in("installment_id", installmentIds),
        supabase
          .from("payment_adjustments")
          .select("installment_id")
          .in("installment_id", installmentIds),
      ]);

      if (paymentsError) {
        throw new Error(paymentsError.message);
      }

      if (adjustmentsError) {
        throw new Error(adjustmentsError.message);
      }

      paymentRelationRows = (paymentsRaw ?? []) as InstallmentRelationRow[];
      adjustmentRelationRows = (adjustmentsRaw ?? []) as InstallmentRelationRow[];
    }
  }

  const classDefaultMap = new Map(
    setupData.classDefaults.map((item) => [item.classId, item]),
  );
  const routeDefaultMap = new Map(
    setupData.transportDefaults.map((item) => [item.id, item]),
  );
  const studentOverrideMap = new Map(
    setupData.studentOverrides.map((item) => [item.studentId, item]),
  );
  const existingInstallmentMap = new Map(
    existingInstallments.map((item) => [
      `${item.student_id}::${item.installment_no}`,
      item,
    ]),
  );
  const paymentInstallmentIds = new Set(
    paymentRelationRows.map((row) => row.installment_id),
  );
  const adjustmentInstallmentIds = new Set(
    adjustmentRelationRows.map((row) => row.installment_id),
  );

  const installmentsToInsert: PlannedInstallment[] = [];
  const installmentsToUpdate: PlannedExistingUpdate[] = [];
  const installmentsToCancel: CancelPlan[] = [];
  let lockedInstallments = 0;
  let studentsWithResolvedSettings = 0;
  let expectedScheduledInstallments = 0;

  for (const student of sessionStudents) {
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
        return;
      }

      if (
        hasLockedActivity(
          existingInstallment.id,
          paymentInstallmentIds,
          adjustmentInstallmentIds,
        )
      ) {
        lockedInstallments += 1;
        return;
      }

      if (differs(existingInstallment, plannedInstallment)) {
        installmentsToUpdate.push({
          id: existingInstallment.id,
          ...plannedInstallment,
        });
      }
    });

    existingInstallments
      .filter((row) => row.student_id === student.id)
      .filter((row) => row.installment_no > setupData.globalPolicy.installmentCount)
      .forEach((row) => {
        if (
          hasLockedActivity(row.id, paymentInstallmentIds, adjustmentInstallmentIds)
        ) {
          lockedInstallments += 1;
          return;
        }

        if (row.status !== "cancelled") {
          installmentsToCancel.push({ id: row.id });
        }
      });
  }

  return {
    academicSessionLabel: setupData.globalPolicy.academicSessionLabel,
    totalActiveStudents: activeStudents.length,
    studentsInAcademicSession: sessionStudents.length,
    studentsWithResolvedSettings,
    studentsMissingSettings: Math.max(
      sessionStudents.length - studentsWithResolvedSettings,
      0,
    ),
    existingInstallments: existingInstallments.length,
    installmentsToInsert,
    installmentsToUpdate,
    installmentsToCancel,
    lockedInstallments,
    expectedScheduledInstallments,
  };
}

function summarizePlan(plan: LedgerSyncPlan): LedgerGenerationPreview {
  return {
    academicSessionLabel: plan.academicSessionLabel,
    totalActiveStudents: plan.totalActiveStudents,
    studentsInAcademicSession: plan.studentsInAcademicSession,
    studentsWithResolvedSettings: plan.studentsWithResolvedSettings,
    studentsMissingSettings: plan.studentsMissingSettings,
    existingInstallments: plan.existingInstallments,
    installmentsToInsert: plan.installmentsToInsert.length,
    installmentsToUpdate: plan.installmentsToUpdate.length,
    installmentsToCancel: plan.installmentsToCancel.length,
    lockedInstallments: plan.lockedInstallments,
    expectedScheduledInstallments: plan.expectedScheduledInstallments,
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

export async function previewLedgerGeneration(): Promise<LedgerGenerationPreview> {
  return summarizePlan(await buildLedgerSyncPlan());
}

export async function generateSessionLedgersAction(): Promise<LedgerGenerationResult> {
  const supabase = await createClient();
  const plan = await buildLedgerSyncPlan();

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

  return summarizePlan(plan);
}
