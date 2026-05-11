"use client";

import { useEffect, useRef, useState } from "react";

import { formatInr } from "@/lib/helpers/currency";

type CountUpProps = {
  /** Target value to animate towards. */
  value: number;
  /** Duration in ms. Defaults to 600ms — short enough to feel responsive. */
  duration?: number;
  /** Format function. Defaults to INR. Pass a custom one for non-currency values. */
  format?: (value: number) => string;
  /** Optional className passed to the span. */
  className?: string;
  /** Skip animation when the value is small or component just mounted with the final value (e.g., SSR). */
  startFrom?: number;
};

/**
 * Lightweight, dependency-free count-up. Uses `requestAnimationFrame` with an
 * ease-out cubic. Respects `prefers-reduced-motion` — when reduced motion is
 * preferred, snaps directly to the final value with no animation.
 *
 * Designed for KPIs / hero figures, NOT for every Money cell. Use sparingly
 * to keep the experience premium rather than gimmicky.
 */
export function CountUp({
  value,
  duration = 600,
  format = formatInr,
  className,
  startFrom = 0,
}: CountUpProps) {
  const [display, setDisplay] = useState(() => startFrom);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const fromRef = useRef<number>(startFrom);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Honour reduced motion — snap, no animation.
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduced || value === fromRef.current) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }

    const from = fromRef.current;
    const to = value;
    startedAtRef.current = null;

    const tick = (now: number) => {
      if (startedAtRef.current === null) startedAtRef.current = now;
      const elapsed = now - startedAtRef.current;
      const t = Math.min(1, elapsed / duration);
      // ease-out cubic — finishes calmly, no spring overshoot.
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(from + (to - from) * eased);
      setDisplay(current);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [value, duration]);

  return (
    <span className={className} aria-label={format(value)}>
      <span aria-hidden="true" className="tabular">
        {format(display)}
      </span>
    </span>
  );
}
