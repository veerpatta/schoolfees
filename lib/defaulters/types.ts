import type {
  StudentClassOption,
  StudentRouteOption,
} from "@/lib/students/types";
import type { PaymentBehavior } from "@/lib/defaulters/behavior";
import type { DefaulterContactSummary } from "@/lib/defaulters/cadence";

/** Outcome of the parent's most recent payment promise. */
export type PromiseStatus = "kept" | "broken" | "pending";

export type DefaulterFilters = {
  classId: string;
  transportRouteId: string;
  overdue: "" | "overdue";
  minPendingAmount: string;
  searchQuery?: string;
};

export type DefaultersPagination = {
  page: number;
  pageSize: number;
  totalRows: number;
  visibleStart: number;
  visibleEnd: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export type DefaulterSummaryRow = {
  studentId: string;
  classId: string | null;
  admissionNo: string;
  fullName: string;
  fatherName: string | null;
  fatherPhone: string | null;
  /** Secondary number (typically the mother). Used for the "try another number" flow. */
  motherPhone: string | null;
  classLabel: string;
  studentStatusLabel: "New" | "Old";
  transportRouteId: string | null;
  transportRouteLabel: string;
  totalDue: number;
  totalPaid: number;
  totalPending: number;
  overdueAmount: number;
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
  /** 0–100 heat score (money + age + promise + responsiveness + freshness). */
  heat: number;
  rank: number;
  /** Payment temperament for filtering/badging. Attached for visible page rows. */
  paymentBehavior?: PaymentBehavior;
  /** Whether the parent kept/broke their last payment promise (null if none). */
  promiseStatus?: PromiseStatus | null;
  /** Admin-set "will pay anyway — don't call" flag for this session. */
  noCall?: boolean;
  familyGroupId?: string | null;
  familyVisibleSiblingCount?: number;
  /** Promise reliability for the student/family in this session, 0-100. */
  promiseKeptRate?: number | null;
  promiseKeptCount?: number;
  promiseBrokenCount?: number;
};

export type MissingDuesWarningRow = {
  studentId: string;
  classId: string | null;
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
  pagination: DefaultersPagination;
  missingDuesRows: MissingDuesWarningRow[];
  routeSummaryRows: RouteOutstandingSummaryRow[];
  /** Per-student contact summaries for every returned row (drives client UI). */
  contactSummaries: Map<string, DefaulterContactSummary>;
};

export const EMPTY_DEFAULTER_FILTERS: DefaulterFilters = {
  classId: "",
  transportRouteId: "",
  overdue: "",
  minPendingAmount: "",
  searchQuery: "",
};
