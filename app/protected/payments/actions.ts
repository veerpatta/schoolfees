"use server";

import { revalidatePath } from "next/cache";

import type { PaymentMode } from "@/lib/db/types";
import { getFeePolicySummary } from "@/lib/fees/data";
import { postStudentPayment } from "@/lib/payments/data";
import type { PaymentEntryActionState } from "@/lib/payments/types";
import { requireStaffPermission } from "@/lib/supabase/session";

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

function toActionStateError(error: unknown): PaymentEntryActionState {
  return {
    status: "error",
    message:
      error instanceof Error
        ? error.message
        : "Unable to save payment right now. Please try again.",
    receiptNumber: null,
    receiptId: null,
    studentId: null,
  };
}

export async function submitPaymentEntryAction(
  _previous: PaymentEntryActionState,
  formData: FormData,
): Promise<PaymentEntryActionState> {
  try {
    await requireStaffPermission("payments:write");
    const studentId = parseUuid(formData.get("studentId"), "Student");

    const receipt = await postStudentPayment({
      studentId,
      paymentDate: parsePaymentDate(formData.get("paymentDate")),
      paymentMode: await parsePaymentMode(formData.get("paymentMode")),
      paymentAmount: parsePaymentAmount(formData.get("paymentAmount")),
      referenceNumber: (formData.get("referenceNumber") ?? "").toString().trim() || null,
      remarks: (formData.get("remarks") ?? "").toString().trim() || null,
      receivedBy: parseRequiredString(formData.get("receivedBy"), "Received by"),
    });

    revalidatePath("/protected");
    revalidatePath("/protected/dashboard");
    revalidatePath("/protected/payments");
    revalidatePath("/protected/collections");
    revalidatePath("/protected/finance-controls");
    revalidatePath("/protected/receipts");
    revalidatePath("/protected/dues");
    revalidatePath("/protected/defaulters");
    revalidatePath("/protected/transactions");
    revalidatePath("/protected/reports");
    revalidatePath("/protected/ledger");
    revalidatePath(`/protected/students/${studentId}`);
    revalidatePath(`/protected/students/${studentId}/statement`);

    return {
      status: "success",
      message: `Payment posted successfully. Receipt ${receipt.receiptNumber} generated.`,
      receiptNumber: receipt.receiptNumber,
      receiptId: receipt.receiptId,
      studentId,
    };
  } catch (error) {
    return toActionStateError(error);
  }
}
