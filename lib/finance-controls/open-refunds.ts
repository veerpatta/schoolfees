import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * How many refund requests are still waiting on someone — pending approval or
 * approved but not yet processed. Used for the Admin Tools capability chip so
 * "Refunds" says whether it needs attention without opening it.
 *
 * Deliberately not date-scoped: the finance-controls day view answers "what
 * happened on this date", while this answers "is anything outstanding".
 */
export async function getOpenRefundCount(): Promise<number> {
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("refund_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending_approval", "approved"]);

    if (error) {
      return 0;
    }

    return count ?? 0;
  } catch {
    // A capability chip must never take the hub page down.
    return 0;
  }
}
