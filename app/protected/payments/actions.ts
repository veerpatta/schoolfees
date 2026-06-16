"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";

import type { PaymentMode } from "@/lib/db/types";
import { recordActivity } from "@/lib/activity/events";
import { getFeePolicyForSession } from "@/lib/fees/data";
import { parseAcademicSessionLabel } from "@/lib/config/fee-rules";
import {
  DuplicatePaymentWarning,
  getPaymentPostingDiagnostic,
  postStudentPayment,
  toFriendlyPaymentPostingError,
} from "@/lib/payments/data";
import type { PaymentEntryActionState } from "@/lib/payments/types";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/supabase/session";
import { revalidateAfterPaymentPosting } from "@/lib/system-sync/finance-revalidation";
import {
  prepareDuesForStudentsAutomatically,
  revalidateSessionFinance,
} from "@/lib/system-sync/finance-sync";
import { buildSyncedOfficeSyncOutcome } from "@/lib/system-sync/office-sync";
import { publishOfficeSyncEvent } from "@/lib/system-sync/office-sync-events";
import { getStudentDetail } from "@/lib/students/data";

function parseRequiredString(value: FormDataEntryValue | null, fieldLabel: string) {
  const normalized = (value ?? "").toString().trim();

  if (!normalized) {
    throw new Error(`${fieldLabel} is required.`);
  }

  return normalized;
}

function parseUuid(value: FormDataEntryValue | null, fieldLabel: string) {
  const normalized = parseRequiredString(value, fieldLabel);
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(normalized)) {
    throw new Error(`${fieldLabel} is invalid.`);
  }

  return normalized;
}

function parsePaymentAmount(value: FormDataEntryValue | null) {
  const numeric = Number((value ?? "").toString().trim());

  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error("Payment amount must be a whole number greater than 0.");
  }

  return numeric;
}

function parseOptionalPaymentAdjustment(value: FormDataEntryValue | null, fieldLabel: string) {
  const normalized = (value ?? "").toString().trim();

  if (!normalized) {
    return 0;
  }

  const numeric = Number(normalized);

  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`${fieldLabel} must be a whole number.`);
  }

  return numeric;
}

function parseSessionLabel(value: FormDataEntryValue | null) {
  const normalized = (value ?? "").toString().trim();

  if (!normalized) {
    throw new Error("Academic session is required.");
  }

  return parseAcademicSessionLabel(normalized).normalizedLabel;
}

async function parsePaymentMode(
  value: FormDataEntryValue | null,
  sessionLabel: string,
): Promise<PaymentMode> {
  const normalized = (value ?? "").toString().trim();
  const policy = await getFeePolicyForSession(sessionLabel);

  if (policy.acceptedPaymentModes.some((item) => item.value === normalized)) {
    return normalized as PaymentMode;
  }

  throw new Error("Payment mode is not allowed by the current fee policy.");
}

function parsePaymentDate(value: FormDataEntryValue | null) {
  const normalized = parseRequiredString(value, "Payment date");
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!isoDatePattern.test(normalized)) {
    throw new Error("Payment date is invalid.");
  }

  return normalized;
}

function toActionStateError(error: unknown, clientRequestId?: string | null): PaymentEntryActionState {
  if (error instanceof DuplicatePaymentWarning) {
    return {
      status: "duplicate",
      message: error.message,
      receiptNumber: error.receiptNumber,
      receiptId: error.receiptId,
      studentId: null,
      amountReceived: null,
      quickDiscountApplied: null,
      lateFeeWaivedApplied: null,
      paymentDate: null,
      paymentMode: null,
      referenceNumber: null,
      receivedBy: null,
      clientRequestId: clientRequestId ?? null,
      remainingBalance: null,
      diagnostic: null,
      duplicateKind: error.kind,
    };
  }

  return {
    status: "error",
    message: toFriendlyPaymentPostingError(error),
    receiptNumber: null,
    receiptId: null,
    studentId: null,
    amountReceived: null,
    quickDiscountApplied: null,
    lateFeeWaivedApplied: null,
    paymentDate: null,
    paymentMode: null,
    referenceNumber: null,
    receivedBy: null,
    clientRequestId: clientRequestId ?? null,
    remainingBalance: null,
    diagnostic: getPaymentPostingDiagnostic(error),
  };
}

export async function submitPaymentEntryAction(
  _previous: PaymentEntryActionState,
  formData: FormData,
): Promise<PaymentEntryActionState> {
  let clientRequestId: string | null = null;
  const _t0 = Date.now();
  let _tBeforePost = _t0;
  try {
    const rawClientRequestId = formData.get("clientRequestId");
    if (rawClientRequestId) {
      try {
        clientRequestId = parseUuid(rawClientRequestId, "Payment attempt");
      } catch {
        // ignore parsing error here, will be caught by the main validator
      }
    }
    const staffSession = await requireStaffPermission("payments:write");
    const studentId = parseUuid(formData.get("studentId"), "Student");
    const sessionLabel = parseSessionLabel(formData.get("sessionLabel"));
    const paymentDate = parsePaymentDate(formData.get("paymentDate"));
    const paymentMode = await parsePaymentMode(formData.get("paymentMode"), sessionLabel);
    const paymentAmount = parsePaymentAmount(formData.get("paymentAmount"));
    const quickDiscountAmount = parseOptionalPaymentAdjustment(
      formData.get("quickDiscountAmount"),
      "Discount",
    );
    const quickLateFeeWaiverAmount = parseOptionalPaymentAdjustment(
      formData.get("quickLateFeeWaiverAmount"),
      "Late fee waiver",
    );
    const validatedClientRequestId = parseUuid(formData.get("clientRequestId"), "Payment attempt");
    clientRequestId = validatedClientRequestId;
    const referenceNumber = (formData.get("referenceNumber") ?? "").toString().trim() || null;
    const receivedBy = parseRequiredString(formData.get("receivedBy"), "Received by");
    const student = await getStudentDetail(studentId);

    if (!student) {
      throw new Error("Selected student could not be found. Refresh Payment Desk and select the student again.");
    }

    if (student.classSessionLabel !== sessionLabel) {
      throw new Error(
        `Selected student belongs to ${student.classSessionLabel || "another year"}, but this payment desk is working in ${sessionLabel}. Change the session before collecting.`,
      );
    }

    // Audit 1.4 — client sets acknowledgeDailyDuplicate=true after the staffer
    // explicitly confirms "this is a separate payment" on the duplicate sheet.
    const acknowledgeDailyDuplicate =
      (formData.get("acknowledgeDailyDuplicate") ?? "").toString() === "true";

    // A1 — permanent late-fee waiver. When the cashier ticks "waive late fee",
    // persist it to the student's fee override via the proven `waive_late_fee`
    // RPC FIRST, then post the payment with no per-receipt writeoff. This makes
    // the waiver permanent and consistent everywhere (profile, defaulters,
    // receipts) instead of a one-off writeoff that only the receipt knew about.
    // The receipt still shows the "Late fee waived" line via the
    // late_fee_waiver_amount fallback in lib/receipts/data.ts.
    //
    // Both RPCs take the same per-student advisory lock, so the waive and the
    // post serialise. They are two calls, not one transaction: if the post
    // fails after the waive succeeds, the (audited) waiver persists and the
    // cashier simply retries the payment — the same clientRequestId dedupes the
    // waiver, and a re-tick is unnecessary.
    if (quickLateFeeWaiverAmount > 0) {
      await requireStaffPermission("payments:waive_late_fee");
      const supabase = await createClient();
      const { data: waiveRows, error: waiveError } = await supabase.rpc("waive_late_fee", {
        p_student_id: studentId,
        p_amount: quickLateFeeWaiverAmount,
        p_remarks: `Late fee waived at Payment Desk during collection on ${paymentDate}`,
        p_session_label: sessionLabel,
        p_client_request_id: clientRequestId,
      });
      if (waiveError) {
        throw new Error(
          `Could not waive the late fee, so no payment was posted. Please retry. (${waiveError.message})`,
        );
      }
      const waiveRow =
        ((waiveRows ?? []) as Array<{ ok: boolean; message: string | null }>)[0] ?? null;
      // ok=false solely because there is no pending late fee left means the
      // waiver was already applied (e.g. a retried submit) — non-fatal. Any
      // other failure must block the post so money and waivers stay in sync.
      if (waiveRow && !waiveRow.ok && !/no pending late fee/i.test(waiveRow.message ?? "")) {
        throw new Error(
          `Could not waive the late fee, so no payment was posted: ${waiveRow.message ?? "unknown error"}`,
        );
      }
    }

    _tBeforePost = Date.now();
    const receipt = await postStudentPayment({
      studentId,
      sessionLabel,
      paymentDate,
      paymentMode,
      paymentAmount,
      quickDiscountAmount,
      // Waiver (if any) is now persisted as a permanent override above, so the
      // posting RPC must NOT also create a writeoff — that would double-count.
      quickLateFeeWaiverAmount: 0,
      referenceNumber,
      remarks: (formData.get("remarks") ?? "").toString().trim() || null,
      receivedBy,
      clientRequestId,
      acknowledgeDailyDuplicate,
    });
    const _tAfterPost = Date.now();
    // Coarse latency split so a slow post is attributable from the Vercel logs:
    // `pre` = auth + validation + student/policy reads before posting,
    // `post` = postStudentPayment (preflight reads + duplicate checks + RPC).
    console.log(
      `[payment-post] ok total=${_tAfterPost - _t0}ms pre=${_tBeforePost - _t0}ms post=${_tAfterPost - _tBeforePost}ms`,
    );
    const resolvedSessionLabel = student.classSessionLabel || sessionLabel;

    revalidateSessionFinance(resolvedSessionLabel, [studentId]);
    // Audit 1.8 — also path-revalidate Dashboard / Transactions / Receipts /
    // Defaulters so they don't render a stale snapshot after a payment posts.
    // revalidateSessionFinance only invalidates session: / student: tags;
    // PAYMENT_AFFECTED_PATHS was orphaned before this fix.
    revalidateAfterPaymentPosting([studentId]);
    const syncOutcome = buildSyncedOfficeSyncOutcome({
      sessionLabel: resolvedSessionLabel,
      affectedStudentIds: [studentId],
    });

    // The office-sync event and activity log are best-effort, non-critical
    // bookkeeping. Awaiting them added two sequential Mumbai round-trips to the
    // cashier's perceived posting latency for no user-visible benefit. Run them
    // via after() so they execute after the response is sent; both already
    // swallow their own errors, so a post-response failure is harmless.
    after(async () => {
      await publishOfficeSyncEvent({
        sessionLabel: resolvedSessionLabel,
        entityType: "payment",
        entityId: receipt.receiptId,
        action: "posted",
        affectedStudentIds: [studentId],
        metadata: {
          receiptNumber: receipt.receiptNumber,
          status: syncOutcome.status,
        },
      });

      await recordActivity({
        userId: (staffSession?.id as string | undefined) ?? null,
        kind: "payment_posted",
        refId: receipt.receiptId,
        payload: {
          studentId,
          receiptNumber: receipt.receiptNumber,
          amount: paymentAmount,
          paymentMode,
          sessionLabel: resolvedSessionLabel,
        },
      });
    });

    return {
      status: "success",
      message: `Payment posted successfully. Receipt ${receipt.receiptNumber} generated.`,
      receiptNumber: receipt.receiptNumber,
      receiptId: receipt.receiptId,
      studentId,
      amountReceived: paymentAmount,
      quickDiscountApplied: receipt.quickDiscountApplied,
      lateFeeWaivedApplied: receipt.lateFeeWaivedApplied,
      paymentDate,
      paymentMode,
      referenceNumber,
      receivedBy,
      clientRequestId,
      remainingBalance: Math.max((receipt.remainingBalance ?? 0), 0),
      diagnostic: null,
      syncOutcome,
    };
  } catch (error) {
    console.log(
      `[payment-post] fail total=${Date.now() - _t0}ms pre=${_tBeforePost - _t0}ms`,
    );
    return toActionStateError(error, clientRequestId);
  }
}

export async function repairPaymentDeskStudentDuesAction(formData: FormData) {
  await requireStaffPermission("payments:write");
  const studentId = parseUuid(formData.get("studentId"), "Student");
  const sessionLabel = parseSessionLabel(formData.get("sessionLabel"));
  const student = await getStudentDetail(studentId);

  if (!student) {
    throw new Error("Student record was not found.");
  }

  if (student.classSessionLabel !== sessionLabel) {
    throw new Error(
      `Selected student belongs to ${student.classSessionLabel || "another year"}, but this payment desk is working in ${sessionLabel}.`,
    );
  }

  const result = await prepareDuesForStudentsAutomatically({
    studentIds: [studentId],
    sessionLabel,
    reason: "Payment Desk manual repair",
  });
  await publishOfficeSyncEvent({
    sessionLabel,
    entityType: "student",
    entityId: studentId,
    action: "payment_desk_repair",
    affectedStudentIds: [studentId],
    metadata: {
      readyForPaymentCount: result.readyForPaymentCount,
      duesNeedAttentionCount: result.duesNeedAttentionCount,
    },
  });
  const noticeParts = result.readyForPaymentCount > 0 && result.duesNeedAttentionCount === 0
    ? [
        `Dues prepared: ${result.inserted} prepared`,
        `${result.updated} updated`,
        `${result.cancelled} cancelled`,
        `${result.protected} kept for review`,
      ]
    : [
        "Dues could not be prepared",
        result.reasonSummary || "Check Fee Setup for this class and year.",
      ];

  const params = new URLSearchParams({
    studentId,
    session: sessionLabel,
    repairNotice: noticeParts.join("; "),
  });

  redirect(`/protected/payments?${params.toString()}`);
}
