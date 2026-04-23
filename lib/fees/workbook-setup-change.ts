import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  generateSessionLedgersAction,
  previewLedgerGenerationDetailed,
  type BlockedInstallmentForReview,
} from "@/lib/fees/generator";
import {
  getFeeSetupPageData,
  upsertClassFeeDefault,
  upsertGlobalFeePolicy,
  upsertTransportDefault,
} from "@/lib/fees/policy";
import {
  buildWorkbookClassSetupRows,
  buildWorkbookRouteSetupRows,
  buildWorkbookSetupSnapshot,
  type WorkbookFeeSetupFormPayload,
} from "@/lib/fees/workbook-setup";
import { createClass } from "@/lib/master-data/data";
import type {
  ClassFeeDefault,
  ConfigChangeFieldDiff,
  ConfigChangeImpactPreview,
  ConfigChangeScope,
  FeeSetupPageData,
  TransportDefault,
} from "@/lib/fees/types";

type ConfigBatchStatus = "preview_ready" | "applied" | "stale" | "failed" | "cancelled";

type WorkbookSetupBatchRow = {
  id: string;
  change_scope: ConfigChangeScope;
  status: ConfigBatchStatus;
  before_payload: unknown;
  proposed_payload: unknown;
  preview_summary: unknown;
};

type ActiveStudentRow = {
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

type WorkbookClassPlanRow = ReturnType<typeof buildWorkbookClassSetupRows>[number] & {
  requestedAnnualTuition: number;
  needsClassCreate: boolean;
  needsDefaultSave: boolean;
};

type WorkbookRoutePlanRow = ReturnType<typeof buildWorkbookRouteSetupRows>[number] & {
  requestedAnnualFee: number;
  needsRouteSave: boolean;
};

type WorkbookSetupPlan = {
  globalChanged: boolean;
  changedFields: ConfigChangeFieldDiff[];
  classRows: WorkbookClassPlanRow[];
  routeRows: WorkbookRoutePlanRow[];
};

function toSingleRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJson(item));
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

function sameValue(left: unknown, right: unknown) {
  return stableStringify(left) === stableStringify(right);
}

function formatNullable(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized || "Not set";
}

function formatAmount(value: number | null | undefined) {
  if (value == null) {
    return "Not set";
  }

  return `Rs ${value}`;
}

function formatDateValue(value: string | null | undefined) {
  const normalized = (value ?? "").trim();

  if (!normalized) {
    return "Not set";
  }

  const parsed = new Date(`${normalized}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(parsed);
}

function buildFieldDiff(payload: {
  field: string;
  label: string;
  beforeValue: unknown;
  afterValue: unknown;
  formatter?: (value: unknown) => string;
}) {
  if (sameValue(payload.beforeValue, payload.afterValue)) {
    return null;
  }

  const formatter = payload.formatter ?? ((value: unknown) => formatNullable(String(value ?? "")));

  return {
    field: payload.field,
    label: payload.label,
    beforeValue: formatter(payload.beforeValue),
    afterValue: formatter(payload.afterValue),
  } satisfies ConfigChangeFieldDiff;
}

function toDueDateLabel(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    throw new Error("Installment due dates must use a valid date.");
  }

  return `${day}-${month}-${year}`;
}

function buildPreviewSchedule(payload: WorkbookFeeSetupFormPayload) {
  return payload.installmentDates.map((value, index) => ({
    label: `Installment ${index + 1}`,
    dueDateLabel: toDueDateLabel(value),
    dueDate: value,
  }));
}

function buildScopeLabel(scope: ConfigChangeScope) {
  switch (scope) {
    case "global_policy":
      return "Canonical policy";
    case "school_defaults":
      return "School defaults";
    case "class_defaults":
      return "Class defaults";
    case "transport_defaults":
      return "Transport defaults";
    case "student_override":
      return "Student override";
    case "workbook_setup":
      return "Workbook Fee Setup";
  }
}

function buildWorkbookSetupPlan(
  setupData: FeeSetupPageData,
  payload: WorkbookFeeSetupFormPayload,
): WorkbookSetupPlan {
  const currentInstallmentDates = setupData.globalPolicy.installmentSchedule.map(
    (item) => item.dueDate,
  );
  const maxInstallmentCount = Math.max(currentInstallmentDates.length, payload.installmentDates.length);

  const classValueByLabel = new Map(
    payload.classRows.map((item) => [item.label, item.annualTuition]),
  );
  const routeValueByName = new Map(
    payload.routeRows.map((item) => [item.routeName, item.annualFee]),
  );

  const globalChangedFields = [
    buildFieldDiff({
      field: "academicSessionLabel",
      label: "Academic session",
      beforeValue: setupData.globalPolicy.academicSessionLabel,
      afterValue: payload.academicSessionLabel,
      formatter: (value) => formatNullable(String(value ?? "")),
    }),
    ...Array.from({ length: maxInstallmentCount }, (_, index) =>
      buildFieldDiff({
        field: `installmentDate${index + 1}`,
        label: `Installment ${index + 1} due date`,
        beforeValue: currentInstallmentDates[index] ?? "",
        afterValue: payload.installmentDates[index] ?? "",
        formatter: (rawValue) => formatDateValue(String(rawValue ?? "")),
      }),
    ),
    buildFieldDiff({
      field: "lateFeeFlatAmount",
      label: "Flat late fee",
      beforeValue: setupData.globalPolicy.lateFeeFlatAmount,
      afterValue: payload.lateFeeFlatAmount,
      formatter: (value) => formatAmount(Number(value ?? 0)),
    }),
    buildFieldDiff({
      field: "newStudentAcademicFeeAmount",
      label: "New student academic fee",
      beforeValue: setupData.globalPolicy.newStudentAcademicFeeAmount,
      afterValue: payload.newStudentAcademicFeeAmount,
      formatter: (value) => formatAmount(Number(value ?? 0)),
    }),
    buildFieldDiff({
      field: "oldStudentAcademicFeeAmount",
      label: "Old student academic fee",
      beforeValue: setupData.globalPolicy.oldStudentAcademicFeeAmount,
      afterValue: payload.oldStudentAcademicFeeAmount,
      formatter: (value) => formatAmount(Number(value ?? 0)),
    }),
  ].filter((item): item is ConfigChangeFieldDiff => Boolean(item));

  const classRows = buildWorkbookClassSetupRows(setupData, payload.academicSessionLabel).map(
    (row) => {
      const requestedAnnualTuition = classValueByLabel.get(row.label) ?? row.annualTuition;

      return {
        ...row,
        requestedAnnualTuition,
        needsClassCreate: !row.hasClassRecord,
        needsDefaultSave:
          !row.hasSavedDefault ||
          row.existingClassDefault?.tuitionFee !== requestedAnnualTuition ||
          !row.hasClassRecord,
      };
    },
  );

  const routeRows = buildWorkbookRouteSetupRows(setupData).map((row) => {
    const requestedAnnualFee = routeValueByName.get(row.routeName) ?? row.annualFee;
    const desiredInstallmentAmount = Math.floor(
      requestedAnnualFee / Math.max(payload.installmentDates.length, 1),
    );

    return {
      ...row,
      requestedAnnualFee,
      needsRouteSave:
        !row.hasRouteRecord ||
        row.existingRouteDefault?.annualFeeAmount !== requestedAnnualFee ||
        row.existingRouteDefault?.defaultInstallmentAmount !== desiredInstallmentAmount ||
        row.existingRouteDefault?.isActive !== true,
    };
  });

  const classChangedFields = classRows
    .filter((row) => row.needsDefaultSave)
    .map((row) =>
      buildFieldDiff({
        field: `class:${row.label}`,
        label: `${row.label} annual tuition`,
        beforeValue: row.existingClassDefault?.tuitionFee ?? null,
        afterValue: row.requestedAnnualTuition,
        formatter: (value) =>
          value == null ? "Not set" : formatAmount(Number(value ?? 0)),
      }),
    )
    .filter((item): item is ConfigChangeFieldDiff => Boolean(item));

  const routeChangedFields = routeRows
    .filter((row) => row.needsRouteSave)
    .map((row) =>
      buildFieldDiff({
        field: `route:${row.routeName}`,
        label: `${row.routeName} annual transport fee`,
        beforeValue: row.existingRouteDefault?.annualFeeAmount ?? null,
        afterValue: row.requestedAnnualFee,
        formatter: (value) =>
          value == null ? "Not set" : formatAmount(Number(value ?? 0)),
      }),
    )
    .filter((item): item is ConfigChangeFieldDiff => Boolean(item));

  return {
    globalChanged: globalChangedFields.length > 0,
    changedFields: [...globalChangedFields, ...classChangedFields, ...routeChangedFields],
    classRows,
    routeRows,
  };
}

function preserveClassDefaults(
  existing: ClassFeeDefault | null,
) {
  if (!existing) {
    return {
      transportFee: 0,
      booksFee: 0,
      admissionActivityMiscFee: 0,
      customFeeHeadAmounts: {},
      studentTypeDefault: "existing" as const,
      transportAppliesDefault: false,
      notes: "Saved from workbook-style Fee Setup.",
    };
  }

  return {
    transportFee: existing.transportFee,
    booksFee: existing.booksFee,
    admissionActivityMiscFee: existing.admissionActivityMiscFee,
    customFeeHeadAmounts: existing.customFeeHeadAmounts,
    studentTypeDefault: existing.studentTypeDefault,
    transportAppliesDefault: existing.transportAppliesDefault,
    notes: existing.notes,
  };
}

function applyWorkbookPlanToSetupData(
  setupData: FeeSetupPageData,
  payload: WorkbookFeeSetupFormPayload,
  plan: WorkbookSetupPlan,
) {
  const nextSetupData: FeeSetupPageData = {
    ...setupData,
    globalPolicy: {
      ...setupData.globalPolicy,
      academicSessionLabel: payload.academicSessionLabel,
      installmentCount: payload.installmentDates.length,
      installmentSchedule: buildPreviewSchedule(payload),
      lateFeeFlatAmount: payload.lateFeeFlatAmount,
      lateFeeLabel: `Flat Rs ${payload.lateFeeFlatAmount}`,
      newStudentAcademicFeeAmount: payload.newStudentAcademicFeeAmount,
      oldStudentAcademicFeeAmount: payload.oldStudentAcademicFeeAmount,
    },
    classDefaults: [...setupData.classDefaults],
    transportDefaults: [...setupData.transportDefaults],
    studentOverrides: setupData.studentOverrides,
    classOptions: setupData.classOptions,
    studentOptions: setupData.studentOptions,
    routeOptions: setupData.routeOptions,
  };

  const classDefaultById = new Map(
    nextSetupData.classDefaults.map((item, index) => [item.classId, index]),
  );
  const routeDefaultById = new Map(
    nextSetupData.transportDefaults.map((item, index) => [item.id, index]),
  );

  plan.classRows
    .filter((row) => row.classId && row.needsDefaultSave)
    .forEach((row) => {
      const preserved = preserveClassDefaults(row.existingClassDefault);
      const annualTotal =
        row.requestedAnnualTuition +
        preserved.transportFee +
        preserved.booksFee +
        preserved.admissionActivityMiscFee +
        Object.values(preserved.customFeeHeadAmounts).reduce((sum, value) => sum + value, 0);
      const nextClassDefault: ClassFeeDefault = {
        id: row.existingClassDefault?.id ?? `preview-${row.classId}`,
        classId: row.classId!,
        classLabel: row.label,
        sessionLabel: payload.academicSessionLabel,
        tuitionFee: row.requestedAnnualTuition,
        transportFee: preserved.transportFee,
        booksFee: preserved.booksFee,
        admissionActivityMiscFee: preserved.admissionActivityMiscFee,
        customFeeHeadAmounts: preserved.customFeeHeadAmounts,
        annualTotal,
        studentTypeDefault: preserved.studentTypeDefault,
        transportAppliesDefault: preserved.transportAppliesDefault,
        notes: preserved.notes,
        updatedAt: row.updatedAt ?? new Date().toISOString(),
      };
      const existingIndex = classDefaultById.get(row.classId!);

      if (existingIndex == null) {
        nextSetupData.classDefaults.push(nextClassDefault);
        classDefaultById.set(row.classId!, nextSetupData.classDefaults.length - 1);
        return;
      }

      nextSetupData.classDefaults[existingIndex] = nextClassDefault;
    });

  plan.routeRows
    .filter((row) => row.routeId && row.needsRouteSave)
    .forEach((row) => {
      const nextRouteDefault: TransportDefault = {
        id: row.routeId!,
        routeCode: row.existingRouteDefault?.routeCode ?? null,
      routeName: row.routeName,
        defaultInstallmentAmount: Math.floor(
          row.requestedAnnualFee / Math.max(payload.installmentDates.length, 1),
        ),
        annualFeeAmount: row.requestedAnnualFee,
        isActive: true,
        notes: row.existingRouteDefault?.notes ?? "Saved from workbook-style Fee Setup.",
        updatedAt: row.updatedAt ?? new Date().toISOString(),
      };
      const existingIndex = routeDefaultById.get(row.routeId!);

      if (existingIndex == null) {
        nextSetupData.transportDefaults.push(nextRouteDefault);
        routeDefaultById.set(row.routeId!, nextSetupData.transportDefaults.length - 1);
        return;
      }

      nextSetupData.transportDefaults[existingIndex] = nextRouteDefault;
    });

  return nextSetupData;
}

async function loadScopedStudentIdsForPlan(
  plan: WorkbookSetupPlan,
  academicSessionLabel: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("students")
    .select("id, class_id, transport_route_id, class_ref:classes(session_label)")
    .eq("status", "active");

  if (error) {
    throw new Error(`Unable to load workbook Fee Setup impact scope: ${error.message}`);
  }

  const sessionStudents = ((data ?? []) as ActiveStudentRow[]).filter((row) => {
    const classRef = toSingleRecord(row.class_ref);
    return classRef?.session_label === academicSessionLabel;
  });

  if (plan.globalChanged) {
    return sessionStudents.map((row) => row.id);
  }

  const changedClassIds = new Set(
    plan.classRows
      .filter((row) => row.classId && row.needsDefaultSave)
      .map((row) => row.classId as string),
  );
  const changedRouteIds = new Set(
    plan.routeRows
      .filter((row) => row.routeId && row.needsRouteSave)
      .map((row) => row.routeId as string),
  );

  if (changedClassIds.size === 0 && changedRouteIds.size === 0) {
    return [] as string[];
  }

  return sessionStudents
    .filter(
      (row) =>
        changedClassIds.has(row.class_id) ||
        (row.transport_route_id ? changedRouteIds.has(row.transport_route_id) : false),
    )
    .map((row) => row.id);
}

async function insertBlockedRows(
  batchId: string,
  blockedRows: BlockedInstallmentForReview[],
) {
  if (blockedRows.length === 0) {
    return;
  }

  const supabase = await createClient();
  const rows = blockedRows.map((item) => ({
    batch_id: batchId,
    student_id: item.studentId,
    installment_id: item.installmentId,
    installment_label: item.installmentLabel,
    due_date: item.dueDate,
    amount_due: item.amountDue,
    paid_amount: item.paidAmount,
    adjustment_amount: item.adjustmentAmount,
    outstanding_amount: item.outstandingAmount,
    reason_code: item.reasonCode,
    reason_label: item.reasonLabel,
    action_needed: item.actionNeeded,
  }));

  const { error } = await supabase
    .from("config_change_blocked_installments")
    .insert(rows);

  if (error) {
    throw new Error(`Unable to record blocked Fee Setup rows: ${error.message}`);
  }
}

async function ensureAcademicSessionActive(sessionLabel: string) {
  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("academic_sessions")
    .select("id, status")
    .eq("session_label", sessionLabel)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    if (existing.status !== "active") {
      const { error } = await supabase
        .from("academic_sessions")
        .update({ status: "active" })
        .eq("id", existing.id);

      if (error) {
        throw new Error(error.message);
      }
    }

    return;
  }

  const { error } = await supabase.from("academic_sessions").insert({
    session_label: sessionLabel,
    status: "active",
    is_current: false,
    notes: "Created from workbook-style Fee Setup.",
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function applyWorkbookSetupPayload(
  payload: WorkbookFeeSetupFormPayload,
  setupData: FeeSetupPageData,
  plan: WorkbookSetupPlan,
) {
  if (plan.globalChanged) {
    await upsertGlobalFeePolicy({
      academicSessionLabel: payload.academicSessionLabel,
      calculationModel: setupData.globalPolicy.calculationModel,
      installmentSchedule: buildPreviewSchedule(payload).map((item) => ({
        label: item.label,
        dueDateLabel: item.dueDateLabel,
      })),
      lateFeeFlatAmount: payload.lateFeeFlatAmount,
      newStudentAcademicFeeAmount: payload.newStudentAcademicFeeAmount,
      oldStudentAcademicFeeAmount: payload.oldStudentAcademicFeeAmount,
      acceptedPaymentModes: setupData.globalPolicy.acceptedPaymentModes.map((item) => item.value),
      receiptPrefix: setupData.globalPolicy.receiptPrefix,
      customFeeHeads: setupData.globalPolicy.customFeeHeads,
      notes: setupData.globalPolicy.notes,
    });
  }

  await ensureAcademicSessionActive(payload.academicSessionLabel);

  for (const row of plan.classRows.filter((item) => item.needsClassCreate)) {
    try {
      await createClass({
        sessionLabel: payload.academicSessionLabel,
        className: row.label,
        section: null,
        streamName: null,
        sortOrder: row.sortOrder,
        status: "active",
        notes: "Created from workbook-style Fee Setup.",
      });
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("Duplicate class name is not allowed")
      ) {
        throw error;
      }
    }
  }

  let refreshedSetupData = await getFeeSetupPageData();
  let refreshedPlan = buildWorkbookSetupPlan(refreshedSetupData, payload);

  for (const row of refreshedPlan.classRows.filter(
    (item) => item.classId && item.needsDefaultSave,
  )) {
    const preserved = preserveClassDefaults(row.existingClassDefault);

    await upsertClassFeeDefault({
      classId: row.classId!,
      tuitionFee: row.requestedAnnualTuition,
      transportFee: preserved.transportFee,
      booksFee: preserved.booksFee,
      admissionActivityMiscFee: preserved.admissionActivityMiscFee,
      customFeeHeadAmounts: preserved.customFeeHeadAmounts,
      customFeeHeads: refreshedSetupData.globalPolicy.customFeeHeads,
      studentTypeDefault: preserved.studentTypeDefault,
      transportAppliesDefault: preserved.transportAppliesDefault,
      notes: preserved.notes,
    });
  }

  for (const row of refreshedPlan.routeRows.filter((item) => item.needsRouteSave)) {
    await upsertTransportDefault({
      routeId: row.routeId,
      routeCode: row.existingRouteDefault?.routeCode ?? null,
      routeName: row.routeName,
      defaultInstallmentAmount: Math.floor(row.requestedAnnualFee / 4),
      annualFeeAmount: row.requestedAnnualFee,
      isActive: true,
      notes: row.existingRouteDefault?.notes ?? "Saved from workbook-style Fee Setup.",
    });
  }

  refreshedSetupData = await getFeeSetupPageData();
  refreshedPlan = buildWorkbookSetupPlan(refreshedSetupData, payload);

  return {
    setupData: refreshedSetupData,
    plan: refreshedPlan,
  };
}

function buildApplySummary(
  plan: WorkbookSetupPlan,
  ledgerResult: Awaited<ReturnType<typeof generateSessionLedgersAction>>,
) {
  return {
    studentsAffected: ledgerResult.affectedStudents,
    installmentsToInsert: ledgerResult.installmentsToInsert,
    installmentsToUpdate: ledgerResult.installmentsToUpdate,
    installmentsToCancel: ledgerResult.installmentsToCancel,
    blockedInstallments: ledgerResult.lockedInstallments,
    classRowsUpdated: plan.classRows.filter(
      (row) => row.needsDefaultSave && row.hasClassRecord,
    ).length,
    classRowsCreated: plan.classRows.filter((row) => row.needsClassCreate).length,
    routeRowsUpdated: plan.routeRows.filter(
      (row) => row.needsRouteSave && row.hasRouteRecord,
    ).length,
    routeRowsCreated: plan.routeRows.filter((row) => !row.hasRouteRecord).length,
  };
}

function buildWorkbookImpactPreview(payload: {
  plan: WorkbookSetupPlan;
  detailedPreview: Awaited<ReturnType<typeof previewLedgerGenerationDetailed>>;
}): ConfigChangeImpactPreview {
  const blockedFullyPaidInstallments = payload.detailedPreview.blockedInstallmentsForReview.filter(
    (item) => item.reasonCode === "fully_paid",
  ).length;
  const blockedPartiallyPaidInstallments =
    payload.detailedPreview.blockedInstallmentsForReview.filter(
      (item) => item.reasonCode === "partially_paid",
    ).length;
  const blockedAdjustedInstallments = payload.detailedPreview.blockedInstallmentsForReview.filter(
    (item) => item.reasonCode === "adjustment_posted",
  ).length;

  return {
    scope: "workbook_setup",
    scopeLabel: buildScopeLabel("workbook_setup"),
    targetLabel: "Workbook Fee Setup",
    changedFields: payload.plan.changedFields,
    studentsInScope: payload.detailedPreview.scopedStudents,
    studentsAffected: payload.detailedPreview.affectedStudents,
    installmentsToInsert: payload.detailedPreview.installmentsToInsert,
    installmentsToUpdate: payload.detailedPreview.installmentsToUpdate,
    installmentsToCancel: payload.detailedPreview.installmentsToCancel,
    blockedInstallments: payload.detailedPreview.lockedInstallments,
    blockedFullyPaidInstallments,
    blockedPartiallyPaidInstallments,
    blockedAdjustedInstallments,
    updatesLimitedToFutureUnpaid: true,
    rowsMarkedForReview: payload.detailedPreview.lockedInstallments,
    classRowsUpdated: payload.plan.classRows.filter(
      (row) => row.needsDefaultSave && row.hasClassRecord,
    ).length,
    classRowsCreated: payload.plan.classRows.filter((row) => row.needsClassCreate).length,
    routeRowsUpdated: payload.plan.routeRows.filter(
      (row) => row.needsRouteSave && row.hasRouteRecord,
    ).length,
    routeRowsCreated: payload.plan.routeRows.filter((row) => !row.hasRouteRecord).length,
    pendingClassCreates: payload.plan.classRows
      .filter((row) => row.needsClassCreate)
      .map((row) => row.label),
    pendingRouteCreates: payload.plan.routeRows
      .filter((row) => !row.hasRouteRecord)
      .map((row) => row.routeName),
  };
}

export async function createWorkbookFeeSetupPreview(
  payload: WorkbookFeeSetupFormPayload,
) {
  const setupData = await getFeeSetupPageData();
  const plan = buildWorkbookSetupPlan(setupData, payload);

  if (plan.changedFields.length === 0) {
    throw new Error("No Fee Setup changes detected. Update at least one value before reviewing.");
  }

  const projectedSetupData = applyWorkbookPlanToSetupData(setupData, payload, plan);
  const scopedStudentIds = await loadScopedStudentIdsForPlan(
    plan,
    projectedSetupData.globalPolicy.academicSessionLabel,
  );
  const detailedPreview = await previewLedgerGenerationDetailed({
    setupData: projectedSetupData,
    scopedStudentIds,
  });
  const impactPreview = buildWorkbookImpactPreview({
    plan,
    detailedPreview,
  });
  const beforeSnapshot = buildWorkbookSetupSnapshot(
    setupData,
    payload.academicSessionLabel,
  );

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("config_change_batches")
    .insert({
      change_scope: "workbook_setup",
      target_ref: payload.academicSessionLabel,
      target_label: "Workbook Fee Setup",
      status: "preview_ready",
      before_payload: beforeSnapshot,
      proposed_payload: payload,
      changed_fields: plan.changedFields,
      preview_summary: impactPreview,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Unable to save workbook Fee Setup preview: ${error.message}`);
  }

  return {
    batchId: data.id as string,
    preview: impactPreview,
  };
}

export async function applyWorkbookFeeSetupBatch(
  batchId: string,
  currentFormPayload: WorkbookFeeSetupFormPayload,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("config_change_batches")
    .select("id, change_scope, status, before_payload, proposed_payload, preview_summary")
    .eq("id", batchId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load workbook Fee Setup preview: ${error.message}`);
  }

  if (!data) {
    throw new Error("Workbook Fee Setup preview was not found.");
  }

  const batch = data as WorkbookSetupBatchRow;

  if (batch.change_scope !== "workbook_setup") {
    throw new Error("This preview does not belong to the workbook Fee Setup workflow.");
  }

  if (batch.status !== "preview_ready") {
    throw new Error("This preview can no longer be applied. Review the Fee Setup again.");
  }

  const storedPayload = batch.proposed_payload as WorkbookFeeSetupFormPayload;

  if (!sameValue(storedPayload, currentFormPayload)) {
    throw new Error("The Fee Setup form changed after review. Review the changes again before saving.");
  }

  const currentSetupData = await getFeeSetupPageData();
  const currentBeforeSnapshot = buildWorkbookSetupSnapshot(
    currentSetupData,
    storedPayload.academicSessionLabel,
  );

  if (!sameValue(currentBeforeSnapshot, batch.before_payload)) {
    await supabase
      .from("config_change_batches")
      .update({
        status: "stale",
        apply_notes:
          "Fee Setup changed after review. Open a fresh workbook-style review before applying.",
      })
      .eq("id", batch.id)
      .eq("status", "preview_ready");

    throw new Error(
      "Another Fee Setup change was saved after this review. Review the workbook screen again before applying.",
    );
  }

  const initialPlan = buildWorkbookSetupPlan(currentSetupData, storedPayload);
  const previewSummary = (batch.preview_summary ?? null) as ConfigChangeImpactPreview | null;

  try {
    const applied = await applyWorkbookSetupPayload(
      storedPayload,
      currentSetupData,
      initialPlan,
    );
    const scopedStudentIds = await loadScopedStudentIdsForPlan(
      initialPlan,
      applied.setupData.globalPolicy.academicSessionLabel,
    );
    const ledgerResult = await generateSessionLedgersAction({
      setupData: applied.setupData,
      scopedStudentIds,
    });

    await insertBlockedRows(batch.id, ledgerResult.blockedInstallmentsForReview);

    const applySummary = buildApplySummary(initialPlan, ledgerResult);
    const { error: updateError } = await supabase
      .from("config_change_batches")
      .update({
        status: "applied",
        apply_summary: applySummary,
        applied_at: new Date().toISOString(),
        apply_notes:
          "Applied from workbook-style Fee Setup. Only future or unpaid rows were updated; locked rows were marked for review.",
      })
      .eq("id", batch.id)
      .eq("status", "preview_ready");

    if (updateError) {
      throw new Error(
        `Fee Setup was applied but the batch audit log could not be updated: ${updateError.message}`,
      );
    }

    return {
      preview: previewSummary,
      applied: applySummary,
      message: `Fee Setup saved: ${applySummary.classRowsCreated} class rows created, ${applySummary.classRowsUpdated} class rows updated, ${applySummary.routeRowsCreated} route rows created, ${applySummary.routeRowsUpdated} route rows updated, and ${ledgerResult.lockedInstallments} blocked rows marked for review.`,
    };
  } catch (errorValue) {
    const message =
      errorValue instanceof Error
        ? errorValue.message
        : "Workbook Fee Setup apply failed after review.";

    await supabase
      .from("config_change_batches")
      .update({
        status: "failed",
        apply_notes: message,
      })
      .eq("id", batch.id)
      .eq("status", "preview_ready");

    throw errorValue;
  }
}
