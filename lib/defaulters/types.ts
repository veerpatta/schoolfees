import type {
  StudentClassOption,
  StudentRouteOption,
} from "@/lib/students/types";

export type DefaulterFilters = {
  classId: string;
  transportRouteId: string;
  overdue: "" | "overdue";
  minPendingAmount: string;
};

export type DefaulterSummaryRow = {
  studentId: string;
  admissionNo: string;
  fullName: string;
  classLabel: string;
  transportRouteLabel: string;
  totalPending: number;
  overdueInstallments: number;
  openInstallments: number;
  oldestDueDate: string | null;
  followUpStatus: "overdue" | "pending";
};

export type DefaultersMetrics = {
  totalStudents: number;
  totalPending: number;
  overdueInstallments: number;
  openInstallments: number;
};

export type DefaultersPageData = {
  classOptions: StudentClassOption[];
  routeOptions: StudentRouteOption[];
  metrics: DefaultersMetrics;
  rows: DefaulterSummaryRow[];
};

export const EMPTY_DEFAULTER_FILTERS: DefaulterFilters = {
  classId: "",
  transportRouteId: "",
  overdue: "",
  minPendingAmount: "",
};
