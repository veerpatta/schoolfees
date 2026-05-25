"use client";

import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";

import {
  PAYMENT_POSTED_EVENT,
  PAYMENT_POSTED_TTL_MS,
  getActiveOptimisticPayments,
  type PostedPayment,
} from "@/lib/dashboard/optimistic-counters";
import { formatInr } from "@/lib/helpers/currency";

export function OptimisticBanner() {
  const [entries, setEntries] = useState<PostedPayment[]>([]);

  useEffect(() => {
    function refresh() {
      setEntries(getActiveOptimisticPayments());
    }
    refresh();

    function onPosted() {
      refresh();
    }
    function onStorage(event: StorageEvent) {
      if (event.key === "vpps:payment-posted-queue") refresh();
    }
    window.addEventListener(PAYMENT_POSTED_EVENT, onPosted);
    window.addEventListener("storage", onStorage);

    const tick = window.setInterval(refresh, 5_000);
    return () => {
      window.removeEventListener(PAYMENT_POSTED_EVENT, onPosted);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(tick);
    };
  }, []);

  if (entries.length === 0) return null;

  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const seconds = Math.ceil(PAYMENT_POSTED_TTL_MS / 1000);

  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-accent-soft-foreground no-print"
    >
      <Receipt className="size-4 shrink-0" aria-hidden="true" />
      <span className="font-semibold tabular-nums">+ {formatInr(total)}</span>
      <span className="text-xs">
        just posted ({entries.length} receipt{entries.length === 1 ? "" : "s"}) — refreshing in &lt; {seconds}s
      </span>
    </div>
  );
}
