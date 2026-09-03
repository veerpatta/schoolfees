"use server";

import { revalidatePath } from "next/cache";

import { sendAisensyCampaignMessage } from "@/modules/whatsapp/data/aisensy";
import {
  importDeliveryReport,
  loadStuckSends,
  resolveStuckSends,
} from "@/modules/whatsapp/data/delivery-store";
import { createAdminClient } from "@/platform/supabase/admin";
import { requireStaffPermission } from "@/platform/supabase/session";

/**
 * The three things an admin does to a finished run: retry what failed, decide
 * what happened to what never answered, and tell it what the provider says.
 *
 * All three treat a send row as EVIDENCE a parent was messaged. Nothing here
 * inserts a second row for a family or deletes one — a retry updates in place,
 * a reconciliation writes a status and an audit trail.
 */

export type RunActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const IDLE_RUN_ACTION: RunActionState = { status: "idle" };

/** How many failed rows one press will retry, so a run cannot hang the request. */
const RETRY_LIMIT = 60;

/**
 * Retry the rows that failed.
 *
 * **Updates in place, never inserts.** A second row would break the unique index
 * that stops a family being messaged twice a day, and would make the send
 * history claim a family was messaged twice when they were messaged once and
 * re-tried. `attempts` is what records the retry.
 *
 * Same day only, implicitly: the row already carries its `sent_on`, and a
 * successful retry does not move it. A failure worth chasing tomorrow is
 * tomorrow's run.
 */
export async function retryFailedSendsAction(
  _prev: RunActionState,
  formData: FormData,
): Promise<RunActionState> {
  let staffId: string | null = null;
  try {
    const staff = await requireStaffPermission("settings:write");
    staffId = (staff?.id as string | undefined) ?? null;
  } catch {
    return { status: "error", message: "Permission denied." };
  }

  const runId = String(formData.get("runId") ?? "").trim();
  if (!runId) return { status: "error", message: "No run given." };

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("whatsapp_reminder_sends")
    .select("id, campaign_name, destination, template_params, attempts")
    .eq("run_id", runId)
    .eq("status", "failed")
    .limit(RETRY_LIMIT);

  if (error) return { status: "error", message: `Could not read the failed rows: ${error.message}` };

  const rows = (data ?? []) as Array<{
    id: string;
    campaign_name: string;
    destination: string;
    template_params: string[];
    attempts: number | null;
  }>;
  if (rows.length === 0) return { status: "error", message: "Nothing failed on this run." };

  let sent = 0;
  let stillFailing = 0;

  for (const row of rows) {
    const result = await sendAisensyCampaignMessage({
      campaignName: row.campaign_name,
      destination: row.destination,
      // The parent name is already inside the stored params; the provider's
      // `userName` is only used for its own reporting.
      userName: row.template_params?.[0] ?? "",
      templateParams: row.template_params ?? [],
      source: "veerpatta-fees-app/retry",
    });

    await supabase
      .from("whatsapp_reminder_sends")
      .update({
        status: result.ok ? "sent" : "failed",
        provider_message_id: result.ok ? result.messageId : null,
        // Cleared on success, kept on failure. `error_message` holds what went
        // wrong the FIRST time and is deliberately not overwritten.
        last_error: result.ok ? null : result.error,
        attempts: (row.attempts ?? 1) + 1,
        last_attempt_at: new Date().toISOString(),
        sent_by: staffId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (result.ok) sent += 1;
    else stillFailing += 1;
  }

  revalidatePath(`/protected/reminders/runs/${runId}`);

  return {
    status: stillFailing > 0 ? "error" : "success",
    message:
      stillFailing > 0
        ? `${sent} went through, ${stillFailing} failed again.`
        : `${sent} retried successfully.`,
  };
}

/**
 * Decide what happened to rows that never answered.
 *
 * The provider never told us, so this is a person's judgement rather than a
 * fact this app can establish — which is why both outcomes write an
 * `audit_logs` row naming who decided and why.
 */
export async function reconcileStuckSendsAction(
  _prev: RunActionState,
  formData: FormData,
): Promise<RunActionState> {
  let staffId: string | null = null;
  try {
    const staff = await requireStaffPermission("settings:write");
    staffId = (staff?.id as string | undefined) ?? null;
  } catch {
    return { status: "error", message: "Permission denied." };
  }

  const runId = String(formData.get("runId") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (outcome !== "sent" && outcome !== "failed") {
    return { status: "error", message: "Pick whether these went out or not." };
  }
  if (reason.length < 3) {
    // A reconciliation with no reason is an unexplained edit to the record of
    // what a parent was told.
    return { status: "error", message: "Say why, so the record explains itself." };
  }

  const supabase = createAdminClient();

  try {
    const stuck = await loadStuckSends({ supabase, runId });
    if (stuck.length === 0) {
      return { status: "error", message: "Nothing on this run is still pending." };
    }

    const count = await resolveStuckSends({
      supabase,
      sendIds: stuck.map((row) => row.id),
      outcome,
      reason,
      staffId,
    });

    revalidatePath(`/protected/reminders/runs/${runId}`);
    return {
      status: "success",
      message: `${count} marked ${outcome}.`,
    };
  } catch (caught) {
    return {
      status: "error",
      message: caught instanceof Error ? caught.message : "Could not reconcile those rows.",
    };
  }
}

/** How large an AiSensy report may be. A run is hundreds of rows, not millions. */
const MAX_REPORT_BYTES = 2_000_000;

/**
 * Import the AiSensy campaign report.
 *
 * The Basic plan has no delivery webhooks, so this CSV is the only way to learn
 * whether a message arrived. Scoped to one run: a file covering another day must
 * not quietly rewrite months of history because a phone number recurs.
 */
export async function importDeliveryReportAction(
  _prev: RunActionState,
  formData: FormData,
): Promise<RunActionState> {
  try {
    await requireStaffPermission("settings:write");
  } catch {
    return { status: "error", message: "Permission denied." };
  }

  const runId = String(formData.get("runId") ?? "").trim();
  const file = formData.get("report");

  if (!runId) return { status: "error", message: "No run given." };
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Choose the campaign report CSV first." };
  }
  if (file.size > MAX_REPORT_BYTES) {
    return { status: "error", message: "That file is larger than a campaign report should be." };
  }

  try {
    const csv = await file.text();
    const summary = await importDeliveryReport({
      supabase: createAdminClient(),
      runId,
      csv,
    });

    if (summary.error) return { status: "error", message: summary.error };

    revalidatePath(`/protected/reminders/runs/${runId}`);

    const parts = [
      `${summary.matched} updated`,
      summary.unchanged > 0 ? `${summary.unchanged} already up to date` : null,
      summary.unmatched > 0 ? `${summary.unmatched} matched nothing in this run` : null,
      summary.skipped > 0 ? `${summary.skipped} rows unreadable` : null,
    ].filter(Boolean);

    return { status: "success", message: parts.join(", ") };
  } catch (caught) {
    return {
      status: "error",
      message: caught instanceof Error ? caught.message : "Could not read that file.",
    };
  }
}
