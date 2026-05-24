"use client";

/**
 * Density toggle — flips the app between cozy and compact via the density
 * context. Pair with `density-row`, `density-cell`, `density-input`
 * utilities defined in `app/globals.css`.
 *
 * Icon-only by default to keep the topbar light. The `variant="labeled"`
 * option is intended for the Settings page.
 */

import { Rows3, StretchVertical } from "lucide-react";

import { cn } from "@/lib/utils";
import { useDensity } from "@/lib/design/density-context";

type DensityToggleProps = {
  variant?: "icon" | "labeled";
  className?: string;
};

export function DensityToggle({ variant = "icon", className }: DensityToggleProps) {
  const { density, toggleDensity } = useDensity();

  const isCompact = density === "compact";
  const Icon = isCompact ? Rows3 : StretchVertical;
  const label = isCompact ? "Compact" : "Cozy";
  const nextLabel = isCompact ? "Switch to cozy" : "Switch to compact";

  return (
    <button
      type="button"
      onClick={toggleDensity}
      aria-label={nextLabel}
      title={`Density: ${label} — click to switch`}
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-border bg-surface text-foreground transition-colors hover:bg-surface-2 focus-ring",
        variant === "icon" ? "size-9" : "h-9 gap-2 px-3 text-sm font-medium",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {variant === "labeled" ? <span>{label}</span> : null}
    </button>
  );
}
