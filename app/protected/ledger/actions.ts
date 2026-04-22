"use server";

import { revalidatePath } from "next/cache";

import { addPaymentAdjustment } from "@/lib/ledger/data";
import type { LedgerAdjustmentActionState } from "@/lib/ledger/types";
import { requireStaffPermission } from "@/lib/supabase/session";

function parseRequiredString(value: FormDataEntryValue | null, label: string) {
  const normalized = (value ?? "").toString().trim();

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function parseUuid(value: FormDataEntryValue | null, label: string) {
  const normalized = parseRequiredString(value, label);
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(normalized)) {
    throw new Error(`${label} is invalid.`);
  }

  return normalized;
}

function parseAdjustmentType(value: FormDataEntryValue | null) {
  const normalized = (value ?? "").toString().trim();

  if (
    normalized === "correction" ||
    normalized === "reversal" ||
    normalized === "discount" ||
    normalized === "writeoff"
  ) {
    return normalized;
  }

  throw new Error("Adjustment category is invalid.");
}

function parseDirection(value: FormDataEntryValue | null) {
  const normalized = (value ?? "").toString().trim();

  if (normalized === "increase_due" || normalized === "reduce_due") {
    return normalized;
  }

  throw new Error("Adjustment impact is invalid.");
}

function parseAmount(value: FormDataEntryValue | null) {
  const numeric = Number((value ?? "").toString().trim());

  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error("Adjustment amount must be a whole number greater than 0.");
  }

  return numeric;
}

function toActionStateError(error: unknown): LedgerAdjustmentActionState {
  return {
    status: "error",
    message:
      error instanceof Error
        ? error.message
        : "Unable to add adjustment right now. Please try again.",
  };
}

export async function submitLedgerAdjustmentAction(
  _previous: LedgerAdjustmentActionState,
  formData: FormData,
): Promise<LedgerAdjustmentActionState> {
  try {
    await requireStaffPermission("payments:adjust");

    const amount = parseAmount(formData.get("amount"));
    const direction = parseDirection(formData.get("direction"));
    const amountDelta = direction === "reduce_due" ? amount : -amount;

    await addPaymentAdjustment({
      studentId: parseUuid(formData.get("studentId"), "Student"),
      paymentId: parseUuid(formData.get("paymentId"), "Payment row"),
      adjustmentType: parseAdjustmentType(formData.get("adjustmentType")),
      amountDelta,
      reason: parseRequiredString(formData.get("reason"), "Reason"),
      notes: (formData.get("notes") ?? "").toString().trim() || null,
    });

    revalidatePath("/protected/ledger");
    revalidatePath("/protected/payments");
    revalidatePath("/protected/finance-controls");
    revalidatePath("/protected/defaulters");
    revalidatePath("/protected");

    return {
      status: "success",
      message: "Adjustment added. Original payment row remains unchanged and audit log updated.",
    };
  } catch (error) {
    return toActionStateError(error);
  }
}
