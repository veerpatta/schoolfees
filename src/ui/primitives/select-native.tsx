import * as React from "react";

import { cn } from "@/platform/utils";

/**
 * A styled native `<select>`.
 *
 * The design system permits a native select — a class picker with 40 options is
 * better served by the platform control than by a Radix listbox, especially on
 * a phone. What it does not permit is the same 300-character class string
 * copy-pasted into four call sites, which is what this replaces.
 *
 * Matches `<Input>`'s geometry and its `aria-invalid` treatment, so a select and
 * a text field sitting next to each other in a form look like siblings.
 */
const SelectNative = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm",
        "transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/30",
        className,
      )}
      {...props}
    />
  ),
);

SelectNative.displayName = "SelectNative";

export { SelectNative };
