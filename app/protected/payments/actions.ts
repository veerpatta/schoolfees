"use server";

import { redirect } from "next/navigation";

import type { PaymentMode } from "@/lib/db/types";
import { getFeePolicyForSession } from "@/lib/fees/data";
import { parseAcademicSessionLabel } from "@/lib/config/fee-rules";
import {
  DuplicatePaymentWarning,
  getPaymentPostingDiagnostic,
  postStudentPayment,
  toFriendlyPaymentPostingError,
} from "@/lib/payments/data";
import type { PaymentEntryActionState } from "@/lib/payments/types";
import { requireStaffPermission } from "@/lib/supabase/session";
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

function toActionStateError(error: unknown): PaymentEntryActionState {
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
      clientRequestId: null,
      remainingBalance: null,
      diagnostic: null,
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
    clientRequestId: null,
    remainingBalance: null,
    diagnostic: getPaymentPostingDiagnostic(error),
  };
}

export async function submitPaymentEntryAction(
  _previous: PaymentEntryActionState,
  formData: FormData,
): Promise<PaymentEntryActionState> {
  try {
    await requireStaffPermission("payments:write");
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
    const clientRequestId = parseUuid(formData.get("clientRequestId"), "Payment attempt");
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

    const receipt = await postStudentPayment({
      studentId,
      sessionLabel,
      paymentDate,
      paymentMode,
      paymentAmount,
      quickDiscountAmount,
      quickLateFeeWaiverAmount,
      referenceNumber,
      remarks: (formData.get("remarks") ?? "").toString().trim() || null,
      receivedBy,
      clientRequestId,
    });
    const resolvedSessionLabel = student.classSessionLabel || sessionLabel;

    revalidateSessionFinance(resolvedSessionLabel, [studentId]);
    const syncOutcome = buildSyncedOfficeSyncOutcome({
      sessionLabel: resolvedSessionLabel,
      affectedStudentIds: [studentId],
    });
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
    return toActionStateError(error);
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
