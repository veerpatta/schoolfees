import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getStudentFormOptions } from "@/lib/students/data";
import { formatPaymentModeLabel } from "@/lib/config/fee-rules";
import { getFeePolicySummary } from "@/lib/fees/data";

import type {
  AdjustmentType,
  ImportBatchStatus,
  ImportRowStatus,
  PaymentMode,
} from "@/lib/db/types";
import type { StudentClassOption } from "@/lib/students/types";

import {
  EMPTY_REPORT_FILTERS,
  reportDefinitions,
  reportKeys,
  type ReportBatchOption,
  type ReportCsvData,
  type ReportData,
  type ReportFilters,
  type ReportKey,
  type ReportsPageData,
  type ReportStudentOption,
  type ImportVerificationBatchRow,
  type ImportVerificationDetailRow,
  type OutstandingReportData,
  type OutstandingReportRow,
  type DailyCollectionReportData,
  type StudentLedgerReportData,
  type StudentLedgerReportEntryRow,
  type ReceiptRegisterReportData,
  type ReceiptRegisterReportRow,
  type ImportVerificationReportData,
} from "@/lib/reports/types";

type ClassRefRow = {
  session_label: string;
  class_name: string;
  section: string | null;
  stream_name: string | null;
};

type StudentRefRow = {
  id: string;
  full_name: string;
  admission_no: string;
  transport_route_id: string | null;
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
  class_ref: ClassRefRow | ClassRefRow[] | null;
};

type ReceiptSourceRow = {
  id: string;
  receipt_number: string;
  payment_date: string;
  payment_mode: PaymentMode;
  total_amount: number;
  reference_number: string | null;
  received_by: string | null;
  created_at: string;
  student_ref: StudentRefRow | StudentRefRow[] | null;
};

type ReceiptSourceItem = {
  receiptId: string;
  receiptNumber: string;
  paymentDate: string;
  paymentMode: PaymentMode;
  totalAmount: number;
  referenceNumber: string | null;
  receivedBy: string | null;
  createdAt: string;
  studentId: string;
  transportRouteId: string | null;
  transportRouteLabel: string;
  fullName: string;
  admissionNo: string;
  sessionLabel: string;
  classLabel: string;
};

type WorkbookInstallmentBalanceReportRow = {
  installment_id: string;
  student_id: string;
  transport_route_id: string | null;
  transport_route_name: string | null;
  transport_route_code: string | null;
  admission_no: string;
  student_name: string;
  session_label: string;
  class_id: string;
  class_name: string;
  class_label: string;
  section: string;
  stream_name: string;
  installment_no: number;
  installment_label: string;
  due_date: string;
  total_charge: number;
  paid_amount: number;
  adjustment_amount: number;
  applied_amount: number;
  pending_amount: number;
  balance_status: "paid" | "partial" | "overdue" | "pending" | "waived";
};

type BaseReportStudentRow = {
  id: string;
  admission_no: string;
  full_name: string;
  class_id: string;
  transport_route_id: string | null;
  father_name: string | null;
  primary_phone: string | null;
  class_ref: ClassRefRow | ClassRefRow[] | null;
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

type LedgerStudentRow = {
  id: string;
  full_name: string;
  admission_no: string;
  transport_route_id: string | null;
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
  class_ref: ClassRefRow | ClassRefRow[] | null;
};

type LedgerReceiptRow = {
  receipt_number: string;
  payment_date: string;
  payment_mode: PaymentMode;
  reference_number: string | null;
  received_by: string | null;
};

type LedgerInstallmentRow = {
  installment_label: string;
  due_date: string;
};

type LedgerPaymentRow = {
  id: string;
  amount: number;
  notes: string | null;
  created_at: string;
  receipt_ref: LedgerReceiptRow | LedgerReceiptRow[] | null;
  installment_ref: LedgerInstallmentRow | LedgerInstallmentRow[] | null;
};

type LedgerAdjustmentRow = {
  id: string;
  payment_id: string;
  adjustment_type: AdjustmentType;
  amount_delta: number;
  reason: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;
};

type UserRow = {
  id: string;
  full_name: string;
};

type ImportBatchRow = {
  id: string;
  filename: string;
  source_format: "csv" | "xlsx";
  status: ImportBatchStatus;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  imported_rows: number;
  failed_rows: number;
  created_at: string;
  validation_completed_at: string | null;
  import_completed_at: string | null;
  error_message: string | null;
};

type ImportRowRecord = {
  id: string;
  batch_id: string;
  row_index: number;
  status: ImportRowStatus;
  errors: unknown;
  warnings: unknown;
  normalized_payload: unknown;
  imported_student_id: string | null;
  duplicate_student_id: string | null;
  created_at: string;
  updated_at: string;
};

type NormalizedImportPayload = {
  fullName: string | null;
  admissionNo: string | null;
  classLabel: string | null;
};

const REPORT_KEY_SET = new Set<ReportKey>(reportKeys);
const PAYMENT_MODE_SET = new Set<PaymentMode>([
  "cash",
  "upi",
  "bank_transfer",
  "cheque",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function buildRouteLabel(value: { route_name: string; route_code: string | null } | null) {
  if (!value) {
    return "No route";
  }

  return value.route_code ? `${value.route_name} (${value.route_code})` : value.route_name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }

      if (!isRecord(entry)) {
        return null;
      }

      return typeof entry.message === "string" ? entry.message : null;
    })
    .filter((entry): entry is string => Boolean(entry));
}

function toNormalizedImportPayload(value: unknown): NormalizedImportPayload {
  if (!isRecord(value)) {
    return {
      fullName: null,
      admissionNo: null,
      classLabel: null,
    };
  }

  return {
    fullName: typeof value.fullName === "string" ? value.fullName : null,
    admissionNo: typeof value.admissionNo === "string" ? value.admissionNo : null,
    classLabel: typeof value.classLabel === "string" ? value.classLabel : null,
  };
}

function normalizeUuid(value: string | undefined | null) {
  const normalized = (value ?? "").trim();
  return UUID_PATTERN.test(normalized) ? normalized : "";
}

function normalizeDate(value: string | undefined | null) {
  const normalized = (value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return "";
  }

  return normalized;
}

function normalizeReportKey(value: string | undefined | null): ReportKey {
  const normalized = (value ?? "").trim();
  return REPORT_KEY_SET.has(normalized as ReportKey)
    ? (normalized as ReportKey)
    : EMPTY_REPORT_FILTERS.report;
}

function normalizePaymentMode(
  value: string | undefined | null,
): "" | PaymentMode {
  const normalized = (value ?? "").trim();
  return PAYMENT_MODE_SET.has(normalized as PaymentMode)
    ? (normalized as PaymentMode)
    : "";
}

function getRawParamValue(
  source:
    | URLSearchParams
    | Record<string, string | string[] | undefined>
    | undefined,
  key: string,
) {
  if (!source) {
    return undefined;
  }

  if (source instanceof URLSearchParams) {
    return source.get(key) ?? undefined;
  }

  const value = source[key];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function normalizeReportFilters(
  source?:
    | URLSearchParams
    | Record<string, string | string[] | undefined>,
): ReportFilters {
  return {
    report: normalizeReportKey(getRawParamValue(source, "report")),
    classId: normalizeUuid(getRawParamValue(source, "classId")),
    transportRouteId: normalizeUuid(getRawParamValue(source, "transportRouteId")),
    sessionLabel: (getRawParamValue(source, "sessionLabel") ?? "").trim(),
    fromDate: normalizeDate(getRawParamValue(source, "fromDate")),
    toDate: normalizeDate(getRawParamValue(source, "toDate")),
    paymentMode: normalizePaymentMode(getRawParamValue(source, "paymentMode")),
    studentId: normalizeUuid(getRawParamValue(source, "studentId")),
    studentQuery: (getRawParamValue(source, "studentQuery") ?? "").trim(),
    batchId: normalizeUuid(getRawParamValue(source, "batchId")),
  };
}

function getDatePart(value: string) {
  return value.slice(0, 10);
}

function dateMatchesRange(
  dateValue: string,
  filters: Pick<ReportFilters, "fromDate" | "toDate">,
) {
  if (!dateValue) {
    return false;
  }

  if (filters.fromDate && dateValue < filters.fromDate) {
    return false;
  }

  if (filters.toDate && dateValue > filters.toDate) {
    return false;
  }

  return true;
}

function buildClassMaps(classOptions: StudentClassOption[]) {
  const classById = new Map(classOptions.map((option) => [option.id, option]));
  const sessionsByLabel = classOptions.reduce((acc, option) => {
    const existing = acc.get(option.label);

    if (existing) {
      existing.add(option.sessionLabel);
      return acc;
    }

    acc.set(option.label, new Set([option.sessionLabel]));
    return acc;
  }, new Map<string, Set<string>>());

  return {
    classById,
    sessionsByLabel,
  };
}

function matchesClassAndSession(
  filters: Pick<ReportFilters, "classId" | "sessionLabel">,
  classOptions: StudentClassOption[],
  row: { classLabel: string; sessionLabel: string },
) {
  const { classById } = buildClassMaps(classOptions);
  const selectedClass = filters.classId ? classById.get(filters.classId) : null;

  if (selectedClass) {
    if (
      row.classLabel !== selectedClass.label ||
      row.sessionLabel !== selectedClass.sessionLabel
    ) {
      return false;
    }
  }

  if (filters.sessionLabel && row.sessionLabel !== filters.sessionLabel) {
    return false;
  }

  return true;
}

function matchesImportClassAndSession(
  filters: Pick<ReportFilters, "classId" | "sessionLabel">,
  classOptions: StudentClassOption[],
  classLabel: string | null,
) {
  if (!filters.classId && !filters.sessionLabel) {
    return true;
  }

  if (!classLabel) {
    return false;
  }

  const { classById, sessionsByLabel } = buildClassMaps(classOptions);
  const selectedClass = filters.classId ? classById.get(filters.classId) : null;

  if (selectedClass && classLabel !== selectedClass.label) {
    return false;
  }

  const rowSessions = sessionsByLabel.get(classLabel);

  if (!rowSessions || rowSessions.size === 0) {
    return false;
  }

  if (selectedClass && !rowSessions.has(selectedClass.sessionLabel)) {
    return false;
  }

  if (filters.sessionLabel && !rowSessions.has(filters.sessionLabel)) {
    return false;
  }

  return true;
}

async function getReceiptSourceRows() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("receipts")
    .select(
      "id, receipt_number, payment_date, payment_mode, total_amount, reference_number, received_by, created_at, student_ref:students(id, full_name, admission_no, transport_route_id, route_ref:transport_routes(route_name, route_code), class_ref:classes(session_label, class_name, section, stream_name))",
    )
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to load receipt report data: ${error.message}`);
  }

  return ((data ?? []) as ReceiptSourceRow[])
    .map((row) => {
      const student = toSingleRecord(row.student_ref);
      const classRef = student ? toSingleRecord(student.class_ref) : null;
      const routeRef = student ? toSingleRecord(student.route_ref) : null;

      if (!student || !classRef) {
        return null;
      }

      return {
        receiptId: row.id,
        receiptNumber: row.receipt_number,
        paymentDate: row.payment_date,
        paymentMode: row.payment_mode,
        totalAmount: row.total_amount,
        referenceNumber: row.reference_number,
        receivedBy: row.received_by,
        createdAt: row.created_at,
        studentId: student.id,
        transportRouteId: student.transport_route_id,
        transportRouteLabel: buildRouteLabel(routeRef),
        fullName: student.full_name,
        admissionNo: student.admission_no,
        sessionLabel: classRef.session_label,
        classLabel: buildClassLabel(classRef),
      } satisfies ReceiptSourceItem;
    })
    .filter((row): row is ReceiptSourceItem => row !== null);
}

function filterReceiptSourceRows(
  rows: ReceiptSourceItem[],
  filters: Pick<
    ReportFilters,
    | "classId"
    | "transportRouteId"
    | "sessionLabel"
    | "fromDate"
    | "toDate"
    | "paymentMode"
  >,
  classOptions: StudentClassOption[],
) {
  return rows.filter((row) => {
    if (filters.transportRouteId && row.transportRouteId !== filters.transportRouteId) {
      return false;
    }

    if (
      !matchesClassAndSession(filters, classOptions, {
        classLabel: row.classLabel,
        sessionLabel: row.sessionLabel,
      })
    ) {
      return false;
    }

    if (filters.paymentMode && row.paymentMode !== filters.paymentMode) {
      return false;
    }

    return dateMatchesRange(row.paymentDate, filters);
  });
}

async function getActiveSessionBaseReportStudents(filters: ReportFilters) {
  const supabase = await createClient();
  const policy = await getFeePolicySummary();
  const sessionLabel = filters.sessionLabel || policy.academicSessionLabel;
  let query = supabase
    .from("students")
    .select(
      "id, admission_no, full_name, class_id, transport_route_id, father_name, primary_phone, class_ref:classes!inner(session_label, status, class_name, section, stream_name), route_ref:transport_routes(route_name, route_code)",
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
    throw new Error(`Unable to load source students for reports: ${error.message}`);
  }

  return ((data ?? []) as BaseReportStudentRow[]).flatMap((row) => {
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
        sessionLabel,
        classLabel: buildClassLabel({
          class_name: classRef.class_name,
          section: classRef.section || null,
          stream_name: classRef.stream_name || null,
        }),
        transportRouteLabel: buildRouteLabel(routeRef),
        installmentNo: 0,
        installmentLabel: "Dues not prepared",
        dueDate: "",
        amountDue: 0,
        paymentsTotal: 0,
        adjustmentsTotal: 0,
        collectedAmount: 0,
        outstandingAmount: 0,
        balanceStatus: "missing_dues" as const,
      } satisfies OutstandingReportRow,
    ];
  });
}

async function getOutstandingReportData(
  filters: ReportFilters,
  classOptions: StudentClassOption[],
): Promise<OutstandingReportData> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_workbook_installment_balances")
    .select(
      "installment_id, student_id, transport_route_id, transport_route_name, transport_route_code, admission_no, student_name, session_label, class_id, class_name, class_label, section, stream_name, installment_no, installment_label, due_date, total_charge, paid_amount, adjustment_amount, applied_amount, pending_amount, balance_status",
    )
    .gt("pending_amount", 0)
    .in("balance_status", ["partial", "overdue", "pending"]);

  if (error) {
    throw new Error(`Unable to load outstanding report: ${error.message}`);
  }

  const generatedRows = ((data ?? []) as WorkbookInstallmentBalanceReportRow[])
    .flatMap((row) => {
      if (
        row.balance_status !== "partial" &&
        row.balance_status !== "overdue" &&
        row.balance_status !== "pending"
      ) {
        return [];
      }

      if (filters.transportRouteId && row.transport_route_id !== filters.transportRouteId) {
        return [];
      }

      const classLabel =
        row.class_label ||
        buildClassLabel({
          class_name: row.class_name,
          section: row.section || null,
          stream_name: row.stream_name || null,
        });

      return [
        {
          studentId: row.student_id,
          admissionNo: row.admission_no,
          fullName: row.student_name,
          sessionLabel: row.session_label,
          classLabel,
          transportRouteLabel: buildRouteLabel(
            row.transport_route_name
              ? {
                  route_name: row.transport_route_name,
                  route_code: row.transport_route_code,
                }
              : null,
          ),
          installmentNo: row.installment_no,
          installmentLabel: row.installment_label,
          dueDate: row.due_date,
          amountDue: row.total_charge,
          paymentsTotal: row.paid_amount,
          adjustmentsTotal: row.adjustment_amount,
          collectedAmount: row.applied_amount,
          outstandingAmount: row.pending_amount,
          balanceStatus: row.balance_status,
        } satisfies OutstandingReportRow,
      ];
    })
    .filter((row) =>
      matchesClassAndSession(filters, classOptions, {
        classLabel: row.classLabel,
        sessionLabel: row.sessionLabel,
      }),
    )
    .filter((row) => dateMatchesRange(row.dueDate, filters));
  const generatedStudentIds = new Set(generatedRows.map((row) => row.studentId));
  const missingDuesRows = (await getActiveSessionBaseReportStudents(filters)).filter(
    (row) => !generatedStudentIds.has(row.studentId),
  );
  const rows = [...generatedRows, ...missingDuesRows]
    .sort((left, right) => {
      if (left.balanceStatus !== right.balanceStatus) {
        if (left.balanceStatus === "missing_dues") {
          return -1;
        }

        if (right.balanceStatus === "missing_dues") {
          return 1;
        }

        return left.balanceStatus === "overdue" ? -1 : 1;
      }

      if (left.dueDate !== right.dueDate) {
        return left.dueDate.localeCompare(right.dueDate);
      }

      return left.fullName.localeCompare(right.fullName);
    });

  const metrics = rows.reduce(
    (acc, row) => {
      acc.totalOutstanding += row.outstandingAmount;

      if (row.balanceStatus !== "missing_dues") {
        acc.openInstallments += 1;

        if (row.balanceStatus === "overdue") {
          acc.overdueInstallments += 1;
        }
      }

      acc.studentIds.add(row.studentId);
      return acc;
    },
    {
      totalOutstanding: 0,
      openInstallments: 0,
      overdueInstallments: 0,
      studentIds: new Set<string>(),
    },
  );

  return {
    key: "outstanding",
    metrics: {
      studentCount: metrics.studentIds.size,
      openInstallments: metrics.openInstallments,
      overdueInstallments: metrics.overdueInstallments,
      totalOutstanding: metrics.totalOutstanding,
    },
    rows,
  };
}

async function getDailyCollectionReportData(
  filters: ReportFilters,
  classOptions: StudentClassOption[],
): Promise<DailyCollectionReportData> {
  const receiptRows = filterReceiptSourceRows(
    await getReceiptSourceRows(),
    filters,
    classOptions,
  );

  const summaryMap = new Map<
    string,
    {
      paymentDate: string;
      paymentMode: PaymentMode;
      totalAmount: number;
      receiptCount: number;
      studentIds: Set<string>;
    }
  >();
  const modeTotalsMap = new Map<
    PaymentMode,
    { paymentMode: PaymentMode; totalAmount: number; receiptCount: number }
  >();
  const distinctStudents = new Set<string>();
  const distinctDays = new Set<string>();

  receiptRows.forEach((row) => {
    distinctStudents.add(row.studentId);
    distinctDays.add(row.paymentDate);

    const summaryKey = `${row.paymentDate}::${row.paymentMode}`;
    const summaryExisting = summaryMap.get(summaryKey);

    if (summaryExisting) {
      summaryExisting.totalAmount += row.totalAmount;
      summaryExisting.receiptCount += 1;
      summaryExisting.studentIds.add(row.studentId);
    } else {
      summaryMap.set(summaryKey, {
        paymentDate: row.paymentDate,
        paymentMode: row.paymentMode,
        totalAmount: row.totalAmount,
        receiptCount: 1,
        studentIds: new Set([row.studentId]),
      });
    }

    const modeExisting = modeTotalsMap.get(row.paymentMode);

    if (modeExisting) {
      modeExisting.totalAmount += row.totalAmount;
      modeExisting.receiptCount += 1;
    } else {
      modeTotalsMap.set(row.paymentMode, {
        paymentMode: row.paymentMode,
        totalAmount: row.totalAmount,
        receiptCount: 1,
      });
    }
  });

  const rows = Array.from(summaryMap.values())
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

  const modeTotals = Array.from(modeTotalsMap.values()).sort((left, right) =>
    left.paymentMode.localeCompare(right.paymentMode),
  );

  return {
    key: "daily-collection",
    metrics: {
      receiptCount: receiptRows.length,
      totalAmount: receiptRows.reduce((sum, row) => sum + row.totalAmount, 0),
      collectionDays: distinctDays.size,
      distinctStudents: distinctStudents.size,
    },
    modeTotals,
    rows,
  };
}

async function getLedgerStudentOptions(
  filters: ReportFilters,
  classOptions: StudentClassOption[],
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("students")
    .select(
      "id, full_name, admission_no, transport_route_id, route_ref:transport_routes(route_name, route_code), class_ref:classes(session_label, class_name, section, stream_name)",
    )
    .in("status", ["active", "inactive"])
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(`Unable to load students for ledger report: ${error.message}`);
  }

  return ((data ?? []) as LedgerStudentRow[])
    .filter((row) => {
      if (!filters.transportRouteId) {
        return true;
      }

      return row.transport_route_id === filters.transportRouteId;
    })
    .map((row) => {
      const classRef = toSingleRecord(row.class_ref);
      const routeRef = toSingleRecord(row.route_ref);

      if (!classRef) {
        return null;
      }

      const classLabel = buildClassLabel(classRef);

      return {
        id: row.id,
        fullName: row.full_name,
        admissionNo: row.admission_no,
        classLabel,
        transportRouteLabel: buildRouteLabel(routeRef),
        sessionLabel: classRef.session_label,
        label: `${row.full_name} (${row.admission_no})`,
      } satisfies ReportStudentOption;
    })
    .filter((row): row is ReportStudentOption => row !== null)
    .filter((row) =>
      matchesClassAndSession(filters, classOptions, {
        classLabel: row.classLabel,
        sessionLabel: row.sessionLabel,
      }),
    )
    .filter((row) => {
      if (!filters.studentQuery) {
        return true;
      }

      const lookup = `${row.fullName} ${row.admissionNo}`.toLowerCase();
      return lookup.includes(filters.studentQuery.toLowerCase());
    });
}

async function getStudentLedgerReportData(
  filters: ReportFilters,
  classOptions: StudentClassOption[],
): Promise<{
  studentOptions: ReportStudentOption[];
  report: StudentLedgerReportData;
}> {
  const studentOptions = await getLedgerStudentOptions(filters, classOptions);
  const selectedStudent =
    studentOptions.find((student) => student.id === filters.studentId) ?? null;

  if (!selectedStudent) {
    return {
      studentOptions,
      report: {
        key: "student-ledger",
        selectedStudent: null,
        metrics: {
          entryCount: 0,
          paymentsTotal: 0,
          adjustmentNet: 0,
          netEffect: 0,
          currentOutstanding: 0,
        },
        rows: [],
      },
    };
  }

  const supabase = await createClient();
  const [{ data: paymentsRaw, error: paymentsError }, { data: adjustmentsRaw, error: adjustmentsError }] =
    await Promise.all([
      supabase
        .from("payments")
        .select(
          "id, amount, notes, created_at, receipt_ref:receipts(receipt_number, payment_date, payment_mode, reference_number, received_by), installment_ref:installments(installment_label, due_date)",
        )
        .eq("student_id", selectedStudent.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("payment_adjustments")
        .select(
          "id, payment_id, adjustment_type, amount_delta, reason, notes, created_at, created_by",
        )
        .eq("student_id", selectedStudent.id)
        .order("created_at", { ascending: false }),
    ]);

  if (paymentsError) {
    throw new Error(`Unable to load ledger payment rows: ${paymentsError.message}`);
  }

  if (adjustmentsError) {
    throw new Error(
      `Unable to load ledger adjustment rows: ${adjustmentsError.message}`,
    );
  }

  const mappedPayments = ((paymentsRaw ?? []) as LedgerPaymentRow[])
    .map((row) => {
      const receipt = toSingleRecord(row.receipt_ref);
      const installment = toSingleRecord(row.installment_ref);

      if (!receipt || !installment) {
        return null;
      }

      return {
        id: row.id,
        createdAt: row.created_at,
        paymentDate: receipt.payment_date,
        receiptNumber: receipt.receipt_number,
        installmentLabel: installment.installment_label,
        dueDate: installment.due_date,
        paymentMode: receipt.payment_mode,
        paymentAmount: row.amount,
        notes: row.notes,
        referenceNumber: receipt.reference_number,
        receivedBy: receipt.received_by,
      };
    })
    .filter(
      (
        row,
      ): row is {
        id: string;
        createdAt: string;
        paymentDate: string;
        receiptNumber: string;
        installmentLabel: string;
        dueDate: string;
        paymentMode: PaymentMode;
        paymentAmount: number;
        notes: string | null;
        referenceNumber: string | null;
        receivedBy: string | null;
      } => row !== null,
    );

  const paymentMap = new Map(
    mappedPayments.map((row) => [
      row.id,
      {
        receiptNumber: row.receiptNumber,
        paymentDate: row.paymentDate,
        installmentLabel: row.installmentLabel,
        dueDate: row.dueDate,
        paymentMode: row.paymentMode,
        paymentAmount: row.paymentAmount,
        referenceNumber: row.referenceNumber,
        receivedBy: row.receivedBy,
      },
    ]),
  );

  const adjustmentRows = (adjustmentsRaw ?? []) as LedgerAdjustmentRow[];
  const creatorIds = Array.from(
    new Set(
      adjustmentRows
        .map((row) => row.created_by)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const creatorNameMap = new Map<string, string>();

  if (creatorIds.length > 0) {
    const { data: creatorsRaw, error: creatorsError } = await supabase
      .from("users")
      .select("id, full_name")
      .in("id", creatorIds);

    if (creatorsError) {
      throw new Error(
        `Unable to load ledger adjustment creators: ${creatorsError.message}`,
      );
    }

    ((creatorsRaw ?? []) as UserRow[]).forEach((row) => {
      creatorNameMap.set(row.id, row.full_name);
    });
  }

  const paymentEntries = mappedPayments
    .filter((row) => dateMatchesRange(getDatePart(row.createdAt), filters))
    .filter((row) =>
      filters.paymentMode ? row.paymentMode === filters.paymentMode : true,
    )
    .map(
      (row) =>
        ({
          entryId: row.id,
          entryType: "payment",
          createdAt: row.createdAt,
          paymentDate: row.paymentDate,
          receiptNumber: row.receiptNumber,
          installmentLabel: row.installmentLabel,
          dueDate: row.dueDate,
          paymentMode: row.paymentMode,
          paymentAmount: row.paymentAmount,
          adjustmentType: null,
          adjustmentAmount: null,
          reason: null,
          notes: row.notes,
          referenceNumber: row.referenceNumber,
          receivedBy: row.receivedBy,
          createdByName: null,
        }) satisfies StudentLedgerReportEntryRow,
    );

  const adjustmentEntries = adjustmentRows
    .map((row): StudentLedgerReportEntryRow | null => {
      const linkedPayment = paymentMap.get(row.payment_id);

      if (!linkedPayment) {
        return null;
      }

      return {
        entryId: row.id,
        entryType: "adjustment",
        createdAt: row.created_at,
        paymentDate: linkedPayment.paymentDate,
        receiptNumber: linkedPayment.receiptNumber,
        installmentLabel: linkedPayment.installmentLabel,
        dueDate: linkedPayment.dueDate,
        paymentMode: linkedPayment.paymentMode,
        paymentAmount: linkedPayment.paymentAmount,
        adjustmentType: row.adjustment_type,
        adjustmentAmount: row.amount_delta,
        reason: row.reason,
        notes: row.notes,
        referenceNumber: linkedPayment.referenceNumber,
        receivedBy: linkedPayment.receivedBy,
        createdByName: row.created_by
          ? (creatorNameMap.get(row.created_by) ?? row.created_by)
          : null,
      };
    })
    .filter((row): row is StudentLedgerReportEntryRow => row !== null)
    .filter((row) => dateMatchesRange(getDatePart(row.createdAt), filters))
    .filter((row) =>
      filters.paymentMode ? row.paymentMode === filters.paymentMode : true,
    );

  const { data: balancesRaw, error: balancesError } = await supabase
    .from("v_workbook_installment_balances")
    .select("pending_amount")
    .eq("student_id", selectedStudent.id)
    .gt("pending_amount", 0);

  if (balancesError) {
    throw new Error(
      `Unable to load current outstanding for ledger report: ${balancesError.message}`,
    );
  }

  const currentOutstanding = ((balancesRaw ?? []) as Array<{ pending_amount: number }>)
    .reduce((sum, row) => sum + row.pending_amount, 0);

  const rows = [...paymentEntries, ...adjustmentEntries].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return right.createdAt.localeCompare(left.createdAt);
    }

    return left.entryType.localeCompare(right.entryType);
  });

  const paymentsTotal = paymentEntries.reduce(
    (sum, row) => sum + row.paymentAmount,
    0,
  );
  const adjustmentNet = adjustmentEntries.reduce(
    (sum, row) => sum + (row.adjustmentAmount ?? 0),
    0,
  );

  return {
    studentOptions,
    report: {
      key: "student-ledger",
      selectedStudent,
      metrics: {
        entryCount: rows.length,
        paymentsTotal,
        adjustmentNet,
        netEffect: paymentsTotal + adjustmentNet,
        currentOutstanding,
      },
      rows,
    },
  };
}

async function getReceiptRegisterReportData(
  filters: ReportFilters,
  classOptions: StudentClassOption[],
): Promise<ReceiptRegisterReportData> {
  const rows = filterReceiptSourceRows(
    await getReceiptSourceRows(),
    filters,
    classOptions,
  ).map(
    (row) =>
      ({
        receiptId: row.receiptId,
        receiptNumber: row.receiptNumber,
        paymentDate: row.paymentDate,
        createdAt: row.createdAt,
        paymentMode: row.paymentMode,
        totalAmount: row.totalAmount,
        referenceNumber: row.referenceNumber,
        receivedBy: row.receivedBy,
        studentId: row.studentId,
        admissionNo: row.admissionNo,
        fullName: row.fullName,
        sessionLabel: row.sessionLabel,
        classLabel: row.classLabel,
        transportRouteLabel: row.transportRouteLabel,
      }) satisfies ReceiptRegisterReportRow,
  );

  return {
    key: "receipt-register",
    metrics: {
      receiptCount: rows.length,
      totalAmount: rows.reduce((sum, row) => sum + row.totalAmount, 0),
      studentCount: new Set(rows.map((row) => row.studentId)).size,
    },
    rows,
  };
}

function toReportBatchOption(row: ImportBatchRow): ReportBatchOption {
  return {
    id: row.id,
    label: row.filename,
    createdAt: row.created_at,
    status: row.status,
  };
}

async function getImportVerificationReportData(
  filters: ReportFilters,
  classOptions: StudentClassOption[],
): Promise<{
  batchOptions: ReportBatchOption[];
  report: ImportVerificationReportData;
}> {
  const supabase = await createClient();
  const { data: batchesRaw, error: batchesError } = await supabase
    .from("import_batches")
    .select(
      "id, filename, source_format, status, total_rows, valid_rows, invalid_rows, duplicate_rows, imported_rows, failed_rows, created_at, validation_completed_at, import_completed_at, error_message",
    )
    .order("created_at", { ascending: false });

  if (batchesError) {
    throw new Error(
      `Unable to load import review batches: ${batchesError.message}`,
    );
  }

  const allBatchRows = (batchesRaw ?? []) as ImportBatchRow[];
  const batchOptions = allBatchRows.map(toReportBatchOption);
  const filteredBatchRows = allBatchRows.filter((row) =>
    dateMatchesRange(getDatePart(row.created_at), filters),
  );

  const selectedBatchRow =
    filteredBatchRows.find((row) => row.id === filters.batchId) ??
    filteredBatchRows[0] ??
    null;

  if (!selectedBatchRow) {
    return {
      batchOptions,
      report: {
        key: "import-verification",
        selectedBatch: null,
        metrics: {
          batchCount: filteredBatchRows.length,
          totalRows: 0,
          importedRows: 0,
          issueRows: 0,
        },
        batchRows: [],
        detailRows: [],
      },
    };
  }

  const { data: detailRowsRaw, error: detailRowsError } = await supabase
    .from("import_rows")
    .select(
      "id, batch_id, row_index, status, errors, warnings, normalized_payload, imported_student_id, duplicate_student_id, created_at, updated_at",
    )
    .eq("batch_id", selectedBatchRow.id)
    .order("row_index", { ascending: true });

  if (detailRowsError) {
    throw new Error(
      `Unable to load import review detail rows: ${detailRowsError.message}`,
    );
  }

  const detailRows = ((detailRowsRaw ?? []) as ImportRowRecord[])
    .map((row) => {
      const normalized = toNormalizedImportPayload(row.normalized_payload);

      return {
        rowId: row.id,
        batchId: row.batch_id,
        rowIndex: row.row_index,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        status: row.status,
        fullName: normalized.fullName,
        admissionNo: normalized.admissionNo,
        classLabel: normalized.classLabel,
        importedStudentId: row.imported_student_id,
        duplicateStudentId: row.duplicate_student_id,
        errors: toStringArray(row.errors),
        warnings: toStringArray(row.warnings),
      } satisfies ImportVerificationDetailRow;
    })
    .filter((row) =>
      matchesImportClassAndSession(filters, classOptions, row.classLabel),
    );

  const batchRows = filteredBatchRows.map(
    (row) =>
      ({
        batchId: row.id,
        filename: row.filename,
        sourceFormat: row.source_format,
        status: row.status,
        totalRows: row.total_rows,
        validRows: row.valid_rows,
        invalidRows: row.invalid_rows,
        duplicateRows: row.duplicate_rows,
        importedRows: row.imported_rows,
        failedRows: row.failed_rows,
        createdAt: row.created_at,
        validationCompletedAt: row.validation_completed_at,
        importCompletedAt: row.import_completed_at,
        errorMessage: row.error_message,
      }) satisfies ImportVerificationBatchRow,
  );

  return {
    batchOptions,
    report: {
      key: "import-verification",
      selectedBatch: toReportBatchOption(selectedBatchRow),
      metrics: {
        batchCount: batchRows.length,
        totalRows: batchRows.reduce((sum, row) => sum + row.totalRows, 0),
        importedRows: batchRows.reduce((sum, row) => sum + row.importedRows, 0),
        issueRows: batchRows.reduce(
          (sum, row) => sum + row.invalidRows + row.duplicateRows + row.failedRows,
          0,
        ),
      },
      batchRows,
      detailRows,
    },
  };
}

export async function getReportsPageData(
  filters: ReportFilters,
): Promise<ReportsPageData> {
  const [{ classOptions, routeOptions }, policy] = await Promise.all([
    getStudentFormOptions(),
    getFeePolicySummary(),
  ]);
  const sessionOptions = Array.from(
    new Set(classOptions.map((option) => option.sessionLabel)),
  ).sort((left, right) => right.localeCompare(left));

  let studentOptions: ReportStudentOption[] = [];
  let batchOptions: ReportBatchOption[] = [];
  let report: ReportData;

  switch (filters.report) {
    case "daily-collection":
      report = await getDailyCollectionReportData(filters, classOptions);
      break;
    case "student-ledger": {
      const result = await getStudentLedgerReportData(filters, classOptions);
      studentOptions = result.studentOptions;
      report = result.report;
      break;
    }
    case "receipt-register":
      report = await getReceiptRegisterReportData(filters, classOptions);
      break;
    case "import-verification": {
      const result = await getImportVerificationReportData(filters, classOptions);
      batchOptions = result.batchOptions;
      report = result.report;
      break;
    }
    case "outstanding":
    default:
      report = await getOutstandingReportData(filters, classOptions);
      break;
  }

  return {
    filters,
    options: {
      classOptions,
      routeOptions,
      sessionOptions,
      paymentModes: policy.acceptedPaymentModes,
      studentOptions,
      batchOptions,
    },
    report,
    generatedAt: new Date().toISOString(),
  };
}

function buildCsvFilename(report: ReportKey) {
  const dateStamp = new Date().toISOString().slice(0, 10);
  return `${report}-report-${dateStamp}.csv`;
}

export async function getReportCsvData(
  filters: ReportFilters,
): Promise<ReportCsvData> {
  const data = await getReportsPageData(filters);

  switch (data.report.key) {
    case "outstanding":
      return {
        filename: buildCsvFilename(data.report.key),
        headers: [
          "Session",
          "Class",
          "Route",
          "Student",
          "SR no",
          "Installment no",
          "Installment",
          "Due date",
          "Amount due",
          "Payments total",
          "Adjustments total",
          "Collected total",
          "Outstanding amount",
          "Status",
        ],
        rows: data.report.rows.map((row) => [
          row.sessionLabel,
          row.classLabel,
          row.transportRouteLabel,
          row.fullName,
          row.admissionNo,
          row.installmentNo,
          row.installmentLabel,
          row.dueDate,
          row.amountDue,
          row.paymentsTotal,
          row.adjustmentsTotal,
          row.collectedAmount,
          row.outstandingAmount,
          row.balanceStatus,
        ]),
      };
    case "daily-collection":
      return {
        filename: buildCsvFilename(data.report.key),
        headers: [
          "Payment date",
          "Payment mode",
          "Receipt count",
          "Student count",
          "Total amount",
        ],
        rows: data.report.rows.map((row) => [
          row.paymentDate,
          formatPaymentModeLabel(row.paymentMode),
          row.receiptCount,
          row.studentCount,
          row.totalAmount,
        ]),
      };
    case "student-ledger": {
      const report = data.report;

      return {
        filename: buildCsvFilename(report.key),
        headers: [
          "Student",
          "SR no",
          "Entry type",
          "Created at",
          "Payment date",
          "Receipt no",
          "Installment",
          "Due date",
          "Payment mode",
          "Payment amount",
          "Adjustment type",
          "Adjustment amount",
          "Reason",
          "Reference no",
          "Received by",
          "Created by",
          "Notes",
        ],
        rows: report.rows.map((row) => [
            report.selectedStudent?.fullName ?? "",
            report.selectedStudent?.admissionNo ?? "",
            row.entryType,
            row.createdAt,
            row.paymentDate,
            row.receiptNumber,
            row.installmentLabel,
            row.dueDate,
            formatPaymentModeLabel(row.paymentMode),
            row.paymentAmount,
            row.adjustmentType,
            row.adjustmentAmount,
            row.reason,
            row.referenceNumber,
            row.receivedBy,
            row.createdByName,
            row.notes,
          ]),
      };
    }
    case "receipt-register":
      return {
        filename: buildCsvFilename(data.report.key),
        headers: [
          "Receipt no",
          "Payment date",
          "Posted at",
          "Student",
          "SR no",
          "Session",
          "Class",
          "Route",
          "Payment mode",
          "Amount",
          "Reference no",
          "Received by",
        ],
        rows: data.report.rows.map((row) => [
          row.receiptNumber,
          row.paymentDate,
          row.createdAt,
          row.fullName,
          row.admissionNo,
          row.sessionLabel,
          row.classLabel,
          row.transportRouteLabel,
          formatPaymentModeLabel(row.paymentMode),
          row.totalAmount,
          row.referenceNumber,
          row.receivedBy,
        ]),
      };
    case "import-verification": {
      const report = data.report;

      return {
        filename: buildCsvFilename(report.key),
        headers: [
          "Batch",
          "Row index",
          "Status",
          "Student",
          "SR no",
          "Class",
          "Imported student id",
          "Duplicate student id",
          "Errors",
          "Warnings",
          "Created at",
          "Updated at",
        ],
        rows: report.detailRows.map((row) => [
            report.selectedBatch?.label ?? "",
            row.rowIndex,
            row.status,
            row.fullName,
            row.admissionNo,
            row.classLabel,
            row.importedStudentId,
            row.duplicateStudentId,
            row.errors.join(" | "),
            row.warnings.join(" | "),
            row.createdAt,
            row.updatedAt,
          ]),
      };
    }
    default: {
      const _exhaustiveCheck: never = data.report;
      throw new Error(`Unsupported report export: ${_exhaustiveCheck}`);
    }
  }
}

export function serializeCsv(payload: ReportCsvData) {
  const rows = [payload.headers, ...payload.rows];

  return rows
    .map((row) =>
      row
        .map((value) => {
          if (value === null || value === undefined) {
            return "";
          }

          const normalized = String(value).replace(/"/g, "\"\"");
          return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized;
        })
        .join(","),
    )
    .join("\n");
}

export { formatPaymentModeLabel };

export function getReportAuditNote(reportKey: ReportKey) {
  switch (reportKey) {
    case "outstanding":
      return "Totals come from prepared dues after the selected due-date, class, and session filters; active students without prepared dues are flagged separately.";
    case "daily-collection":
      return "Summary totals come from posted receipts grouped by payment date and payment mode.";
    case "student-ledger":
      return "Ledger rows come from append-only payments and payment adjustments; corrections stay visible as separate entries.";
    case "receipt-register":
      return "Receipt totals come directly from receipt records in the selected date and class scope.";
    case "import-verification":
      return "Batch totals come from import batch counters, and row status detail comes from staged import rows.";
  }

  return reportDefinitions.outstanding.description;
}
