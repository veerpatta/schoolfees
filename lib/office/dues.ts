import "server-only";

import { getDefaultersPageData } from "@/lib/defaulters/data";
import { getReportsPageData, normalizeReportFilters } from "@/lib/reports/data";
import type { ReportFilters } from "@/lib/reports/types";
import { getStudentFormOptions } from "@/lib/students/data";

export const officeWorkbookViews = [
  "transactions",
  "installments",
  "statements",
  "defaulters",
  "receipts_today",
  "collection_today",
  "import_issues",
] as const;

export type OfficeWorkbookView = (typeof officeWorkbookViews)[number];

export type OfficeWorkbookFilters = {
  view: OfficeWorkbookView;
  classId: string;
  sessionLabel: string;
};

export function normalizeOfficeWorkbookView(value: string | undefined | null): OfficeWorkbookView {
  const normalized = (value ?? "").trim();
  return officeWorkbookViews.includes(normalized as OfficeWorkbookView)
    ? (normalized as OfficeWorkbookView)
    : "transactions";
}

function todayStamp(referenceDate = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referenceDate);
}

function toReportFilters(
  base: Partial<ReportFilters>,
  overrides: Partial<ReportFilters>,
): ReportFilters {
  return {
    ...normalizeReportFilters(undefined),
    ...base,
    ...overrides,
  };
}

export async function getOfficeWorkbookData(filters: OfficeWorkbookFilters) {
  const { classOptions } = await getStudentFormOptions();
  const today = todayStamp();

  switch (filters.view) {
    case "transactions":
      return {
        view: filters.view,
        classOptions,
        data: await getReportsPageData(
          toReportFilters(
            {
              report: "receipt-register",
              classId: filters.classId,
              sessionLabel: filters.sessionLabel,
            },
            {},
          ),
        ),
      };
    case "installments":
      return {
        view: filters.view,
        classOptions,
        data: await getReportsPageData(
          toReportFilters(
            {
              report: "outstanding",
              classId: filters.classId,
              sessionLabel: filters.sessionLabel,
            },
            {},
          ),
        ),
      };
    case "statements":
      return {
        view: filters.view,
        classOptions,
        data: await getDefaultersPageData({
          classId: filters.classId,
          transportRouteId: "",
          overdue: "",
          minPendingAmount: "",
        }),
      };
    case "defaulters":
      return {
        view: filters.view,
        classOptions,
        data: await getDefaultersPageData({
          classId: filters.classId,
          transportRouteId: "",
          overdue: "overdue",
          minPendingAmount: "",
        }),
      };
    case "receipts_today":
      return {
        view: filters.view,
        classOptions,
        data: await getReportsPageData(
          toReportFilters(
            {
              report: "receipt-register",
              classId: filters.classId,
              sessionLabel: filters.sessionLabel,
            },
            {
              fromDate: today,
              toDate: today,
            },
          ),
        ),
      };
    case "collection_today":
      return {
        view: filters.view,
        classOptions,
        data: await getReportsPageData(
          toReportFilters(
            {
              report: "daily-collection",
              classId: filters.classId,
              sessionLabel: filters.sessionLabel,
            },
            {
              fromDate: today,
              toDate: today,
            },
          ),
        ),
      };
    case "import_issues":
      return {
        view: filters.view,
        classOptions,
        data: await getReportsPageData(
          toReportFilters(
            {
              report: "import-verification",
              classId: filters.classId,
              sessionLabel: filters.sessionLabel,
            },
            {},
          ),
        ),
      };
    default:
      return {
        view: "transactions" as const,
        classOptions,
        data: await getReportsPageData(
          toReportFilters(
            {
              report: "receipt-register",
              classId: filters.classId,
              sessionLabel: filters.sessionLabel,
            },
            {},
          ),
        ),
      };
  }
}
