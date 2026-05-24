"use client";

/**
 * Collect drawer — v2 "fire-and-navigate" bridge.
 *
 * The @drawer parallel slot now intercepts /protected/payments navigations
 * and renders Payment Desk inside a Sheet automatically, so this component
 * only needs to handle the command-palette path: when CollectContext has an
 * intent (set by the command palette's useCollect().open(intent)), this
 * effect fires the router navigation and clears the intent.
 *
 * CollectTrigger buttons navigate directly via router.push without going
 * through context — they bypass this component entirely.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useCollect } from "@/lib/payments/collect-context";

export function CollectDrawer() {
  const router = useRouter();
  const { intent, close } = useCollect();

  useEffect(() => {
    if (!intent) return;
    const params = new URLSearchParams({ studentId: intent.studentId });
    if (intent.returnTo) {
      params.set("returnTo", intent.returnTo);
    }
    const href = `/protected/payments?${params.toString()}`;
    close();
    router.push(href);
  }, [intent, close, router]);

  return null;
}
