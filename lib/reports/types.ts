import type {
  AdjustmentType,
  ImportBatchStatus,
  ImportRowStatus,
  PaymentMode,
} from "@/lib/db/types";
import type { StudentClassOption } from "@/lib/students/types";

export const reportKeys = [
  "outstanding",
  "daily-collection",
  "student-ledger",
  "receipt-register",
  "import-verification",
] as const;

export type ReportKey = (typeof reportKeys)[number];

export const reportDefinitions: Record<
  ReportKey,
  {
    title: string;
    description: string;
    tableTitle: string;
    tableDescription: string;
    printFriendly: boolean;
  }
> = {
  outstanding: {
    title: "Outstanding report",
    description:
      "Open dues by class, session, student, and installment for follow-up work.",
    tableTitle: "Outstanding rows",
    tableDescription:
      "Flat installment-level table for office follow-up and spreadsheet export.",
    printFriendly: true,
  },
  "daily-collection": {
    title: "Daily collection report",
    description:
      "Day-book style summary grouped by payment date and payment mode.",
    tableTitle: "Daily collection summary",
    tableDescription:
      "Grouped totals by date and mode so desk totals match posted receipts.",
    printFriendly: true,
  },
  "student-ledger": {
    title: "Student ledger report",
    description:
      "Chronological payment and adjustment history for one student without hiding corrections.",
    tableTitle: "Ledger entries",
    tableDescription:
      "Payments and adjustments stay separate in one export-ready table.",
    printFriendly: true,
  },
  "receipt-register": {
    title: "Receipt register",
    description:
      "Receipt-by-receipt register for verification, reconciliation, and recheck work.",
    tableTitle: "Receipt register",
    tableDescription:
      "Flat receipt list with class, mode, amount, and desk reference details.",
    printFriendly: true,
  },
  "import-verification": {
    title: "Import verification report",
    description:
      "Batch summary and row-level import status for checking workbook migration results.",
    tableTitle: "Import detail rows",
    tableDescription:
      "Selected batch row outcomes with errors, duplicates, and imported records visible.",
    printFriendly: false,
  },
};

export const paymentModeFilterOptions: ReadonlyArray<{
  value: PaymentMode;
  label: string;
}> = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
] as const;

export type ReportFilters = {
  report: ReportKey;
  classId: string;
  sessionLabel: string;
  fromDate: string;
  toDate: string;
  paymentMode: "" | PaymentMode;
  studentId: string;
  studentQuery: string;
  batchId: string;
};

export const EMPTY_REPORT_FILTERS: ReportFilters = {
  report: "outstanding",
  classId: "",
  sessionLabel: "",
  fromDate: "",
  toDate: "",
  paymentMode: "",
  studentId: "",
  studentQuery: "",
  batchId: "",
};

export type ReportStudentOption = {
  id: string;
  fullName: string;
  admissionNo: string;
  classLabel: string;
  sessionLabel: string;
  label: string;
};

export type ReportBatchOption = {
  id: string;
  label: string;
  createdAt: string;
  status: ImportBatchStatus;
};

export type ReportsFilterOptions = {
  classOptions: StudentClassOption[];
  sessionOptions: string[];
  paymentModes: ReadonlyArray<{ value: PaymentMode; label: string }>;
  studentOptions: ReportStudentOption[];
  batchOptions: ReportBatchOption[];
};

export type OutstandingReportRow = {
  studentId: string;
  admissionNo: string;
  fullName: string;
  sessionLabel: string;
  classLabel: string;
  installmentNo: number;
  installmentLabel: string;
  dueDate: string;
  amountDue: number;
  paymentsTotal: number;
  adjustmentsTotal: number;
  collectedAmount: number;
  outstandingAmount: number;
  balanceStatus: "partial" | "overdue" | "pending";
};

export type OutstandingReportData = {
  key: "outstanding";
  metrics: {
    studentCount: number;
    openInstallments: number;
    overdueInstallments: number;
    totalOutstanding: number;
  };
  rows: OutstandingReportRow[];
};

export type DailyCollectionReportRow = {
  paymentDate: string;
  paymentMode: PaymentMode;
  receiptCount: number;
  studentCount: number;
  totalAmount: number;
};

export type DailyCollectionModeTotal = {
  paymentMode: PaymentMode;
  totalAmount: number;
  receiptCount: number;
};

export type DailyCollectionReportData = {
  key: "daily-collection";
  metrics: {
    receiptCount: number;
    totalAmount: number;
    collectionDays: number;
    distinctStudents: number;
  };
  modeTotals: DailyCollectionModeTotal[];
  rows: DailyCollectionReportRow[];
};

export type StudentLedgerReportEntryRow = {
  entryId: string;
  entryType: "payment" | "adjustment";
  createdAt: string;
  paymentDate: string;
  receiptNumber: string;
  installmentLabel: string;
  dueDate: string;
  paymentMode: PaymentMode;
  paymentAmount: number;
  adjustmentType: AdjustmentType | null;
  adjustmentAmount: number | null;
  reason: string | null;
  notes: string | null;
  referenceNumber: string | null;
  receivedBy: string | null;
  createdByName: string | null;
};

export type StudentLedgerReportData = {
  key: "student-ledger";
  selectedStudent: ReportStudentOption | null;
  metrics: {
    entryCount: number;
    paymentsTotal: number;
    adjustmentNet: number;
    netEffect: number;
    currentOutstanding: number;
  };
  rows: StudentLedgerReportEntryRow[];
};

export type ReceiptRegisterReportRow = {
  receiptId: string;
  receiptNumber: string;
  paymentDate: string;
  createdAt: string;
  paymentMode: PaymentMode;
  totalAmount: number;
  referenceNumber: string | null;
  receivedBy: string | null;
  studentId: string;
  admissionNo: string;
  fullName: string;
  sessionLabel: string;
  classLabel: string;
};

export type ReceiptRegisterReportData = {
  key: "receipt-register";
  metrics: {
    receiptCount: number;
    totalAmount: number;
    studentCount: number;
  };
  rows: ReceiptRegisterReportRow[];
};

export type ImportVerificationBatchRow = {
  batchId: string;
  filename: string;
  sourceFormat: "csv" | "xlsx";
  status: ImportBatchStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  importedRows: number;
  failedRows: number;
  createdAt: string;
  validationCompletedAt: string | null;
  importCompletedAt: string | null;
  errorMessage: string | null;
};

export type ImportVerificationDetailRow = {
  rowId: string;
  batchId: string;
  rowIndex: number;
  createdAt: string;
  updatedAt: string;
  status: ImportRowStatus;
  fullName: string | null;
  admissionNo: string | null;
  classLabel: string | null;
  importedStudentId: string | null;
  duplicateStudentId: string | null;
  errors: string[];
  warnings: string[];
};

export type ImportVerificationReportData = {
  key: "import-verification";
  selectedBatch: ReportBatchOption | null;
  metrics: {
    batchCount: number;
    totalRows: number;
    importedRows: number;
    issueRows: number;
  };
  batchRows: ImportVerificationBatchRow[];
  detailRows: ImportVerificationDetailRow[];
};

export type ReportData =
  | OutstandingReportData
  | DailyCollectionReportData
  | StudentLedgerReportData
  | ReceiptRegisterReportData
  | ImportVerificationReportData;

export type ReportsPageData = {
  filters: ReportFilters;
  options: ReportsFilterOptions;
  report: ReportData;
  generatedAt: string;
};

export type ReportCsvData = {
  filename: string;
  headers: string[];
  rows: Array<Array<string | number | null>>;
};
