"use client";

import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";

/**
 * Connectivity banner for the Payment Desk. Reads `navigator.onLine` and
 * listens for online/offline events. When offline, surfaces that drafts are
 * being saved locally (the existing IndexedDB draft store keeps amount, mode,
 * and reference number per student+date). When connectivity comes back, the
 * banner briefly shows a confirmation so the staff know it's safe to post.
 *
 * No silent auto-post — the staff still hits "Confirm" to commit. This
 * matches the AGENTS.md rule that payments only land via the Payment Desk
 * RPC after explicit user confirmation.
 */
export function CollectDraftBanner() {
  const [status, setStatus] = useState<"idle" | "offline" | "recovered">("idle");

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setStatus("offline");
    }

    function handleOffline() {
      setStatus("offline");
    }
    function handleOnline() {
      setStatus((previous) => (previous === "offline" ? "recovered" : "idle"));
      window.setTimeout(() => {
        setStatus("idle");
      }, 6000);
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (status === "idle") return null;

  if (status === "offline") {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
        <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">You&apos;re offline.</p>
          <p className="text-xs">
            Keep typing — your draft is saved locally per student. Reconnect before you confirm; the post happens once you tap the confirm button.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-xl border border-success/40 bg-success-soft px-3 py-2 text-sm text-success-soft-foreground">
      <Wifi className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">You&apos;re back online.</p>
        <p className="text-xs">Drafts are intact. Review the amount and confirm when ready.</p>
      </div>
    </div>
  );
}
