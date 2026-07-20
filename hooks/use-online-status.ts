"use client";

import { useEffect, useState } from "react";

export type ConnectivityStatus = "online" | "offline" | "recovered";

/**
 * Connectivity indicator — DISPLAY ONLY.
 *
 * This app deliberately has no offline mode: nothing is queued, retried, or
 * posted while offline (see the plan and AGENTS.md — payments land only via an
 * explicit Payment Desk confirmation). This hook exists so surfaces can *tell
 * the user* what's happening, never to drive a mutation.
 *
 * `recovered` is a transient state after coming back online, so a surface can
 * show "you're back" and then fall silent.
 */
export function useOnlineStatus(recoveredHoldMs = 6000): ConnectivityStatus {
  const [status, setStatus] = useState<ConnectivityStatus>("online");

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setStatus("offline");
    }

    let recoveredTimer: number | undefined;

    function handleOffline() {
      if (recoveredTimer) window.clearTimeout(recoveredTimer);
      setStatus("offline");
    }

    function handleOnline() {
      setStatus((previous) => (previous === "offline" ? "recovered" : "online"));
      recoveredTimer = window.setTimeout(() => setStatus("online"), recoveredHoldMs);
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      if (recoveredTimer) window.clearTimeout(recoveredTimer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [recoveredHoldMs]);

  return status;
}
