export type StudentRecord = {
  id: string;
  admissionNo: string;
  fullName: string;
  classSection: string;
  status: "active" | "inactive";
};

export type FeeLedgerEntry = {
  id: string;
  studentId: string;
  installmentLabel: string;
  dueDate: string;
  amount: number;
  lateFee: number;
  paidAmount: number;
  paymentStatus: "pending" | "partial" | "paid";
  updatedAt: string;
};
