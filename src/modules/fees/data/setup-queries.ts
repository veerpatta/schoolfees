import { FEE_ADMINISTERED_STATUSES } from "@/modules/students/domain/populations";
import "server-only";

import { cache } from "react";

import type { ClassStatus } from "@/platform/db/types";
import { previewLedgerGeneration, type LedgerGenerationPreview } from "@/modules/fees/data/generator";
import { getFeeSetupPageData } from "@/modules/fees/domain/queries";
import { cacheSafeUnstableCache } from "@/platform/supabase/cache-safe";
import { createClient } from "@/platform/supabase/server";
import { getSystemSyncHealth } from "@/modules/system-sync/domain/finance-sync";
import type { SetupChecklistItem, SetupClassDefaultRow, SetupClassRow, SetupCompletionState, SetupFlowItem, SetupImportSummary, SetupReadinessSummary, SetupRouteRow, SetupWizardData } from "../domain/setup-types";

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
  id: string;
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
  studentsMissingDues: number;
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
      href: "/protected/master-data",
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
      href: "/protected/master-data",
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
      href: "/protected/master-data",
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
      href: "/protected/fee-setup",
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
        : "Dues sync runs automatically after fee setup or student changes. This status updates after background preparation finishes.",
      status: payload.ledgerReady ? "complete" : "incomplete",
      blocking: false,
      href: "/protected/fee-setup/generate",
    },
  ];
  const readyForCompletion = baseChecklist.every(
    (item) => !item.blocking || item.status === "complete",
  );
  const collectionDeskReady = readyForCompletion;
  const collectionDeskRecoveryDetail =
    payload.studentsMissingDues > 0
      ? `${payload.studentsMissingDues} student(s) have no dues records. Open Session Health if automatic sync does not clear this.`
      : "Setup was marked complete earlier, but live blocking checks now need attention again.";
  const checklist: SetupChecklistItem[] = [
    ...baseChecklist,
    {
      key: "collection_desk_ready",
      label: "Collection desk ready",
      detail: collectionDeskReady
        ? "All blocking setup checks are complete. The Payment Desk can be used."
        : payload.completionState.setupCompletedAt
          ? collectionDeskRecoveryDetail
          : `Complete the blocking checklist above. Payment modes (${payload.acceptedPaymentModes
              .map((item) => item.label)
              .join(", ")}), late fee Rs ${payload.lateFeeFlatAmount}, and receipt prefix ${payload.receiptPrefix} remain visible for review.`
          ,
      status: collectionDeskReady ? "complete" : "incomplete",
      blocking: true,
      href:
        payload.studentsMissingDues > 0
          ? "/protected/admin-tools#fee-data-troubleshooting"
          : "/protected/admin-tools",
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
      label: "Review setup status",
      detail: payload.readiness.readyForCompletion
        ? "Core setup data is ready. Saving a completion note is optional for the office audit trail."
        : "Complete session, classes, routes, and fee defaults before importing students.",
      href: "/protected/admin-tools",
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
      href: payload.importSummary.firstAnomalyBatchId
        ? `/protected/imports?batchId=${payload.importSummary.firstAnomalyBatchId}`
        : payload.importSummary.batchesWithAnomalies > 0
          ? "/protected/imports?status=invalid"
          : "/protected/imports",
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
        : "Automatic dues sync is still catching up. Use manual update only if an admin wants to refresh immediately.",
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
        : "Collections should start only after the blocking setup, fee defaults, and student records are ready.",
      href: "/protected/payments",
      status: payload.readiness.collectionDeskReady ? "current" : "upcoming",
    },
  ];
}

const LEDGER_PREVIEW_SKIPPED: LedgerGenerationPreview = {
  academicSessionLabel: "",
  totalActiveStudents: 0,
  studentsInAcademicSession: 0,
  scopedStudents: 0,
  studentsWithResolvedSettings: 0,
  studentsMissingSettings: 0,
  existingInstallments: 0,
  installmentsToInsert: 0,
  installmentsToUpdate: 0,
  installmentsToRepoint: 0,
  installmentsToCancel: 0,
  lockedInstallments: 0,
  creditTotal: 0,
  feeDeltaTotal: 0,
  expectedScheduledInstallments: 0,
  affectedStudents: 0,
};

async function loadSetupWizardData(options: { skipLedgerPreview?: boolean } = {}): Promise<SetupWizardData> {
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
      .in("status", [...FEE_ADMINISTERED_STATUSES]),
    supabase
      .from("import_batches")
      .select("id, status, invalid_rows, duplicate_rows, failed_rows")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("setup_progress")
      .select("id, setup_completed_at, completion_notes")
      .eq("is_active", true)
      .maybeSingle(),
    options.skipLedgerPreview
      ? Promise.resolve(LEDGER_PREVIEW_SKIPPED)
      : previewLedgerGeneration({ setupData }),
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
  const syncHealth = await getSystemSyncHealth(activeSessionLabel);
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
    firstAnomalyBatchId:
      importBatches.find(
        (item) =>
          item.invalid_rows > 0 || item.duplicate_rows > 0 || item.failed_rows > 0,
      )?.id ?? null,
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
    studentsMissingDues: syncHealth.studentsMissingInstallments.length,
  });

  return {
    policy: setupData.globalPolicy,
    schoolDefault: setupData.schoolDefault,
    setupLocked: Boolean(completionState.setupCompletedAt) && readiness.readyForCompletion,
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

const getSetupWizardDataForRequest = cache(loadSetupWizardData);

// The "light" form is used by Transactions, Payments, and other office pages
// purely to compute a workflow-readiness chip (class count, has-defaults,
// ledgers-ready, …). Under the hood it still pulls all classes, every active
// student row, recent import batches, setup progress and system-sync health —
// hundreds of millis on every nav. The underlying truth only changes when an
// admin actually saves Fee Setup / regenerates ledgers, so cache it for 60s
// and invalidate via the existing `fee-policy` / `setup-readiness` tags from
// those write actions.
const loadSetupWizardDataLightUncached = () =>
  loadSetupWizardData({ skipLedgerPreview: true });

const _getSetupWizardDataLightDataCached = cacheSafeUnstableCache(
  loadSetupWizardDataLightUncached,
  ["setup-wizard-data-light"],
  { tags: ["setup-readiness", "fee-policy"], revalidate: 60 },
);

const getSetupWizardDataLightForRequest = cache(
  () => _getSetupWizardDataLightDataCached(),
);

export async function getSetupWizardData(): Promise<SetupWizardData> {
  return getSetupWizardDataForRequest();
}

export async function getSetupWizardDataLight(): Promise<SetupWizardData> {
  return getSetupWizardDataLightForRequest();
}

