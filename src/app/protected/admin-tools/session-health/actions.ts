"use server";

import { redirect } from "next/navigation";

import { describeError } from "@/platform/observability/log";
import { generateSessionLedgersAction } from "@/lib/fees/generator";
import { createClient } from "@/platform/supabase/server";
import { requireStaffPermission } from "@/platform/supabase/session";
import { revalidateSessionFinance } from "@/lib/system-sync/finance-sync";
import { drainFinancialViewRefresh } from "@/lib/system-sync/financial-view-refresh";

function sessionHealthUrl(params: Record<string, string | number>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    searchParams.set(key, String(value));
  });

  return `/protected/admin-tools/session-health?${searchParams.toString()}`;
}

function getErrorMessage(error: unknown) {
  return describeError(error);
}

export async function reconcileSessionAction(formData: FormData) {
  const staff = await requireStaffPermission("fees:write");
  const label = String(formData.get("sessionLabel") ?? "").trim();

  if (!label) {
    throw new Error("Choose a session to reconcile.");
  }

  const supabase = await createClient();
  const { data: logRow, error: insertError } = await supabase
    .from("session_reconcile_log")
    .insert({
      session_label: label,
      run_by: staff.id ?? null,
    })
    .select("id")
    .single();

  if (insertError || !logRow?.id) {
    throw new Error(insertError?.message ?? "Unable to start reconcile log.");
  }

  let preparedCount = 0;

  try {
    const result = await generateSessionLedgersAction({
      scopedSessionLabel: label,
      useAdminClient: true,
    });
    preparedCount = result.installmentsToInsert;
    const attentionCount = result.skippedStudents.length + result.errors.length;
    const { error: updateError } = await supabase
      .from("session_reconcile_log")
      .update({
        finished_at: new Date().toISOString(),
        prepared_count: result.installmentsToInsert,
        updated_count: result.installmentsToUpdate,
        locked_count: result.lockedInstallments,
        attention_count: attentionCount,
      })
      .eq("id", logRow.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // This is the repair tool. Regenerating a whole session enqueues one
    // matview refresh and nothing drains it, so the operator ran the repair,
    // saw unchanged numbers, and ran it again. Drain before revalidating.
    await drainFinancialViewRefresh();
    revalidateSessionFinance(label);
  } catch (error) {
    const message = getErrorMessage(error);

    await supabase
      .from("session_reconcile_log")
      .update({
        finished_at: new Date().toISOString(),
        error_message: message.slice(0, 500),
      })
      .eq("id", logRow.id);

    redirect(
      sessionHealthUrl({
        error: message,
        session: label,
      }),
    );
  }

  redirect(
    sessionHealthUrl({
      reconciled: label,
      prepared: preparedCount,
      session: label,
    }),
  );
}

/**
 * Recompute the cached figures for one session, without touching a single row.
 *
 * The dashboard's rollups are cached on `session:{label}` so board switching
 * stays instant. Every path that moves money busts that tag and a five-minute
 * ceiling backstops the rest, but two cases still need a human to say "now":
 * something changed the database from outside the app (a repair script, psql,
 * the Supabase table editor), or somebody simply wants to be certain before
 * reading a number out to a parent.
 *
 * There was no way to do that. `reconcileSessionAction` busts the tag as a side
 * effect, but it also REGENERATES the whole session's ledgers — far too heavy to
 * offer as "refresh" — and its button only rendered when the session already
 * needed attention, so a healthy session had no control at all.
 *
 * This one only drains the materialized-view queue and evicts the tag. It reads
 * and invalidates; it never writes a fee, so it is safe to press at any time and
 * safe to press twice.
 */
export async function refreshSessionFiguresAction(formData: FormData) {
  await requireStaffPermission("dashboard:view");

  const label = (formData.get("sessionLabel") ?? "").toString().trim();

  if (!label) {
    redirect(sessionHealthUrl({ error: "Session is required to refresh figures." }));
  }

  // Drain first, then evict: the matview is what the RPCs read, so evicting the
  // Next cache before the projection has settled would just re-cache the old
  // numbers. This is the ordering the drift repair got wrong.
  await drainFinancialViewRefresh();
  revalidateSessionFinance(label);

  redirect(
    sessionHealthUrl({
      notice: `Figures for ${label} were recomputed from the database.`,
      session: label,
    }),
  );
}
