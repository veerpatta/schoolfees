import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

const CORE_FINANCE_PATHS = [
  "/protected",
  "/protected/dashboard",
  "/protected/students",
  "/protected/payments",
  "/protected/collections",
  "/protected/transactions",
  "/protected/receipts",
  "/protected/defaulters",
  "/protected/reports",
  "/protected/ledger",
  "/protected/fee-setup",
  "/protected/fee-setup/generate",
  "/protected/imports",
  "/protected/dues",
] as const;

export function revalidateCoreFinancePaths(studentIds: readonly string[] = []) {
  revalidateSessionFinance("legacy", studentIds);

  for (const path of CORE_FINANCE_PATHS) {
    revalidatePath(path);
  }

  for (const studentId of new Set(studentIds.filter(Boolean))) {
    revalidatePath(`/protected/students/${studentId}`);
    revalidatePath(`/protected/students/${studentId}/statement`);
    revalidatePath(`/protected/payments?studentId=${studentId}`);
  }
}

export function revalidateAfterPaymentPosting(studentIds: readonly string[] = []) {
  revalidateSessionFinance("legacy", studentIds);

  const paymentPaths = [
    "/protected/dashboard",
    "/protected/payments",
    "/protected/transactions",
    "/protected/receipts",
    "/protected/defaulters",
  ] as const;

  for (const path of paymentPaths) {
    revalidatePath(path);
  }

  for (const studentId of new Set(studentIds.filter(Boolean))) {
    revalidatePath(`/protected/students/${studentId}`);
    revalidatePath(`/protected/students/${studentId}/statement`);
    revalidatePath(`/protected/payments?studentId=${studentId}`);
  }
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
