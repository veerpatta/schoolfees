import "server-only";

import { getFeePolicySummary } from "@/lib/fees/data";
import { calculateOverdueBaseAmount } from "@/lib/fees/due-amounts";
import { createClient } from "@/lib/supabase/server";
import { cacheSafeUnstableCache, getCacheSafeClient } from "@/lib/supabase/cache-safe";
import { getWorkbookClassOptions, getWorkbookInstallmentRows, getWorkbookStudentFinancials } from "@/lib/workbook/data";
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
  class_id: string | null;
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

type FamilyMemberRow = {
  student_id: string;
  family_group_id: string;
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

function toDateKey() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function calculateDaysOverdue(dueDate: string | null, today: string) {
  if (!dueDate || dueDate >= today) {
    return 0;
  }

  const due = new Date(`${dueDate}T00:00:00+05:30`).getTime();
  const now = new Date(`${today}T00:00:00+05:30`).getTime();
  return Math.max(0, Math.floor((now - due) / 86_400_000));
}

async function getActiveSessionStudentsUncached(filters: DefaulterFilters, sessionLabel: string) {
  const supabase = await getCacheSafeClient();
  let query = supabase
    .from("students")
    .select(
      "id, class_id, admission_no, full_name, father_name, primary_phone, transport_route_id, class_ref:classes!inner(session_label, status, class_name, section, stream_name), route_ref:transport_routes(route_name, route_code)",
    )
    .eq("status", "active")
    .eq("class_ref.session_label", sessionLabel)
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
        classId: row.class_id,
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

async function getActiveSessionStudents(filters: DefaulterFilters, sessionLabel: string) {
  return cacheSafeUnstableCache(
    async () => getActiveSessionStudentsUncached(filters, sessionLabel),
    [
      "defaulters-active-students",
      sessionLabel,
      filters.classId,
      filters.transportRouteId,
    ],
    { tags: [`session:${sessionLabel}`] },
  )();
}

async function loadDefaulterFamilyMembers(studentIds: string[], sessionLabel: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_family_members")
    .select("student_id, family_group_id")
    .in("student_id", studentIds)
    .eq("academic_session_label", sessionLabel);

  if (error || !data) {
    return new Map<string, { familyGroupId: string; visibleSiblingCount: number }>();
  }

  const rows = data as FamilyMemberRow[];
  const visibleByFamily = new Map<string, number>();

  rows.forEach((row) => {
    visibleByFamily.set(row.family_group_id, (visibleByFamily.get(row.family_group_id) ?? 0) + 1);
  });

  return new Map(
    rows.map((row) => [
      row.student_id,
      {
        familyGroupId: row.family_group_id,
        visibleSiblingCount: Math.max((visibleByFamily.get(row.family_group_id) ?? 1) - 1, 0),
      },
    ]),
  );
}

export async function getDefaultersPageData(
  filters: DefaulterFilters,
  sessionLabel?: string,
): Promise<DefaultersPageData> {
  const policy = await getFeePolicySummary();
  const resolvedSessionLabel = sessionLabel ?? policy.academicSessionLabel;
  const [{ routeOptions }, classOptions, financialRows, overdueInstallmentRows, activeStudents] = await Promise.all([
    getStudentFormOptions({ sessionLabel: resolvedSessionLabel }),
    getWorkbookClassOptions(resolvedSessionLabel),
    getWorkbookStudentFinancials({
      classId: filters.classId || undefined,
      sessionLabel: resolvedSessionLabel,
    }),
    getWorkbookInstallmentRows({
      classId: filters.classId || undefined,
      overdueOnly: true,
      pendingOnly: true,
      sessionLabel: resolvedSessionLabel,
    }),
    getActiveSessionStudents(filters, resolvedSessionLabel),
  ]);

  const minimumPendingAmount = parseMinimumPendingAmount(filters.minPendingAmount);
  const normalizedSearch = (filters.searchQuery ?? "").trim().toLowerCase();
  const today = toDateKey();
  const overdueRowsByStudent = new Map<string, typeof overdueInstallmentRows>();
  overdueInstallmentRows
    .filter((row) => (filters.transportRouteId ? row.transportRouteId === filters.transportRouteId : true))
    .forEach((row) => {
      overdueRowsByStudent.set(row.studentId, [
        ...(overdueRowsByStudent.get(row.studentId) ?? []),
        row,
      ]);
    });

  const rows = financialRows
    .filter((row) =>
      filters.transportRouteId ? row.transportRouteId === filters.transportRouteId : true,
    )
    .filter((row) => row.outstandingAmount > 0)
    .filter((row) => row.outstandingAmount >= minimumPendingAmount)
    .filter((row) =>
      filters.overdue === "overdue"
        ? calculateOverdueBaseAmount(overdueRowsByStudent.get(row.studentId) ?? []) > 0
        : true,
    )
    .filter((row) => {
      if (!normalizedSearch) {
        return true;
      }

      return [
        row.studentName,
        row.admissionNo,
        row.fatherName ?? "",
        row.fatherPhone ?? "",
        row.classLabel,
      ].some((value) => value.toLowerCase().includes(normalizedSearch));
    })
    .map(
      (row) => {
        const daysOverdue = calculateDaysOverdue(row.nextDueDate, today);
        const overdueAmount = calculateOverdueBaseAmount(overdueRowsByStudent.get(row.studentId) ?? []);
        const defaulterScore = row.outstandingAmount + overdueAmount + daysOverdue * 100;

        return {
          studentId: row.studentId,
          classId: row.classId,
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
          overdueAmount,
          lateFee: row.lateFeeTotal,
          discountApplied: row.discountAmount,
          lateFeeWaived: row.lateFeeWaiverAmount,
          overdueInstallments: row.overdueInstallmentCount,
          openInstallments:
            Number(row.inst1Pending > 0) +
            Number(row.inst2Pending > 0) +
            Number(row.inst3Pending > 0) +
            Number(row.inst4Pending > 0),
          nextDueAmount: row.nextDueAmount,
          oldestDueDate: row.nextDueDate,
          nextDueDate: row.nextDueDate,
          lastPaymentDate: row.lastPaymentDate,
          followUpStatus: overdueAmount > 0 ? "overdue" : "pending",
          daysOverdue,
          defaulterScore,
          rank: 0,
        } satisfies DefaulterSummaryRow;
      },
    )
    .sort((left, right) => {
      if (right.defaulterScore !== left.defaulterScore) {
        return right.defaulterScore - left.defaulterScore;
      }

      if (right.totalPending !== left.totalPending) {
        return right.totalPending - left.totalPending;
      }

      return left.fullName.localeCompare(right.fullName);
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const familyMembership =
    rows.length > 0
      ? await loadDefaulterFamilyMembers(
          rows.map((row) => row.studentId),
          resolvedSessionLabel,
        )
      : new Map<string, { familyGroupId: string; visibleSiblingCount: number }>();
  const rowsWithFamilies = rows.map((row) => {
    const family = familyMembership.get(row.studentId);

    return {
      ...row,
      familyGroupId: family?.familyGroupId ?? null,
      familyVisibleSiblingCount: family?.visibleSiblingCount ?? 0,
    };
  });

  const generatedStudentIds = new Set(financialRows.map((row) => row.studentId));
  const missingDuesRows = activeStudents.filter(
    (row) => !generatedStudentIds.has(row.studentId),
  );

  const routeSummaryMap = new Map<string, RouteOutstandingSummaryRow>();

  rowsWithFamilies.forEach((row) => {
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

  const metrics = rowsWithFamilies.reduce(
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
    rows: rowsWithFamilies,
    missingDuesRows,
    routeSummaryRows,
  };
}
