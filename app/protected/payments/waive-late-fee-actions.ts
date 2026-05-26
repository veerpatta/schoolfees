"use server";

import { revalidatePath } from "next/cache";

import { upsertStudentFeeOverride } from "@/lib/fees/data";
import { recordActivity } from "@/lib/activity/events";
import { syncAfterStudentChange } from "@/lib/system-sync/finance-sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffPermission } from "@/lib/supabase/session";

export type WaiveLateFeeActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  newWaiverAmount: number | null;
};

export const INITIAL_WAIVE_LATE_FEE_ACTION_STATE: WaiveLateFeeActionState = {
  status: "idle",
  message: null,
  newWaiverAmount: null,
};

type WorkbookFinancialRow = {
  outstanding_amount: number;
  late_fee_total: number | null;
  pending_late_fee_amount: number | null;
};

type ExistingOverrideRow = {
  id: string;
  discount_amount: number;
  reason: string;
  notes: string | null;
  custom_tuition_fee_amount: number | null;
  custom_transport_fee_amount: number | null;
  custom_books_fee_amount: number | null;
  custom_admission_activity_misc_fee_amount: number | null;
  custom_other_fee_heads: unknown;
  custom_late_fee_flat_amount: number | null;
  other_adjustment_head: string | null;
  other_adjustment_amount: number | null;
  late_fee_waiver_amount: number;
  student_type_override: "new" | "existing" | null;
  transport_applies_override: boolean | null;
};

function parseAmount(value: FormDataEntryValue | null): number {
  const raw = (value ?? "").toString().trim();
  if (!raw) return NaN;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed) : NaN;
}

function asNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.round(value);
}

/**
 * Standalone late-fee waiver, posted from the Payment Desk by an admin or
 * accountant (gated on `payments:waive_late_fee`).
 *
 * The schema stores standalone waivers in `student_fee_overrides
 * .late_fee_waiver_amount`. The workbook view subtracts the override from the
 * computed late fee, so subsequent dues / Payment Desk previews / receipts
 * see the lower pending balance immediately. The audit trail is captured by
 * the `audit_logs` trigger on `student_fee_overrides` plus a structured
 * append to `student_fee_overrides.reason` and a `recordActivity` payment-
 * activity entry. Posted payments and receipts are never modified.
 */
export async function waiveLateFeeAction(
  _previous: WaiveLateFeeActionState,
  formData: FormData,
): Promise<WaiveLateFeeActionState> {
  try {
    const staff = await requireStaffPermission("payments:waive_late_fee");

    const studentId = (formData.get("studentId") ?? "").toString().trim();
    const amount = parseAmount(formData.get("amount"));
    const reason = (formData.get("reason") ?? "").toString().trim();

    if (!studentId) {
      return { status: "error", message: "Student is required.", newWaiverAmount: null };
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      return {
        status: "error",
        message: "Enter a positive late-fee amount to waive.",
        newWaiverAmount: null,
      };
    }
    if (!reason) {
      return {
        status: "error",
        message: "Reason is required so the audit trail explains the waiver.",
        newWaiverAmount: null,
      };
    }
    if (reason.length < 4) {
      return {
        status: "error",
        message: "Add a slightly longer reason (at least 4 characters).",
        newWaiverAmount: null,
      };
    }

    const admin = createAdminClient();

    const { data: studentRaw, error: studentError } = await admin
      .from("students")
      .select("id")
      .eq("id", studentId)
      .maybeSingle();
    if (studentError) {
      return { status: "error", message: studentError.message, newWaiverAmount: null };
    }
    if (!studentRaw) {
      return { status: "error", message: "Student not found.", newWaiverAmount: null };
    }

    const { data: financialRaw, error: financialError } = await admin
      .from("v_workbook_student_financials")
      .select("outstanding_amount, late_fee_total, pending_late_fee_amount")
      .eq("student_id", studentId)
      .maybeSingle();
    if (financialError) {
      return {
        status: "error",
        message: `Unable to read current dues: ${financialError.message}`,
        newWaiverAmount: null,
      };
    }
    const financial = (financialRaw ?? null) as WorkbookFinancialRow | null;
    const currentPendingLateFee =
      asNumber(financial?.pending_late_fee_amount) ||
      asNumber(financial?.late_fee_total);
    if (currentPendingLateFee <= 0) {
      return {
        status: "error",
        message: "This student has no pending late fee to waive.",
        newWaiverAmount: null,
      };
    }
    if (amount > currentPendingLateFee) {
      return {
        status: "error",
        message: `Waiver cannot exceed the current pending late fee (${currentPendingLateFee}).`,
        newWaiverAmount: null,
      };
    }

    const { data: existingOverrideRaw, error: overrideError } = await admin
      .from("student_fee_overrides")
      .select(
        "id, discount_amount, reason, notes, custom_tuition_fee_amount, custom_transport_fee_amount, custom_books_fee_amount, custom_admission_activity_misc_fee_amount, custom_other_fee_heads, custom_late_fee_flat_amount, other_adjustment_head, other_adjustment_amount, late_fee_waiver_amount, student_type_override, transport_applies_override",
      )
      .eq("student_id", studentId)
      .eq("is_active", true)
      .maybeSingle();
    if (overrideError) {
      return {
        status: "error",
        message: `Unable to read existing override: ${overrideError.message}`,
        newWaiverAmount: null,
      };
    }
    const existingOverride = (existingOverrideRaw ?? null) as ExistingOverrideRow | null;

    const currentWaiver = asNumber(existingOverride?.late_fee_waiver_amount ?? 0);
    const newWaiver = currentWaiver + amount;

    const today = new Date().toISOString().slice(0, 10);
    const auditLine = `Waive late fee ${amount} on ${today} by ${staff.email ?? "staff"}: ${reason}`;
    const combinedReason = existingOverride?.reason
      ? `${existingOverride.reason} | ${auditLine}`
      : auditLine;

    const customFeeHeadAmounts: Record<string, number> = {};
    const rawHeads = existingOverride?.custom_other_fee_heads;
    if (rawHeads && typeof rawHeads === "object" && !Array.isArray(rawHeads)) {
      for (const [key, value] of Object.entries(rawHeads as Record<string, unknown>)) {
        if (typeof value === "number" && Number.isFinite(value)) {
          customFeeHeadAmounts[key] = Math.round(value);
        }
      }
    }

    try {
      await upsertStudentFeeOverride({
        studentId,
        customTuitionFeeAmount: existingOverride?.custom_tuition_fee_amount ?? null,
        customTransportFeeAmount: existingOverride?.custom_transport_fee_amount ?? null,
        customBooksFeeAmount: existingOverride?.custom_books_fee_amount ?? null,
        customAdmissionActivityMiscFeeAmount:
          existingOverride?.custom_admission_activity_misc_fee_amount ?? null,
        customFeeHeadAmounts,
        customFeeHeads: [],
        customLateFeeFlatAmount: existingOverride?.custom_late_fee_flat_amount ?? null,
        otherAdjustmentHead: existingOverride?.other_adjustment_head ?? null,
        otherAdjustmentAmount: existingOverride?.other_adjustment_amount ?? null,
        lateFeeWaiverAmount: newWaiver,
        discountAmount: asNumber(existingOverride?.discount_amount ?? 0),
        studentTypeOverride: existingOverride?.student_type_override ?? null,
        transportAppliesOverride: existingOverride?.transport_applies_override ?? null,
        reason: combinedReason,
        notes: existingOverride?.notes ?? null,
        useAdminClient: true,
      });
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Unable to apply waiver.",
        newWaiverAmount: null,
      };
    }

    try {
      await syncAfterStudentChange(studentId);
    } catch {
      // Sync failure is non-fatal — a background sync will pick it up.
    }

    try {
      await recordActivity({
        userId: (staff.id as string | undefined) ?? null,
        kind: "payment_posted",
        refId: studentId,
        payload: {
          action: "late_fee_waiver",
          waivedAmount: amount,
          newWaiverTotal: newWaiver,
          reason,
        },
      });
    } catch {
      // Activity logging is best-effort.
    }

    revalidatePath("/protected/students");
    revalidatePath(`/protected/students/${studentId}`);
    revalidatePath("/protected/payments");
    revalidatePath("/protected/transactions");
    revalidatePath("/protected/defaulters");

    return {
      status: "success",
      message: `Waived ₹${amount} of late fee. Total waiver for this student: ₹${newWaiver}.`,
      newWaiverAmount: newWaiver,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to waive late fee.",
      newWaiverAmount: null,
    };
  }
}
