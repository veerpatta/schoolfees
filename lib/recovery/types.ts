import type { StudentStatus } from "@/lib/db/types";

/**
 * Recovery = collecting still-pending dues from students who have LEFT the school
 * (status left / graduated / inactive). This is distinct from `lib/defaulters`,
 * which is follow-up for STILL-ENROLLED (active) students. Nothing here is new
 * storage — it is a read model over existing installment balances + students.
 */

/** A non-active status that puts a student into the recovery queue. */
export type RecoveryStudentStatus = Extract<StudentStatus, "left" | "graduated" | "inactive">;

export const RECOVERY_STUDENT_STATUSES: readonly RecoveryStudentStatus[] = [
  "left",
  "graduated",
  "inactive",
];

/** One pending installment owed by a left student. */
export type RecoveryDue = {
  installmentId: string;
  installmentLabel: string;
  dueDate: string | null;
  /** Session the installment itself belongs to. */
  sessionLabel: string | null;
  /** For carry-forward rows, the session the unpaid balance originated in. */
  sourceSessionLabel: string | null;
  isCarryForward: boolean;
  carryForwardBalanceId: string | null;
  remainingAmount: number;
};

/** A single left student's recoverable position, aggregated across their dues. */
export type StudentRecoveryDueRow = {
  studentId: string;
  admissionNo: string;
  fullName: string;
  fatherName: string | null;
  phone: string | null;
  status: RecoveryStudentStatus;
  classId: string | null;
  classLabel: string | null;
  /** The earliest session any of these dues trace back to. */
  sourceSessionLabel: string | null;
  totalRemaining: number;
  lastPaymentDate: string | null;
  hasCarryForward: boolean;
  carryForwardBalanceIds: string[];
  dues: RecoveryDue[];
  /** Collectable when there is a positive pending balance to allocate to. */
  collectable: boolean;
};

export type RecoveryQueueFilters = {
  /** Matches admission no / name / phone. */
  query?: string;
  statuses?: RecoveryStudentStatus[];
  sourceSessionLabel?: string;
  classId?: string;
};

export type RecoveryQueueData = {
  rows: StudentRecoveryDueRow[];
  totalStudents: number;
  totalRemaining: number;
  statusCounts: Record<RecoveryStudentStatus, number>;
  sessionOptions: string[];
  classOptions: Array<{ classId: string; classLabel: string }>;
};
