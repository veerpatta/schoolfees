/**
 * How old the money is.
 *
 * `v_workbook_student_financials` and `v_workbook_installment_balances` are
 * materialized views. Since 20260726154843 the payment RPC only *enqueues* a
 * refresh; two things drain the queue — the payment server action right after it
 * responds, and a two-minute pg_cron backstop. That is right for the cashier, who
 * is not kept waiting, but a read taken seconds after a posting can predate it.
 *
 * The old server stamped every payload with `asOfDate: todayIst()` regardless,
 * so a stale number was indistinguishable from a fresh one. Now the payload says
 * when the view was last rebuilt and whether a rebuild is outstanding, and an
 * assistant can tell someone "this is two minutes behind the counter" instead of
 * quoting it as current.
 */

import { select } from "./supabase.mjs";

const QUEUE_TABLE = "workbook_materialized_view_refresh_queue";

export function todayIst() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function nowIso() {
  return new Date().toISOString();
}

/**
 * Never throws: a freshness probe must not be able to take down a report. When
 * it cannot read the queue it says so rather than implying the data is current.
 */
export async function getDataFreshness(env) {
  try {
    const { rows } = await select(env, QUEUE_TABLE, {
      select: "queue_key,pending,requested_at,last_refreshed_at",
      queue_key: "eq.workbook",
      limit: 1,
    });

    const row = rows[0];
    if (!row) {
      return {
        known: false,
        note: "No refresh-queue row yet. The financial views have not been rebuilt through the queue since it was created.",
      };
    }

    const lastRefreshedAt = row.last_refreshed_at || null;
    const staleSeconds = lastRefreshedAt
      ? Math.max(0, Math.round((Date.now() - new Date(lastRefreshedAt).getTime()) / 1000))
      : null;

    return {
      known: true,
      lastRefreshedAt,
      refreshPending: row.pending === true,
      refreshRequestedAt: row.requested_at || null,
      staleSeconds,
      note:
        row.pending === true
          ? "A payment has been posted since the last rebuild. These figures may be up to about two minutes behind the Payment Desk."
          : "Financial views are rebuilt and current as of lastRefreshedAt.",
    };
  } catch (error) {
    return {
      known: false,
      note: `Could not read the refresh queue: ${String(error?.message || error).slice(0, 200)}. Treat these figures as possibly stale.`,
    };
  }
}

/** The provenance block that rides along with every money payload. */
export async function moneyProvenance(env) {
  return {
    asOf: nowIso(),
    asOfDateIst: todayIst(),
    dataFreshness: await getDataFreshness(env),
    readOnly: true,
  };
}
