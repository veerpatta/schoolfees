"use client";

import { useTranslations } from "next-intl";
import { Delete } from "lucide-react";

import { sanitizeDecimalInput } from "@/lib/payments/payment-desk-client-helpers";
import { cn } from "@/lib/utils";

/**
 * Money keypad — the phone app's large-target amount entry (mobile v2).
 *
 * A counter clerk types rupees, rarely paise. A 3×4 pad gives targets twice
 * the size of the OS keyboard's, and "000" turns ₹7,500 into three presses.
 * It sits ALONGSIDE the native numeric field rather than replacing it, so
 * hardware keyboards, assistive tech, and paise entry all still work.
 *
 * It edits the field's raw string — never a digits-only extraction. Stripping
 * non-digits would turn a typed "7500.5" into "75005" on the next press, i.e.
 * silently multiply the amount by 100. Every write goes back out through
 * `sanitizeDecimalInput`, the same normaliser the text input uses, so the two
 * input methods can never disagree about what the field holds.
 */

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "del"] as const;

export type MoneyKeypadKey = (typeof KEYS)[number];

/**
 * Pure key handler, exported so the arithmetic is unit-testable without a DOM.
 * Returns the next field value, or `null` when the press is a no-op.
 */
export function applyKeypadPress(
  value: string,
  key: MoneyKeypadKey,
  maxLength = 9,
): string | null {
  if (key === "del") {
    return sanitizeDecimalInput(value.slice(0, -1));
  }

  // "000" on an empty field would read as ₹0 — it only ever multiplies an
  // amount that is already there.
  if (key === "000" && value === "") return null;

  const next = `${value}${key}`;
  if (next.length > maxLength) return null;
  return sanitizeDecimalInput(next);
}

export function MoneyKeypad({
  value,
  onChange,
  maxLength = 9,
  disabled = false,
  className,
}: {
  /** Current field value, exactly as the text input holds it. */
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("MobileApp");

  function press(key: MoneyKeypadKey) {
    if (disabled) return;
    const next = applyKeypadPress(value, key, maxLength);
    if (next === null) return;
    onChange(next);
  }

  return (
    <div
      className={cn("grid grid-cols-3 gap-2", className)}
      role="group"
      aria-label={t("keypadLabel")}
    >
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          aria-label={key === "del" ? t("keypadDelete") : key}
          onClick={() => press(key)}
          className={cn(
            "focus-ring grid h-[52px] select-none place-items-center rounded-[13px] border border-border",
            "text-[21px] font-bold text-foreground transition-transform",
            "active:scale-[0.97] active:bg-surface-2 disabled:opacity-40",
            key === "del" ? "bg-surface-2" : "bg-card",
            key === "000" && "text-base",
          )}
        >
          {key === "del" ? <Delete className="size-[18px]" aria-hidden="true" /> : key}
        </button>
      ))}
    </div>
  );
}
