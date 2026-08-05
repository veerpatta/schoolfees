"use server";

import { after } from "next/server";

import { recordActivity } from "@/lib/activity/events";
import { revalidateAfterPaymentPosting } from "@/lib/system-sync/finance-revalidation";
// Imported through the system-sync helper rather than reaching for
// `@/lib/supabase/admin` directly — the helper owns the service-role rationale,
// and late-fee-waiver-lock.test.ts asserts this module never imports the admin
// client itself.
import { drainFinancialViewRefresh } from "@/lib/system-sync/financial-view-refresh";
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `waive_late_fee.p_client_request_id` is typed `uuid`, so PostgREST raises
 * `invalid input syntax for type uuid` on anything else. Anything that is not a
 * well-formed UUID degrades to null rather than failing the waiver.
 */
function parseClientRequestId(value: FormDataEntryValue | null): string | null {
  const raw = (value ?? "").toString().trim();
  return UUID_PATTERN.test(raw) ? raw : null;
}

/**
 * Standalone late-fee waiver. Mounted on the student profile's identity strip
 * (see components/payments/waive-late-fee-trigger.tsx) and gated on
 * `payments:waive_late_fee`. The Payment Desk does not use this action — it
 * calls the same RPC inline while posting a payment.
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
    const clientRequestId = parseClientRequestId(formData.get("clientRequestId"));

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

    // A waiver writes exactly one column (late_fee_waiver_amount) plus the audit
    // reason. It is NOT an input to any installment amount — the late fee is
    // derived at READ time by v_workbook_installment_balances and by
    // private.workbook_installment_snapshot, both of which read
    // late_fee_waiver_amount straight off the active override row.
    //
    // This used to await a full student finance sync, which (passing no
    // sessionLabel) took the slow branch and regenerated the whole ledger plan:
    // every class, every fee setting, every transport route, every student and
    // every override row loaded up front, only to produce a plan byte-identical
    // to what was already stored. The staffer paid for all of it between
    // clicking Waive and seeing the toast.
    revalidateAfterPaymentPosting([studentId]);

    after(async () => {
      // The student_fee_overrides trigger only ENQUEUES a materialized-view
      // refresh (queue insert + the */2 cron backstop). Draining it here is what
      // the old sync path never did, so dashboards and defaulters used to stay
      // stale for up to two minutes after a waiver.
      await drainFinancialViewRefresh();

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
    });

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
