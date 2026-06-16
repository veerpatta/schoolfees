import "server-only";

import { getFeePolicySummary } from "@/lib/fees/data";
import { calculateDaysOverdue, calculateOverdueBaseAmount } from "@/lib/fees/due-amounts";
import { createClient } from "@/lib/supabase/server";
import { cacheSafeUnstableCache, getCacheSafeClient } from "@/lib/supabase/cache-safe";
import { getWorkbookClassOptions, getWorkbookInstallmentRows, getWorkbookStudentFinancials } from "@/lib/workbook/data";
import { getStudentFormOptions } from "@/lib/students/data";
import { heatScore, type DefaulterContactSummary } from "@/lib/defaulters/cadence";
import { classifyPaymentBehavior } from "@/lib/defaulters/behavior";
import {
  getContactSummariesForStudents,
  getNoCallFlags,
  getPromiseReliabilityForStudents,
  refreshDefaulterRecoveryState,
} from "@/lib/defaulters/contacts";
import { resolvePromiseStatus } from "@/lib/defaulters/promise-lifecycle";
import { isCarryForwardInstallment } from "@/lib/prev-year-dues/display";

import type {
  DefaulterFilters,
  DefaultersPagination,
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
  // Scope by session (not a giant student_id IN list — that would overflow the
  // request URL for large defaulter sets) and filter to the candidate set in
  // memory. visibleSiblingCount then means "siblings also in the defaulter list".
  const wanted = new Set(studentIds);
  const { data, error } = await supabase
    .from("student_family_members")
    .select("student_id, family_group_id")
    .eq("academic_session_label", sessionLabel);

  if (error || !data) {
    return new Map<string, { familyGroupId: string; visibleSiblingCount: number }>();
  }

  const rows = (data as FamilyMemberRow[]).filter((row) => wanted.has(row.student_id));
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

function buildPagination(totalRows: number, page: number, pageSize: number, visibleCount: number): DefaultersPagination {
  const visibleStart = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const visibleEnd = totalRows === 0 ? 0 : visibleStart + visibleCount - 1;

  return {
    page,
    pageSize,
    totalRows,
    visibleStart,
    visibleEnd,
    hasPreviousPage: page > 1,
    hasNextPage: visibleEnd < totalRows,
  };
}

export async function getDefaultersPageData(
  filters: DefaulterFilters,
  sessionLabel?: string,
  pagination?: { page?: number; pageSize?: number },
  options?: {
    redactPaymentHistory?: boolean;
    /** Optional pre-fetched contact summaries (heat score uses these). */
    contactSummaries?: Map<string, DefaulterContactSummary>;
  },
): Promise<DefaultersPageData> {
  const _t0 = Date.now();
  const redactPaymentHistory = options?.redactPaymentHistory === true;
  const policy = await getFeePolicySummary();
  const resolvedSessionLabel = sessionLabel ?? policy.academicSessionLabel;
  void pagination; // pagination is now handled client-side; kept for signature stability.
  const [{ routeOptions }, classOptions, financialRows, overdueInstallmentRows, allInstallmentRows, activeStudents] =
    await Promise.all([
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
      // All installments (incl. paid) — drives within-session payment-timing
      // for the behavior classifier. Same broad-fetch-then-bucket pattern as
      // overdue rows above.
      getWorkbookInstallmentRows({
        classId: filters.classId || undefined,
        sessionLabel: resolvedSessionLabel,
      }),
      getActiveSessionStudents(filters, resolvedSessionLabel),
    ]);

  // Per-student paid-installment timing: on-time when the installment was fully
  // cleared on or before its due date. Used only for behavior classification.
  const paymentTimingByStudent = new Map<string, { onTime: number; late: number }>();
  // Pending previous-year carry-forward balance per student. Drives the "Old
  // balance" chip and the previous-year-dues filter. Carried over from
  // allInstallmentRows (which includes paid rows) so we can read the live
  // pending amount.
  const prevYearDuesByStudent = new Map<string, number>();
  for (const inst of allInstallmentRows) {
    if (isCarryForwardInstallment(inst) && inst.pendingAmount > 0) {
      prevYearDuesByStudent.set(
        inst.studentId,
        (prevYearDuesByStudent.get(inst.studentId) ?? 0) + inst.pendingAmount,
      );
    }
    if (inst.balanceStatus !== "paid") continue;
    const bucket = paymentTimingByStudent.get(inst.studentId) ?? { onTime: 0, late: 0 };
    const paidOnTime = !inst.lastPaymentDate || inst.lastPaymentDate <= inst.dueDate;
    if (paidOnTime) bucket.onTime += 1;
    else bucket.late += 1;
    paymentTimingByStudent.set(inst.studentId, bucket);
  }

  const minimumPendingAmount = parseMinimumPendingAmount(filters.minPendingAmount);
  const normalizedSearch = (filters.searchQuery ?? "").trim().toLowerCase();
  const today = toDateKey();
  const todayDate = new Date(`${today}T12:00:00+05:30`);
  const overdueRowsByStudent = new Map<string, typeof overdueInstallmentRows>();
  overdueInstallmentRows
    .filter((row) => (filters.transportRouteId ? row.transportRouteId === filters.transportRouteId : true))
    .forEach((row) => {
      overdueRowsByStudent.set(row.studentId, [
        ...(overdueRowsByStudent.get(row.studentId) ?? []),
        row,
      ]);
    });

  // 1) Filter the financial rows down to the full candidate defaulter set.
  const baseRows = financialRows
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
    .filter((row) =>
      filters.prevYearDues === "prevYear" ? (prevYearDuesByStudent.get(row.studentId) ?? 0) > 0 : true,
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
    });

  // 2) Contact summaries, no-call flags, and family — for the WHOLE candidate
  //    set, so heat, behavior segments, and the No-call tab are list-wide (not
  //    just the visible page). Summaries are fetched here when not supplied so
  //    the page needs a single pass.
  const candidateIds = baseRows.map((row) => row.studentId);
  if (candidateIds.length > 0) {
    await refreshDefaulterRecoveryState(resolvedSessionLabel);
  }
  const [contactSummaries, familyMembership, noCallFlags, promiseReliability] =
    await Promise.all([
    options?.contactSummaries
      ? Promise.resolve(options.contactSummaries)
      : candidateIds.length > 0
        ? getContactSummariesForStudents(candidateIds, resolvedSessionLabel)
        : Promise.resolve(new Map<string, DefaulterContactSummary>()),
    candidateIds.length > 0
      ? loadDefaulterFamilyMembers(candidateIds, resolvedSessionLabel)
      : Promise.resolve(new Map<string, { familyGroupId: string; visibleSiblingCount: number }>()),
    candidateIds.length > 0
      ? getNoCallFlags(candidateIds, resolvedSessionLabel)
      : Promise.resolve(new Map<string, { noCall: boolean; reason: string | null }>()),
    candidateIds.length > 0
      ? getPromiseReliabilityForStudents(candidateIds, resolvedSessionLabel)
      : Promise.resolve(
          new Map<
            string,
            {
              promiseKeptRate: number | null;
              promiseKeptCount: number;
              promiseBrokenCount: number;
            }
          >(),
        ),
  ]);

  // 3) Enrich every candidate (heat, behavior, promise status, no-call, family),
  //    sort by heat, then rank.
  const rows = baseRows
    .map((row) => {
      const daysOverdue = calculateDaysOverdue(row.nextDueDate, today);
      const overdueAmount = calculateOverdueBaseAmount(overdueRowsByStudent.get(row.studentId) ?? []);
      const defaulterScore = row.outstandingAmount + overdueAmount + daysOverdue * 100;
      const summary = contactSummaries.get(row.studentId) ?? null;
      const heat = heatScore({
        totalPending: row.outstandingAmount,
        daysOverdue,
        today: todayDate,
        contact: summary,
      });
      const lastPaymentDate = redactPaymentHistory ? null : row.lastPaymentDate;
      const timing = paymentTimingByStudent.get(row.studentId) ?? { onTime: 0, late: 0 };
      // Use the redacted value so a no-payments-view user can't infer payment
      // activity from a "Kept promise" chip.
      const promiseStatus = resolvePromiseStatus({ summary, lastPaymentDate, today });
      const family = familyMembership.get(row.studentId);
      const reliability = promiseReliability.get(row.studentId);

      return {
        studentId: row.studentId,
        classId: row.classId,
        admissionNo: row.admissionNo,
        fullName: row.studentName,
        fatherName: row.fatherName,
        fatherPhone: row.fatherPhone,
        motherPhone: row.motherPhone,
        classLabel: row.classLabel,
        studentStatusLabel: row.studentStatusLabel,
        transportRouteId: row.transportRouteId,
        transportRouteLabel: row.transportRouteName ?? "No Transport",
        totalDue: row.baseChargeTotal,
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
        lastPaymentDate,
        followUpStatus: overdueAmount > 0 ? "overdue" : "pending",
        daysOverdue,
        defaulterScore,
        heat,
        rank: 0,
        paymentBehavior: classifyPaymentBehavior({
          installmentsPaidOnTime: timing.onTime,
          installmentsPaidLate: timing.late,
          overdueInstallmentCount: row.overdueInstallmentCount,
          daysOverdue,
          noAnswerStreak: summary?.noAnswerStreak ?? 0,
          brokenPromise: promiseStatus === "broken",
        }),
        promiseStatus,
        noCall: noCallFlags.get(row.studentId)?.noCall ?? false,
        familyGroupId: family?.familyGroupId ?? null,
        familyVisibleSiblingCount: family?.visibleSiblingCount ?? 0,
        promiseKeptRate: reliability?.promiseKeptRate ?? null,
        promiseKeptCount: reliability?.promiseKeptCount ?? 0,
        promiseBrokenCount: reliability?.promiseBrokenCount ?? 0,
        prevYearDuesAmount: prevYearDuesByStudent.get(row.studentId) ?? 0,
      } satisfies DefaulterSummaryRow;
    })
    .sort((left, right) => {
      // Primary: heat score (uses contact log). Falls back to defaulterScore.
      if (right.heat !== left.heat) {
        return right.heat - left.heat;
      }

      if (right.defaulterScore !== left.defaulterScore) {
        return right.defaulterScore - left.defaulterScore;
      }

      if (right.totalPending !== left.totalPending) {
        return right.totalPending - left.totalPending;
      }

      return left.fullName.localeCompare(right.fullName);
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));

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

  const result = {
    classOptions,
    routeOptions,
    metrics,
    rows,
    // The full filtered list is returned in one shot; the workspace paginates
    // client-side so cadence/behavior/no-call filters stay list-wide + instant.
    pagination: buildPagination(rows.length, 1, Math.max(rows.length, 1), rows.length),
    missingDuesRows,
    routeSummaryRows,
    contactSummaries,
  };
  console.log(`[defaulters-page-data] loaded ${rows.length} rows in ${Date.now() - _t0}ms`);
  return result;
}

/**
 * Audit 1.7 — Returns every defaulter row that matches the supplied filters,
 * without pagination, so the "Download this view" button on the Defaulters
 * page exports exactly what's on screen. Sorted by outstanding-then-name so
 * spreadsheets are deterministic.
 *
 * The returned row shape is intentionally narrower than the page-data row —
 * we don't need heat, contact summaries, or family rollups in the XLSX.
 */
export type DefaulterExportRow = {
  studentId: string;
  admissionNo: string;
  fullName: string;
  classLabel: string;
  fatherName: string | null;
  fatherPhone: string | null;
  motherPhone: string | null;
  transportRouteLabel: string;
  totalPending: number;
  overdueAmount: number;
  lateFeeTotal: number;
  nextDueDate: string | null;
  nextDueAmount: number;
  statusLabel: string;
  daysOverdue: number;
};

export async function getDefaulterExportRows(
  filters: DefaulterFilters,
  sessionLabel?: string,
): Promise<DefaulterExportRow[]> {
  const policy = await getFeePolicySummary();
  const resolvedSessionLabel = sessionLabel ?? policy.academicSessionLabel;

  const [financialRows, overdueInstallmentRows, prevYearDuesRows] = await Promise.all([
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
    // Only needed to honour the previous-year-dues filter so the export matches
    // the on-screen list; skip the round-trip otherwise.
    filters.prevYearDues === "prevYear"
      ? getWorkbookInstallmentRows({
          classId: filters.classId || undefined,
          pendingOnly: true,
          sessionLabel: resolvedSessionLabel,
        })
      : Promise.resolve([]),
  ]);

  const prevYearDuesStudentIds = new Set(
    prevYearDuesRows
      .filter((row) => isCarryForwardInstallment(row) && row.pendingAmount > 0)
      .map((row) => row.studentId),
  );

  const minimumPendingAmount = parseMinimumPendingAmount(filters.minPendingAmount);
  const normalizedSearch = (filters.searchQuery ?? "").trim().toLowerCase();
  const today = toDateKey();
  const overdueByStudent = new Map<string, typeof overdueInstallmentRows>();
  overdueInstallmentRows
    .filter((row) => (filters.transportRouteId ? row.transportRouteId === filters.transportRouteId : true))
    .forEach((row) => {
      overdueByStudent.set(row.studentId, [
        ...(overdueByStudent.get(row.studentId) ?? []),
        row,
      ]);
    });

  return financialRows
    .filter((row) =>
      filters.transportRouteId ? row.transportRouteId === filters.transportRouteId : true,
    )
    .filter((row) => row.outstandingAmount > 0)
    .filter((row) => row.outstandingAmount >= minimumPendingAmount)
    .filter((row) =>
      filters.overdue === "overdue"
        ? calculateOverdueBaseAmount(overdueByStudent.get(row.studentId) ?? []) > 0
        : true,
    )
    .filter((row) =>
      filters.prevYearDues === "prevYear" ? prevYearDuesStudentIds.has(row.studentId) : true,
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
    .map((row) => ({
      studentId: row.studentId,
      admissionNo: row.admissionNo,
      fullName: row.studentName,
      classLabel: row.classLabel,
      fatherName: row.fatherName,
      fatherPhone: row.fatherPhone,
      motherPhone: row.motherPhone,
      transportRouteLabel: row.transportRouteName ?? "No Transport",
      totalPending: row.outstandingAmount,
      overdueAmount: calculateOverdueBaseAmount(overdueByStudent.get(row.studentId) ?? []),
      lateFeeTotal: row.lateFeeTotal,
      nextDueDate: row.nextDueDate ?? null,
      nextDueAmount: row.nextDueAmount ?? 0,
      statusLabel: row.statusLabel,
      daysOverdue: calculateDaysOverdue(row.nextDueDate, today),
    }))
    .sort((left, right) => {
      if (right.totalPending !== left.totalPending) {
        return right.totalPending - left.totalPending;
      }
      return left.fullName.localeCompare(right.fullName);
    });
}
