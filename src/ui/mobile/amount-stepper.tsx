"use client";

import { Minus, Plus } from "lucide-react";

import { formatInr } from "@/platform/helpers/currency";
import { cn } from "@/platform/utils";

/**
 * The design's −/amount/+ control for editing a fee head on a phone
 * (template §FEE SETUP).
 *
 * Step size is a deliberate departure. The prototype nudges by ₹50, because
 * its mock edits a MONTHLY tuition of a few hundred rupees. Real class tuition
 * here is ₹20,000–38,000 a year, where ₹50 a tap is 400 taps to move ₹20k.
 * The step is therefore caller-supplied and defaults to ₹500.
 *
 * The stepper nudges; the field beside it still takes a typed figure. Neither
 * replaces the other — a clerk correcting ₹20,000 to ₹20,500 taps once, and
 * one setting ₹38,000 types it.
 */
export function AmountStepper({
  value,
  onChange,
  step = 500,
  min = 0,
  max,
  disabled = false,
  decreaseLabel,
  increaseLabel,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  decreaseLabel: string;
  increaseLabel: string;
  className?: string;
}) {
  const clamp = (next: number) => {
    const lowered = Math.max(min, next);
    return max === undefined ? lowered : Math.min(max, lowered);
  };

  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;

  const buttonClass =
    "focus-ring grid size-[38px] shrink-0 place-items-center rounded-[11px] border border-border bg-surface-2 text-foreground transition-transform active:scale-95 disabled:opacity-40";

  return (
    <span className={cn("flex shrink-0 items-center gap-2", className)}>
      <button
        type="button"
        aria-label={decreaseLabel}
        disabled={disabled || atMin}
        onClick={() => onChange(clamp(value - step))}
        className={buttonClass}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span
        aria-live="polite"
        className="tabular w-[72px] text-center text-[15px] font-extrabold text-foreground"
      >
        {formatInr(value)}
      </span>
      <button
        type="button"
        aria-label={increaseLabel}
        disabled={disabled || atMax}
        onClick={() => onChange(clamp(value + step))}
        className={buttonClass}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </span>
  );
}
