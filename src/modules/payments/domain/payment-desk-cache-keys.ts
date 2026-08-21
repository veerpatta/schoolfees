/**
 * Storage names for the Payment Desk's client-side caches.
 *
 * They live in their own module so the sign-out purge
 * (lib/cache/signed-out-purge.ts, which runs on the login route) can name what
 * it clears without importing the IndexedDB machinery of
 * payment-desk-summary-cache.ts into the login chunk.
 *
 * Only caches of *server data* belong here. The desk keeps other things under
 * the same `vpps.paymentDesk.` prefix -- `classStreak`, `lastPaymentMode` --
 * which are the staffer's own preferences, carry no student data, and are
 * deliberately not purged.
 */

/** localStorage prefix for the cached student index (names, admission numbers). */
export const paymentDeskStudentIndexCacheKey = "vpps.paymentDesk.studentIndex";

/** localStorage prefix for cached per-student fee summaries (balances). */
export const paymentDeskStudentSummaryKeyPrefix = "vpps.paymentDesk.studentSummary";

/** IndexedDB database holding the same summaries when IndexedDB is available. */
export const paymentDeskSummaryDbName = "vpps-payment-desk-cache";

/** Cache Storage buckets written by public/service-worker.js. */
export const serviceWorkerCachePrefix = "vpps-";
