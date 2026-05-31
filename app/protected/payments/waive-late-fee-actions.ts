"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { recordActivity } from "@/lib/activity/events";
import { syncAfterStudentChange } from "@/lib/system-sync/finance-sync";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/supabase/session";
// A "use server" module may export only async functions. The action-state type
// and INITIAL_* constant live in a plain sibling module; re-exporting the type
// here is fine (types are erased at build), but the const must not be exported
// from this file or every Payment Desk server-action POST 500s.
import type { WaiveLateFeeActionState } from "./waive-late-fee-action-state";

type WaiveLateFeeRpcRow = {
  ok: boolean;
  message: string | null;
  new_waiver_amount: number | null;
  added_amount: number | null;
};

function parseAmount(value: FormDataEntryValue | null): number {
  const raw = (value ?? "").toString().trim();
  if (!raw) return NaN;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed) : NaN;
}

/**
 * Standalone late-fee waiver, posted from the Payment Desk by an admin or
 * accountant (gated on `payments:waive_late_fee`).
 *
 * Audit 1.5 — the read-then-write is now wrapped in the `waive_late_fee`
 * Postgres RPC, which acquires `pg_advisory_xact_lock` with the same salt
 * used by post_student_payment_with_adjustments. This serialises concurrent
 * waivers (and concurrent waiver + payment) per student so the late fee
 * cannot be zeroed out twice.
 *
 * The RPC updates only the `late_fee_waiver_amount` and audit `reason`
 * fields on the active student_fee_overrides row (insert path used only when
 * no row exists yet). Posted payments / receipts / payment_adjustments are
 * never touched.
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
    const sessionLabel = (formData.get("sessionLabel") ?? "").toString().trim() || null;
    const clientRequestId =
      (formData.get("clientRequestId") ?? "").toString().trim() || null;

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

    // Audit 1.5 hotfix — call the RPC via the user-JWT supabase client
    // (createClient), NOT the service-role admin client. The waive_late_fee
    // RPC's first guard is `public.has_permission('payments:waive_late_fee')`,
    // which requires `auth.uid() is not null`. Under a service-role JWT,
    // auth.uid() is null and every waiver would raise "You do not have
    // permission to waive late fees." Staff RBAC is already enforced upstream
    // by requireStaffPermission() — the RPC's in-DB check is defense-in-depth.
    const supabase = await createClient();

    const { data: rpcRows, error: rpcError } = await supabase.rpc("waive_late_fee", {
      p_student_id: studentId,
      p_amount: amount,
      p_remarks: reason,
      p_session_label: sessionLabel,
      p_client_request_id: clientRequestId,
    });

    if (rpcError) {
      return {
        status: "error",
        message: rpcError.message || "Unable to apply waiver.",
        newWaiverAmount: null,
      };
    }

    const row = ((rpcRows ?? []) as WaiveLateFeeRpcRow[])[0] ?? null;
    if (!row) {
      return {
        status: "error",
        message: "Waiver RPC returned no rows. Please retry.",
        newWaiverAmount: null,
      };
    }

    if (!row.ok) {
      return {
        status: "error",
        message: row.message ?? "Waiver could not be applied.",
        newWaiverAmount: row.new_waiver_amount,
      };
    }

    const newWaiver = row.new_waiver_amount ?? 0;

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

    try { revalidateTag(`student:${studentId}`, "max"); } catch {}
    revalidatePath(`/protected/students/${studentId}`);
    revalidatePath("/protected/transactions");

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
