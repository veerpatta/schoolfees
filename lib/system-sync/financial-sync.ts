import "server-only";

import { getFeePolicySummary } from "@/lib/fees/data";
import {
  generateSessionLedgersAction,
  type LedgerGenerationResult,
  type LedgerSkippedStudent,
} from "@/lib/fees/generator";
import { createClient } from "@/lib/supabase/server";
import { revalidateCoreFinancePaths } from "@/lib/system-sync/finance-revalidation";

type StudentClassJoin = {
  id: string;
  session_label: string;
  status: string;
  class_name: string;
  section: string | null;
  stream_name: string | null;
};

type StudentSessionRow = {
  id: string;
  admission_no: string;
  full_name: string;
  status: string;
  class_id: string;
  transport_route_id: string | null;
  class_ref: StudentClassJoin | StudentClassJoin[] | null;
};

type CountResult = {
  count: number | null;
  error: { message: string } | null;
};

export type FinancialSyncResult = LedgerGenerationResult & {
  reason: string;
  warnings: string[];
};

export type SystemSyncHealth = {
  activeFeePolicySession: string;
  activeFeePolicyCalculationModel: string;
  academicCurrentSession: string | null;
  sessionMismatch: boolean;
  activeSession: string;
  academicSessionsCurrentSession: string | null;
  sessionsMatch: boolean;
  activeStudentsBySession: SessionCountRow[];
  workbookFinancialRowsBySession: SessionCountRow[];
  importBatchesByTargetSession: ImportBatchSessionStatusRow[];
  importBatchesByTargetSessionStatus: ImportBatchSessionStatusRow[];
  studentsMissingInstallments: MissingInstallmentStudentRow[];
  studentsOutsideActiveFeeSession: StudentSessionMismatchRow[];
  classSessionMismatchStudents: StudentSessionMismatchRow[];
  classesMissingFeeSettings: ClassFeeSettingGapRow[];
  classRowsWithoutFeeSettings: ClassFeeSettingGapRow[];
  workbookFinancialRowCount: number;
  rawStudentsInActiveSession: number;
  studentsShownInDefaultWorkspace: number;
  studentsWithFinancialRows: number;
  studentsMissingFinancialRows: number;
  studentsMissingInstallmentRows: number;
  studentsWithNoFeeSetting: number;
  studentsInInactiveOrWrongSession: number;
  studentsMissingDues: number;
  classesWithoutFeeSettings: number;
  routesWithoutAnnualFees: number;
  requiredDatabaseObjectsStatus: RequiredDatabaseObjectsStatus;
  paymentPreviewReady: boolean;
  paymentDeskReady: boolean;
  dashboardReady: boolean;
  warnings: string[];
  errors: string[];
};

export type DatabaseObjectStatusKey =
  | "vWorkbookStudentFinancials"
  | "vWorkbookInstallmentBalances"
  | "previewWorkbookPaymentAllocation"
  | "postStudentPayment"
  | "privateWorkbookInstallmentSnapshot";

export type DatabaseObjectStatus = {
  key: DatabaseObjectStatusKey;
  label: string;
  objectName: string;
  required: boolean;
  usable: boolean;
  message: string;
};

export type RequiredDatabaseObjectsStatus = {
  vWorkbookStudentFinancials: DatabaseObjectStatus;
  vWorkbookInstallmentBalances: DatabaseObjectStatus;
  previewWorkbookPaymentAllocation: DatabaseObjectStatus;
  postStudentPayment: DatabaseObjectStatus;
  privateWorkbookInstallmentSnapshot: DatabaseObjectStatus;
};

export type SessionCountRow = {
  sessionLabel: string;
  count: number;
};

export type ImportBatchSessionStatusRow = {
  targetSessionLabel: string | null;
  status: string;
  count: number;
};

export type MissingInstallmentStudentRow = {
  studentId: string;
  admissionNo: string;
  fullName: string;
  sessionLabel: string;
};

export type StudentSessionMismatchRow = MissingInstallmentStudentRow & {
  feeSetupSessionLabel: string;
};

export type ClassFeeSettingGapRow = {
  classId: string;
  sessionLabel: string;
  classLabel: string;
};

export type RawClassStudentSummaryRow = {
  classId: string;
  sessionLabel: string;
  classLabel: string;
  sortOrder: number;
  activeStudentCount: number;
};

function toSingleRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

async function getCount(loader: PromiseLike<CountResult>, label: string) {
  const { count, error } = await loader;

  if (error) {
    throw new Error(`Unable to load ${label}: ${error.message}`);
  }

  return count ?? 0;
}

function buildSyncResult(
  result: LedgerGenerationResult,
  reason: string,
  warnings: string[] = [],
): FinancialSyncResult {
  return {
    ...result,
    reason,
    warnings,
  };
}

function buildLedgerWarnings(result: LedgerGenerationResult) {
  const warnings: string[] = [];

  if (result.scopedStudents === 0 || result.studentsInAcademicSession === 0) {
    warnings.push("No matching active student was found in the active Fee Setup session.");
  }

  if (result.studentsMissingSettings > 0) {
    warnings.push("One or more students belong to a class with no fee amount in Fee Setup.");
  }

  result.skippedStudents.forEach((student) => {
    warnings.push(student.reasonMessage);
  });

  if (
    result.scopedStudents > 0 &&
    result.installmentsToInsert === 0 &&
    result.installmentsToUpdate === 0 &&
    result.installmentsToCancel === 0 &&
    result.lockedInstallments === 0
  ) {
    warnings.push("No dues changed. The student may already be synced or may need Fee Setup review.");
  }

  return [...new Set(warnings)];
}

export function summarizeDuesPreparationIssues(skippedStudents: readonly LedgerSkippedStudent[]) {
  const reasonMessages = [...new Set(skippedStudents.map((student) => student.reasonMessage))];

  if (reasonMessages.length === 0) {
    return "";
  }

  return reasonMessages.slice(0, 3).join(" ");
}

export function hasPreparedDues(result: LedgerGenerationResult) {
  return (
    result.installmentsToInsert > 0 ||
    result.installmentsToUpdate > 0 ||
    result.existingInstallments > 0 ||
    result.affectedStudents > 0
  );
}

function buildEmptySyncResult(reason: string, warnings: string[] = []): FinancialSyncResult {
  return {
    academicSessionLabel: "",
    totalActiveStudents: 0,
    studentsInAcademicSession: 0,
    scopedStudents: 0,
    studentsWithResolvedSettings: 0,
    studentsMissingSettings: 0,
    existingInstallments: 0,
    installmentsToInsert: 0,
    installmentsToUpdate: 0,
    installmentsToCancel: 0,
    lockedInstallments: 0,
    expectedScheduledInstallments: 0,
    affectedStudents: 0,
    blockedInstallmentsForReview: [],
    skippedStudents: [],
    errors: [],
    reason,
    warnings,
  };
}

function buildClassLabel(value: {
  class_name: string;
  section: string | null;
  stream_name: string | null;
}) {
  return [value.class_name, value.section ? `Section ${value.section}` : "", value.stream_name ?? ""]
    .filter(Boolean)
    .join(" - ");
}

function addSessionCount(
  map: Map<string, number>,
  sessionLabel: string | null | undefined,
  increment = 1,
) {
  const label = sessionLabel?.trim() || "Not set";
  map.set(label, (map.get(label) ?? 0) + increment);
}

function toSessionCountRows(map: Map<string, number>) {
  return [...map.entries()]
    .map(([sessionLabel, count]) => ({ sessionLabel, count }))
    .sort((left, right) => left.sessionLabel.localeCompare(right.sessionLabel));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeDatabaseError(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message ?? "";
  const code = error?.code ?? "";
  return `${code} ${message}`.trim().toLowerCase();
}

function isMissingDatabaseObjectError(error: { message?: string; code?: string } | null | undefined) {
  const normalized = normalizeDatabaseError(error);

  return (
    normalized.includes("pgrst202") ||
    normalized.includes("42883") ||
    normalized.includes("42p01") ||
    normalized.includes("could not find the function") ||
    normalized.includes("does not exist") ||
    (normalized.includes("relation") && normalized.includes("does not exist"))
  );
}

function hasPrivateSnapshotAccessError(error: { message?: string; code?: string } | null | undefined) {
  const normalized = normalizeDatabaseError(error);

  return (
    normalized.includes("private.workbook_installment_snapshot") ||
    normalized.includes("permission denied for schema private") ||
    normalized.includes("permission denied for function workbook_installment_snapshot")
  );
}

function objectStatus(
  key: DatabaseObjectStatusKey,
  payload: {
    label: string;
    objectName: string;
    usable: boolean;
    message: string;
  },
): DatabaseObjectStatus {
  return {
    key,
    required: true,
    ...payload,
  };
}

async function getRequiredDatabaseObjectsStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<RequiredDatabaseObjectsStatus> {
  const zeroUuid = "00000000-0000-0000-0000-000000000000";
  const today = new Date().toISOString().slice(0, 10);

  const workbookStudentFinancials = await supabase
    .from("v_workbook_student_financials")
    .select("student_id", { count: "exact", head: true });
  const vWorkbookStudentFinancials = objectStatus("vWorkbookStudentFinancials", {
    label: "Workbook student financials view",
    objectName: "public.v_workbook_student_financials",
    usable: !workbookStudentFinancials.error,
    message: workbookStudentFinancials.error
      ? `View check failed: ${workbookStudentFinancials.error.message}`
      : "View is available.",
  });

  const workbookInstallmentBalances = await supabase
    .from("v_workbook_installment_balances")
    .select("installment_id", { count: "exact", head: true });
  const vWorkbookInstallmentBalances = objectStatus("vWorkbookInstallmentBalances", {
    label: "Workbook installment balances view",
    objectName: "public.v_workbook_installment_balances",
    usable: !workbookInstallmentBalances.error,
    message: workbookInstallmentBalances.error
      ? `View check failed: ${workbookInstallmentBalances.error.message}`
      : "View is available.",
  });

  const previewProbe = await supabase.rpc("preview_workbook_payment_allocation", {
    p_student_id: zeroUuid,
    p_payment_date: today,
  });
  const previewMissing = isMissingDatabaseObjectError(previewProbe.error);
  const previewPrivateSnapshotProblem = hasPrivateSnapshotAccessError(previewProbe.error);
  const previewWorkbookPaymentAllocation = objectStatus("previewWorkbookPaymentAllocation", {
    label: "Payment preview function",
    objectName: "public.preview_workbook_payment_allocation(uuid, date)",
    usable: !previewProbe.error,
    message: !previewProbe.error
      ? "Date-aware payment preview function is available."
      : previewMissing
        ? "Payment preview needs a database update."
        : `Payment preview function check failed: ${previewProbe.error.message}`,
  });

  const postPaymentProbe = await supabase.rpc("post_student_payment", {
    p_student_id: zeroUuid,
    p_payment_date: today,
    p_payment_mode: "cash",
    p_total_amount: 1,
    p_reference_number: null,
    p_remarks: "readiness check only",
    p_received_by: "system-readiness",
    p_receipt_prefix: "SVP",
  });
  const postPaymentMissing = isMissingDatabaseObjectError(postPaymentProbe.error);
  const postStudentPayment = objectStatus("postStudentPayment", {
    label: "Payment posting function",
    objectName: "public.post_student_payment",
    usable: !postPaymentMissing,
    message: postPaymentMissing
      ? `Payment posting function is missing: ${postPaymentProbe.error?.message ?? "unknown error"}`
      : "Payment posting function exists. Readiness check did not create a payment.",
  });

  const privateWorkbookInstallmentSnapshot = objectStatus("privateWorkbookInstallmentSnapshot", {
    label: "Workbook installment snapshot helper",
    objectName: "private.workbook_installment_snapshot",
    usable:
      !previewPrivateSnapshotProblem &&
      (vWorkbookInstallmentBalances.usable || previewWorkbookPaymentAllocation.usable),
    message: previewPrivateSnapshotProblem
      ? "Workbook snapshot helper is missing or not usable from the preview function."
      : vWorkbookInstallmentBalances.usable || previewWorkbookPaymentAllocation.usable
        ? "Workbook snapshot helper is reachable through public workbook views/functions."
        : "Workbook snapshot helper could not be verified through public workbook objects.",
  });

  return {
    vWorkbookStudentFinancials,
    vWorkbookInstallmentBalances,
    previewWorkbookPaymentAllocation,
    postStudentPayment,
    privateWorkbookInstallmentSnapshot,
  };
}

export async function getRawActiveSessionStudentCount(sessionLabel: string) {
  const supabase = await createClient();
  const normalizedSession = sessionLabel.trim();

  if (!normalizedSession) {
    return 0;
  }

  const { count, error } = await supabase
    .from("students")
    .select("id, class_ref:classes!inner(id)", { count: "exact", head: true })
    .eq("status", "active")
    .eq("class_ref.session_label", normalizedSession)
    .eq("class_ref.status", "active");

  if (error) {
    throw new Error(`Unable to count active-session students: ${error.message}`);
  }

  return count ?? 0;
}

export async function getRawClassStudentSummary(
  sessionLabel: string,
): Promise<RawClassStudentSummaryRow[]> {
  const supabase = await createClient();
  const normalizedSession = sessionLabel.trim();

  if (!normalizedSession) {
    return [];
  }

  const { data: classesRaw, error: classesError } = await supabase
    .from("classes")
    .select("id, class_name, section, stream_name, sort_order")
    .eq("session_label", normalizedSession)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("class_name", { ascending: true });

  if (classesError) {
    throw new Error(`Unable to load active class summary: ${classesError.message}`);
  }

  const classes = (classesRaw ?? []) as Array<{
    id: string;
    class_name: string;
    section: string | null;
    stream_name: string | null;
    sort_order: number;
  }>;

  if (classes.length === 0) {
    return [];
  }

  const classIds = classes.map((row) => row.id);
  const { data: studentsRaw, error: studentsError } = await supabase
    .from("students")
    .select("class_id")
    .eq("status", "active")
    .in("class_id", classIds);

  if (studentsError) {
    throw new Error(`Unable to load active class student counts: ${studentsError.message}`);
  }

  const countsByClassId = ((studentsRaw ?? []) as Array<{ class_id: string }>).reduce(
    (acc, row) => acc.set(row.class_id, (acc.get(row.class_id) ?? 0) + 1),
    new Map<string, number>(),
  );

  return classes.map((row) => ({
    classId: row.id,
    sessionLabel: normalizedSession,
    classLabel: buildClassLabel(row),
    sortOrder: row.sort_order,
    activeStudentCount: countsByClassId.get(row.id) ?? 0,
  }));
}

export async function syncStudentFinancials(payload: {
  studentIds: readonly string[];
  reason: string;
}) {
  const studentIds = [...new Set(payload.studentIds.filter(Boolean))];

  if (studentIds.length === 0) {
    revalidateCoreFinancePaths();
    return buildEmptySyncResult(payload.reason, ["No students selected."]);
  }

  const result = await generateSessionLedgersAction({ scopedStudentIds: studentIds });
  revalidateCoreFinancePaths(studentIds);

  return buildSyncResult(result, payload.reason, buildLedgerWarnings(result));
}

export async function syncSessionFinancials(payload: {
  sessionLabel: string;
  reason: string;
}) {
  const policy = await getFeePolicySummary();
  const requestedSession = payload.sessionLabel.trim();
  const warnings: string[] = [];

  if (
    requestedSession &&
    requestedSession.toLowerCase() !== policy.academicSessionLabel.trim().toLowerCase()
  ) {
    warnings.push(
      `Dues were not prepared because ${requestedSession} is not active in Fee Setup. The active year is ${policy.academicSessionLabel}.`,
    );
    revalidateCoreFinancePaths();
    return buildEmptySyncResult(payload.reason, warnings);
  }

  const result = await generateSessionLedgersAction();
  revalidateCoreFinancePaths();

  return buildSyncResult(result, payload.reason, [...warnings, ...buildLedgerWarnings(result)]);
}

export async function generateMissingSessionDues(payload: {
  sessionLabel: string;
  reason: string;
}) {
  const health = await getSystemSyncHealth(payload.sessionLabel);
  const studentIds = health.studentsMissingInstallments.map((row) => row.studentId);

  if (studentIds.length === 0) {
    revalidateCoreFinancePaths();
    return buildEmptySyncResult(payload.reason, ["No active students are missing dues."]);
  }

  const result = await generateSessionLedgersAction({ scopedStudentIds: studentIds });
  revalidateCoreFinancePaths(studentIds);

  return buildSyncResult(result, payload.reason, buildLedgerWarnings(result));
}

export async function syncAfterStudentChange(payload: { studentId: string }) {
  return syncStudentFinancials({
    studentIds: [payload.studentId],
    reason: "Student Master changed",
  });
}

export async function syncAfterStudentBulkImport(payload: { studentIds: readonly string[] }) {
  return syncStudentFinancials({
    studentIds: payload.studentIds,
    reason: "Student import changed Student Master",
  });
}

export async function syncAfterFeeSetupChange(payload: { sessionLabel: string }) {
  return syncSessionFinancials({
    sessionLabel: payload.sessionLabel,
    reason: "Fee Setup changed",
  });
}

export function revalidateFinanceSurfaces(payload: { studentIds?: readonly string[] } = {}) {
  revalidateCoreFinancePaths(payload.studentIds ?? []);
}

export async function getSystemSyncHealth(sessionLabel?: string): Promise<SystemSyncHealth> {
  const supabase = await createClient();
  const policy = await getFeePolicySummary();
  const activeSession = sessionLabel?.trim() || policy.academicSessionLabel;
  const activeFeePolicyCalculationModel = policy.calculationModel ?? "unknown";
  const warnings: string[] = [];
  const errors: string[] = [];
  let requiredDatabaseObjectsStatus: RequiredDatabaseObjectsStatus;

  try {
    requiredDatabaseObjectsStatus = await getRequiredDatabaseObjectsStatus(supabase);
  } catch (error) {
    const message = `Unable to check required database objects: ${getErrorMessage(error)}`;
    warnings.push(message);
    requiredDatabaseObjectsStatus = {
      vWorkbookStudentFinancials: objectStatus("vWorkbookStudentFinancials", {
        label: "Workbook student financials view",
        objectName: "public.v_workbook_student_financials",
        usable: false,
        message,
      }),
      vWorkbookInstallmentBalances: objectStatus("vWorkbookInstallmentBalances", {
        label: "Workbook installment balances view",
        objectName: "public.v_workbook_installment_balances",
        usable: false,
        message,
      }),
      previewWorkbookPaymentAllocation: objectStatus("previewWorkbookPaymentAllocation", {
        label: "Payment preview function",
        objectName: "public.preview_workbook_payment_allocation(uuid, date)",
        usable: false,
        message,
      }),
      postStudentPayment: objectStatus("postStudentPayment", {
        label: "Payment posting function",
        objectName: "public.post_student_payment",
        usable: false,
        message,
      }),
      privateWorkbookInstallmentSnapshot: objectStatus("privateWorkbookInstallmentSnapshot", {
        label: "Workbook installment snapshot helper",
        objectName: "private.workbook_installment_snapshot",
        usable: false,
        message,
      }),
    };
  }

  let studentRows: StudentSessionRow[] = [];
  try {
    const { data: studentRowsRaw, error: studentsError } = await supabase
      .from("students")
      .select(
        "id, admission_no, full_name, status, class_id, transport_route_id, class_ref:classes(id, session_label, status, class_name, section, stream_name)",
      );

    if (studentsError) {
      throw new Error(studentsError.message);
    }

    studentRows = (studentRowsRaw ?? []) as StudentSessionRow[];
  } catch (error) {
    errors.push(
      `Unable to load sync health students: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const activeSessionStudents = studentRows.filter((row) => {
    const classRef = toSingleRecord(row.class_ref);
    return (
      classRef?.session_label === activeSession &&
      classRef.status === "active" &&
      row.status === "active"
    );
  });
  const activeSessionStudentIds = activeSessionStudents.map((row) => row.id);
  const activeSessionClassIds = [...new Set(activeSessionStudents.map((row) => row.class_id))];
  const activeStudentsBySessionMap = new Map<string, number>();
  const classSessionMismatchStudents: StudentSessionMismatchRow[] = [];

  studentRows.forEach((row) => {
    const classRef = toSingleRecord(row.class_ref);

    if (row.status !== "active" || classRef?.status !== "active") {
      return;
    }

    addSessionCount(activeStudentsBySessionMap, classRef.session_label);

    if (classRef.session_label !== activeSession) {
      classSessionMismatchStudents.push({
        studentId: row.id,
        admissionNo: row.admission_no,
        fullName: row.full_name,
        sessionLabel: classRef.session_label,
        feeSetupSessionLabel: activeSession,
      });
    }
  });

  const activeRouteIds = [
    ...new Set(
      activeSessionStudents
        .map((row) => row.transport_route_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  let academicSessionsCurrentSession: string | null = null;
  try {
    const { data, error } = await supabase
      .from("academic_sessions")
      .select("session_label")
      .eq("is_current", true)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    academicSessionsCurrentSession = data?.session_label?.trim() || null;
  } catch (error) {
    warnings.push(
      `Unable to load academic current session: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const sessionsMatch =
    academicSessionsCurrentSession !== null &&
    academicSessionsCurrentSession.trim().toLowerCase() === activeSession.trim().toLowerCase();

  const activeSessionClassRows = await supabase
    .from("classes")
    .select("id, session_label, class_name, section, stream_name")
    .eq("session_label", activeSession)
    .eq("status", "active");

  if (activeSessionClassRows.error) {
    warnings.push(`Unable to load classes for sync health: ${activeSessionClassRows.error.message}`);
  }

  let studentsWithFinancialRows = 0;
  let installmentRowsData: Array<{ student_id: string }> = [];
  let feeSettingRowsData: Array<{ class_id: string }> = [];
  let routesWithoutAnnualFees = 0;
  const workbookFinancialRowsBySessionMap = new Map<string, number>();
  const importBatchSessionStatusMap = new Map<string, ImportBatchSessionStatusRow>();

  try {
    const { data, error } = await supabase
      .from("v_workbook_student_financials")
      .select("student_id, session_label");

    if (error) {
      throw new Error(error.message);
    }

    ((data ?? []) as Array<{ student_id: string; session_label: string | null }>).forEach((row) => {
      addSessionCount(workbookFinancialRowsBySessionMap, row.session_label);
    });

    studentsWithFinancialRows = activeSessionStudentIds.length > 0
      ? await getCount(
          supabase
            .from("v_workbook_student_financials")
            .select("student_id", { count: "exact", head: true })
            .in("student_id", activeSessionStudentIds),
          "students with prepared fee records",
        )
      : 0;
  } catch (error) {
    warnings.push(
      `Unable to count workbook student rows: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const { data, error } = await supabase
      .from("import_batches")
      .select("target_session_label, status");

    if (error) {
      throw new Error(error.message);
    }

    ((data ?? []) as Array<{ target_session_label: string | null; status: string }>).forEach((row) => {
      const targetSessionLabel = row.target_session_label?.trim() || null;
      const key = `${targetSessionLabel ?? "Not set"}::${row.status}`;
      const current = importBatchSessionStatusMap.get(key);
      importBatchSessionStatusMap.set(key, {
        targetSessionLabel,
        status: row.status,
        count: (current?.count ?? 0) + 1,
      });
    });
  } catch (error) {
    warnings.push(
      `Unable to load import batch session status: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    if (activeSessionStudentIds.length > 0) {
      const { data, error } = await supabase
        .from("installments")
        .select("student_id")
        .in("student_id", activeSessionStudentIds)
        .neq("status", "cancelled");

      if (error) {
        throw new Error(error.message);
      }

      installmentRowsData = (data ?? []) as Array<{ student_id: string }>;
    }
  } catch (error) {
    warnings.push(
      `Unable to load installment rows for sync health: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    if (activeSessionClassIds.length > 0) {
      const { data, error } = await supabase
        .from("fee_settings")
        .select("class_id")
        .eq("is_active", true)
        .in("class_id", activeSessionClassIds);

      if (error) {
        throw new Error(error.message);
      }

      feeSettingRowsData = (data ?? []) as Array<{ class_id: string }>;
    }
  } catch (error) {
    warnings.push(
      `Unable to load fee settings for sync health: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    if (activeRouteIds.length > 0) {
      routesWithoutAnnualFees = await getCount(
        supabase
          .from("transport_routes")
          .select("id", { count: "exact", head: true })
          .in("id", activeRouteIds)
          .or("annual_fee_amount.is.null,annual_fee_amount.eq.0"),
        "routes without annual fees",
      );
    }
  } catch (error) {
    warnings.push(
      `Unable to count routes without annual fees: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const feeSettingClassIds = new Set(feeSettingRowsData.map((row) => row.class_id));
  const activeClassIds = new Set(
    [
      ...(activeSessionClassRows.data ?? []).map((row) => row.id),
      ...activeSessionClassIds,
    ] as string[],
  );
  const installmentStudentIds = new Set(installmentRowsData.map((row) => row.student_id));
  const studentsMissingInstallments = activeSessionStudents
    .filter((row) => !installmentStudentIds.has(row.id))
    .map((row) => ({
      studentId: row.id,
      admissionNo: row.admission_no,
      fullName: row.full_name,
      sessionLabel: activeSession,
    }));
  const classRowsWithoutFeeSettings = ((activeSessionClassRows.data ?? []) as Array<{
    id: string;
    session_label: string;
    class_name: string;
    section: string | null;
    stream_name: string | null;
  }>)
    .filter((row) => !feeSettingClassIds.has(row.id))
    .map((row) => ({
      classId: row.id,
      sessionLabel: row.session_label,
      classLabel: buildClassLabel(row),
    }));
  const studentsWithNoFeeSetting = activeSessionStudents.filter(
    (row) => !feeSettingClassIds.has(row.class_id),
  ).length;
  const studentsMissingInstallmentRows = Math.max(
    activeSessionStudents.length - installmentStudentIds.size,
    0,
  );
  const studentsMissingFinancialRows = Math.max(
    activeSessionStudents.length - studentsWithFinancialRows,
    0,
  );
  const studentsMissingDues = Math.max(studentsMissingFinancialRows, studentsMissingInstallmentRows);
  const studentsInInactiveOrWrongSession = studentRows.filter((row) => {
    const classRef = toSingleRecord(row.class_ref);
    return (
      row.status === "active" &&
      (classRef?.session_label !== activeSession || classRef?.status !== "active")
    );
  }).length;
  const importBatchesByTargetSession = [...importBatchSessionStatusMap.values()].sort(
    (left, right) =>
      (left.targetSessionLabel ?? "").localeCompare(right.targetSessionLabel ?? "") ||
      left.status.localeCompare(right.status),
  );
  const classesWithoutFeeSettings = [...activeClassIds].filter(
    (classId) => !feeSettingClassIds.has(classId),
  ).length;
  const paymentPreviewReady =
    requiredDatabaseObjectsStatus.previewWorkbookPaymentAllocation.usable &&
    requiredDatabaseObjectsStatus.privateWorkbookInstallmentSnapshot.usable;
  const paymentDeskReady =
    paymentPreviewReady &&
    requiredDatabaseObjectsStatus.postStudentPayment.usable &&
    activeSessionStudents.length > 0 &&
    studentsMissingInstallmentRows === 0 &&
    studentsWithNoFeeSetting === 0;
  const dashboardReady =
    requiredDatabaseObjectsStatus.vWorkbookStudentFinancials.usable &&
    requiredDatabaseObjectsStatus.vWorkbookInstallmentBalances.usable &&
    (activeSessionStudents.length === 0 ||
      (studentsMissingFinancialRows === 0 && studentsWithNoFeeSetting === 0));

  if (!sessionsMatch) {
    warnings.push("Academic current session differs from Fee Setup session.");
  }

  if (activeSessionStudents.length > 0 && studentsMissingInstallmentRows > 0) {
    warnings.push("Students exist but dues are missing.");
  }

  if (classRowsWithoutFeeSettings.length > 0) {
    warnings.push("Class fees are missing for these classes.");
  }

  if (!paymentPreviewReady) {
    warnings.push("Payment preview needs a database update.");
  }

  return {
    activeFeePolicySession: activeSession,
    activeFeePolicyCalculationModel,
    academicCurrentSession: academicSessionsCurrentSession,
    sessionMismatch: !sessionsMatch,
    activeSession,
    academicSessionsCurrentSession,
    sessionsMatch,
    activeStudentsBySession: toSessionCountRows(activeStudentsBySessionMap),
    workbookFinancialRowsBySession: toSessionCountRows(workbookFinancialRowsBySessionMap),
    importBatchesByTargetSession,
    importBatchesByTargetSessionStatus: importBatchesByTargetSession,
    studentsMissingInstallments,
    studentsOutsideActiveFeeSession: classSessionMismatchStudents,
    classSessionMismatchStudents,
    classesMissingFeeSettings: classRowsWithoutFeeSettings,
    classRowsWithoutFeeSettings,
    workbookFinancialRowCount: studentsWithFinancialRows,
    rawStudentsInActiveSession: activeSessionStudents.length,
    studentsShownInDefaultWorkspace: activeSessionStudents.length,
    studentsWithFinancialRows,
    studentsMissingFinancialRows,
    studentsMissingInstallmentRows,
    studentsWithNoFeeSetting,
    studentsInInactiveOrWrongSession,
    studentsMissingDues,
    classesWithoutFeeSettings,
    routesWithoutAnnualFees,
    requiredDatabaseObjectsStatus,
    paymentPreviewReady,
    paymentDeskReady,
    dashboardReady,
    warnings,
    errors,
  };
}

export async function alignAcademicCurrentSessionWithFeeSetup() {
  const supabase = await createClient();
  const policy = await getFeePolicySummary();
  const activeSession = policy.academicSessionLabel.trim();

  if (!activeSession) {
    throw new Error("Fee Setup does not have an active academic session label.");
  }

  const { data: existingSession, error: lookupError } = await supabase
    .from("academic_sessions")
    .select("id")
    .eq("session_label", activeSession)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Unable to check academic session: ${lookupError.message}`);
  }

  const clearResult = await supabase
    .from("academic_sessions")
    .update({ is_current: false })
    .neq("session_label", activeSession);

  if (clearResult.error) {
    throw new Error(`Unable to clear previous current session: ${clearResult.error.message}`);
  }

  if (existingSession?.id) {
    const { error } = await supabase
      .from("academic_sessions")
      .update({ is_current: true, status: "active" })
      .eq("id", existingSession.id);

    if (error) {
      throw new Error(`Unable to align academic current session: ${error.message}`);
    }
  } else {
    const { error } = await supabase
      .from("academic_sessions")
      .insert({
        session_label: activeSession,
        status: "active",
        is_current: true,
          notes: "Created by Fee Data Status to align the working session with Fee Setup.",
      });

    if (error) {
      throw new Error(`Unable to create academic current session: ${error.message}`);
    }
  }

  revalidateCoreFinancePaths();

  return getSystemSyncHealth(activeSession);
}
