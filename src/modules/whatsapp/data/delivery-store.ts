import "server-only";

import {
  matchDeliveryReport,
  parseDeliveryReport,
  phoneDigits,
  type DeliveryStatus,
  type SendRowForMatching,
} from "@/modules/whatsapp/domain/delivery-report";

/**
 * Writing delivery results, retrying failures, and unsticking pending rows.
 *
 * All three are admin actions on one run, and all three share the rule that a
 * send row is EVIDENCE a parent was messaged: nothing here inserts a second row
 * or deletes an existing one. A retry updates in place and bumps `attempts`; a
 * reconciliation writes a status and an `audit_logs` entry saying who decided it.
 */

export type DeliveryImportSummary = {
  matched: number;
  unmatched: number;
  unchanged: number;
  skipped: number;
  error: string | null;
};

/**
 * Import an AiSensy campaign report onto one run's sends.
 *
 * Scoped to a run rather than applied globally: an admin uploads the report for
 * the campaign they just sent, and a file covering a different day should not
 * quietly rewrite months of history because a phone number recurs.
 */
export async function importDeliveryReport(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  runId: string;
  csv: string;
}): Promise<DeliveryImportSummary> {
  const parsed = parseDeliveryReport(args.csv);
  if (parsed.error) {
    return { matched: 0, unmatched: 0, unchanged: 0, skipped: parsed.skipped, error: parsed.error };
  }

  const { data, error } = await args.supabase
    .from("whatsapp_reminder_sends")
    .select("id, provider_message_id, destination, sent_on, status, delivery_status")
    .eq("run_id", args.runId);

  if (error) {
    return {
      matched: 0,
      unmatched: 0,
      unchanged: 0,
      skipped: parsed.skipped,
      error: `Could not read this run's sends: ${error.message}`,
    };
  }

  const sends: SendRowForMatching[] = (
    (data ?? []) as Array<{
      id: string;
      provider_message_id: string | null;
      destination: string | null;
      sent_on: string;
      status: string;
      delivery_status: string | null;
    }>
  ).map((row) => ({
    id: row.id,
    providerMessageId: row.provider_message_id,
    destinationDigits: phoneDigits(row.destination),
    sentOn: row.sent_on,
    status: row.status,
    currentDeliveryStatus: (row.delivery_status as DeliveryStatus | null) ?? null,
  }));

  const result = matchDeliveryReport(parsed.rows, sends);

  // One update per row. Small by construction — a run is a few hundred rows and
  // only the ones whose status actually moved are written.
  for (const update of result.updates) {
    await args.supabase
      .from("whatsapp_reminder_sends")
      .update({
        delivery_status: update.status,
        // `delivered_at` and `read_at` are set only by the status that earns
        // them, so a later "read" does not overwrite the delivery time.
        ...(update.status === "delivered" ? { delivered_at: update.at ?? new Date().toISOString() } : {}),
        ...(update.status === "read" ? { read_at: update.at ?? new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", update.id);
  }

  return {
    matched: result.updates.length,
    unmatched: result.unmatched,
    unchanged: result.unchanged,
    skipped: parsed.skipped,
    error: null,
  };
}

/** A row still `pending` long after its run finished. */
export type StuckSend = {
  id: string;
  studentName: string;
  admissionNo: string;
  destination: string;
  createdAt: string;
};

/**
 * How long a `pending` row waits before it counts as stuck.
 *
 * Fifteen minutes. A run of a few hundred takes under a minute, so anything
 * still pending a quarter of an hour later did not fail slowly — the request
 * died between claiming the row and hearing back, and the day is already
 * claimed.
 */
export const STUCK_AFTER_MINUTES = 15;

export async function loadStuckSends(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  runId: string;
  now?: Date;
}): Promise<StuckSend[]> {
  const cutoff = new Date((args.now ?? new Date()).getTime() - STUCK_AFTER_MINUTES * 60_000);

  const { data, error } = await args.supabase
    .from("whatsapp_reminder_sends")
    .select("id, destination, created_at, students(full_name, admission_no)")
    // `pending` ONLY. `covered_by_sibling` is not pending and never will be —
    // no provider call is made for one — so sweeping it here would offer the
    // office a list of rows there is nothing to reconcile about.
    .eq("run_id", args.runId)
    .eq("status", "pending")
    .lt("created_at", cutoff.toISOString());

  if (error) throw new Error(`Could not read stuck sends: ${error.message}`);

  return (
    (data ?? []) as Array<{
      id: string;
      destination: string | null;
      created_at: string;
      students: { full_name: string | null; admission_no: string | null } | null;
    }>
  ).map((row) => ({
    id: row.id,
    studentName: row.students?.full_name ?? "",
    admissionNo: row.students?.admission_no ?? "",
    destination: row.destination ?? "",
    createdAt: row.created_at,
  }));
}

/**
 * An admin's decision about what really happened to a stuck row.
 *
 * Both outcomes are a judgement, not a fact this app can establish — the whole
 * point is that the provider never answered — so both write an `audit_logs` row
 * naming who decided it and why.
 */
export async function resolveStuckSends(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  sendIds: string[];
  outcome: "sent" | "failed";
  reason: string;
  staffId: string | null;
}): Promise<number> {
  if (args.sendIds.length === 0) return 0;

  const { error } = await args.supabase
    .from("whatsapp_reminder_sends")
    .update({
      status: args.outcome,
      last_error: args.outcome === "failed" ? args.reason : null,
      updated_at: new Date().toISOString(),
    })
    .in("id", args.sendIds);

  if (error) throw new Error(`Could not update those sends: ${error.message}`);

  // Best-effort, and deliberately after the update: the decision is recorded
  // even if the audit write fails, rather than the reverse.
  try {
    await args.supabase.from("audit_logs").insert(
      args.sendIds.map((id) => ({
        table_name: "whatsapp_reminder_sends",
        record_id: id,
        action: "UPDATE",
        after_data: {
          status: args.outcome,
          reason: args.reason,
          resolved_as: "stuck_pending_reconciliation",
        },
        changed_by: args.staffId,
      })),
    );
  } catch (caught) {
    console.warn("[whatsapp-reminders] reconciliation audit failed", caught);
  }

  return args.sendIds.length;
}

/**
 * Families whose notice was READ some days ago with no receipt since.
 *
 * The strongest signal this system produces. A family who did not see the
 * message has an excuse; a family who read it and did nothing has made a
 * decision, and that is who a collector should ring first.
 *
 * Requires imported delivery data, so it is empty until a report has been
 * uploaded — which the screen says rather than showing an empty list as if it
 * were good news.
 */
export async function loadSeenButNotPaid(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  sessionLabel: string;
  minDaysSinceRead?: number;
  runId?: string;
}): Promise<Array<{ studentId: string; readAt: string; dueAmount: number }>> {
  const days = args.minDaysSinceRead ?? 3;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

  let query = args.supabase
    .from("whatsapp_reminder_sends")
    .select("student_id, read_at, due_amount, sent_on")
    .eq("session_label", args.sessionLabel)
    .eq("status", "sent")
    .eq("delivery_status", "read")
    .lt("read_at", cutoff);

  if (args.runId) query = query.eq("run_id", args.runId);

  const { data, error } = await query;
  if (error) throw new Error(`Could not read seen-but-not-paid: ${error.message}`);

  const rows = (data ?? []) as Array<{
    student_id: string;
    read_at: string;
    due_amount: number | null;
    sent_on: string;
  }>;
  if (rows.length === 0) return [];

  // Who has paid since. Scoped by student id, and deliberately NOT by
  // `.in("id", ids)` on a roster-sized list — that URL has died three times in
  // this codebase past ~17k characters.
  const earliest = rows.reduce(
    (oldest, row) => (row.sent_on < oldest ? row.sent_on : oldest),
    rows[0]!.sent_on,
  );
  const { data: receipts } = await args.supabase
    .from("receipts")
    .select("student_id, payment_date")
    .gte("payment_date", earliest)
    .neq("payment_mode", "discount");

  const paidSince = new Map<string, string>();
  for (const receipt of (receipts ?? []) as Array<{ student_id: string; payment_date: string }>) {
    const existing = paidSince.get(receipt.student_id);
    if (!existing || receipt.payment_date > existing) {
      paidSince.set(receipt.student_id, receipt.payment_date);
    }
  }

  return rows
    .filter((row) => {
      const paid = paidSince.get(row.student_id);
      return !paid || paid < row.sent_on;
    })
    .map((row) => ({
      studentId: row.student_id,
      readAt: row.read_at,
      dueAmount: Number(row.due_amount ?? 0),
    }));
}
