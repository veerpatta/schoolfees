"use client";

import { useMediaQuery } from "@/hooks/use-media-query";

/**
 * Whether the viewer has asked the OS to reduce motion.
 *
 * Most animation is silenced in CSS (the `prefers-reduced-motion` block in
 * app/globals.css). This is for the handful of places that animate in JS and
 * must snap to the final value instead — CountUp, RateGauge, the receipt sheet
 * exit delay.
 *
 * Built on `useMediaQuery` rather than a local `matchMedia` read so it is
 * hydration-safe: a bare `window.matchMedia(...).matches` seed returns the real
 * answer on the client's first render while the server HTML was built from
 * `false`, which is a hydration mismatch. See use-media-query.ts.
 */
export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
