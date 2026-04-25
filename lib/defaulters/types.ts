import type {
  StudentClassOption,
  StudentRouteOption,
} from "@/lib/students/types";

export type DefaulterFilters = {
  classId: string;
  transportRouteId: string;
  overdue: "" | "overdue";
  minPendingAmount: string;
  searchQuery?: string;
};

export type DefaulterSummaryRow = {
  studentId: string;
  admissionNo: string;
  fullName: string;
  fatherName: string | null;
  fatherPhone: string | null;
  classLabel: string;
  studentStatusLabel: "New" | "Old";
  transportRouteId: string | null;
  transportRouteLabel: string;
  totalDue: number;
  totalPaid: number;
  totalPending: number;
  lateFee: number;
  discountApplied: number;
  lateFeeWaived: number;
  overdueInstallments: number;
  openInstallments: number;
  nextDueAmount: number | null;
  oldestDueDate: string | null;
  nextDueDate: string | null;
  lastPaymentDate: string | null;
  followUpStatus: "overdue" | "pending";
  daysOverdue: number;
  defaulterScore: number;
  rank: number;
};

export type MissingDuesWarningRow = {
  studentId: string;
  admissionNo: string;
  fullName: string;
  fatherName: string | null;
  fatherPhone: string | null;
  classLabel: string;
  transportRouteId: string | null;
  transportRouteLabel: string;
};

export type RouteOutstandingSummaryRow = {
  routeId: string | null;
  routeLabel: string;
  studentCount: number;
  totalPending: number;
  overdueInstallments: number;
  openInstallments: number;
  oldestDueDate: string | null;
};

export type DefaultersMetrics = {
  totalStudents: number;
  totalPending: number;
  overdueInstallments: number;
  openInstallments: number;
  missingDuesStudents: number;
};

export type DefaultersPageData = {
  classOptions: StudentClassOption[];
  routeOptions: StudentRouteOption[];
  metrics: DefaultersMetrics;
  rows: DefaulterSummaryRow[];
  missingDuesRows: MissingDuesWarningRow[];
  routeSummaryRows: RouteOutstandingSummaryRow[];
};

export const EMPTY_DEFAULTER_FILTERS: DefaulterFilters = {
  classId: "",
  transportRouteId: "",
  overdue: "",
  minPendingAmount: "",
  searchQuery: "",
};
