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
 * THROWS on a failed read, and this is the whole point.
 *
 * Both functions here used to discard the error and return whatever rows had
 * arrived, described as degrading to "no badge". That undersold it: an absent
 * row does not mean "not reversed" to any caller, it means "reversed by ₹0".
 * The same map decides `isReceiptReversed`, which is what excludes a receipt
 * from a collection figure — so a failed read does not drop a badge, it counts
 * money the school gave back as money it collected. The live session carries
 * ₹1,28,850 of reversals.
 *
 * The callers are the day-close cron, the Dashboard's collection totals,
 * Finance Controls, every export and report, and the public receipt
 * verification page a parent opens. Every one of them would rather fail than
 * quietly overstate collection, which is also this project's rule: a reversed
 * receipt "is excluded from every collection figure".
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
  const { data, error } = await fetchInChunks(uniqueIds, IN_FILTER_CHUNK_SIZE, (chunk) =>
    supabase
      .from("v_receipt_reversal_totals")
      .select("receipt_id, reversed_amount")
      .in("receipt_id", chunk),
  );

  if (error) {
    throw new Error(
      `Unable to read receipt reversal totals for ${uniqueIds.length} receipt(s): ${
        (error as { message?: string })?.message ?? String(error)
      }. Refusing to report reversals as zero — a reversed receipt would be counted as collection.`,
    );
  }

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
 * Throws on a failed read, like its sibling. The comment here used to say the
 * total "degrades to counts a reversed receipt" — which is the failure, stated
 * plainly and then accepted. Guarding the truncation case while waving through
 * the error case left the same wrong number by the other door.
 */
export async function getAllReceiptReversalTotals(
  client?: SupabaseLike,
): Promise<Map<string, number>> {
  const supabase = client ?? (await createClient());
  const { data, error } = await fetchAllPages<{ receipt_id: string; reversed_amount: number }>(
    (from, to) =>
      supabase
        .from("v_receipt_reversal_totals")
        .select("receipt_id, reversed_amount")
        .order("receipt_id", { ascending: true })
        .range(from, to),
  );

  if (error) {
    throw new Error(
      `Unable to read the project's receipt reversal totals: ${
        (error as { message?: string })?.message ?? String(error)
      }. Refusing to report reversals as zero — reversed receipts would be counted as collection.`,
    );
  }

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
