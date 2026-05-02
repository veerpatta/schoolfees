"use server";

import { redirect } from "next/navigation";

import type { PaymentMode } from "@/lib/db/types";
import { getFeePolicySummary } from "@/lib/fees/data";
import { upsertStudentFeeOverride } from "@/lib/fees/policy";
import { createClient } from "@/lib/supabase/server";
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
  revalidateCoreFinancePaths,
} from "@/lib/system-sync/finance-sync";

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

async function parsePaymentMode(value: FormDataEntryValue | null): Promise<PaymentMode> {
  const normalized = (value ?? "").toString().trim();
  const policy = await getFeePolicySummary();

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


function parseWholeNumberOptional(value: FormDataEntryValue | null, fieldLabel: string) {
  const normalized = (value ?? "").toString().trim();
  if (!normalized) return 0;
  const numeric = Number(normalized);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`${fieldLabel} must be a whole number 0 or greater.`);
  }
  return numeric;
}

async function applyPaymentDeskOverrides(payload: {
  studentId: string;
  waiveLateFee: boolean;
  additionalDiscount: number;
}) {
  if (!payload.waiveLateFee && payload.additionalDiscount <= 0) return;
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("student_fee_overrides")
    .select("custom_tuition_fee_amount, custom_transport_fee_amount, custom_books_fee_amount, custom_admission_activity_misc_fee_amount, custom_other_fee_heads, custom_late_fee_flat_amount, other_adjustment_head, other_adjustment_amount, late_fee_waiver_amount, discount_amount, student_type_override, transport_applies_override, notes")
    .eq("student_id", payload.studentId)
    .eq("is_active", true)
    .maybeSingle();

  await upsertStudentFeeOverride({
    studentId: payload.studentId,
    customTuitionFeeAmount: existing?.custom_tuition_fee_amount ?? null,
    customTransportFeeAmount: existing?.custom_transport_fee_amount ?? null,
    customBooksFeeAmount: existing?.custom_books_fee_amount ?? null,
    customAdmissionActivityMiscFeeAmount: existing?.custom_admission_activity_misc_fee_amount ?? null,
    customFeeHeadAmounts: existing?.custom_other_fee_heads ?? {},
    customFeeHeads: [],
    customLateFeeFlatAmount: existing?.custom_late_fee_flat_amount ?? null,
    otherAdjustmentHead: existing?.other_adjustment_head ?? null,
    otherAdjustmentAmount: existing?.other_adjustment_amount ?? null,
    lateFeeWaiverAmount: payload.waiveLateFee ? 1000 : (existing?.late_fee_waiver_amount ?? 0),
    discountAmount: (existing?.discount_amount ?? 0) + payload.additionalDiscount,
    studentTypeOverride: existing?.student_type_override ?? null,
    transportAppliesOverride: existing?.transport_applies_override ?? null,
    reason: "Payment Desk quick override",
    notes: existing?.notes ?? null,
  });
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
    const paymentDate = parsePaymentDate(formData.get("paymentDate"));
    const paymentMode = await parsePaymentMode(formData.get("paymentMode"));
    const paymentAmount = parsePaymentAmount(formData.get("paymentAmount"));
    const clientRequestId = parseUuid(formData.get("clientRequestId"), "Payment attempt");
    const referenceNumber = (formData.get("referenceNumber") ?? "").toString().trim() || null;
    const receivedBy = parseRequiredString(formData.get("receivedBy"), "Received by");
    const waiveLateFee = (formData.get("waiveLateFee") ?? "0").toString() === "1";
    const additionalDiscount = parseWholeNumberOptional(formData.get("additionalDiscount"), "Additional discount");

    await applyPaymentDeskOverrides({ studentId, waiveLateFee, additionalDiscount });

    const receipt = await postStudentPayment({
      studentId,
      paymentDate,
      paymentMode,
      paymentAmount,
      referenceNumber,
      remarks: (formData.get("remarks") ?? "").toString().trim() || null,
      receivedBy,
      clientRequestId,
    });

    revalidateCoreFinancePaths([studentId]);

    return {
      status: "success",
      message: `Payment posted successfully. Receipt ${receipt.receiptNumber} generated.`,
      receiptNumber: receipt.receiptNumber,
      receiptId: receipt.receiptId,
      studentId,
      amountReceived: paymentAmount,
      paymentDate,
      paymentMode,
      referenceNumber,
      receivedBy,
      clientRequestId,
      remainingBalance: Math.max((receipt.remainingBalance ?? 0), 0),
      diagnostic: null,
    };
  } catch (error) {
    return toActionStateError(error);
  }
}

export async function repairPaymentDeskStudentDuesAction(formData: FormData) {
  await requireStaffPermission("payments:write");
  const studentId = parseUuid(formData.get("studentId"), "Student");

  const result = await prepareDuesForStudentsAutomatically({
    studentIds: [studentId],
    reason: "Payment Desk manual repair",
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
    repairNotice: noticeParts.join("; "),
  });

  redirect(`/protected/payments?${params.toString()}`);
}
