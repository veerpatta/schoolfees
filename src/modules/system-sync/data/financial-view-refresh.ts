import "server-only";

import { createAdminClient } from "@/platform/supabase/admin";

/**
 * Drain the workbook materialized-view refresh queue.
 *
 * Posting a payment used to refresh three chained materialized views inline,
 * 6-15 times per transaction, while the parent stood at the counter. Migration
 * 20260726000002 reduced the trigger to a queue insert; this is what makes the
 * views fresh again without the cashier paying for it.
 *
 * Call it from `after()` so it runs once the response has been sent. The clerk
 * sees the receipt immediately and the dashboards catch up a moment later.
 *
 * **Service-role on purpose.** `refresh_workbook_materialized_views_if_requested`
 * is granted to `postgres` and `service_role` only — this is system maintenance,
 * not a user-permissioned action, and granting it to `authenticated` would hand
 * every staff account a lever that rebuilds three matviews on demand. The admin
 * client also reads no cookies, which makes it the more reliable caller in a
 * post-response context.
 *
 * Best-effort by design: the function takes `for update skip locked`, so if the
 * cron or a concurrent post is already draining, this call simply does nothing
 * and the other one finishes the work. Failures are swallowed — the two-minute
 * cron backstop still runs, so the worst case is the pre-existing behaviour.
 */
export async function drainFinancialViewRefresh(): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.rpc("refresh_workbook_materialized_views_if_requested");

    if (error) {
      console.warn(`Deferred financial view refresh failed: ${error.message}`);
    }
  } catch (error) {
    console.warn("Deferred financial view refresh failed.", error);
  }
}
