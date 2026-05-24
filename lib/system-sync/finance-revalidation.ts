import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

// Next.js 16 forbids revalidatePath / revalidateTag during render. The
// admin-tools page calls autoReconcileSessionIfSafe → generateMissingSessionDues
// → revalidateCoreFinancePaths during its render path. We can't restructure
// every call site here, so we swallow render-time invalidation errors and let
// the background cron / explicit Server Actions pick up the revalidation.
function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // no-op: called during render in Next 16
  }
}

function safeRevalidateTag(tag: string, lifetime: Parameters<typeof revalidateTag>[1] = "max") {
  try {
    revalidateTag(tag, lifetime);
  } catch {
    // no-op: called during render in Next 16
  }
}

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
    safeRevalidatePath(`/protected/students/${studentId}`);
    safeRevalidatePath(`/protected/students/${studentId}/statement`);
    safeRevalidateTag(`student:${studentId}`, "max");
  }
}

export function revalidateAfterPaymentPosting(studentIds: readonly string[] = []) {
  for (const path of PAYMENT_AFFECTED_PATHS) {
    safeRevalidatePath(path);
  }

  revalidateStudentFinance(studentIds);
}

export function revalidateCoreFinancePaths(studentIds: readonly string[] = []) {
  for (const path of FULL_FINANCE_PATHS) {
    safeRevalidatePath(path);
  }

  revalidateStudentFinance(studentIds);
}

export function revalidateSessionFinance(
  sessionLabel: string,
  studentIds: readonly string[] = [],
) {
  const normalizedSessionLabel = sessionLabel.trim();

  if (normalizedSessionLabel) {
    safeRevalidateTag(`session:${sessionLabel}`, "max");
  }

  for (const studentId of new Set(studentIds.filter(Boolean))) {
    safeRevalidateTag(`student:${studentId}`, "max");
  }
}
