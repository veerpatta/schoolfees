"use client";

/**
 * Reusable "Collect" button. Any row, header, or empty-state can drop one
 * in to open the Collect drawer with a pre-filled student.
 */

import { BadgeIndianRupee } from "lucide-react";

import { cn } from "@/lib/utils";
import { useCollect, type CollectIntent } from "@/lib/payments/collect-context";

type CollectTriggerProps = {
  intent: CollectIntent;
  variant?: "primary" | "ghost";
  size?: "sm" | "md";
  className?: string;
  label?: string;
};

export function CollectTrigger({
  intent,
  variant = "primary",
  size = "sm",
  className,
  label = "Collect",
}: CollectTriggerProps) {
  const { open } = useCollect();
  return (
    <button
      type="button"
      onClick={() => open(intent)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors focus-ring",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3 text-sm",
        variant === "primary"
          ? "bg-accent text-accent-foreground hover:bg-accent/90"
          : "bg-transparent text-foreground hover:bg-surface-2",
        className,
      )}
      title={`Open Payment Desk for ${intent.studentLabel ?? "this student"}`}
    >
      <BadgeIndianRupee className="size-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}
