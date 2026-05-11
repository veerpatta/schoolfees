import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-60",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    "active:translate-y-[0.5px]",
  ].join(" "),
  {
    variants: {
      variant: {
        // Solid ink — default for confirm/save actions
        primary:
          "bg-primary text-primary-foreground shadow-xs hover:bg-foreground/92 active:bg-foreground/95",
        // Tonal neutral — quieter than primary; for medium-emphasis actions
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-surface-3",
        // Reserved for the SINGLE hero CTA per screen (saffron)
        accent:
          "bg-accent text-accent-foreground shadow-xs hover:bg-accent/92 active:bg-accent/95",
        // Quiet bordered button — most secondary actions
        outline:
          "border border-border bg-surface text-foreground shadow-xs hover:bg-surface-2 hover:border-border-strong",
        // Tonal — implies importance without solid color (uses accent-soft)
        soft:
          "bg-accent-soft text-accent-soft-foreground hover:bg-accent-soft/80",
        // Borderless — toolbars, compact actions
        ghost:
          "text-foreground hover:bg-surface-2",
        // Destructive
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/92",
        "destructive-outline":
          "border border-destructive/40 bg-surface text-destructive-soft-foreground hover:bg-destructive-soft hover:border-destructive/60",
        // Inline link
        link:
          "text-accent underline-offset-4 hover:underline px-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        default: "h-9 px-3.5 md:h-9",
        lg: "h-10 px-5",
        // Mobile-default — bigger tap target
        mobile: "h-11 px-4 text-sm",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
        "icon-lg": "h-10 w-10",
      },
    },
    compoundVariants: [
      // On small screens, default size becomes 44px tall for thumb-friendly touch
      { size: "default", class: "max-md:h-11 max-md:px-4" },
      { size: "sm", class: "max-md:h-10" },
      { size: "icon", class: "max-md:h-11 max-md:w-11" },
    ],
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

// Backwards-compat: existing call sites use variant="default" — alias to primary
type LegacyVariant = "default";
type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]> | LegacyVariant;
type ButtonSize = VariantProps<typeof buttonVariants>["size"];

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  asChild?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingText?: string;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

function resolveVariant(variant?: ButtonVariant) {
  if (!variant || variant === "default") return "primary" as const;
  return variant;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingText,
      leadingIcon,
      trailingIcon,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const resolvedVariant = resolveVariant(variant);

    return (
      <Comp
        ref={ref}
        className={cn(
          buttonVariants({ variant: resolvedVariant, size, className }),
        )}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {loadingText ?? children}
          </>
        ) : (
          <>
            {leadingIcon}
            {children}
            {trailingIcon}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
