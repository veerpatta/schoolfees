import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getStudentFormOptions } from "@/lib/students/data";

import type {
  DefaulterFilters,
  DefaulterSummaryRow,
  DefaultersPageData,
} from "./types";

type StudentClassRow = {
  class_name: string;
  section: string | null;
  stream_name: string | null;
};

type StudentRouteRow = {
  route_name: string;
  route_code: string | null;
};

type StudentRow = {
  id: string;
  full_name: string;
  admission_no: string;
  class_ref: StudentClassRow | StudentClassRow[] | null;
  route_ref: StudentRouteRow | StudentRouteRow[] | null;
};

type InstallmentBalanceRow = {
  student_id: string;
  due_date: string;
  outstanding_amount: number;
  balance_status: "paid" | "partial" | "overdue" | "pending" | "waived" | "cancelled";
};

type StudentAccumulator = Omit<DefaulterSummaryRow, "followUpStatus">;

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

function buildRouteLabel(value: StudentRouteRow | null) {
  if (!value) {
    return "No route";
  }

  return value.route_code
    ? `${value.route_name} (${value.route_code})`
    : value.route_name;
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

export async function getDefaultersPageData(
  filters: DefaulterFilters,
): Promise<DefaultersPageData> {
  const supabase = await createClient();
  const { classOptions, routeOptions } = await getStudentFormOptions();

  let studentsQuery = supabase
    .from("students")
    .select(
      "id, full_name, admission_no, class_ref:classes(class_name, section, stream_name), route_ref:transport_routes(route_name, route_code)",
    )
    .in("status", ["active", "inactive"])
    .order("full_name", { ascending: true });

  if (filters.classId) {
    studentsQuery = studentsQuery.eq("class_id", filters.classId);
  }

  if (filters.transportRouteId) {
    studentsQuery = studentsQuery.eq("transport_route_id", filters.transportRouteId);
  }

  const { data: studentsRaw, error: studentsError } = await studentsQuery;

  if (studentsError) {
    throw new Error(`Unable to load defaulter students: ${studentsError.message}`);
  }

  const studentRows = (studentsRaw ?? []) as StudentRow[];

  if (studentRows.length === 0) {
    return {
      classOptions,
      routeOptions,
      metrics: {
        totalStudents: 0,
        totalPending: 0,
        overdueInstallments: 0,
        openInstallments: 0,
      },
      rows: [],
    };
  }

  const studentIds = studentRows.map((row) => row.id);
  const { data: balancesRaw, error: balancesError } = await supabase
    .from("v_installment_balances")
    .select("student_id, due_date, outstanding_amount, balance_status")
    .in("student_id", studentIds)
    .gt("outstanding_amount", 0)
    .in("balance_status", ["overdue", "pending", "partial"])
    .order("due_date", { ascending: true });

  if (balancesError) {
    throw new Error(`Unable to load defaulter balances: ${balancesError.message}`);
  }

  const balances = (balancesRaw ?? []) as InstallmentBalanceRow[];
  const summaryMap = new Map<string, StudentAccumulator>();

  studentRows.forEach((row) => {
    const classRef = toSingleRecord(row.class_ref);
    const routeRef = toSingleRecord(row.route_ref);

    summaryMap.set(row.id, {
      studentId: row.id,
      admissionNo: row.admission_no,
      fullName: row.full_name,
      classLabel: classRef ? buildClassLabel(classRef) : "Unknown class",
      transportRouteLabel: buildRouteLabel(routeRef),
      totalPending: 0,
      overdueInstallments: 0,
      openInstallments: 0,
      oldestDueDate: null,
    });
  });

  balances.forEach((row) => {
    const existing = summaryMap.get(row.student_id);

    if (!existing) {
      return;
    }

    existing.totalPending += row.outstanding_amount;
    existing.openInstallments += 1;

    if (row.balance_status === "overdue") {
      existing.overdueInstallments += 1;
    }

    if (!existing.oldestDueDate || row.due_date < existing.oldestDueDate) {
      existing.oldestDueDate = row.due_date;
    }
  });

  const minimumPendingAmount = parseMinimumPendingAmount(filters.minPendingAmount);

  const rows = Array.from(summaryMap.values())
    .filter((row) => row.totalPending > 0)
    .filter((row) =>
      filters.overdue === "overdue" ? row.overdueInstallments > 0 : true,
    )
    .filter((row) => row.totalPending >= minimumPendingAmount)
    .map(
      (row) =>
        ({
          ...row,
          followUpStatus: row.overdueInstallments > 0 ? "overdue" : "pending",
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
  };
}
