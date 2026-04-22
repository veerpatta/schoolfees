import "server-only";

import { createHash } from "node:crypto";

import { generateSessionLedgersAction } from "@/lib/fees/generator";
import { getFeeSetupPageData } from "@/lib/fees/policy";
import { resolveStudentPolicyBreakdown } from "@/lib/fees/policy";
import type { LedgerRegenerationPreview, LedgerRegenerationReviewRow } from "@/lib/fees/types";
import { createClient } from "@/lib/supabase/server";

type GeneratorStudentRow = {
  id: string;
  full_name: string;
  admission_no: string;
  class_id: string;
  transport_route_id: string | null;
  class_ref:
    | {
        session_label: string;
        class_name: string;
        section: string | null;
        stream_name: string | null;
      }
    | Array<{
        session_label: string;
        class_name: string;
        section: string | null;
        stream_name: string | null;
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

type RegenerationAction = "insert" | "update" | "cancel" | "skip" | "review";
type RegenerationBalanceStatus = "paid" | "partial" | "unpaid" | "future" | "waived" | "cancelled";

type RegenerationRowPlan = PlannedInstallment & {
  installment_id: string | null;
  student_label: string;
  class_label: string;
  amount_due: number;
  paid_amount: number;
  adjustment_amount: number;
  outstanding_amount: number;
  balance_status: RegenerationBalanceStatus;
  action_needed: RegenerationAction;
  reason_code:
    | "missing_installment"
    | "already_in_sync"
    | "fully_paid"
    | "partially_paid"
    | "adjustment_posted"
    | "existing_waived"
    | "existing_cancelled"
    | "extra_installment"
    | "missing_settings";
  reason_label: string;
};

type RegenerationPlan = {
  policyRevisionId: string | null;
  policyRevisionLabel: string;
  reason: string;
  sourceSnapshot: Record<string, unknown>;
  rows: RegenerationRowPlan[];
  totalActiveStudents: number;
  studentsInAcademicSession: number;
  studentsWithResolvedSettings: number;
  studentsMissingSettings: number;
  existingInstallments: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsCancelled: number;
  rowsRecalculated: number;
  rowsSkipped: number;
  rowsRequiringReview: number;
  paidInstallments: number;
  partiallyPaidInstallments: number;
  unpaidInstallments: number;
  futureInstallments: number;
  affectedStudents: number;
};

type RegenBatchRow = {
  id: string;
  policy_revision_id: string | null;
  policy_revision_label: string;
  reason: string;
  status: "preview_ready" | "applied" | "stale" | "failed" | "cancelled";
  source_snapshot: Record<string, unknown>;
  preview_summary: unknown;
};

function toSingleRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function buildClassLabel(value: {
  class_name: string;
  section: string | null;
  stream_name: string | null;
}) {
  const segments = [value.class_name];

  if (value.section) {
    segments.push(`Section ${value.section}`);
  }

  if (value.stream_name) {
    segments.push(value.stream_name);
  }

  return segments.join(" - ");
}

function splitAcrossInstallments(totalAmount: number, count: number) {
  const baseAmount = Math.floor(totalAmount / count);
  const remainder = totalAmount % count;

  return Array.from({ length: count }, (_, index) =>
    baseAmount + (index === 0 ? remainder : 0),
  );
}

function getSchoolDateStamp(referenceDate = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referenceDate);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortJson(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const ordered: Record<string, unknown> = {};

  Object.keys(record)
    .sort()
    .forEach((key) => {
      ordered[key] = sortJson(record[key]);
    });

  return ordered;
}

function stableStringify(value: unknown) {
  return JSON.stringify(sortJson(value));
}

function hashPlanSignature(rows: RegenerationRowPlan[]) {
  const signature = rows.map((row) => ({
    studentId: row.student_id,
    installmentNo: row.installment_no,
    installmentId: row.installment_id,
    installmentLabel: row.installment_label,
    dueDate: row.due_date,
    baseAmount: row.base_amount,
    transportAmount: row.transport_amount,
    discountAmount: row.discount_amount,
    lateFeeFlatAmount: row.late_fee_flat_amount,
    amountDue: row.amount_due,
    paidAmount: row.paid_amount,
    adjustmentAmount: row.adjustment_amount,
    outstandingAmount: row.outstanding_amount,
    balanceStatus: row.balance_status,
    actionNeeded: row.action_needed,
    reasonCode: row.reason_code,
    reasonLabel: row.reason_label,
  }));

  return createHash("sha256").update(stableStringify(signature)).digest("hex");
}

function toCurrentBalanceStatus(payload: {
  installmentStatus: ExistingInstallmentRow["status"];
  dueDate: string;
  amountDue: number;
  paidAmount: number;
  adjustmentAmount: number;
}) {
  if (payload.installmentStatus === "waived") {
    return "waived" as const;
  }

  if (payload.installmentStatus === "cancelled") {
    return "cancelled" as const;
  }

  if (payload.amountDue <= 0) {
    return "paid" as const;
  }

  const appliedAmount = Math.max(payload.paidAmount + payload.adjustmentAmount, 0);

  if (appliedAmount >= payload.amountDue) {
    return "paid" as const;
  }

  if (appliedAmount > 0) {
    return "partial" as const;
  }

  return payload.dueDate > getSchoolDateStamp() ? "future" : "unpaid";
}

function toReviewReason(balanceStatus: Exclude<RegenerationBalanceStatus, "waived" | "cancelled">) {
  switch (balanceStatus) {
    case "paid":
      return {
        code: "fully_paid" as const,
        label: "Fully paid installment",
      };
    case "partial":
      return {
        code: "partially_paid" as const,
        label: "Partially paid installment",
      };
    default:
      return {
        code: "adjustment_posted" as const,
        label: "Installment has adjustment entries",
      };
  }
}

function toSafeReason(action: Exclude<RegenerationAction, "review">) {
  switch (action) {
    case "insert":
      return {
        code: "missing_installment" as const,
        label: "Missing installment row will be created",
      };
    case "update":
      return {
        code: "missing_installment" as const,
        label: "Unpaid installment will be updated to the current policy",
      };
    case "cancel":
      return {
        code: "extra_installment" as const,
        label: "Extra unpaid installment will be cancelled",
      };
    case "skip":
    default:
      return {
        code: "already_in_sync" as const,
        label: "Already aligned with the current policy",
      };
  }
}

async function loadPlan(): Promise<RegenerationPlan> {
  const supabase = await createClient();
  const setupData = await getFeeSetupPageData();

  const { data: activeStudentsRaw, error: studentsError } = await supabase
    .from("students")
    .select(
      "id, full_name, admission_no, class_id, transport_route_id, class_ref:classes(session_label, class_name, section, stream_name)",
    )
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
        paymentTotalsByInstallment.set(
          row.installment_id,
          (paymentTotalsByInstallment.get(row.installment_id) ?? 0) + row.amount,
        );
      });

      ((adjustmentsRaw ?? []) as InstallmentAdjustmentRow[]).forEach((row) => {
        adjustmentTotalsByInstallment.set(
          row.installment_id,
          (adjustmentTotalsByInstallment.get(row.installment_id) ?? 0) + row.amount_delta,
        );
      });
    }
  }

  const classDefaultMap = new Map(setupData.classDefaults.map((item) => [item.classId, item]));
  const routeDefaultMap = new Map(setupData.transportDefaults.map((item) => [item.id, item]));
  const studentOverrideMap = new Map(setupData.studentOverrides.map((item) => [item.studentId, item]));
  const existingInstallmentMap = new Map(
    existingInstallments.map((item) => [`${item.student_id}::${item.installment_no}`, item]),
  );
  const sessionClassIds = new Set(sessionStudents.map((student) => student.class_id));
  const sessionStudentIds = new Set(sessionStudents.map((student) => student.id));
  const sessionRouteIds = new Set(
    sessionStudents
      .map((student) => student.transport_route_id)
      .filter((routeId): routeId is string => Boolean(routeId)),
  );

  const rows: RegenerationRowPlan[] = [];
  const affectedStudentIds = new Set<string>();
  let studentsWithResolvedSettings = 0;
  let studentsMissingSettings = 0;

  for (const student of sessionStudents) {
    const classRef = toSingleRecord(student.class_ref);
    const studentLabel = `${student.full_name} (${student.admission_no})`;
    const classLabel = classRef ? buildClassLabel(classRef) : "Unknown class";
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

    if (!feeSettingId || resolved.breakdown.annualTotal <= 0) {
      studentsMissingSettings += 1;
      continue;
    }

    if (baseAmount + transportAmount < discountAmount) {
      throw new Error(
        `Discount for student ${studentLabel} exceeds the configured annual total.`,
      );
    }

    studentsWithResolvedSettings += 1;

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
        fee_setting_id: feeSettingId,
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
        const amountDue =
          plannedInstallment.base_amount +
          plannedInstallment.transport_amount -
          plannedInstallment.discount_amount;
        const balanceStatus =
          plannedInstallment.due_date > getSchoolDateStamp() ? "future" : "unpaid";

        rows.push({
          ...plannedInstallment,
          installment_id: null,
          student_label: studentLabel,
          class_label: classLabel,
          amount_due: amountDue,
          paid_amount: 0,
          adjustment_amount: 0,
          outstanding_amount: amountDue,
          balance_status: balanceStatus,
          action_needed: "insert",
          reason_code: "missing_installment",
          reason_label: "Missing installment row will be created",
        });
        affectedStudentIds.add(student.id);
        return;
      }

      const paidAmount = paymentTotalsByInstallment.get(existingInstallment.id) ?? 0;
      const adjustmentAmount = adjustmentTotalsByInstallment.get(existingInstallment.id) ?? 0;
      const amountDue = existingInstallment.amount_due;
      const balanceStatus = toCurrentBalanceStatus({
        installmentStatus: existingInstallment.status,
        dueDate: existingInstallment.due_date,
        amountDue,
        paidAmount,
        adjustmentAmount,
      });
      const appliedAmount = Math.max(paidAmount + adjustmentAmount, 0);
      const outstandingAmount =
        balanceStatus === "waived" || balanceStatus === "cancelled"
          ? 0
          : Math.max(amountDue - appliedAmount, 0);

      if (existingInstallment.status === "waived" || existingInstallment.status === "cancelled") {
        rows.push({
          ...plannedInstallment,
          installment_id: existingInstallment.id,
          student_label: studentLabel,
          class_label: classLabel,
          amount_due: amountDue,
          paid_amount: paidAmount,
          adjustment_amount: adjustmentAmount,
          outstanding_amount: 0,
          balance_status: balanceStatus,
          action_needed: "skip",
          reason_code:
            existingInstallment.status === "waived" ? "existing_waived" : "existing_cancelled",
          reason_label:
            existingInstallment.status === "waived"
              ? "Waived installment left unchanged"
              : "Cancelled installment left unchanged",
        });
        return;
      }

      if (paidAmount > 0 || adjustmentAmount !== 0) {
        const reason = toReviewReason(balanceStatus as Exclude<RegenerationBalanceStatus, "waived" | "cancelled">);

        rows.push({
          ...plannedInstallment,
          installment_id: existingInstallment.id,
          student_label: studentLabel,
          class_label: classLabel,
          amount_due: amountDue,
          paid_amount: paidAmount,
          adjustment_amount: adjustmentAmount,
          outstanding_amount: outstandingAmount,
          balance_status: balanceStatus,
          action_needed: "review",
          reason_code: reason.code,
          reason_label: reason.label,
        });
        affectedStudentIds.add(student.id);
        return;
      }

      const isDifferent =
        existingInstallment.fee_setting_id !== plannedInstallment.fee_setting_id ||
        existingInstallment.student_fee_override_id !== plannedInstallment.student_fee_override_id ||
        existingInstallment.installment_label !== plannedInstallment.installment_label ||
        existingInstallment.due_date !== plannedInstallment.due_date ||
        existingInstallment.base_amount !== plannedInstallment.base_amount ||
        existingInstallment.transport_amount !== plannedInstallment.transport_amount ||
        existingInstallment.discount_amount !== plannedInstallment.discount_amount ||
        existingInstallment.late_fee_flat_amount !== plannedInstallment.late_fee_flat_amount ||
        existingInstallment.status !== "scheduled";

      if (!isDifferent) {
        rows.push({
          ...plannedInstallment,
          installment_id: existingInstallment.id,
          student_label: studentLabel,
          class_label: classLabel,
          amount_due: amountDue,
          paid_amount: 0,
          adjustment_amount: 0,
          outstanding_amount: amountDue,
          balance_status: balanceStatus,
          action_needed: "skip",
          reason_code: "already_in_sync",
          reason_label: "Already aligned with the current policy",
        });
        return;
      }

      const safeAction: Exclude<RegenerationAction, "review"> = "update";
      const safeReason = toSafeReason(safeAction);

      rows.push({
        ...plannedInstallment,
        installment_id: existingInstallment.id,
        student_label: studentLabel,
        class_label: classLabel,
        amount_due: amountDue,
        paid_amount: 0,
        adjustment_amount: 0,
        outstanding_amount: amountDue,
        balance_status: balanceStatus,
        action_needed: safeAction,
        reason_code: safeReason.code,
        reason_label: safeReason.label,
      });
      affectedStudentIds.add(student.id);
    });

    existingInstallments
      .filter((row) => row.student_id === student.id)
      .filter((row) => row.installment_no > setupData.globalPolicy.installmentCount)
      .forEach((row) => {
        if (row.status === "waived" || row.status === "cancelled") {
          rows.push({
            student_id: row.student_id,
            class_id: row.class_id,
            fee_setting_id: row.fee_setting_id,
            student_fee_override_id: row.student_fee_override_id,
            installment_no: row.installment_no,
            installment_label: row.installment_label,
            due_date: row.due_date,
            base_amount: row.base_amount,
            transport_amount: row.transport_amount,
            discount_amount: row.discount_amount,
            late_fee_flat_amount: row.late_fee_flat_amount,
            status: "scheduled",
            installment_id: row.id,
            student_label: studentLabel,
            class_label: classLabel,
            amount_due: row.amount_due,
            paid_amount: paymentTotalsByInstallment.get(row.id) ?? 0,
            adjustment_amount: adjustmentTotalsByInstallment.get(row.id) ?? 0,
            outstanding_amount: 0,
            balance_status:
              row.status === "waived" ? "waived" : ("cancelled" as const),
            action_needed: "skip",
            reason_code: row.status === "waived" ? "existing_waived" : "existing_cancelled",
            reason_label:
              row.status === "waived"
                ? "Waived installment left unchanged"
                : "Cancelled installment left unchanged",
          });
          return;
        }

        const paidAmount = paymentTotalsByInstallment.get(row.id) ?? 0;
        const adjustmentAmount = adjustmentTotalsByInstallment.get(row.id) ?? 0;
        const balanceStatus = toCurrentBalanceStatus({
          installmentStatus: row.status,
          dueDate: row.due_date,
          amountDue: row.amount_due,
          paidAmount,
          adjustmentAmount,
        });
        const appliedAmount = Math.max(paidAmount + adjustmentAmount, 0);
        const outstandingAmount = Math.max(row.amount_due - appliedAmount, 0);

        if (paidAmount > 0 || adjustmentAmount !== 0) {
          const reason = toReviewReason(balanceStatus as Exclude<RegenerationBalanceStatus, "waived" | "cancelled">);

          rows.push({
            student_id: row.student_id,
            class_id: row.class_id,
            fee_setting_id: row.fee_setting_id,
            student_fee_override_id: row.student_fee_override_id,
            installment_no: row.installment_no,
            installment_label: row.installment_label,
            due_date: row.due_date,
            base_amount: row.base_amount,
            transport_amount: row.transport_amount,
            discount_amount: row.discount_amount,
            late_fee_flat_amount: row.late_fee_flat_amount,
            status: "scheduled",
            installment_id: row.id,
            student_label: studentLabel,
            class_label: classLabel,
            amount_due: row.amount_due,
            paid_amount: paidAmount,
            adjustment_amount: adjustmentAmount,
            outstanding_amount: outstandingAmount,
            balance_status: balanceStatus,
            action_needed: "review",
            reason_code: reason.code,
            reason_label: reason.label,
          });
          affectedStudentIds.add(student.id);
          return;
        }

        rows.push({
          student_id: row.student_id,
          class_id: row.class_id,
          fee_setting_id: row.fee_setting_id,
          student_fee_override_id: row.student_fee_override_id,
          installment_no: row.installment_no,
          installment_label: row.installment_label,
          due_date: row.due_date,
          base_amount: row.base_amount,
          transport_amount: row.transport_amount,
          discount_amount: row.discount_amount,
          late_fee_flat_amount: row.late_fee_flat_amount,
          status: "scheduled",
          installment_id: row.id,
          student_label: studentLabel,
          class_label: classLabel,
          amount_due: row.amount_due,
          paid_amount: 0,
          adjustment_amount: 0,
          outstanding_amount: 0,
          balance_status: row.due_date > getSchoolDateStamp() ? "future" : "unpaid",
          action_needed: "cancel",
          reason_code: "extra_installment",
          reason_label: "Extra unpaid installment will be cancelled",
        });
        affectedStudentIds.add(student.id);
      });
  }

  const paidInstallments = rows.filter((row) => row.balance_status === "paid").length;
  const partiallyPaidInstallments = rows.filter((row) => row.balance_status === "partial").length;
  const unpaidInstallments = rows.filter((row) => row.balance_status === "unpaid").length;
  const futureInstallments = rows.filter((row) => row.balance_status === "future").length;
  const rowsInserted = rows.filter((row) => row.action_needed === "insert").length;
  const rowsUpdated = rows.filter((row) => row.action_needed === "update").length;
  const rowsCancelled = rows.filter((row) => row.action_needed === "cancel").length;
  const rowsSkipped = rows.filter((row) => row.action_needed === "skip").length;
  const rowsRequiringReview = rows.filter((row) => row.action_needed === "review").length;
  const rowsRecalculated = rowsInserted + rowsUpdated + rowsCancelled;
  const plan: RegenerationPlan = {
    policyRevisionId: setupData.globalPolicy.id,
    policyRevisionLabel: setupData.globalPolicy.academicSessionLabel,
    reason: "",
    sourceSnapshot: {
      policyRevisionId: setupData.globalPolicy.id,
      policyRevisionLabel: setupData.globalPolicy.academicSessionLabel,
      schoolDefaultId: setupData.schoolDefault.id,
      schoolDefaultUpdatedAt: setupData.schoolDefault.updatedAt,
      classDefaults: setupData.classDefaults
        .filter((item) => sessionClassIds.has(item.classId))
        .map((item) => ({
          classId: item.classId,
          id: item.id,
          updatedAt: item.updatedAt,
        })),
      transportDefaults: setupData.transportDefaults
        .filter((item) => sessionRouteIds.has(item.id))
        .map((item) => ({
          id: item.id,
          updatedAt: item.updatedAt,
        })),
      studentOverrides: setupData.studentOverrides
        .filter((item) => sessionStudentIds.has(item.studentId))
        .map((item) => ({
          studentId: item.studentId,
          id: item.id,
          updatedAt: item.updatedAt,
        })),
      totalStudents: sessionStudents.length,
      existingInstallments: existingInstallments.length,
      planHash: hashPlanSignature(rows),
      planVersion: 1,
    },
    rows,
    totalActiveStudents: activeStudents.length,
    studentsInAcademicSession: sessionStudents.length,
    studentsWithResolvedSettings,
    studentsMissingSettings,
    existingInstallments: existingInstallments.length,
    rowsInserted,
    rowsUpdated,
    rowsCancelled,
    rowsRecalculated,
    rowsSkipped,
    rowsRequiringReview,
    paidInstallments,
    partiallyPaidInstallments,
    unpaidInstallments,
    futureInstallments,
    affectedStudents: affectedStudentIds.size,
  };

  return plan;
}

async function insertRows(batchId: string, rows: RegenerationRowPlan[]) {
  if (rows.length === 0) {
    return;
  }

  const supabase = await createClient();
  const batchSize = 100;

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize).map((row) => ({
      batch_id: batchId,
      student_id: row.student_id,
      installment_id: row.installment_id,
      class_id: row.class_id,
      fee_setting_id: row.fee_setting_id,
      student_fee_override_id: row.student_fee_override_id,
      student_label: row.student_label,
      class_label: row.class_label,
      installment_no: row.installment_no,
      installment_label: row.installment_label,
      due_date: row.due_date,
      base_amount: row.base_amount,
      transport_amount: row.transport_amount,
      discount_amount: row.discount_amount,
      late_fee_flat_amount: row.late_fee_flat_amount,
      amount_due: row.amount_due,
      paid_amount: row.paid_amount,
      adjustment_amount: row.adjustment_amount,
      outstanding_amount: row.outstanding_amount,
      balance_status: row.balance_status,
      action_needed: row.action_needed,
      reason_code: row.reason_code,
      reason_label: row.reason_label,
    }));

    const { error } = await supabase.from("ledger_regeneration_rows").insert(batch);

    if (error) {
      throw new Error(`Unable to store regeneration rows: ${error.message}`);
    }
  }
}

function buildPreviewSummary(plan: RegenerationPlan): LedgerRegenerationPreview {
  const reviewRows: LedgerRegenerationReviewRow[] = plan.rows
    .filter((row) => row.action_needed === "review")
    .slice(0, 12)
    .map((row) => ({
      studentId: row.student_id,
      studentLabel: row.student_label,
      classLabel: row.class_label,
      installmentNo: row.installment_no,
      installmentLabel: row.installment_label,
      dueDate: row.due_date,
      balanceStatus: row.balance_status,
      actionNeeded: row.action_needed,
      reasonLabel: row.reason_label,
      outstandingAmount: row.outstanding_amount,
    }));

  return {
    policyRevisionId: plan.policyRevisionId,
    policyRevisionLabel: plan.policyRevisionLabel,
    reason: plan.reason,
    totalActiveStudents: plan.totalActiveStudents,
    studentsInAcademicSession: plan.studentsInAcademicSession,
    studentsWithResolvedSettings: plan.studentsWithResolvedSettings,
    studentsMissingSettings: plan.studentsMissingSettings,
    existingInstallments: plan.existingInstallments,
    rowsInserted: plan.rowsInserted,
    rowsUpdated: plan.rowsUpdated,
    rowsCancelled: plan.rowsCancelled,
    rowsRecalculated: plan.rowsRecalculated,
    rowsSkipped: plan.rowsSkipped,
    rowsRequiringReview: plan.rowsRequiringReview,
    paidInstallments: plan.paidInstallments,
    partiallyPaidInstallments: plan.partiallyPaidInstallments,
    unpaidInstallments: plan.unpaidInstallments,
    futureInstallments: plan.futureInstallments,
    affectedStudents: plan.affectedStudents,
    reviewRowsTotal: plan.rowsRequiringReview,
    reviewRows,
  };
}

export async function createLedgerRegenerationPreview(payload: { reason: string }) {
  const plan = await loadPlan();
  const trimmedReason = payload.reason.trim();

  if (!trimmedReason) {
    throw new Error("Reason is required for ledger regeneration.");
  }

  const preview = buildPreviewSummary({
    ...plan,
    reason: trimmedReason,
  });

  if (preview.rowsRecalculated === 0 && preview.rowsRequiringReview === 0) {
    throw new Error("No ledger rows need recalculation right now.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ledger_regeneration_batches")
    .insert({
      policy_revision_id: plan.policyRevisionId,
      policy_revision_label: plan.policyRevisionLabel,
      reason: trimmedReason,
      status: "preview_ready",
      source_snapshot: {
        hash: hashPlanSignature(plan.rows),
        rowCount: plan.rows.length,
        planVersion: 1,
      },
      preview_summary: preview,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Unable to save ledger regeneration preview: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error("Unable to start ledger regeneration right now.");
  }

  try {
    await insertRows(data.id as string, plan.rows);
  } catch (rowError) {
    await supabase
      .from("ledger_regeneration_batches")
      .update({
        status: "failed",
        apply_notes:
          rowError instanceof Error
            ? rowError.message
            : "Unable to store ledger regeneration rows.",
      })
      .eq("id", data.id as string)
      .eq("status", "preview_ready");

    throw rowError;
  }

  return {
    batchId: data.id as string,
    preview,
  };
}

export async function applyLedgerRegenerationBatch(batchId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ledger_regeneration_batches")
    .select("id, policy_revision_id, policy_revision_label, reason, status, source_snapshot, preview_summary")
    .eq("id", batchId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load ledger regeneration batch: ${error.message}`);
  }

  if (!data) {
    throw new Error("Ledger regeneration batch was not found.");
  }

  const batch = data as RegenBatchRow;

  if (batch.status !== "preview_ready") {
    throw new Error("This regeneration preview can no longer be applied. Create a fresh preview.");
  }

  const currentPlan = await loadPlan();
  const currentHash = hashPlanSignature(currentPlan.rows);
  const snapshot = batch.source_snapshot as { hash?: string } | null;

  if (!snapshot?.hash || snapshot.hash !== currentHash) {
    await supabase
      .from("ledger_regeneration_batches")
      .update({
        status: "stale",
        apply_notes: "Fee setup or ledger balances changed after preview. Create a fresh preview before applying.",
      })
      .eq("id", batch.id)
      .eq("status", "preview_ready");

    throw new Error("Ledger balances changed after this preview. Please preview again before applying.");
  }

  const ledgerResult = await generateSessionLedgersAction();
  const previewSummary = batch.preview_summary as LedgerRegenerationPreview | null;

  const applySummary = {
    policyRevisionId: batch.policy_revision_id ?? "",
    policyRevisionLabel: batch.policy_revision_label,
    reason: batch.reason,
    rowsInserted: ledgerResult.installmentsToInsert,
    rowsUpdated: ledgerResult.installmentsToUpdate,
    rowsCancelled: ledgerResult.installmentsToCancel,
    rowsRecalculated:
      ledgerResult.installmentsToInsert +
      ledgerResult.installmentsToUpdate +
      ledgerResult.installmentsToCancel,
    rowsSkipped: previewSummary?.rowsSkipped ?? 0,
    rowsRequiringReview: previewSummary?.rowsRequiringReview ?? ledgerResult.lockedInstallments,
    affectedStudents: ledgerResult.affectedStudents,
    studentsInAcademicSession: ledgerResult.scopedStudents,
  } satisfies Record<string, number | string>;

  const { error: updateError } = await supabase
    .from("ledger_regeneration_batches")
    .update({
      status: "applied",
      apply_summary: applySummary,
      applied_at: new Date().toISOString(),
      apply_notes:
        "Applied safely: only no-payment rows were recalculated. Rows with payments or adjustments were left untouched for manual review.",
    })
    .eq("id", batch.id)
    .eq("status", "preview_ready");

  if (updateError) {
    throw new Error(`Ledger regeneration applied but batch log update failed: ${updateError.message}`);
  }

  return {
    preview: previewSummary,
    applied: applySummary,
    message: `Applied ${batch.policy_revision_label}: ${ledgerResult.installmentsToInsert} inserts, ${ledgerResult.installmentsToUpdate} updates, ${ledgerResult.installmentsToCancel} cancellations, and ${ledgerResult.lockedInstallments} rows left for manual review.`,
  };
}
