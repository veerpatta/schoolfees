import "server-only";

import {
  getWorkbookInstallmentRows,
  getWorkbookStudentFinancials,
  getWorkbookTransactions,
} from "@/lib/workbook/data";

type ClassSummaryAccumulator = {
  sessionLabel: string;
  classLabel: string;
  totalStudents: number;
  totalDue: number;
  totalPaid: number;
  totalOutstanding: number;
  paidStudents: number;
  partlyPaidStudents: number;
  overdueStudents: number;
  notStartedStudents: number;
  overdueInstallments: number;
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
  totalDue: number;
  totalPaid: number;
  totalOutstanding: number;
  paidStudents: number;
  partlyPaidStudents: number;
  overdueStudents: number;
  notStartedStudents: number;
  studentsWithPending: number;
  overdueInstallments: number;
  pendingAmount: number;
};

export type DashboardInstallmentSummaryRow = {
  installmentLabel: string;
  studentCount: number;
  pendingAmount: number;
};

export type DashboardPageData = {
  totalStudents: number;
  totalDue: number;
  totalCollected: number;
  totalPending: number;
  overdueInstallmentCount: number;
  studentsWithPending: number;
  paidStudents: number;
  partlyPaidStudents: number;
  overdueStudents: number;
  notStartedStudents: number;
  recentPayments: DashboardRecentPayment[];
  classSummary: DashboardClassSummaryRow[];
  installmentSummary: DashboardInstallmentSummaryRow[];
};

export async function getDashboardPageData(): Promise<DashboardPageData> {
  const [financialRows, transactions, overdueInstallments] = await Promise.all([
    getWorkbookStudentFinancials(),
    getWorkbookTransactions(),
    getWorkbookInstallmentRows({ overdueOnly: true, pendingOnly: true }),
  ]);

  const classSummaryMap = new Map<string, ClassSummaryAccumulator>();
  let totalDue = 0;
  let totalCollected = 0;
  let totalPending = 0;
  const overdueInstallmentCount = overdueInstallments.length;
  let studentsWithPending = 0;
  let paidStudents = 0;
  let partlyPaidStudents = 0;
  let overdueStudents = 0;
  let notStartedStudents = 0;

  financialRows.forEach((row) => {
    totalDue += row.totalDue;
    totalCollected += row.totalPaid;
    totalPending += row.outstandingAmount;
    if (row.outstandingAmount > 0) {
      studentsWithPending += 1;
    }

    if (row.statusLabel === "PAID") {
      paidStudents += 1;
    } else if (row.statusLabel === "NOT STARTED") {
      notStartedStudents += 1;
    } else if (row.statusLabel === "OVERDUE") {
      overdueStudents += 1;
    } else if (row.statusLabel === "PARTLY PAID") {
      partlyPaidStudents += 1;
    }

    const key = `${row.sessionLabel}::${row.classLabel}`;
    const existing = classSummaryMap.get(key);

    if (existing) {
      existing.totalStudents += 1;
      existing.totalDue += row.totalDue;
      existing.totalPaid += row.totalPaid;
      existing.totalOutstanding += row.outstandingAmount;
      existing.overdueInstallments += Number(row.statusLabel === "OVERDUE");
      existing.paidStudents += Number(row.statusLabel === "PAID");
      existing.partlyPaidStudents += Number(row.statusLabel === "PARTLY PAID");
      existing.overdueStudents += Number(row.statusLabel === "OVERDUE");
      existing.notStartedStudents += Number(row.statusLabel === "NOT STARTED");
      return;
    }

    classSummaryMap.set(key, {
      sessionLabel: row.sessionLabel,
      classLabel: row.classLabel,
      totalStudents: 1,
      totalDue: row.totalDue,
      totalPaid: row.totalPaid,
      totalOutstanding: row.outstandingAmount,
      paidStudents: Number(row.statusLabel === "PAID"),
      partlyPaidStudents: Number(row.statusLabel === "PARTLY PAID"),
      overdueStudents: Number(row.statusLabel === "OVERDUE"),
      notStartedStudents: Number(row.statusLabel === "NOT STARTED"),
      overdueInstallments: Number(row.statusLabel === "OVERDUE"),
    });
  });

  const classSummary = Array.from(classSummaryMap.values())
    .map((row) => ({
      sessionLabel: row.sessionLabel,
      classLabel: row.classLabel,
      totalStudents: row.totalStudents,
      totalDue: row.totalDue,
      totalPaid: row.totalPaid,
      totalOutstanding: row.totalOutstanding,
      paidStudents: row.paidStudents,
      partlyPaidStudents: row.partlyPaidStudents,
      overdueStudents: row.overdueStudents,
      notStartedStudents: row.notStartedStudents,
      studentsWithPending: row.totalStudents - row.paidStudents,
      overdueInstallments: row.overdueInstallments,
      pendingAmount: row.totalOutstanding,
    }))
    .sort((left, right) => {
      if (right.pendingAmount !== left.pendingAmount) {
        return right.pendingAmount - left.pendingAmount;
      }

      return left.classLabel.localeCompare(right.classLabel);
    });

  const installmentSummary: DashboardInstallmentSummaryRow[] = [
    {
      installmentLabel: "Installment 1",
      studentCount: financialRows.filter((row) => row.inst1Pending > 0).length,
      pendingAmount: financialRows.reduce((sum, row) => sum + row.inst1Pending, 0),
    },
    {
      installmentLabel: "Installment 2",
      studentCount: financialRows.filter((row) => row.inst2Pending > 0).length,
      pendingAmount: financialRows.reduce((sum, row) => sum + row.inst2Pending, 0),
    },
    {
      installmentLabel: "Installment 3",
      studentCount: financialRows.filter((row) => row.inst3Pending > 0).length,
      pendingAmount: financialRows.reduce((sum, row) => sum + row.inst3Pending, 0),
    },
    {
      installmentLabel: "Installment 4",
      studentCount: financialRows.filter((row) => row.inst4Pending > 0).length,
      pendingAmount: financialRows.reduce((sum, row) => sum + row.inst4Pending, 0),
    },
  ];

  const recentPayments = transactions.slice(0, 8).map((row) => ({
    receiptNumber: row.receiptNumber,
    paymentDate: row.paymentDate,
    studentName: row.studentName,
    admissionNo: row.admissionNo,
    classLabel: row.classLabel,
    paymentMode:
      row.paymentMode === "upi"
        ? "UPI"
        : row.paymentMode === "bank_transfer"
          ? "Bank transfer"
          : row.paymentMode === "cheque"
            ? "Cheque"
            : "Cash",
    amount: row.totalAmount,
  }));

  return {
    totalStudents: financialRows.length,
    totalDue,
    totalCollected,
    totalPending,
    overdueInstallmentCount,
    studentsWithPending,
    paidStudents,
    partlyPaidStudents,
    overdueStudents,
    notStartedStudents,
    recentPayments,
    classSummary,
    installmentSummary,
  };
}
