/**
 * How long after posting the one-click undo stays available.
 *
 * `undo_recent_payment` enforces this in SQL (`interval '10 minutes'` against
 * `receipts.created_at`) and is the only authority. Everything on this side is
 * presentation: a countdown, and the decision of whether to offer undo or the
 * admin reversal instead.
 *
 * It lived as three separate literals — the countdown button, the success sheet
 * and the receipt page — which is three places to forget when the SQL changes.
 *
 * Deliberately not `server-only`: client components read it too.
 */
export const UNDO_WINDOW_MS = 10 * 60_000;
export const UNDO_WINDOW_SECONDS = UNDO_WINDOW_MS / 1000;

/** Milliseconds of undo left on a receipt, floored at zero. */
export function undoWindowRemainingMs(createdAt: string, now: number = Date.now()) {
  return Math.max(0, new Date(createdAt).getTime() + UNDO_WINDOW_MS - now);
}

/** Whether the one-click undo is still on the table for this receipt. */
export function isUndoWindowOpen(createdAt: string, now: number = Date.now()) {
  return undoWindowRemainingMs(createdAt, now) > 0;
}
