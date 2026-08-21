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

/**
 * Busts a cache tag from a Server Action, and says so when it fails.
 *
 * The two private helpers above swallow deliberately, and their reason is real:
 * Next 16 forbids invalidation during render, and the admin-tools page reaches
 * them mid-render. That reason does not extend to a Server Action. Every caller
 * of this function is one — `revalidateFeeSetupSurface`,
 * `revalidateMasterDataSurface` and `applyPromotionRunAction` all run in the
 * action phase — so a throw here means the bust genuinely did not happen.
 *
 * That matters because of what these particular tags gate. The fee-policy
 * resolvers are cached under `fee-policy` for 300s; if the bust after a
 * promotion, a Fee Setup publish or a session write is lost, `loadPolicyForSession`
 * cannot see the new row and falls back to the OUTGOING year's installment
 * schedule and late fee — so `post_student_payment` prices the new year off the
 * old year's policy until the entry expires. A bare `catch {}` made that
 * indistinguishable from success.
 *
 * It deliberately does not rethrow. The write it follows has already committed,
 * and failing the action afterwards would tell the office the opposite of what
 * happened. Stale-and-logged beats "your promotion failed".
 */
export function revalidateTagAfterWrite(
  tag: string,
  lifetime: Parameters<typeof revalidateTag>[1] = "max",
) {
  try {
    revalidateTag(tag, lifetime);
  } catch (error) {
    console.error(
      `[finance-revalidation] cache bust for "${tag}" failed after a committed write. ` +
        "Readers may serve stale fee policy until the entry expires.",
      error,
    );
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
