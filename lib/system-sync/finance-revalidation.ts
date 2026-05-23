import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

const PAYMENT_AFFECTED_PATHS = [
  "/protected/dashboard",
  "/protected/transactions",
  "/protected/receipts",
  "/protected/defaulters",
] as const;

const FULL_FINANCE_PATHS = [
  "/protected/dashboard",
  "/protected/students",
  "/protected/transactions",
  "/protected/receipts",
  "/protected/defaulters",
  "/protected/dues",
  "/protected/ledger",
] as const;

function revalidateStudentFinance(studentIds: readonly string[] = []) {
  for (const studentId of new Set(studentIds.filter(Boolean))) {
    revalidatePath(`/protected/students/${studentId}`);
    revalidatePath(`/protected/students/${studentId}/statement`);
    revalidateTag(`student:${studentId}`, "max");
  }
}

export function revalidateAfterPaymentPosting(studentIds: readonly string[] = []) {
  for (const path of PAYMENT_AFFECTED_PATHS) {
    revalidatePath(path);
  }

  revalidateStudentFinance(studentIds);
}

export function revalidateCoreFinancePaths(studentIds: readonly string[] = []) {
  for (const path of FULL_FINANCE_PATHS) {
    revalidatePath(path);
  }

  revalidateStudentFinance(studentIds);
}

export function revalidateSessionFinance(
  sessionLabel: string,
  studentIds: readonly string[] = [],
) {
  const normalizedSessionLabel = sessionLabel.trim();

  if (normalizedSessionLabel) {
    revalidateTag(`session:${sessionLabel}`, "max");
  }

  for (const studentId of new Set(studentIds.filter(Boolean))) {
    revalidateTag(`student:${studentId}`, "max");
  }
}
