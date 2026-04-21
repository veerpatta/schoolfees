import "server-only";

import { createClient } from "@/lib/supabase/server";

type ClassRefRow = {
  session_label: string;
  class_name: string;
  section: string | null;
  stream_name: string | null;
};

type StudentRow = {
  id: string;
  class_ref: ClassRefRow | ClassRefRow[] | null;
};

type ReceiptStudentRow = {
  full_name: string;
  admission_no: string;
  class_ref: ClassRefRow | ClassRefRow[] | null;
};

type ReceiptRow = {
  receipt_number: string;
  payment_date: string;
  total_amount: number;
  payment_mode: "cash" | "upi" | "bank_transfer" | "cheque";
  student_ref: ReceiptStudentRow | ReceiptStudentRow[] | null;
};

type ReceiptTotalRow = {
  total_amount: number;
};

type InstallmentBalanceRow = {
  student_id: string;
  session_label: string;
  class_name: string;
  section: string;
  stream_name: string;
  amount_due: number;
  outstanding_amount: number;
  balance_status: "paid" | "partial" | "overdue" | "pending" | "waived" | "cancelled";
};

type ClassSummaryAccumulator = {
  sessionLabel: string;
  classLabel: string;
  totalStudents: number;
  studentsWithPending: Set<string>;
  overdueInstallments: number;
  pendingAmount: number;
};

export type DashboardRecentPayment = {
  receiptNumber: string;
  paymentDate: string;
  studentName: string;
  admissionNo: string;
  classLabel: string;
  paymentMode: string;
  amount: number;
};

export type DashboardClassSummaryRow = {
  sessionLabel: string;
  classLabel: string;
  totalStudents: number;
  studentsWithPending: number;
  overdueInstallments: number;
  pendingAmount: number;
};

export type DashboardPageData = {
  totalStudents: number;
  totalDue: number;
  totalCollected: number;
  totalPending: number;
  overdueInstallmentCount: number;
  studentsWithPending: number;
  recentPayments: DashboardRecentPayment[];
  classSummary: DashboardClassSummaryRow[];
};

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

function buildClassKey(value: {
  session_label: string;
  class_name: string;
  section: string | null;
  stream_name: string | null;
}) {
  return [
    value.session_label,
    value.class_name,
    value.section ?? "",
    value.stream_name ?? "",
  ].join("::");
}

function formatPaymentMode(
  value: "cash" | "upi" | "bank_transfer" | "cheque",
) {
  switch (value) {
    case "upi":
      return "UPI";
    case "bank_transfer":
      return "Bank transfer";
    case "cheque":
      return "Cheque";
    default:
      return "Cash";
  }
}

export async function getDashboardPageData(): Promise<DashboardPageData> {
  const supabase = await createClient();

  const [
    { data: studentsRaw, error: studentsError },
    { data: receiptTotalsRaw, error: receiptTotalsError },
    { data: balancesRaw, error: balancesError },
    { data: recentReceiptsRaw, error: recentReceiptsError },
  ] = await Promise.all([
    supabase
      .from("students")
      .select(
        "id, class_ref:classes(session_label, class_name, section, stream_name)",
      )
      .in("status", ["active", "inactive"]),
    supabase.from("receipts").select("total_amount"),
    supabase
      .from("v_installment_balances")
      .select(
        "student_id, session_label, class_name, section, stream_name, amount_due, outstanding_amount, balance_status",
      ),
    supabase
      .from("receipts")
      .select(
        "receipt_number, payment_date, total_amount, payment_mode, student_ref:students(full_name, admission_no, class_ref:classes(class_name, section, stream_name))",
      )
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  if (studentsError) {
    throw new Error(`Unable to load dashboard students: ${studentsError.message}`);
  }

  if (receiptTotalsError) {
    throw new Error(`Unable to load collection totals: ${receiptTotalsError.message}`);
  }

  if (balancesError) {
    throw new Error(`Unable to load installment balances: ${balancesError.message}`);
  }

  if (recentReceiptsError) {
    throw new Error(`Unable to load recent payments: ${recentReceiptsError.message}`);
  }

  const studentRows = (studentsRaw ?? []) as StudentRow[];
  const balanceRows = (balancesRaw ?? []) as InstallmentBalanceRow[];
  const receiptTotalRows = (receiptTotalsRaw ?? []) as ReceiptTotalRow[];
  const recentPayments = ((recentReceiptsRaw ?? []) as ReceiptRow[]).map((row) => {
    const studentRef = toSingleRecord(row.student_ref);
    const classRef = studentRef ? toSingleRecord(studentRef.class_ref) : null;

    return {
      receiptNumber: row.receipt_number,
      paymentDate: row.payment_date,
      studentName: studentRef?.full_name ?? "Unknown student",
      admissionNo: studentRef?.admission_no ?? "-",
      classLabel: classRef ? buildClassLabel(classRef) : "Unknown class",
      paymentMode: formatPaymentMode(row.payment_mode),
      amount: row.total_amount,
    } satisfies DashboardRecentPayment;
  });

  const classSummaryMap = new Map<string, ClassSummaryAccumulator>();

  studentRows.forEach((row) => {
    const classRef = toSingleRecord(row.class_ref);

    if (!classRef) {
      return;
    }

    const key = buildClassKey(classRef);
    const existing = classSummaryMap.get(key);

    if (existing) {
      existing.totalStudents += 1;
      return;
    }

    classSummaryMap.set(key, {
      sessionLabel: classRef.session_label,
      classLabel: buildClassLabel(classRef),
      totalStudents: 1,
      studentsWithPending: new Set<string>(),
      overdueInstallments: 0,
      pendingAmount: 0,
    });
  });

  let totalDue = 0;
  let totalPending = 0;
  let overdueInstallmentCount = 0;
  const studentsWithPending = new Set<string>();

  balanceRows.forEach((row) => {
    if (row.balance_status !== "waived") {
      totalDue += row.amount_due;
    }

    if (row.outstanding_amount <= 0) {
      return;
    }

    totalPending += row.outstanding_amount;
    studentsWithPending.add(row.student_id);

    if (row.balance_status === "overdue") {
      overdueInstallmentCount += 1;
    }

    const key = buildClassKey(row);
    const existing = classSummaryMap.get(key);

    if (!existing) {
      classSummaryMap.set(key, {
        sessionLabel: row.session_label,
        classLabel: buildClassLabel(row),
        totalStudents: 0,
        studentsWithPending: new Set<string>([row.student_id]),
        overdueInstallments: row.balance_status === "overdue" ? 1 : 0,
        pendingAmount: row.outstanding_amount,
      });
      return;
    }

    existing.pendingAmount += row.outstanding_amount;
    existing.studentsWithPending.add(row.student_id);

    if (row.balance_status === "overdue") {
      existing.overdueInstallments += 1;
    }
  });

  const classSummary = Array.from(classSummaryMap.values())
    .map((row) => ({
      sessionLabel: row.sessionLabel,
      classLabel: row.classLabel,
      totalStudents: row.totalStudents,
      studentsWithPending: row.studentsWithPending.size,
      overdueInstallments: row.overdueInstallments,
      pendingAmount: row.pendingAmount,
    }))
    .sort((left, right) => {
      if (right.pendingAmount !== left.pendingAmount) {
        return right.pendingAmount - left.pendingAmount;
      }

      if (right.studentsWithPending !== left.studentsWithPending) {
        return right.studentsWithPending - left.studentsWithPending;
      }

      return left.classLabel.localeCompare(right.classLabel);
    });

  const totalCollected = receiptTotalRows.reduce(
    (sum, row) => sum + row.total_amount,
    0,
  );

  return {
    totalStudents: studentRows.length,
    totalDue,
    totalCollected,
    totalPending,
    overdueInstallmentCount,
    studentsWithPending: studentsWithPending.size,
    recentPayments,
    classSummary,
  };
}
