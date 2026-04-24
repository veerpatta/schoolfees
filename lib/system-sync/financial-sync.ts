import "server-only";

import { getFeePolicySummary } from "@/lib/fees/data";
import {
  generateSessionLedgersAction,
  type LedgerGenerationResult,
} from "@/lib/fees/generator";
import { createClient } from "@/lib/supabase/server";
import { revalidateCoreFinancePaths } from "@/lib/system-sync/finance-revalidation";

type StudentClassJoin = {
  id: string;
  session_label: string;
};

type StudentSessionRow = {
  id: string;
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
  activeSession: string;
  rawStudentsInActiveSession: number;
  studentsWithFinancialRows: number;
  studentsMissingFinancialRows: number;
  studentsMissingInstallmentRows: number;
  studentsWithNoFeeSetting: number;
  studentsInInactiveOrWrongSession: number;
  classesWithoutFeeSettings: number;
  routesWithoutAnnualFees: number;
  paymentDeskReady: boolean;
  dashboardReady: boolean;
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
    reason,
    warnings,
  };
}

export async function syncStudentFinancials(payload: {
  studentIds: readonly string[];
  reason: string;
}) {
  const studentIds = [...new Set(payload.studentIds.filter(Boolean))];

  if (studentIds.length === 0) {
    revalidateCoreFinancePaths();
    return buildEmptySyncResult(payload.reason, ["No student IDs were supplied for dues sync."]);
  }

  const result = await generateSessionLedgersAction({ scopedStudentIds: studentIds });
  revalidateCoreFinancePaths(studentIds);

  return buildSyncResult(result, payload.reason);
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
      `Skipped dues sync for ${requestedSession} because the active Fee Setup session is ${policy.academicSessionLabel}. Make that session active first.`,
    );
    revalidateCoreFinancePaths();
    return buildEmptySyncResult(payload.reason, warnings);
  }

  const result = await generateSessionLedgersAction();
  revalidateCoreFinancePaths();

  return buildSyncResult(result, payload.reason, warnings);
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

  const { data: studentRowsRaw, error: studentsError } = await supabase
    .from("students")
    .select("id, status, class_id, transport_route_id, class_ref:classes(id, session_label)");

  if (studentsError) {
    throw new Error(`Unable to load sync health students: ${studentsError.message}`);
  }

  const studentRows = (studentRowsRaw ?? []) as StudentSessionRow[];
  const activeSessionStudents = studentRows.filter((row) => {
    const classRef = toSingleRecord(row.class_ref);
    return classRef?.session_label === activeSession && row.status === "active";
  });
  const activeSessionStudentIds = activeSessionStudents.map((row) => row.id);
  const activeSessionClassIds = [...new Set(activeSessionStudents.map((row) => row.class_id))];
  const activeRouteIds = [
    ...new Set(
      activeSessionStudents
        .map((row) => row.transport_route_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const [
    activeSessionClassRows,
    studentsWithFinancialRows,
    installmentRows,
    feeSettingRows,
    routesWithoutAnnualFees,
  ] = await Promise.all([
    supabase
      .from("classes")
      .select("id")
      .eq("session_label", activeSession)
      .eq("is_active", true),
    activeSessionStudentIds.length > 0
      ? getCount(
          supabase
            .from("v_workbook_student_financials")
            .select("student_id", { count: "exact", head: true })
            .in("student_id", activeSessionStudentIds),
          "students with workbook rows",
        )
      : 0,
    activeSessionStudentIds.length > 0
      ? supabase
          .from("installments")
          .select("student_id")
          .in("student_id", activeSessionStudentIds)
          .neq("status", "cancelled")
      : Promise.resolve({ data: [], error: null }),
    activeSessionClassIds.length > 0
      ? supabase
          .from("fee_settings")
          .select("class_id")
          .eq("is_active", true)
          .in("class_id", activeSessionClassIds)
      : Promise.resolve({ data: [], error: null }),
    activeRouteIds.length > 0
      ? getCount(
          supabase
            .from("transport_routes")
            .select("id", { count: "exact", head: true })
            .in("id", activeRouteIds)
            .or("annual_fee_amount.is.null,annual_fee_amount.eq.0"),
          "routes without annual fees",
        )
      : 0,
  ]);

  if ("error" in feeSettingRows && feeSettingRows.error) {
    throw new Error(`Unable to load fee settings for sync health: ${feeSettingRows.error.message}`);
  }

  if ("error" in installmentRows && installmentRows.error) {
    throw new Error(`Unable to load installment rows for sync health: ${installmentRows.error.message}`);
  }

  if (activeSessionClassRows.error) {
    throw new Error(`Unable to load classes for sync health: ${activeSessionClassRows.error.message}`);
  }

  const feeSettingClassIds = new Set(
    ((feeSettingRows.data ?? []) as Array<{ class_id: string }>).map((row) => row.class_id),
  );
  const activeClassIds = new Set(
    [
      ...((activeSessionClassRows.data ?? []) as Array<{ id: string }>).map((row) => row.id),
      ...activeSessionClassIds,
    ],
  );
  const installmentStudentIds = new Set(
    ((installmentRows.data ?? []) as Array<{ student_id: string }>).map((row) => row.student_id),
  );
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
  const studentsInInactiveOrWrongSession = studentRows.filter((row) => {
    const classRef = toSingleRecord(row.class_ref);
    return row.status === "active" && classRef?.session_label !== activeSession;
  }).length;

  return {
    activeSession,
    rawStudentsInActiveSession: activeSessionStudents.length,
    studentsWithFinancialRows,
    studentsMissingFinancialRows,
    studentsMissingInstallmentRows,
    studentsWithNoFeeSetting,
    studentsInInactiveOrWrongSession,
    classesWithoutFeeSettings: [...activeClassIds].filter((classId) => !feeSettingClassIds.has(classId)).length,
    routesWithoutAnnualFees,
    paymentDeskReady:
      activeSessionStudents.length > 0 &&
      studentsMissingInstallmentRows === 0 &&
      studentsWithNoFeeSetting === 0,
    dashboardReady:
      activeSessionStudents.length === 0 ||
      (studentsMissingFinancialRows === 0 && studentsWithNoFeeSetting === 0),
  };
}
