import "server-only";

import { fetchAllPages, fetchInChunks } from "@/lib/helpers/chunk";
import { createClient } from "@/lib/supabase/server";

const IN_FILTER_CHUNK_SIZE = 200;

type SupabaseLike = Pick<Awaited<ReturnType<typeof createClient>>, "from">;

/**
 * Batch lookup of reversal totals for a set of receipts, via the
 * v_receipt_reversal_totals view (payment_adjustments 'reversal' rows summed
 * per receipt). Returns a map of receiptId -> reversed amount (positive).
 *
 * Pass `client` when calling from a cache-safe context (unstable_cache) where
 * the cookie-based client cannot be created.
 *
 * Best-effort: on query failure returns what was collected so far — lists
 * degrade to "no badge" rather than failing the page.
 */
export async function getReceiptReversalTotals(
  receiptIds: readonly string[],
  client?: SupabaseLike,
): Promise<Map<string, number>> {
  const uniqueIds = [...new Set(receiptIds.filter(Boolean))];
  const totals = new Map<string, number>();

  if (uniqueIds.length === 0) {
    return totals;
  }

  const supabase = client ?? (await createClient());
  const { data } = await fetchInChunks(uniqueIds, IN_FILTER_CHUNK_SIZE, (chunk) =>
    supabase
      .from("v_receipt_reversal_totals")
      .select("receipt_id, reversed_amount")
      .in("receipt_id", chunk),
  );

  for (const row of (data ?? []) as Array<{ receipt_id: string; reversed_amount: number }>) {
    totals.set(row.receipt_id, row.reversed_amount);
  }

  return totals;
}

/**
 * Every reversal total in the project, unfiltered.
 *
 * The `.in(...)` variant above chunks at 200 ids, so scanning a whole session's
 * receipts through it costs one request per 200 receipts. This costs one — the
 * view holds a single row per reversed receipt, and reversals are rare
 * (correction paths, not a daily occurrence), so the whole thing is smaller
 * than one page of the receipts it describes.
 *
 * Paged rather than unbounded because PostgREST truncates at `max-rows` with no
 * error and no flag; a short answer here would silently un-reverse receipts.
 *
 * Best-effort, like its sibling: on failure returns what was collected, so a
 * total degrades to "counts a reversed receipt" rather than failing the page.
 */
export async function getAllReceiptReversalTotals(
  client?: SupabaseLike,
): Promise<Map<string, number>> {
  const supabase = client ?? (await createClient());
  const { data } = await fetchAllPages<{ receipt_id: string; reversed_amount: number }>(
    (from, to) =>
      supabase
        .from("v_receipt_reversal_totals")
        .select("receipt_id, reversed_amount")
        .order("receipt_id", { ascending: true })
        .range(from, to),
  );

  const totals = new Map<string, number>();
  for (const row of data) {
    totals.set(row.receipt_id, row.reversed_amount);
  }
  return totals;
}

/** A receipt reads as REVERSED when reversals cover its full amount. */
export function isReceiptReversed(
  totals: Map<string, number>,
  receiptId: string,
  totalAmount: number,
): boolean {
  return totalAmount > 0 && (totals.get(receiptId) ?? 0) >= totalAmount;
}
