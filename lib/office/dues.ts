import "server-only";

import { getFeePolicySummary } from "@/lib/fees/data";
import { getReportsPageData, normalizeReportFilters } from "@/lib/reports/data";
import type { ImportVerificationDetailRow } from "@/lib/reports/types";
import type { OfficeWorkbookView } from "@/lib/office/workbook";
import { createClient } from "@/lib/supabase/server";
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
  fromDate?: string;
  paymentMode?: string;
  routeId?: string;
  searchQuery?: string;
  sessionLabel: string;
  toDate?: string;
  exportAll?: boolean;
};

export type OfficeWorkbookCollectionRow = {
  paymentDate: string;
  paymentMode: string;
  receiptCount: number;
  studentCount: number;
  totalAmount: number;
};

export type OfficeWorkbookStudentRow = WorkbookStudentFinancial & {
  duesStatus: "generated" | "missing_dues";
  duesStatusLabel: string;
  receiptHistory: Array<{
    receiptNumber: string;
    paymentDate: string;
    totalAmount: number;
  }>;
};

type BaseOfficeStudentRow = {
  id: string;
  admission_no: string;
  full_name: string;
  date_of_birth: string | null;
  father_name: string | null;
  mother_name: string | null;
  primary_phone: string | null;
  secondary_phone: string | null;
  status: string;
  class_id: string;
  transport_route_id: string | null;
  class_ref: {
    id: string;
    session_label: string;
    class_name: string;
    section: string | null;
    stream_name: string | null;
    sort_order: number;
  } | Array<{
    id: string;
    session_label: string;
    class_name: string;
    section: string | null;
    stream_name: string | null;
    sort_order: number;
  }> | null;
  route_ref: {
    route_name: string;
    route_code: string | null;
  } | Array<{
    route_name: string;
    route_code: string | null;
  }> | null;
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
      view: "transactions" | "receipts";
      classOptions: WorkbookClassOption[];
      rows: WorkbookTransaction[];
    }
  | {
      view: "installments" | "student_dues" | "class_register" | "defaulters";
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
    }
  | {
      view: "exports";
      classOptions: WorkbookClassOption[];
    };

function toStudentRows(
  students: WorkbookStudentFinancial[],
  transactions: WorkbookTransaction[],
  generatedStudentIds?: ReadonlySet<string>,
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
    duesStatus:
      generatedStudentIds && !generatedStudentIds.has(row.studentId)
        ? "missing_dues" as const
        : "generated" as const,
    duesStatusLabel:
      generatedStudentIds && !generatedStudentIds.has(row.studentId)
        ? "Dues not prepared"
        : "Generated",
    receiptHistory: (historyMap.get(row.studentId) ?? []).slice(0, 3),
  }));
}

async function getBaseOfficeStudents(filters: OfficeWorkbookFilters) {
  const policy = await getFeePolicySummary();
  const sessionLabel = filters.sessionLabel || policy.academicSessionLabel;
  const supabase = await createClient();
  let query = supabase
    .from("students")
    .select(
      "id, admission_no, full_name, date_of_birth, father_name, mother_name, primary_phone, secondary_phone, status, class_id, transport_route_id, class_ref:classes!inner(id, session_label, status, class_name, section, stream_name, sort_order), route_ref:transport_routes(route_name, route_code)",
    )
    .eq("status", "active")
    .eq("class_ref.session_label", sessionLabel)
    .eq("class_ref.status", "active")
    .order("full_name", { ascending: true });

  if (filters.classId) {
    query = query.eq("class_id", filters.classId);
  }

  if (filters.routeId) {
    query = query.eq("transport_route_id", filters.routeId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Unable to load source students: ${error.message}`);
  }

  return ((data ?? []) as BaseOfficeStudentRow[]).map((row): WorkbookStudentFinancial => {
    const classRef = toSingleRecord(row.class_ref);
    const routeRef = toSingleRecord(row.route_ref);
    return {
      studentId: row.id,
      admissionNo: row.admission_no,
      studentName: row.full_name,
      dateOfBirth: row.date_of_birth,
      fatherName: row.father_name,
      motherName: row.mother_name,
      fatherPhone: row.primary_phone,
      motherPhone: row.secondary_phone,
      recordStatus: row.status,
      classId: row.class_id,
      sessionLabel,
      className: classRef?.class_name ?? "Unknown class",
      classLabel: classRef ? buildClassLabel(classRef) : "Unknown class",
      sortOrder: classRef?.sort_order ?? 999,
      transportRouteId: row.transport_route_id,
      transportRouteName: routeRef?.route_name ?? null,
      transportRouteCode: routeRef?.route_code ?? null,
      studentStatusCode: "existing",
      studentStatusLabel: "Old",
      tuitionFee: 0,
      transportFee: 0,
      academicFee: 0,
      otherAdjustmentHead: null,
      otherAdjustmentAmount: 0,
      grossBaseBeforeDiscount: 0,
      discountAmount: 0,
      lateFeeWaiverAmount: 0,
      lateFeeTotal: 0,
      totalDue: 0,
      totalPaid: 0,
      outstandingAmount: 0,
      nextDueDate: null,
      nextDueAmount: null,
      nextDueLabel: null,
      lastPaymentDate: null,
      inst1Pending: 0,
      inst2Pending: 0,
      inst3Pending: 0,
      inst4Pending: 0,
      statusLabel: "",
      overrideReason: null,
    };
  });
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

function filterStudentRows(rows: WorkbookStudentFinancial[], filters: OfficeWorkbookFilters) {
  const normalizedSearch = (filters.searchQuery ?? "").trim().toLowerCase();

  return rows
    .filter((row) => (filters.routeId ? row.transportRouteId === filters.routeId : true))
    .filter((row) => {
      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        row.studentName,
        row.admissionNo,
        row.fatherName ?? "",
        row.fatherPhone ?? "",
        row.motherPhone ?? "",
        row.classLabel,
        row.transportRouteName ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
}

export async function getOfficeWorkbookData(
  filters: OfficeWorkbookFilters,
): Promise<OfficeWorkbookData> {
  const classOptions = await getWorkbookClassOptions();
  const sharedFilters = {
    classId: filters.classId || undefined,
    fromDate: filters.fromDate || undefined,
    paymentMode: filters.paymentMode || undefined,
    query: filters.searchQuery || undefined,
    routeId: filters.routeId || undefined,
    sessionLabel: filters.sessionLabel || undefined,
    toDate: filters.toDate || undefined,
    limit: filters.exportAll ? null : undefined,
  };

  switch (filters.view) {
    case "transactions":
    case "receipts":
      return {
        view: filters.view,
        classOptions,
        rows: await getWorkbookTransactions(sharedFilters),
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
    case "student_dues":
    case "class_register":
    case "defaulters": {
      const [students, transactions] = await Promise.all([
        getWorkbookStudentFinancials({
          ...sharedFilters,
          onlyOverdue: filters.view === "defaulters",
        }),
        getWorkbookTransactions(sharedFilters),
      ]);
      const baseStudents =
        filters.view === "class_register" || filters.view === "student_dues"
          ? await getBaseOfficeStudents(filters)
          : [];
      const generatedStudentIds = new Set(students.map((row) => row.studentId));
      const sourceAwareStudents = [
        ...students,
        ...baseStudents.filter((row) => !generatedStudentIds.has(row.studentId)),
      ];
      const filteredRows =
        filters.view === "defaulters"
          ? students.filter((row) => row.statusLabel === "OVERDUE")
          : sourceAwareStudents;
      const visibleRows = filterStudentRows(filteredRows, filters);

      return {
        view: filters.view,
        classOptions,
        rows: toStudentRows(visibleRows, transactions, generatedStudentIds),
        summary: buildSummary(visibleRows),
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
    case "exports":
      return {
        view: filters.view,
        classOptions,
      };
    default:
      return {
        view: "transactions",
        classOptions,
        rows: await getWorkbookTransactions(sharedFilters),
      };
  }
}
