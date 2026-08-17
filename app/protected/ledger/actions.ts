"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { addPaymentAdjustment } from "@/lib/ledger/data";
import type { LedgerAdjustmentActionState } from "@/lib/ledger/types";
import { drainFinancialViewRefresh } from "@/lib/system-sync/financial-view-refresh";
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
    normalized === "discount" ||
    normalized === "writeoff"
  ) {
    return normalized;
  }

  // A per-payment-row reversal could leave a receipt PARTLY reversed, which
  // every collection total then counts at face value. Reversing is a
  // whole-receipt operation, so point the caller at it rather than accepting
  // half of one.
  if (normalized === "reversal") {
    throw new Error(
      "Reversing is done on the whole receipt, not one ledger row. Open the receipt and use “Reverse this receipt”.",
    );
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

    // The adjustment trigger only enqueues the matview refresh now
    // (migration 20260726000002). Drain it after the response so the ledger
    // shows the corrected dues immediately rather than on the 2-minute cron.
    after(drainFinancialViewRefresh);

    return {
      status: "success",
      message: "Adjustment added. Original payment row remains unchanged and audit log updated.",
    };
  } catch (error) {
    return toActionStateError(error);
  }
}
