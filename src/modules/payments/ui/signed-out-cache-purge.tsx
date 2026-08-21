"use client";

import { useEffect } from "react";

import { purgeSignedOutCaches } from "@/modules/payments/domain/signed-out-purge";

/**
 * Wipes cached school data whenever the login screen is shown.
 *
 * The office counter is a shared device: without this, the previous staffer's
 * student index, admission numbers and fee balances stayed in Cache Storage,
 * IndexedDB and localStorage while the next one signed in. See
 * lib/cache/signed-out-purge.ts for what is cleared and what is kept.
 *
 * Renders nothing.
 */
export function SignedOutCachePurge() {
  useEffect(() => {
    // Failure here must never block a sign-in: a browser with storage denied
    // (private mode, a locked-down policy) still has to reach the form.
    void purgeSignedOutCaches().catch(() => undefined);
  }, []);

  return null;
}
