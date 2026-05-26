"use server";

import { revalidatePath } from "next/cache";

import { upsertStudentFeeOverride } from "@/lib/fees/data";
import { syncAfterStudentChange } from "@/lib/system-sync/finance-sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffPermission } from "@/lib/supabase/session";

export type CloseDueActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  newDiscountAmount: number | null;
};

export const INITIAL_CLOSE_DUE_ACTION_STATE: CloseDueActionState = {
  status: "idle",
  message: null,
  newDiscountAmount: null,
};

type StudentRow = {
  id: string;
  full_name: string;
  admission_no: string;
  class_id: string;
};

type WorkbookFinancialRow = {
  outstanding_amount: number;
  discount_amount: number;
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

export async function closeDueAsDiscountAction(
  _previous: CloseDueActionState,
  formData: FormData,
): Promise<CloseDueActionState> {
  try {
    const staff = await requireStaffPermission("finance:write");

    const studentId = (formData.get("studentId") ?? "").toString().trim();
    const sessionLabel = (formData.get("sessionLabel") ?? "").toString().trim();
    const amount = parseAmount(formData.get("amount"));
    const reason = (formData.get("reason") ?? "").toString().trim();

    if (!studentId) {
      return { status: "error", message: "Student is required.", newDiscountAmount: null };
    }
    if (!sessionLabel) {
      return { status: "error", message: "Session is required.", newDiscountAmount: null };
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      return {
        status: "error",
        message: "Enter a positive amount to close as discount.",
        newDiscountAmount: null,
      };
    }
    if (!reason) {
      return {
        status: "error",
        message: "Reason is required so the audit trail explains the write-off.",
        newDiscountAmount: null,
      };
    }
    if (reason.length < 4) {
      return {
        status: "error",
        message: "Add a slightly longer reason (at least 4 characters).",
        newDiscountAmount: null,
      };
    }

    const admin = createAdminClient();

    const { data: studentRaw, error: studentError } = await admin
      .from("students")
      .select("id, full_name, admission_no, class_id")
      .eq("id", studentId)
      .maybeSingle();
    if (studentError) {
      return { status: "error", message: studentError.message, newDiscountAmount: null };
    }
    const student = studentRaw as StudentRow | null;
    if (!student) {
      return { status: "error", message: "Student not found.", newDiscountAmount: null };
    }

    const { data: financialRaw, error: financialError } = await admin
      .from("v_workbook_student_financials")
      .select("outstanding_amount, discount_amount")
      .eq("student_id", studentId)
      .eq("session_label", sessionLabel)
      .maybeSingle();
    if (financialError) {
      return {
        status: "error",
        message: `Unable to read current dues: ${financialError.message}`,
        newDiscountAmount: null,
      };
    }
    const financial = (financialRaw ?? null) as WorkbookFinancialRow | null;
    const currentPending = asNumber(financial?.outstanding_amount);
    if (currentPending <= 0) {
      return {
        status: "error",
        message: "This student already has no pending balance.",
        newDiscountAmount: null,
      };
    }
    if (amount > currentPending) {
      return {
        status: "error",
        message: `Amount cannot exceed the current pending balance (${currentPending}).`,
        newDiscountAmount: null,
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
        newDiscountAmount: null,
      };
    }
    const existingOverride = (existingOverrideRaw ?? null) as ExistingOverrideRow | null;

    const currentDiscount = asNumber(existingOverride?.discount_amount ?? 0);
    const newDiscount = currentDiscount + amount;

    const today = new Date().toISOString().slice(0, 10);
    const auditLine = `Close due ${amount} on ${today} by ${staff.email ?? "staff"}: ${reason}`;
    const combinedReason = existingOverride?.reason
      ? `${existingOverride.reason} | ${auditLine}`
      : auditLine;

    // Read the custom fee heads JSON as a typed map for the upsert helper.
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
        lateFeeWaiverAmount: asNumber(existingOverride?.late_fee_waiver_amount ?? 0),
        discountAmount: newDiscount,
        studentTypeOverride: existingOverride?.student_type_override ?? null,
        transportAppliesOverride: existingOverride?.transport_applies_override ?? null,
        reason: combinedReason,
        notes: existingOverride?.notes ?? null,
        useAdminClient: true,
      });
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Unable to apply discount.",
        newDiscountAmount: null,
      };
    }

    // Re-sync so the workbook view reflects the new pending immediately.
    try {
      await syncAfterStudentChange(studentId);
    } catch {
      // Sync failure is non-fatal — a background sync will pick it up.
    }

    revalidatePath("/protected/students");
    revalidatePath(`/protected/students/${studentId}`);
    revalidatePath("/protected/payments");
    revalidatePath("/protected/transactions");
    revalidatePath("/protected/defaulters");

    return {
      status: "success",
      message: `Closed ${amount} as discount. New pending: ₹0.`,
      newDiscountAmount: newDiscount,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to close due as discount.",
      newDiscountAmount: null,
    };
  }
}
