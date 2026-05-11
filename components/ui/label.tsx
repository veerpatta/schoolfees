"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "@/lib/utils";

type LabelProps = React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & {
  /** Marks the field as required visually. */
  required?: boolean;
  /** Optional helper text shown muted, inline next to the label. */
  hint?: React.ReactNode;
};

const Label = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, LabelProps>(
  ({ className, required, hint, children, ...props }, ref) => (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(
        "flex items-center gap-1.5 text-sm font-medium leading-none text-foreground",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {required ? (
        <span aria-hidden="true" className="text-destructive">*</span>
      ) : null}
      {hint ? (
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </LabelPrimitive.Root>
  ),
);
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
