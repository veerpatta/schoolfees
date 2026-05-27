"use client";

import { useEffect, useRef, useState } from "react";

import { formatInr } from "@/lib/helpers/currency";

type FormatType = "inr" | "percent" | "number";

type CountUpProps = {
  /** Target value to animate towards. */
  value: number;
  /** Duration in ms. Defaults to 600ms — short enough to feel responsive. */
  duration?: number;
  /**
   * Built-in formatter. `inr` (default) renders Indian rupee currency.
   * `percent` renders `42%`. `number` renders a comma-grouped integer.
   *
   * Use the string-token form whenever a Server Component renders `<CountUp>` —
   * functions can't be serialized across the RSC boundary.
   */
  format?: FormatType;
  /**
   * Escape hatch for Client Components that need a custom formatter.
   * Server Components MUST use `format` instead.
   */
  formatter?: (value: number) => string;
  /** Optional className passed to the visible span. */
  className?: string;
  /** Override the initial value (default 0). */
  startFrom?: number;
};

// Plain-number formatter used only for the non-money "number" / "percent" formats.
// Money figures route through formatInr() — see formatBuiltIn() below.
const numberFormatter = new Intl.NumberFormat("en-IN"); // @allow-raw-money-format

function formatBuiltIn(type: FormatType, value: number): string {
  switch (type) {
    case "percent":
      return `${Math.round(value)}%`;
    case "number":
      return numberFormatter.format(value);
    case "inr":
    default:
      return formatInr(value);
  }
}

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
  format = "inr",
  formatter,
  className,
  startFrom = 0,
}: CountUpProps) {
  const [display, setDisplay] = useState(() => startFrom);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const fromRef = useRef<number>(startFrom);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const mobile = window.matchMedia?.("(max-width: 767px)")?.matches;
    if (reduced || mobile || value === fromRef.current) {
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
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic — no overshoot
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

  const render = formatter ?? ((v: number) => formatBuiltIn(format, v));

  return (
    <span className={className} aria-label={render(value)}>
      <span aria-hidden="true" className="tabular">
        {render(display)}
      </span>
    </span>
  );
}
