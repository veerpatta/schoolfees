"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffPermission } from "@/lib/supabase/session";

export type CloseDueActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  receiptNumber: string | null;
};

type WorkbookFinancialRow = {
  outstanding_amount: number;
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
  const staff = await requireStaffPermission("finance:write");

  try {
    const studentId = (formData.get("studentId") ?? "").toString().trim();
    const sessionLabel = (formData.get("sessionLabel") ?? "").toString().trim();
    const amount = parseAmount(formData.get("amount"));
    const reason = (formData.get("reason") ?? "").toString().trim();

    if (!studentId) {
      return { status: "error", message: "Student is required.", receiptNumber: null };
    }
    if (!sessionLabel) {
      return { status: "error", message: "Session is required.", receiptNumber: null };
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      return {
        status: "error",
        message: "Enter a positive amount to close as discount.",
        receiptNumber: null,
      };
    }
    if (!reason || reason.length < 4) {
      return {
        status: "error",
        message: "Reason is required (at least 4 characters) so the audit trail explains the write-off.",
        receiptNumber: null,
      };
    }

    const admin = createAdminClient();

    const { data: financialRaw, error: financialError } = await admin
      .from("v_workbook_student_financials")
      .select("outstanding_amount")
      .eq("student_id", studentId)
      .eq("session_label", sessionLabel)
      .maybeSingle();
    if (financialError) {
      return {
        status: "error",
        message: `Unable to read current dues: ${financialError.message}`,
        receiptNumber: null,
      };
    }
    const currentPending = asNumber((financialRaw as WorkbookFinancialRow | null)?.outstanding_amount);
    if (currentPending <= 0) {
      return {
        status: "error",
        message: "This student already has no pending balance.",
        receiptNumber: null,
      };
    }
    if (amount > currentPending) {
      return {
        status: "error",
        message: `Amount cannot exceed the current pending balance (₹${currentPending}).`,
        receiptNumber: null,
      };
    }

    const today = new Date().toISOString().slice(0, 10);
    const remarks = `Close due as discount by ${staff.email ?? "staff"}: ${reason}`;

    const { data: rpcRaw, error: rpcError } = await admin.rpc(
      "post_student_payment_with_adjustments",
      {
        p_student_id: studentId,
        p_payment_date: today,
        p_payment_mode: "discount",
        p_total_amount: amount,
        p_reference_number: null,
        p_remarks: remarks,
        p_received_by: staff.email ?? null,
        p_client_request_id: randomUUID(),
      },
    );
    if (rpcError) {
      return {
        status: "error",
        message: `Unable to close balance: ${rpcError.message}`,
        receiptNumber: null,
      };
    }
    const rpcRow = Array.isArray(rpcRaw) ? rpcRaw[0] : rpcRaw;
    const receiptNumber =
      rpcRow && typeof rpcRow === "object" && "receipt_number" in rpcRow
        ? String((rpcRow as { receipt_number: unknown }).receipt_number ?? "")
        : null;

    revalidatePath("/protected/students");
    revalidatePath(`/protected/students/${studentId}`);
    revalidatePath("/protected/payments");
    revalidatePath("/protected/transactions");
    revalidatePath("/protected/defaulters");
    revalidatePath("/protected/receipts");

    return {
      status: "success",
      message: `Closed ₹${amount} as discount${receiptNumber ? ` (receipt ${receiptNumber})` : ""}.`,
      receiptNumber,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to close due as discount.",
      receiptNumber: null,
    };
  }
}
