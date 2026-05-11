"use client";

import { X } from "lucide-react";
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useCallback,
  useEffect,
} from "react";

import { cn } from "@/lib/utils";

/**
 * Lightweight bottom sheet — used for mobile drawers.
 * Pure CSS + a controlled `open` prop. No Radix Dialog, to keep the bundle small.
 */

type SheetProps = ComponentPropsWithoutRef<"div"> & {
  open: boolean;
  onClose: () => void;
  /** Optional title above the content. */
  title?: ReactNode;
  /** Optional description shown muted below the title. */
  description?: ReactNode;
  /** Side. Bottom is the default mobile pattern. */
  side?: "bottom" | "right";
  /** Lock background scroll while open. */
  lockScroll?: boolean;
  children: ReactNode;
};

export function Sheet({
  open,
  onClose,
  title,
  description,
  side = "bottom",
  lockScroll = true,
  className,
  children,
  ...props
}: SheetProps) {
  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKey);
    if (lockScroll) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleKey);
        document.body.style.overflow = previous;
      };
    }
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, handleKey, lockScroll]);

  if (!open) return null;

  const isBottom = side === "bottom";

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex"
      style={{ alignItems: isBottom ? "flex-end" : "stretch", justifyContent: isBottom ? "stretch" : "flex-end" }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/30 anim-fade-in"
      />
      <div
        className={cn(
          "relative z-10 flex max-h-[92dvh] w-full flex-col bg-card text-foreground shadow-lg",
          isBottom
            ? "rounded-t-xl border-t border-border anim-slide-up"
            : "h-full max-w-md rounded-l-xl border-l border-border anim-slide-up",
          className,
        )}
        {...props}
      >
        {isBottom ? (
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong" aria-hidden="true" />
        ) : null}

        {(title || description) && (
          <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
            <div className="min-w-0">
              {title ? (
                <h3 className="text-base font-semibold tracking-tight text-foreground">
                  {title}
                </h3>
              ) : null}
              {description ? (
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </header>
        )}

        <div className="flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-1">
          {children}
        </div>
      </div>
    </div>
  );
}
