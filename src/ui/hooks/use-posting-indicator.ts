"use client";

import { useEffect, useState } from "react";

/**
 * Timing for the "payment is posting" screen.
 *
 * Two competing needs. A post that resolves in 200ms must not strobe a
 * full-screen sheet at the clerk, so the sheet waits a beat before appearing.
 * A post that takes eight seconds must stop implying it is nearly done, so the
 * copy escalates.
 *
 * The delay matches `RouteProgress`'s anti-flash constant and the escalation
 * matches the confirm sheet's slow-save threshold — the desk should not have
 * three different opinions about how long is too long.
 *
 * Lives outside the Payment Desk client because that file is already past the
 * size budget and slated for a split (docs/design/design-system.md §5.1).
 */
const SHOW_DELAY_MS = 120;
const SLOW_AFTER_MS = 8000;

export function usePostingIndicator(isPostInFlight: boolean) {
  const [showPostingSheet, setShowPostingSheet] = useState(false);
  const [isSlowPost, setIsSlowPost] = useState(false);

  useEffect(() => {
    if (!isPostInFlight) {
      setShowPostingSheet(false);
      setIsSlowPost(false);
      return;
    }

    const showTimer = setTimeout(() => setShowPostingSheet(true), SHOW_DELAY_MS);
    const slowTimer = setTimeout(() => setIsSlowPost(true), SLOW_AFTER_MS);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(slowTimer);
    };
  }, [isPostInFlight]);

  return { showPostingSheet, isSlowPost };
}
