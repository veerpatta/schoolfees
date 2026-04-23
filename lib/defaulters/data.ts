import "server-only";

import { getWorkbookClassOptions, getWorkbookStudentFinancials } from "@/lib/workbook/data";
import { getStudentFormOptions } from "@/lib/students/data";

import type {
  DefaulterFilters,
  RouteOutstandingSummaryRow,
  DefaulterSummaryRow,
  DefaultersPageData,
} from "./types";

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

export async function getDefaultersPageData(
  filters: DefaulterFilters,
): Promise<DefaultersPageData> {
  const [{ routeOptions }, classOptions, financialRows] = await Promise.all([
    getStudentFormOptions(),
    getWorkbookClassOptions(),
    getWorkbookStudentFinancials({
      classId: filters.classId || undefined,
      onlyOverdue: filters.overdue === "overdue",
    }),
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
    },
  );

  return {
    classOptions,
    routeOptions,
    metrics,
    rows,
    routeSummaryRows,
  };
}
