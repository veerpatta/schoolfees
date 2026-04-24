import type {
  WorkbookInstallmentBalance,
  WorkbookStudentFinancial,
  WorkbookTransaction,
} from "@/lib/workbook/data";

export type DashboardKpis = {
  totalStudents: number;
  totalExpectedFees: number;
  totalCollected: number;
  totalPending: number;
  overdueAmount: number;
  todaysCollection: number;
  receiptsToday: number;
  collectionRate: number;
};

export type DashboardRecentPayment = {
  receiptId: string;
  receiptNumber: string;
  paymentDate: string;
  studentId: string;
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
  expectedAmount: number;
  collectedAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  overdueStudents: number;
  studentsWithPending: number;
  collectionRate: number;
};

export type DashboardInstallmentSummaryRow = {
  installmentNo: number;
  installmentLabel: string;
  dueDate: string | null;
  studentCount: number;
  expectedAmount: number;
  collectedAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  collectionRate: number;
};

export type DashboardTrendPoint = {
  date: string;
  amount: number;
  receiptCount: number;
};

export type DashboardPaymentModeBreakdown = {
  paymentMode: string;
  amount: number;
  receiptCount: number;
};

export type DashboardFollowUpStudent = {
  studentId: string;
  studentName: string;
  admissionNo: string;
  classLabel: string;
  fatherPhone: string | null;
  outstandingAmount: number;
  nextDueDate: string | null;
  nextDueLabel: string | null;
  nextDueAmount: number | null;
  statusLabel: WorkbookStudentFinancial["statusLabel"];
  reminderText: string;
};

export type DashboardEmptyState = {
  hasStudents: boolean;
  hasReceipts: boolean;
  hasFinancialData: boolean;
};

export type DashboardSummaryInput = {
  financialRows: WorkbookStudentFinancial[];
  installmentRows: WorkbookInstallmentBalance[];
  overdueInstallments: WorkbookInstallmentBalance[];
  transactions: WorkbookTransaction[];
  todayTransactions: WorkbookTransaction[];
  rawStudentCount?: number;
};

export function calculatePercentage(part: number, whole: number) {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((part / whole) * 100)));
}

export function formatPaymentModeLabel(value: string) {
  switch (value) {
    case "upi":
      return "UPI";
    case "bank_transfer":
      return "Bank transfer";
    case "cheque":
      return "Cheque";
    case "cash":
      return "Cash";
    default:
      return value || "Unknown";
  }
}

function buildReminderText(row: WorkbookStudentFinancial) {
  const duePart = row.nextDueDate
    ? ` Next due: ${row.nextDueLabel ?? "installment"} on ${row.nextDueDate}.`
    : "";

  return `Fee reminder for ${row.studentName} (${row.admissionNo}): pending amount is Rs ${row.outstandingAmount}.${duePart} Please contact the school fee office.`;
}

function getCollectedFromInstallment(row: WorkbookInstallmentBalance) {
  return Math.max(0, row.paidAmount + row.adjustmentAmount);
}

export function buildDashboardSummary(input: DashboardSummaryInput) {
  const totalStudents = input.rawStudentCount ?? input.financialRows.length;
  const totalExpectedFees = input.financialRows.reduce(
    (sum, row) => sum + row.totalDue,
    0,
  );
  const totalCollected = input.financialRows.reduce(
    (sum, row) => sum + row.totalPaid,
    0,
  );
  const totalPending = input.financialRows.reduce(
    (sum, row) => sum + row.outstandingAmount,
    0,
  );
  const overdueAmount = input.overdueInstallments.reduce(
    (sum, row) => sum + row.pendingAmount,
    0,
  );
  const todaysCollection = input.todayTransactions.reduce(
    (sum, row) => sum + row.totalAmount,
    0,
  );

  const kpis: DashboardKpis = {
    totalStudents,
    totalExpectedFees,
    totalCollected,
    totalPending,
    overdueAmount,
    todaysCollection,
    receiptsToday: input.todayTransactions.length,
    collectionRate: calculatePercentage(totalCollected, totalExpectedFees),
  };

  const overdueByClass = input.overdueInstallments.reduce((acc, row) => {
    const key = `${row.sessionLabel}::${row.classLabel}`;
    acc.set(key, (acc.get(key) ?? 0) + row.pendingAmount);
    return acc;
  }, new Map<string, number>());

  const classMap = input.financialRows.reduce(
    (acc, row) => {
      const key = `${row.sessionLabel}::${row.classLabel}`;
      const existing = acc.get(key) ?? {
        sessionLabel: row.sessionLabel,
        classLabel: row.classLabel,
        totalStudents: 0,
        expectedAmount: 0,
        collectedAmount: 0,
        pendingAmount: 0,
        overdueAmount: 0,
        overdueStudents: 0,
        studentsWithPending: 0,
      };

      existing.totalStudents += 1;
      existing.expectedAmount += row.totalDue;
      existing.collectedAmount += row.totalPaid;
      existing.pendingAmount += row.outstandingAmount;
      existing.overdueStudents += Number(row.statusLabel === "OVERDUE");
      existing.studentsWithPending += Number(row.outstandingAmount > 0);
      acc.set(key, existing);
      return acc;
    },
    new Map<
      string,
      Omit<DashboardClassSummaryRow, "collectionRate">
    >(),
  );

  const classSummary = Array.from(classMap.entries())
    .map(([key, row]) => ({
      ...row,
      overdueAmount: overdueByClass.get(key) ?? 0,
      collectionRate: calculatePercentage(row.collectedAmount, row.expectedAmount),
    }))
    .sort((left, right) => {
      if (right.pendingAmount !== left.pendingAmount) {
        return right.pendingAmount - left.pendingAmount;
      }

      return left.classLabel.localeCompare(right.classLabel);
    });

  const installmentMap = input.installmentRows.reduce(
    (acc, row) => {
      const key = String(row.installmentNo);
      const existing = acc.get(key) ?? {
        installmentNo: row.installmentNo,
        installmentLabel: row.installmentLabel,
        dueDate: row.dueDate,
        studentCount: 0,
        expectedAmount: 0,
        collectedAmount: 0,
        pendingAmount: 0,
        overdueAmount: 0,
      };

      existing.studentCount += 1;
      existing.expectedAmount += row.totalCharge;
      existing.collectedAmount += getCollectedFromInstallment(row);
      existing.pendingAmount += row.pendingAmount;
      existing.overdueAmount += row.balanceStatus === "overdue" ? row.pendingAmount : 0;
      acc.set(key, existing);
      return acc;
    },
    new Map<
      string,
      Omit<DashboardInstallmentSummaryRow, "collectionRate">
    >(),
  );

  const installmentSummary = Array.from(installmentMap.values())
    .map((row) => ({
      ...row,
      collectionRate: calculatePercentage(row.collectedAmount, row.expectedAmount),
    }))
    .sort((left, right) => left.installmentNo - right.installmentNo);

  const trendMap = input.transactions.reduce((acc, row) => {
    const existing = acc.get(row.paymentDate) ?? {
      date: row.paymentDate,
      amount: 0,
      receiptCount: 0,
    };

    existing.amount += row.totalAmount;
    existing.receiptCount += 1;
    acc.set(row.paymentDate, existing);
    return acc;
  }, new Map<string, DashboardTrendPoint>());

  const collectionTrend = Array.from(trendMap.values())
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-14);

  const modeMap = input.todayTransactions.reduce((acc, row) => {
    const label = formatPaymentModeLabel(row.paymentMode);
    const existing = acc.get(label) ?? {
      paymentMode: label,
      amount: 0,
      receiptCount: 0,
    };

    existing.amount += row.totalAmount;
    existing.receiptCount += 1;
    acc.set(label, existing);
    return acc;
  }, new Map<string, DashboardPaymentModeBreakdown>());

  const todayPaymentModeBreakdown = Array.from(modeMap.values()).sort(
    (left, right) => right.amount - left.amount,
  );

  const recentPayments = input.transactions.slice(0, 8).map((row) => ({
    receiptId: row.receiptId,
    receiptNumber: row.receiptNumber,
    paymentDate: row.paymentDate,
    studentId: row.studentId,
    studentName: row.studentName,
    admissionNo: row.admissionNo,
    classLabel: row.classLabel,
    paymentMode: formatPaymentModeLabel(row.paymentMode),
    amount: row.totalAmount,
  }));

  const followUpQueue = input.financialRows
    .filter((row) => row.outstandingAmount > 0)
    .sort((left, right) => {
      if (left.statusLabel !== right.statusLabel) {
        if (left.statusLabel === "OVERDUE") {
          return -1;
        }

        if (right.statusLabel === "OVERDUE") {
          return 1;
        }
      }

      return right.outstandingAmount - left.outstandingAmount;
    })
    .slice(0, 10)
    .map((row) => ({
      studentId: row.studentId,
      studentName: row.studentName,
      admissionNo: row.admissionNo,
      classLabel: row.classLabel,
      fatherPhone: row.fatherPhone,
      outstandingAmount: row.outstandingAmount,
      nextDueDate: row.nextDueDate,
      nextDueLabel: row.nextDueLabel,
      nextDueAmount: row.nextDueAmount,
      statusLabel: row.statusLabel,
      reminderText: buildReminderText(row),
    }));

  const emptyState: DashboardEmptyState = {
    hasStudents: totalStudents > 0,
    hasReceipts: input.transactions.length > 0,
    hasFinancialData: totalExpectedFees > 0 || totalCollected > 0 || totalPending > 0,
  };

  return {
    kpis,
    classSummary,
    installmentSummary,
    collectionTrend,
    todayPaymentModeBreakdown,
    recentPayments,
    followUpQueue,
    emptyState,
  };
}
