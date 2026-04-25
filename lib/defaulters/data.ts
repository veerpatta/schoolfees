import "server-only";

import { getFeePolicySummary } from "@/lib/fees/data";
import { createClient } from "@/lib/supabase/server";
import { getWorkbookClassOptions, getWorkbookStudentFinancials } from "@/lib/workbook/data";
import { getStudentFormOptions } from "@/lib/students/data";

import type {
  DefaulterFilters,
  MissingDuesWarningRow,
  RouteOutstandingSummaryRow,
  DefaulterSummaryRow,
  DefaultersPageData,
} from "./types";

type BaseDefaulterStudentRow = {
  id: string;
  admission_no: string;
  full_name: string;
  father_name: string | null;
  primary_phone: string | null;
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
  route_ref:
    | {
        route_name: string;
        route_code: string | null;
      }
    | Array<{
        route_name: string;
        route_code: string | null;
      }>
    | null;
};

function toSingleRecord<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
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

function buildRouteLabel(value: { route_name: string; route_code: string | null } | null) {
  if (!value) {
    return "No Transport";
  }

  return value.route_code ? `${value.route_name} (${value.route_code})` : value.route_name;
}

function parseMinimumPendingAmount(value: string) {
  if (!value.trim()) {
    return 0;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.floor(parsed);
}

async function getActiveSessionStudents(filters: DefaulterFilters) {
  const supabase = await createClient();
  const policy = await getFeePolicySummary();
  let query = supabase
    .from("students")
    .select(
      "id, admission_no, full_name, father_name, primary_phone, transport_route_id, class_ref:classes!inner(session_label, status, class_name, section, stream_name), route_ref:transport_routes(route_name, route_code)",
    )
    .eq("status", "active")
    .eq("class_ref.session_label", policy.academicSessionLabel)
    .eq("class_ref.status", "active")
    .order("full_name", { ascending: true });

  if (filters.classId) {
    query = query.eq("class_id", filters.classId);
  }

  if (filters.transportRouteId) {
    query = query.eq("transport_route_id", filters.transportRouteId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Unable to load active students for defaulters: ${error.message}`);
  }

  return ((data ?? []) as BaseDefaulterStudentRow[]).flatMap((row): MissingDuesWarningRow[] => {
    const classRef = toSingleRecord(row.class_ref);
    const routeRef = toSingleRecord(row.route_ref);

    if (!classRef) {
      return [];
    }

    return [
      {
        studentId: row.id,
        admissionNo: row.admission_no,
        fullName: row.full_name,
        fatherName: row.father_name,
        fatherPhone: row.primary_phone,
        classLabel: buildClassLabel(classRef),
        transportRouteId: row.transport_route_id,
        transportRouteLabel: buildRouteLabel(routeRef),
      },
    ];
  });
}

export async function getDefaultersPageData(
  filters: DefaulterFilters,
): Promise<DefaultersPageData> {
  const [{ routeOptions }, classOptions, financialRows, activeStudents] = await Promise.all([
    getStudentFormOptions(),
    getWorkbookClassOptions(),
    getWorkbookStudentFinancials({
      classId: filters.classId || undefined,
    }),
    getActiveSessionStudents(filters),
  ]);

  const minimumPendingAmount = parseMinimumPendingAmount(filters.minPendingAmount);

  const rows = financialRows
    .filter((row) =>
      filters.transportRouteId ? row.transportRouteId === filters.transportRouteId : true,
    )
    .filter((row) => row.outstandingAmount > 0)
    .filter((row) => row.outstandingAmount >= minimumPendingAmount)
    .filter((row) => (filters.overdue === "overdue" ? row.statusLabel === "OVERDUE" : true))
    .map(
      (row) =>
        ({
          studentId: row.studentId,
          admissionNo: row.admissionNo,
          fullName: row.studentName,
          fatherName: row.fatherName,
          fatherPhone: row.fatherPhone,
          classLabel: row.classLabel,
          studentStatusLabel: row.studentStatusLabel,
          transportRouteId: row.transportRouteId,
          transportRouteLabel: row.transportRouteName ?? "No Transport",
          totalDue: row.totalDue,
          totalPaid: row.totalPaid,
          totalPending: row.outstandingAmount,
          lateFee: row.lateFeeTotal,
          discountApplied: row.discountAmount,
          lateFeeWaived: row.lateFeeWaiverAmount,
          overdueInstallments:
            Number(row.inst1Pending > 0 && row.statusLabel === "OVERDUE") +
            Number(row.inst2Pending > 0 && row.statusLabel === "OVERDUE") +
            Number(row.inst3Pending > 0 && row.statusLabel === "OVERDUE") +
            Number(row.inst4Pending > 0 && row.statusLabel === "OVERDUE"),
          openInstallments:
            Number(row.inst1Pending > 0) +
            Number(row.inst2Pending > 0) +
            Number(row.inst3Pending > 0) +
            Number(row.inst4Pending > 0),
          nextDueAmount: row.nextDueAmount,
          oldestDueDate: row.nextDueDate,
          nextDueDate: row.nextDueDate,
          lastPaymentDate: row.lastPaymentDate,
          followUpStatus: row.statusLabel === "OVERDUE" ? "overdue" : "pending",
        }) satisfies DefaulterSummaryRow,
    )
    .sort((left, right) => {
      if (right.overdueInstallments !== left.overdueInstallments) {
        return right.overdueInstallments - left.overdueInstallments;
      }

      if (right.totalPending !== left.totalPending) {
        return right.totalPending - left.totalPending;
      }

      return left.fullName.localeCompare(right.fullName);
    });

  const generatedStudentIds = new Set(financialRows.map((row) => row.studentId));
  const missingDuesRows = activeStudents.filter(
    (row) => !generatedStudentIds.has(row.studentId),
  );

  const routeSummaryMap = new Map<string, RouteOutstandingSummaryRow>();

  rows.forEach((row) => {
    const routeKey = row.transportRouteId ?? `label::${row.transportRouteLabel}`;
    const existing = routeSummaryMap.get(routeKey);

    if (existing) {
      existing.studentCount += 1;
      existing.totalPending += row.totalPending;
      existing.overdueInstallments += row.overdueInstallments;
      existing.openInstallments += row.openInstallments;

      if (!existing.oldestDueDate || (row.oldestDueDate && row.oldestDueDate < existing.oldestDueDate)) {
        existing.oldestDueDate = row.oldestDueDate;
      }

      return;
    }

    routeSummaryMap.set(routeKey, {
      routeId: row.transportRouteId,
      routeLabel: row.transportRouteLabel,
      studentCount: 1,
      totalPending: row.totalPending,
      overdueInstallments: row.overdueInstallments,
      openInstallments: row.openInstallments,
      oldestDueDate: row.oldestDueDate,
    });
  });

  const routeSummaryRows = Array.from(routeSummaryMap.values()).sort((left, right) => {
    if (right.totalPending !== left.totalPending) {
      return right.totalPending - left.totalPending;
    }

    return left.routeLabel.localeCompare(right.routeLabel);
  });

  const metrics = rows.reduce(
    (acc, row) => {
      acc.totalStudents += 1;
      acc.totalPending += row.totalPending;
      acc.overdueInstallments += row.overdueInstallments;
      acc.openInstallments += row.openInstallments;
      return acc;
    },
    {
      totalStudents: 0,
      totalPending: 0,
      overdueInstallments: 0,
      openInstallments: 0,
      missingDuesStudents: missingDuesRows.length,
    },
  );

  return {
    classOptions,
    routeOptions,
    metrics,
    rows,
    missingDuesRows,
    routeSummaryRows,
  };
}
