"use client";

import { useEffect } from "react";

import { acquireSheetScrollLock, releaseSheetScrollLock } from "@/ui/primitives/sheet";

/**
 * Freeze the page behind a full-screen overlay.
 *
 * Use this instead of writing `document.body.style.overflow` by hand. Two
 * things go wrong with the hand-rolled version, and the Payment Desk had both:
 *
 * 1. **It locks the wrong element on a phone.** Below 767px the scroller is
 *    `.mobile-app-main` (`height:100dvh; overflow-y:auto`), not the document —
 *    so a body-only lock is a no-op exactly where overlays matter most.
 * 2. **It races the shared lock.** `<Sheet>` keeps a *counted* lock so nested
 *    or overlapping overlays release correctly. A raw write outside that count
 *    restores a stale `overflow` when it unmounts, which can leave the page
 *    unscrollable until the next navigation.
 *
 * Routing through the counted lock fixes both.
 */
export function useOverlayScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    acquireSheetScrollLock();
    return () => {
      releaseSheetScrollLock();
    };
  }, [active]);
}
