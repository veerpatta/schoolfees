import "server-only";

import type { ClassStatus } from "@/lib/db/types";
import { previewLedgerGeneration } from "@/lib/fees/generator";
import { getFeeSetupPageData } from "@/lib/fees/data";
import {
  upsertClassFeeDefault,
  upsertGlobalFeePolicy,
  upsertSchoolFeeDefaults,
  upsertTransportDefault,
} from "@/lib/fees/policy";
import { createClient } from "@/lib/supabase/server";
import { getSetupLockedMessage } from "@/lib/setup/copy";

import type {
  SaveSetupClassDefaultInput,
  SaveSetupClassRowInput,
  SaveSetupPolicyInput,
  SaveSetupRouteRowInput,
  SaveSetupSchoolDefaultsInput,
  SetupChecklistItem,
  SetupClassDefaultRow,
  SetupClassRow,
  SetupCompletionState,
  SetupFlowItem,
  SetupImportSummary,
  SetupReadinessSummary,
  SetupRouteRow,
  SetupWizardData,
} from "./types";

type ClassRow = {
  id: string;
  session_label: string;
  class_name: string;
  section: string | null;
  stream_name: string | null;
  sort_order: number;
  status: ClassStatus;
  notes: string | null;
};

type StudentRow = {
  id: string;
  class_ref:
    | {
        session_label: string;
      }
    | Array<{
        session_label: string;
      }>
    | null;
};

type ImportBatchRow = {
  status: string;
  invalid_rows: number;
  duplicate_rows: number;
  failed_rows: number;
};

type SetupProgressRow = {
  id: string;
  setup_completed_at: string | null;
  completion_notes: string | null;
};

async function getActiveSetupCompletionState() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("setup_progress")
    .select("id, setup_completed_at, completion_notes")
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load setup completion state: ${error.message}`);
  }

  return (data as SetupProgressRow | null) ?? null;
}

async function assertSetupEditable(reason: "policy" | "master_data" | "defaults") {
  const completion = await getActiveSetupCompletionState();

  if (!completion?.setup_completed_at) {
    return;
  }

  throw new Error(getSetupLockedMessage(reason));
}

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
  const parts = [value.class_name];

  if (value.section) {
    parts.push(`Section ${value.section}`);
  }

  if (value.stream_name) {
    parts.push(value.stream_name);
  }

  return parts.join(" - ");
}

function normalizeTextKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function buildClassIdentityKey(payload: {
  sessionLabel: string;
  className: string;
  section: string | null;
  streamName: string | null;
}) {
  return [
    normalizeTextKey(payload.sessionLabel),
    normalizeTextKey(payload.className),
    normalizeTextKey(payload.section),
    normalizeTextKey(payload.streamName),
  ].join("::");
}

function buildRouteIdentityKey(payload: {
  routeCode: string | null;
  routeName: string;
}) {
  const routeCode = normalizeTextKey(payload.routeCode);

  if (routeCode) {
    return `code::${routeCode}`;
  }

  return `name::${normalizeTextKey(payload.routeName)}`;
}

function dedupeSessionSuggestions(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  ).sort((left, right) => right.localeCompare(left));
}

function buildReadinessSummary(payload: {
  hasPolicyRecord: boolean;
  policySessionLabel: string;
  routeCount: number;
  schoolDefaultExists: boolean;
  classCount: number;
  classDefaultCount: number;
  activeSessionStudentCount: number;
  ledgerReady: boolean;
  lateFeeFlatAmount: number;
  installmentCount: number;
  acceptedPaymentModes: Array<{ label: string }>;
  receiptPrefix: string;
  completionState: SetupCompletionState;
}): SetupReadinessSummary {
  const baseChecklist: SetupChecklistItem[] = [
    {
      key: "session_created",
      label: "Session created",
      detail: payload.hasPolicyRecord
        ? `Active academic session is ${payload.policySessionLabel}.`
        : "Save the active academic session before continuing.",
      status: payload.hasPolicyRecord ? "complete" : "incomplete",
      blocking: true,
      href: "/protected/setup#session-policy",
    },
    {
      key: "classes_configured",
      label: "Classes configured",
      detail:
        payload.classCount > 0
          ? `${payload.classCount} classes are available for ${payload.policySessionLabel}.`
          : "Add the classes that belong to the active academic session.",
      status: payload.classCount > 0 ? "complete" : "incomplete",
      blocking: true,
      href: "/protected/setup#classes",
    },
    {
      key: "routes_configured",
      label: "Routes configured",
      detail:
        payload.routeCount > 0
          ? `${payload.routeCount} transport routes are available for student mapping.`
          : "No transport routes are saved yet. If transport is used, add them before import.",
      status: payload.routeCount > 0 ? "complete" : "warning",
      blocking: false,
      href: "/protected/setup#routes",
    },
    {
      key: "fee_defaults_configured",
      label: "Fee defaults configured",
      detail:
        payload.schoolDefaultExists && payload.classCount > 0
          ? payload.classDefaultCount === payload.classCount
            ? `School defaults plus ${payload.classDefaultCount} class-wise defaults are saved.`
            : `${payload.classCount - payload.classDefaultCount} classes still need class-wise defaults.`
          : "Save school-wide defaults first, then save class-wise defaults for each class.",
      status:
        payload.schoolDefaultExists &&
        payload.classCount > 0 &&
        payload.classDefaultCount === payload.classCount
          ? "complete"
          : "incomplete",
      blocking: true,
      href: "/protected/setup#class-defaults",
    },
    {
      key: "students_imported",
      label: "Students imported",
      detail:
        payload.activeSessionStudentCount > 0
          ? `${payload.activeSessionStudentCount} students are available in the active session.`
          : "Import or add students before generating ledgers.",
      status: payload.activeSessionStudentCount > 0 ? "complete" : "incomplete",
      blocking: true,
      href: "/protected/imports",
    },
    {
      key: "ledgers_generated",
      label: "Dues recalculated",
      detail: payload.ledgerReady
        ? `${payload.installmentCount} installment windows are already in sync for the active session.`
        : "Run ledger recalculation after student import so collections post against the correct dues.",
      status: payload.ledgerReady ? "complete" : "incomplete",
      blocking: true,
      href: "/protected/fee-setup/generate",
    },
  ];
  const readyForCompletion =
    baseChecklist.every((item) => item.status === "complete");
  const collectionDeskReady = readyForCompletion && Boolean(payload.completionState.setupCompletedAt);
  const checklist: SetupChecklistItem[] = [
    ...baseChecklist,
    {
      key: "collection_desk_ready",
      label: "Collection desk ready",
      detail: collectionDeskReady
        ? `Setup was marked complete on ${new Date(payload.completionState.setupCompletedAt!).toLocaleString("en-IN", {
            dateStyle: "medium",
            timeStyle: "short",
          })}.`
        : payload.completionState.setupCompletedAt
          ? "Setup was marked complete earlier, but live blocking checks now need attention again."
          : `Confirm setup completion after reviewing payment modes (${payload.acceptedPaymentModes
              .map((item) => item.label)
              .join(", ")}), late fee Rs ${payload.lateFeeFlatAmount}, and receipt prefix ${payload.receiptPrefix}.`
          ,
      status: collectionDeskReady ? "complete" : "incomplete",
      blocking: true,
      href: "/protected/setup#complete",
    },
  ];
  const completedCount = checklist.filter((item) => item.status === "complete").length;

  return {
    completedCount,
    totalCount: checklist.length,
    progressPercent: Math.round((completedCount / checklist.length) * 100),
    readyForCompletion,
    collectionDeskReady,
    checklist,
    missingBlockingItems: checklist.filter(
      (item) => item.blocking && item.status !== "complete",
    ),
  };
}

function buildFlowItems(payload: {
  readiness: SetupReadinessSummary;
  importSummary: SetupImportSummary;
  activeSessionStudentCount: number;
  ledgerReady: boolean;
}): SetupFlowItem[] {
  return [
    {
      key: "setup",
      label: "Finish setup wizard",
      detail: payload.readiness.readyForCompletion
        ? "Core setup data is ready. Mark the setup stage complete after one last review."
        : "Complete session, classes, routes, and fee defaults before importing students.",
      href: "/protected/setup",
      status: payload.readiness.readyForCompletion ? "done" : "current",
    },
    {
      key: "import_students",
      label: "Import students",
      detail:
        payload.activeSessionStudentCount > 0
          ? "Student records are already available for the active session."
          : "Upload the current workbook or CSV and save valid rows only.",
      href: "/protected/imports",
      status:
        payload.activeSessionStudentCount > 0
          ? "done"
          : payload.readiness.readyForCompletion
            ? "current"
            : "upcoming",
    },
    {
      key: "review_anomalies",
      label: "Review anomalies",
      detail:
        payload.importSummary.batchesWithAnomalies > 0
          ? `${payload.importSummary.batchesWithAnomalies} import batch(es) still show duplicates, invalid rows, or failed rows.`
          : payload.importSummary.completedBatches > 0
            ? "No pending import anomalies are visible in recent batches."
            : "After import, review duplicates and invalid rows before ledger recalculation.",
      href: "/protected/imports",
      status:
        payload.importSummary.batchesWithAnomalies > 0
          ? "attention"
          : payload.importSummary.completedBatches > 0
            ? "done"
            : "upcoming",
    },
    {
      key: "generate_ledgers",
      label: "Recalculate dues",
      detail: payload.ledgerReady
        ? "Ledger recalculation is already up to date for current students."
        : "Run ledger recalculation so the collection desk sees correct installment dues.",
      href: "/protected/fee-setup/generate",
      status:
        payload.ledgerReady
          ? "done"
          : payload.activeSessionStudentCount > 0
            ? "current"
            : "upcoming",
    },
    {
      key: "start_collections",
      label: "Start collections",
      detail: payload.readiness.collectionDeskReady
        ? "The collection desk can begin posting receipts for the active session."
        : "Collections should start only after student import, anomaly review, ledger recalculation, and setup completion.",
      href: "/protected/collections",
      status: payload.readiness.collectionDeskReady ? "current" : "upcoming",
    },
  ];
}

export async function getSetupWizardData(): Promise<SetupWizardData> {
  const supabase = await createClient();
  const setupData = await getFeeSetupPageData();
  const activeSessionLabel = setupData.globalPolicy.academicSessionLabel;

  const [
    { data: classRowsRaw, error: classRowsError },
    { data: studentRowsRaw, error: studentRowsError },
    { data: importBatchesRaw, error: importBatchesError },
    { data: completionRaw, error: completionError },
    ledgerPreview,
  ] = await Promise.all([
    supabase
      .from("classes")
      .select("id, session_label, class_name, section, stream_name, sort_order, status, notes")
      .order("session_label", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("class_name", { ascending: true }),
    supabase
      .from("students")
      .select("id, class_ref:classes(session_label)")
      .in("status", ["active", "inactive"]),
    supabase
      .from("import_batches")
      .select("status, invalid_rows, duplicate_rows, failed_rows")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("setup_progress")
      .select("id, setup_completed_at, completion_notes")
      .eq("is_active", true)
      .maybeSingle(),
    previewLedgerGeneration({ setupData }),
  ]);

  if (classRowsError) {
    throw new Error(`Unable to load setup classes: ${classRowsError.message}`);
  }

  if (studentRowsError) {
    throw new Error(`Unable to load setup students: ${studentRowsError.message}`);
  }

  if (importBatchesError) {
    throw new Error(`Unable to load import readiness: ${importBatchesError.message}`);
  }

  if (completionError) {
    throw new Error(`Unable to load setup completion state: ${completionError.message}`);
  }

  const classRows = (classRowsRaw ?? []) as ClassRow[];
  const studentRows = (studentRowsRaw ?? []) as StudentRow[];
  const importBatches = (importBatchesRaw ?? []) as ImportBatchRow[];
  const completionRow = (completionRaw as SetupProgressRow | null) ?? null;
  const activeSessionClasses = classRows
    .filter((row) => row.session_label === activeSessionLabel)
    .map(
      (row) =>
        ({
          id: row.id,
          className: row.class_name,
          section: row.section,
          streamName: row.stream_name,
          sortOrder: row.sort_order,
          status: row.status,
          notes: row.notes,
          label: buildClassLabel(row),
        }) satisfies SetupClassRow,
    );
  const activeClassIds = new Set(activeSessionClasses.map((row) => row.id));
  const classDefaultMap = new Map(
    setupData.classDefaults
      .filter((item) => activeClassIds.has(item.classId))
      .map((item) => [item.classId, item]),
  );
  const classDefaults = activeSessionClasses.map(
    (row) =>
      ({
        classId: row.id,
        classLabel: row.label,
        hasSavedDefault: classDefaultMap.has(row.id),
        tuitionFee: classDefaultMap.get(row.id)?.tuitionFee ?? setupData.schoolDefault.tuitionFee,
        transportFee:
          classDefaultMap.get(row.id)?.transportFee ?? setupData.schoolDefault.transportFee,
        booksFee: classDefaultMap.get(row.id)?.booksFee ?? setupData.schoolDefault.booksFee,
        admissionActivityMiscFee:
          classDefaultMap.get(row.id)?.admissionActivityMiscFee ??
          setupData.schoolDefault.admissionActivityMiscFee,
      }) satisfies SetupClassDefaultRow,
  );
  const routes = setupData.transportDefaults.map(
    (item) =>
      ({
        id: item.id,
        routeCode: item.routeCode,
        routeName: item.routeName,
        defaultInstallmentAmount: item.defaultInstallmentAmount,
        annualFeeAmount: item.annualFeeAmount,
        isActive: item.isActive,
        notes: item.notes,
      }) satisfies SetupRouteRow,
  );
  const activeSessionStudentCount = studentRows.filter((row) => {
    const classRef = toSingleRecord(row.class_ref);
    return classRef?.session_label === activeSessionLabel;
  }).length;
  const installmentChangesPending =
    ledgerPreview.installmentsToInsert +
    ledgerPreview.installmentsToUpdate +
    ledgerPreview.installmentsToCancel;
  const ledgerReady =
    activeSessionStudentCount > 0 &&
    ledgerPreview.studentsMissingSettings === 0 &&
    ledgerPreview.existingInstallments > 0 &&
    installmentChangesPending === 0;
  const completionState: SetupCompletionState = {
    id: completionRow?.id ?? null,
    setupCompletedAt: completionRow?.setup_completed_at ?? null,
    completionNotes: completionRow?.completion_notes ?? null,
  };
  const importSummary: SetupImportSummary = {
    completedBatches: importBatches.filter((item) => item.status === "completed").length,
    batchesWithAnomalies: importBatches.filter(
      (item) =>
        item.invalid_rows > 0 || item.duplicate_rows > 0 || item.failed_rows > 0,
    ).length,
  };
  const readiness = buildReadinessSummary({
    hasPolicyRecord: Boolean(setupData.globalPolicy.id),
    policySessionLabel: activeSessionLabel,
    routeCount: routes.length,
    schoolDefaultExists: Boolean(setupData.schoolDefault.id),
    classCount: activeSessionClasses.length,
    classDefaultCount: classDefaults.filter((item) => item.hasSavedDefault).length,
    activeSessionStudentCount,
    ledgerReady,
    lateFeeFlatAmount: setupData.globalPolicy.lateFeeFlatAmount,
    installmentCount: setupData.globalPolicy.installmentCount,
    acceptedPaymentModes: setupData.globalPolicy.acceptedPaymentModes,
    receiptPrefix: setupData.globalPolicy.receiptPrefix,
    completionState,
  });

  return {
    policy: setupData.globalPolicy,
    schoolDefault: setupData.schoolDefault,
    setupLocked: Boolean(completionState.setupCompletedAt),
    sessionSuggestions: dedupeSessionSuggestions([
      activeSessionLabel,
      ...classRows.map((row) => row.session_label),
    ]),
    activeSessionClasses,
    routes,
    classDefaults,
    completionState,
    readiness,
    flow: buildFlowItems({
      readiness,
      importSummary,
      activeSessionStudentCount,
      ledgerReady,
    }),
    importSummary,
    activeSessionStudentCount,
    activeSessionClassDefaultCount: classDefaults.filter((item) => item.hasSavedDefault).length,
    installmentCount: setupData.globalPolicy.installmentCount,
  };
}

export async function saveSetupPolicy(input: SaveSetupPolicyInput) {
  await assertSetupEditable("policy");
  const setupData = await getFeeSetupPageData();
  const installmentSchedule = input.installmentDueDateLabels.map((dueDateLabel, index) => ({
    label: `Installment ${index + 1}`,
    dueDateLabel,
  }));

  return upsertGlobalFeePolicy({
    academicSessionLabel: input.academicSessionLabel,
    calculationModel: input.calculationModel,
    installmentSchedule,
    lateFeeFlatAmount: input.lateFeeFlatAmount,
    newStudentAcademicFeeAmount: input.newStudentAcademicFeeAmount,
    oldStudentAcademicFeeAmount: input.oldStudentAcademicFeeAmount,
    acceptedPaymentModes: input.acceptedPaymentModes,
    receiptPrefix:
      input.receiptPrefix?.trim().toUpperCase() ||
      setupData.globalPolicy.receiptPrefix ||
      "SVP",
    customFeeHeads: setupData.globalPolicy.customFeeHeads,
    notes: setupData.globalPolicy.notes,
  });
}

export async function saveSetupSchoolDefaults(input: SaveSetupSchoolDefaultsInput) {
  await assertSetupEditable("defaults");
  const setupData = await getFeeSetupPageData();

  return upsertSchoolFeeDefaults({
    tuitionFee: input.tuitionFee,
    transportFee: input.transportFee,
    booksFee: input.booksFee,
    admissionActivityMiscFee: input.admissionActivityMiscFee,
    customFeeHeadAmounts: setupData.schoolDefault.customFeeHeadAmounts,
    customFeeHeads: setupData.globalPolicy.customFeeHeads,
    studentTypeDefault: setupData.schoolDefault.studentTypeDefault,
    transportAppliesDefault: setupData.schoolDefault.transportAppliesDefault,
    notes: setupData.schoolDefault.notes,
  });
}

export async function saveSetupClasses(
  academicSessionLabel: string,
  rows: SaveSetupClassRowInput[],
) {
  await assertSetupEditable("master_data");
  if (!academicSessionLabel.trim()) {
    throw new Error("Save the academic session before adding classes.");
  }

  if (rows.length === 0) {
    throw new Error("Add at least one class row before saving.");
  }

  const supabase = await createClient();
  const { data: existingRaw, error: existingError } = await supabase
    .from("classes")
    .select("id, session_label, class_name, section, stream_name")
    .eq("session_label", academicSessionLabel);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingRows = (existingRaw ?? []) as Array<{
    id: string;
    session_label: string;
    class_name: string;
    section: string | null;
    stream_name: string | null;
  }>;
  const existingByKey = new Map(
    existingRows.map((row) => [
      buildClassIdentityKey({
        sessionLabel: row.session_label,
        className: row.class_name,
        section: row.section,
        streamName: row.stream_name,
      }),
      row,
    ]),
  );
  const seenKeys = new Set<string>();

  for (const row of rows) {
    const key = buildClassIdentityKey({
      sessionLabel: academicSessionLabel,
      className: row.className,
      section: row.section,
      streamName: row.streamName,
    });

    if (seenKeys.has(key)) {
      throw new Error(`Duplicate class row found for ${row.className}.`);
    }

    seenKeys.add(key);
    const existing = existingByKey.get(key);

    if (existing && row.id && existing.id !== row.id) {
      throw new Error(`Class ${row.className} already exists in this session.`);
    }
  }

  for (const row of rows) {
    const values = {
      session_label: academicSessionLabel.trim(),
      class_name: row.className.trim(),
      section: row.section?.trim() || null,
      stream_name: row.streamName?.trim() || null,
      sort_order: row.sortOrder,
      status: row.status,
      notes: row.notes?.trim() || null,
    };
    const key = buildClassIdentityKey({
      sessionLabel: academicSessionLabel,
      className: row.className,
      section: row.section,
      streamName: row.streamName,
    });
    const existing = existingByKey.get(key);
    const targetId = row.id || existing?.id || null;

    if (targetId) {
      const { error } = await supabase.from("classes").update(values).eq("id", targetId);

      if (error) {
        throw new Error(error.message);
      }
      continue;
    }

    const { error } = await supabase.from("classes").insert(values);

    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function saveSetupRoutes(rows: SaveSetupRouteRowInput[]) {
  await assertSetupEditable("master_data");
  if (rows.length === 0) {
    return;
  }

  const supabase = await createClient();
  const { data: existingRaw, error: existingError } = await supabase
    .from("transport_routes")
    .select("id, route_code, route_name");

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingRows = (existingRaw ?? []) as Array<{
    id: string;
    route_code: string | null;
    route_name: string;
  }>;
  const existingByKey = new Map(
    existingRows.map((row) => [
      buildRouteIdentityKey({
        routeCode: row.route_code,
        routeName: row.route_name,
      }),
      row,
    ]),
  );
  const seenKeys = new Set<string>();

  for (const row of rows) {
    const key = buildRouteIdentityKey({
      routeCode: row.routeCode,
      routeName: row.routeName,
    });

    if (seenKeys.has(key)) {
      throw new Error(`Duplicate transport route found for ${row.routeName}.`);
    }

    seenKeys.add(key);
    const existing = existingByKey.get(key);

    if (existing && row.id && existing.id !== row.id) {
      throw new Error(`Route ${row.routeName} already exists.`);
    }
  }

  for (const row of rows) {
    const key = buildRouteIdentityKey({
      routeCode: row.routeCode,
      routeName: row.routeName,
    });
    const existing = existingByKey.get(key);

    await upsertTransportDefault({
      routeId: row.id || existing?.id || null,
      routeCode: row.routeCode?.trim() || null,
      routeName: row.routeName.trim(),
      defaultInstallmentAmount: row.defaultInstallmentAmount,
      annualFeeAmount: row.annualFeeAmount,
      isActive: row.isActive,
      notes: row.notes?.trim() || null,
    });
  }
}

export async function saveSetupClassDefaults(rows: SaveSetupClassDefaultInput[]) {
  await assertSetupEditable("defaults");
  if (rows.length === 0) {
    throw new Error("Add classes before saving class-wise defaults.");
  }

  const setupData = await getFeeSetupPageData();
  const classDefaultMap = new Map(
    setupData.classDefaults.map((item) => [item.classId, item]),
  );

  for (const row of rows) {
    const existing = classDefaultMap.get(row.classId);

    await upsertClassFeeDefault({
      classId: row.classId,
      tuitionFee: row.tuitionFee,
      transportFee: row.transportFee,
      booksFee: row.booksFee,
      admissionActivityMiscFee: row.admissionActivityMiscFee,
      customFeeHeadAmounts:
        existing?.customFeeHeadAmounts ?? setupData.schoolDefault.customFeeHeadAmounts,
      customFeeHeads: setupData.globalPolicy.customFeeHeads,
      studentTypeDefault:
        existing?.studentTypeDefault ?? setupData.schoolDefault.studentTypeDefault,
      transportAppliesDefault:
        existing?.transportAppliesDefault ?? setupData.schoolDefault.transportAppliesDefault,
      notes: existing?.notes ?? null,
    });
  }
}

export async function markSetupStageComplete(completionNotes: string | null) {
  const readiness = await getSetupWizardData();

  if (!readiness.readiness.readyForCompletion) {
    throw new Error("Finish the blocking setup steps before marking setup complete.");
  }

  const supabase = await createClient();
  const values = {
    setup_completed_at: new Date().toISOString(),
    completion_notes: completionNotes?.trim() || null,
    is_active: true,
  };
  const existingId = readiness.completionState.id;

  if (existingId) {
    const { error } = await supabase
      .from("setup_progress")
      .update(values)
      .eq("id", existingId);

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const { error } = await supabase.from("setup_progress").insert(values);

  if (error) {
    throw new Error(error.message);
  }
}
