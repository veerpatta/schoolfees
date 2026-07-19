"use client";

import { useCallback } from "react";

/**
 * Named haptic patterns. Using names rather than raw arrays keeps the physical
 * vocabulary consistent across surfaces — "success" must feel identical
 * whether it fires on the Payment Desk or anywhere else.
 */
export const hapticPatterns = {
  /** Payment posted / irreversible action completed. */
  success: [50, 30, 80],
  /** Duplicate or blocked action — deliberately stuttering. */
  warning: [20, 40, 20, 40, 20],
  /** Something failed. */
  error: [40, 60, 40],
  /** Lightweight confirmation of a tap on a control. */
  tap: 10,
} as const satisfies Record<string, VibratePattern>;

export type HapticPattern = keyof typeof hapticPatterns;

/** Fire-and-forget: haptics are a nicety and must never break a flow. */
export function triggerHaptic(pattern: HapticPattern | VibratePattern) {
  try {
    if (typeof navigator === "undefined" || !navigator.vibrate) return;
    const resolved =
      typeof pattern === "string" ? hapticPatterns[pattern] : pattern;
    navigator.vibrate(resolved as VibratePattern);
  } catch {
    // Best-effort only — unsupported, blocked, or user-disabled.
  }
}

export function useHaptics() {
  return useCallback(
    (pattern: HapticPattern | VibratePattern) => triggerHaptic(pattern),
    [],
  );
}
