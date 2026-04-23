import "server-only";

import { getReportsPageData, normalizeReportFilters } from "@/lib/reports/data";
import type { ImportVerificationDetailRow } from "@/lib/reports/types";
import type { OfficeWorkbookView } from "@/lib/office/workbook";
import {
  getWorkbookClassOptions,
  getWorkbookStudentFinancials,
  getWorkbookTransactions,
  type WorkbookClassOption,
  type WorkbookStudentFinancial,
  type WorkbookTransaction,
} from "@/lib/workbook/data";

export type OfficeWorkbookFilters = {
  view: OfficeWorkbookView;
  classId: string;
  sessionLabel: string;
};

export type OfficeWorkbookCollectionRow = {
  paymentDate: string;
  paymentMode: string;
  receiptCount: number;
  studentCount: number;
  totalAmount: number;
};

export type OfficeWorkbookStudentRow = WorkbookStudentFinancial & {
  receiptHistory: Array<{
    receiptNumber: string;
    paymentDate: string;
    totalAmount: number;
  }>;
};

export type OfficeWorkbookSummary = {
  studentCount: number;
  totalDue: number;
  totalPaid: number;
  totalOutstanding: number;
  totalDiscount: number;
  totalLateFeeWaived: number;
  transportStudentCount: number;
  tuitionFeeTotal: number;
  transportFeeTotal: number;
  academicFeeTotal: number;
  otherAdjustmentTotal: number;
};

export type OfficeWorkbookData =
  | {
      view: "transactions" | "receipts_today";
      classOptions: WorkbookClassOption[];
      rows: WorkbookTransaction[];
    }
  | {
      view: "installments" | "statements" | "class_register" | "defaulters";
      classOptions: WorkbookClassOption[];
      rows: OfficeWorkbookStudentRow[];
      summary: OfficeWorkbookSummary;
    }
  | {
      view: "collection_today";
      classOptions: WorkbookClassOption[];
      rows: OfficeWorkbookCollectionRow[];
    }
  | {
      view: "import_issues";
      classOptions: WorkbookClassOption[];
      rows: ImportVerificationDetailRow[];
    };

function toStudentRows(
  students: WorkbookStudentFinancial[],
  transactions: WorkbookTransaction[],
) {
  const historyMap = transactions.reduce(
    (acc, row) => {
      const existing = acc.get(row.studentId) ?? [];
      existing.push({
        receiptNumber: row.receiptNumber,
        paymentDate: row.paymentDate,
        totalAmount: row.totalAmount,
      });
      acc.set(row.studentId, existing);
      return acc;
    },
    new Map<
      string,
      Array<{
        receiptNumber: string;
        paymentDate: string;
        totalAmount: number;
      }>
    >(),
  );

  return students.map((row) => ({
    ...row,
    receiptHistory: (historyMap.get(row.studentId) ?? []).slice(0, 3),
  }));
}

function buildSummary(rows: WorkbookStudentFinancial[]): OfficeWorkbookSummary {
  return rows.reduce(
    (acc, row) => {
      acc.studentCount += 1;
      acc.totalDue += row.totalDue;
      acc.totalPaid += row.totalPaid;
      acc.totalOutstanding += row.outstandingAmount;
      acc.totalDiscount += row.discountAmount;
      acc.totalLateFeeWaived += row.lateFeeWaiverAmount;
      acc.transportStudentCount += Number(Boolean(row.transportRouteId));
      acc.tuitionFeeTotal += row.tuitionFee;
      acc.transportFeeTotal += row.transportFee;
      acc.academicFeeTotal += row.academicFee;
      acc.otherAdjustmentTotal += row.otherAdjustmentAmount;
      return acc;
    },
    {
      studentCount: 0,
      totalDue: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      totalDiscount: 0,
      totalLateFeeWaived: 0,
      transportStudentCount: 0,
      tuitionFeeTotal: 0,
      transportFeeTotal: 0,
      academicFeeTotal: 0,
      otherAdjustmentTotal: 0,
    },
  );
}

function buildCollectionRows(rows: WorkbookTransaction[]) {
  const collectionMap = rows.reduce(
    (acc, row) => {
      const key = `${row.paymentDate}::${row.paymentMode}`;
      const existing = acc.get(key);

      if (existing) {
        existing.receiptCount += 1;
        existing.studentIds.add(row.studentId);
        existing.totalAmount += row.totalAmount;
        return acc;
      }

      acc.set(key, {
        paymentDate: row.paymentDate,
        paymentMode:
          row.paymentMode === "upi"
            ? "UPI"
            : row.paymentMode === "bank_transfer"
              ? "Bank transfer"
              : row.paymentMode === "cheque"
                ? "Cheque"
                : "Cash",
        receiptCount: 1,
        studentIds: new Set<string>([row.studentId]),
        totalAmount: row.totalAmount,
      });
      return acc;
    },
    new Map<
      string,
      {
        paymentDate: string;
        paymentMode: string;
        receiptCount: number;
        studentIds: Set<string>;
        totalAmount: number;
      }
    >(),
  );

  return Array.from(collectionMap.values())
    .map((row) => ({
      paymentDate: row.paymentDate,
      paymentMode: row.paymentMode,
      receiptCount: row.receiptCount,
      studentCount: row.studentIds.size,
      totalAmount: row.totalAmount,
    }))
    .sort((left, right) => {
      if (left.paymentDate !== right.paymentDate) {
        return right.paymentDate.localeCompare(left.paymentDate);
      }

      return left.paymentMode.localeCompare(right.paymentMode);
    });
}

export async function getOfficeWorkbookData(
  filters: OfficeWorkbookFilters,
): Promise<OfficeWorkbookData> {
  const classOptions = await getWorkbookClassOptions();
  const sharedFilters = {
    classId: filters.classId || undefined,
    sessionLabel: filters.sessionLabel || undefined,
  };

  switch (filters.view) {
    case "transactions":
      return {
        view: filters.view,
        classOptions,
        rows: await getWorkbookTransactions(sharedFilters),
      };
    case "receipts_today":
      return {
        view: filters.view,
        classOptions,
        rows: await getWorkbookTransactions({
          ...sharedFilters,
          todayOnly: true,
        }),
      };
    case "collection_today":
      return {
        view: filters.view,
        classOptions,
        rows: buildCollectionRows(
          await getWorkbookTransactions({
            ...sharedFilters,
            todayOnly: true,
          }),
        ),
      };
    case "installments":
    case "statements":
    case "class_register":
    case "defaulters": {
      const [students, transactions] = await Promise.all([
        getWorkbookStudentFinancials({
          ...sharedFilters,
          onlyOverdue: filters.view === "defaulters",
        }),
        getWorkbookTransactions(sharedFilters),
      ]);
      const filteredRows =
        filters.view === "defaulters"
          ? students.filter((row) => row.statusLabel === "OVERDUE")
          : students;

      return {
        view: filters.view,
        classOptions,
        rows: toStudentRows(filteredRows, transactions),
        summary: buildSummary(filteredRows),
      };
    }
    case "import_issues": {
      const reportData = await getReportsPageData(
        normalizeReportFilters({
          report: "import-verification",
          classId: filters.classId,
          sessionLabel: filters.sessionLabel,
        }),
      );

      return {
        view: filters.view,
        classOptions,
        rows:
          reportData.report.key === "import-verification"
            ? reportData.report.detailRows.filter(
                (row) =>
                  row.errors.length > 0 ||
                  row.warnings.length > 0 ||
                  row.status !== "imported",
              )
            : [],
      };
    }
    default:
      return {
        view: "transactions",
        classOptions,
        rows: await getWorkbookTransactions(sharedFilters),
      };
  }
}
