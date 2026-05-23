"use client";

import { X } from "lucide-react";
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/**
 * Lightweight bottom sheet — used for mobile drawers.
 * Pure CSS + a controlled `open` prop. No Radix Dialog, to keep the bundle small.
 * Supports swipe-to-dismiss on mobile bottom sheets.
 */

const sheetSizeClass = {
  sm: "max-h-[40dvh]",
  md: "max-h-[60dvh]",
  lg: "max-h-[80dvh]",
  full: "max-h-[92dvh]",
} as const;

type SheetSize = keyof typeof sheetSizeClass;

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
  /** Sheet height for bottom sheets. Default: "full" (92dvh). */
  size?: SheetSize;
  children: ReactNode;
};

const SWIPE_DISMISS_THRESHOLD = 80;
let sheetScrollLockCount = 0;
let previousBodyOverflow = "";
let previousHtmlOverflow = "";

function acquireSheetScrollLock() {
  if (sheetScrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
  }

  sheetScrollLockCount += 1;
}

function releaseSheetScrollLock() {
  sheetScrollLockCount = Math.max(0, sheetScrollLockCount - 1);

  if (sheetScrollLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
    document.documentElement.style.overflow = previousHtmlOverflow;
    previousBodyOverflow = "";
    previousHtmlOverflow = "";
  }
}

export function releaseAllSheetScrollLocks() {
  sheetScrollLockCount = 0;
  document.body.style.overflow = previousBodyOverflow;
  document.documentElement.style.overflow = previousHtmlOverflow;
  previousBodyOverflow = "";
  previousHtmlOverflow = "";
}

export function Sheet({
  open,
  onClose,
  title,
  description,
  side = "bottom",
  lockScroll = true,
  size = "full",
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
      acquireSheetScrollLock();
      return () => {
        document.removeEventListener("keydown", handleKey);
        releaseSheetScrollLock();
      };
    }
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, handleKey, lockScroll]);

  /* ---- Swipe-to-dismiss for bottom sheets ---- */
  const panelRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const touchStartY = useRef<number | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    // Only allow dragging downward
    if (delta > 0) {
      setDragY(delta);
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (dragY > SWIPE_DISMISS_THRESHOLD) {
      onClose();
    }
    setDragY(0);
    touchStartY.current = null;
  }, [dragY, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const isBottom = side === "bottom";
  const panelStyle: React.CSSProperties = isBottom && dragY > 0
    ? { transform: `translate3d(0, ${dragY}px, 0)`, transition: "none" }
    : {};

  return createPortal(
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
        style={{ animationDuration: "250ms" }}
      />
      <div
        ref={panelRef}
        className={cn(
          "relative z-10 flex w-full flex-col bg-card text-foreground shadow-lg",
          isBottom
            ? cn("rounded-t-xl border-t border-border anim-slide-up", sheetSizeClass[size])
            : "h-full max-w-md rounded-l-xl border-l border-border anim-slide-up",
          className,
        )}
        style={panelStyle}
        {...props}
      >
        {isBottom ? (
          <div
            className="mx-auto mt-2 h-1 w-10 cursor-grab rounded-full bg-border-strong active:cursor-grabbing"
            aria-hidden="true"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            /* Extend touch target for easier swiping */
            style={{ padding: "8px 0", margin: "-8px auto 0", backgroundClip: "content-box" }}
          />
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

        <div className="flex-1 overflow-y-auto momentum-scroll px-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-1">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
