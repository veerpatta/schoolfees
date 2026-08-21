import {
  paymentDeskStudentIndexCacheKey,
  paymentDeskStudentSummaryKeyPrefix,
  paymentDeskSummaryDbName,
  serviceWorkerCachePrefix,
} from "@/lib/payments/payment-desk-cache-keys";

/**
 * Clear every client-side copy of school data that a signed-in session left
 * behind: cached student names, admission numbers and balances in Cache
 * Storage, IndexedDB and localStorage.
 *
 * Why it runs on the login screen rather than in the sign-out action:
 * `logoutAction` is a Server Action and cannot reach Cache Storage or
 * IndexedDB at all. The login page already redirects to /protected whenever a
 * staff session exists, so *being on it* is proof there is no session -- which
 * makes purging there unconditionally correct, and covers the ways a session
 * ends that never touch the sign-out button (expiry, a revoked account,
 * somebody clearing cookies).
 *
 * What is deliberately left alone: the staffer's own unsent work and
 * preferences -- payment drafts (`vpps-payment-drafts`), saved table views,
 * appearance, language, `vpps.paymentDesk.lastPaymentMode`. A draft is an
 * amount somebody typed and has not posted yet; a session that expires
 * mid-entry must not also destroy it. Please do not "tidy" this into a
 * blanket wipe.
 */

const purgedLocalStoragePrefixes = [
  paymentDeskStudentIndexCacheKey,
  paymentDeskStudentSummaryKeyPrefix,
] as const;

async function purgeCacheStorage() {
  if (typeof caches === "undefined") {
    return;
  }

  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith(serviceWorkerCachePrefix))
      .map((key) => caches.delete(key)),
  );
}

function purgeIndexedDb() {
  if (typeof indexedDB === "undefined") {
    return;
  }

  // Fire and forget. deleteDatabase blocks until every other connection to it
  // closes, and on the login screen there are none -- but awaiting a request
  // that can silently stay `blocked` forever would hang the caller.
  indexedDB.deleteDatabase(paymentDeskSummaryDbName);
}

function purgeLocalStorage() {
  const storage = typeof window === "undefined" ? null : window.localStorage;

  if (!storage) {
    return;
  }

  const doomed: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);

    if (key && purgedLocalStoragePrefixes.some((prefix) => key.startsWith(prefix))) {
      doomed.push(key);
    }
  }

  // Collected first, removed second: removeItem re-indexes the store, so
  // deleting inside the loop skips every other match.
  for (const key of doomed) {
    storage.removeItem(key);
  }
}

export async function purgeSignedOutCaches() {
  purgeLocalStorage();
  purgeIndexedDb();
  await purgeCacheStorage();
}
