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
  /**
   * Make the Android/browser back gesture close this sheet instead of leaving
   * the page. Opt-in per call site so sheets that are themselves a navigation
   * step (rare) can keep the default behavior.
   */
  historyDismiss?: boolean;
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

/** Marker written into history.state so we only react to our own entries —
 * the App Router pushes its own states and must not be mistaken for a sheet. */
const SHEET_HISTORY_MARKER = "__vppsSheet";
let sheetHistorySeq = 0;

export function Sheet({
  open,
  onClose,
  title,
  description,
  side = "bottom",
  lockScroll = true,
  size = "full",
  historyDismiss = true,
  className,
  children,
  ...props
}: SheetProps) {
  /**
   * Back-button integration. On open we push a marker entry; a popstate that
   * removes it closes the sheet. Any OTHER dismissal (Escape, X, backdrop,
   * swipe) must pop our own entry with history.back(), otherwise phantom
   * entries pile up and the back button appears dead for the next few presses.
   * `closingFromPopstateRef` keeps those two paths from cancelling each other.
   */
  const closingFromPopstateRef = useRef(false);
  const pushedHistoryRef = useRef(false);

  const closeWithHistory = useCallback(() => {
    if (historyDismiss && pushedHistoryRef.current && !closingFromPopstateRef.current) {
      // Popping our entry fires popstate, which runs onClose for us.
      pushedHistoryRef.current = false;
      window.history.back();
      return;
    }
    onClose();
  }, [historyDismiss, onClose]);

  useEffect(() => {
    if (!open || !historyDismiss) return;
    if (typeof window === "undefined") return;

    sheetHistorySeq += 1;
    const entryId = sheetHistorySeq;
    window.history.pushState(
      { ...(window.history.state ?? {}), [SHEET_HISTORY_MARKER]: entryId },
      "",
    );
    pushedHistoryRef.current = true;

    const onPopState = (event: PopStateEvent) => {
      const stillOurs = (event.state as Record<string, unknown> | null)?.[SHEET_HISTORY_MARKER];
      if (stillOurs === entryId) return;
      pushedHistoryRef.current = false;
      closingFromPopstateRef.current = true;
      onClose();
      closingFromPopstateRef.current = false;
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      // Unmounted without a popstate (parent flipped `open`, or navigated
      // away) — clean up the entry we own so history stays balanced.
      if (pushedHistoryRef.current) {
        pushedHistoryRef.current = false;
        window.history.back();
      }
    };
  }, [open, historyDismiss, onClose]);

  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") closeWithHistory();
    },
    [closeWithHistory],
  );

  const panelRef = useRef<HTMLDivElement>(null);

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

  /* ---- Audit 1.16: manual focus trap + restore ----
   * The sheet sets role="dialog" aria-modal="true" but did not trap Tab,
   * did not move initial focus, and did not restore focus on close.
   * Keyboard and screen-reader users could Tab into background content.
   *
   * We capture the previously-focused element on open, move focus into
   * the sheet (first focusable element, falling back to the panel itself),
   * cycle Tab/Shift+Tab between first and last focusable elements, and
   * restore the original focus when the sheet closes.
   */
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    if (typeof document === "undefined") return;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const panel = panelRef.current;
    if (panel) {
      // Defer focus to after the panel renders.
      const id = window.setTimeout(() => {
        const focusables = panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length > 0) {
          focusables[0].focus();
        } else {
          panel.setAttribute("tabindex", "-1");
          panel.focus();
        }
      }, 0);

      const onTabKey = (event: KeyboardEvent) => {
        if (event.key !== "Tab") return;
        const focusables = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null);
        if (focusables.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (event.shiftKey) {
          if (active === first || !panel.contains(active)) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (active === last) {
            event.preventDefault();
            first.focus();
          }
        }
      };

      document.addEventListener("keydown", onTabKey);
      return () => {
        window.clearTimeout(id);
        document.removeEventListener("keydown", onTabKey);
        const previous = previouslyFocusedRef.current;
        if (previous && document.body.contains(previous)) {
          previous.focus();
        }
      };
    }
    return undefined;
  }, [open]);

  /* ---- Swipe-to-dismiss for bottom sheets ---- */
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
      closeWithHistory();
    }
    setDragY(0);
    touchStartY.current = null;
  }, [dragY, closeWithHistory]);

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
        onClick={closeWithHistory}
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
              onClick={closeWithHistory}
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
