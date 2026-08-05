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
  /**
   * Actions pinned BELOW the scroll area — always visible, never scrolled past,
   * and lifted above the on-screen keyboard. Any sheet whose primary action
   * sits at the end of a long body (or below a text input) should pass it here
   * instead of rendering it as the last child of `children`.
   */
  footer?: ReactNode;
  children: ReactNode;
};

const SWIPE_DISMISS_THRESHOLD = 80;
let sheetScrollLockCount = 0;
let previousBodyOverflow = "";
let previousHtmlOverflow = "";
let previousMainOverflow = "";
let isLocked = false;
let previousMainScrollTop = 0;

/**
 * The element that actually scrolls on a phone.
 *
 * Below 767px `.mobile-app-main` is `height:100dvh; overflow-y:auto` (see the
 * phone app scroll model in globals.css) and the document does NOT scroll — so
 * locking `body` and `html` alone, which is all this used to do, was a no-op on
 * every phone. Returns null on desktop, where the document is the scroller.
 */
function getPhoneScroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".mobile-app-main");
}

export function acquireSheetScrollLock() {
  if (sheetScrollLockCount === 0) {
    isLocked = true;
    previousBodyOverflow = document.body.style.overflow;
    previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const main = getPhoneScroller();
    if (main) {
      // scrollTop is captured BEFORE the overflow write, because setting
      // overflow:hidden on a scrolled element can reset it to 0 — and
      // ScrollRestoringMain persists that value on unmount, so losing it here
      // would silently break scroll restoration on every screen with a sheet.
      previousMainScrollTop = main.scrollTop;
      previousMainOverflow = main.style.overflow;
      main.style.overflow = "hidden";
    }
  }

  sheetScrollLockCount += 1;
}

function restoreScrollLock() {
  // Restoring when nothing is locked would scroll `.mobile-app-main` back to a
  // captured position of 0. Reachable by switching academic sessions with a
  // receipt open: the pill calls releaseAllSheetScrollLocks(), and the sheet's
  // own cleanup then calls releaseSheetScrollLock() on an already-zero count.
  if (!isLocked) {
    return;
  }
  isLocked = false;

  document.body.style.overflow = previousBodyOverflow;
  document.documentElement.style.overflow = previousHtmlOverflow;
  previousBodyOverflow = "";
  previousHtmlOverflow = "";

  const main = getPhoneScroller();
  if (main) {
    main.style.overflow = previousMainOverflow;
    main.scrollTop = previousMainScrollTop;
  }
  previousMainOverflow = "";
  previousMainScrollTop = 0;
}

export function releaseSheetScrollLock() {
  sheetScrollLockCount = Math.max(0, sheetScrollLockCount - 1);

  if (sheetScrollLockCount === 0) {
    restoreScrollLock();
  }
}

export function releaseAllSheetScrollLocks() {
  sheetScrollLockCount = 0;
  restoreScrollLock();
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
  footer,
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

  /**
   * `onClose` is an inline arrow at essentially every call site, so its
   * identity changes on every render of the owner. Reading it through a ref
   * keeps the effects below keyed on `open` alone.
   *
   * This is load-bearing, not tidiness. When the history effect depended on
   * `onClose`, one keystroke inside a sheet tore the effect down — firing
   * `history.back()` — and immediately pushed a fresh marker entry. The queued
   * traversal then landed on that NEW entry, the popstate handler saw a marker
   * it did not recognise, and closed the sheet mid-interaction. That is the
   * "the picker vanishes when I select a student" report; guarded by
   * tests/ui/interaction/sheet-history-stability.test.tsx.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const closeWithHistory = useCallback(() => {
    if (historyDismiss && pushedHistoryRef.current && !closingFromPopstateRef.current) {
      // Popping our entry fires popstate, which runs onClose for us.
      pushedHistoryRef.current = false;
      window.history.back();
      return;
    }
    onCloseRef.current();
  }, [historyDismiss]);

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
      onCloseRef.current();
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
  }, [open, historyDismiss]);

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
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, handleKey]);

  /**
   * Scroll lock is its own effect, keyed on `open`/`lockScroll` only. Sharing
   * an effect with the keydown listener meant every re-render released and
   * re-acquired the lock — and releasing writes `.mobile-app-main`'s scrollTop
   * back to the captured value, so a phone scrolled visibly on every keystroke.
   */
  useEffect(() => {
    if (!open || !lockScroll) return;
    acquireSheetScrollLock();
    return () => releaseSheetScrollLock();
  }, [open, lockScroll]);

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
        // A sheet can nominate where focus should land with
        // `data-sheet-initial-focus`. Without it focus goes to the first
        // focusable, which is the header's close button — so a picker's search
        // field lost focus a tick after `autoFocus` put it there. Call sites
        // that must NOT raise the on-screen keyboard simply omit the attribute.
        const preferred = panel.querySelector<HTMLElement>("[data-sheet-initial-focus]");
        const focusables = panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (preferred) {
          preferred.focus();
        } else if (focusables.length > 0) {
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
  const panelStyle: React.CSSProperties = {
    // Lift the whole panel clear of the on-screen keyboard. On iOS the
    // keyboard overlays the layout viewport, so without this the bottom of
    // the sheet (where the submit button lives) is unreachable no matter how
    // the body scrolls. --keyboard-offset is 0 where the viewport resizes.
    ...(isBottom ? { marginBottom: "var(--keyboard-offset, 0px)" } : {}),
    ...(isBottom && dragY > 0
      ? { transform: `translate3d(0, ${dragY}px, 0)`, transition: "none" }
      : {}),
  };

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

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto momentum-scroll px-5 pt-1",
            // With a pinned footer the safe-area padding belongs to the footer,
            // not the scroll body, or the last row sits above a dead gap.
            footer
              ? "pb-3"
              : "pb-[calc(env(safe-area-inset-bottom,0px)+20px)]",
          )}
        >
          {children}
        </div>

        {footer ? (
          <div
            data-sheet-footer
            className="flex-none border-t border-border bg-card px-5 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]"
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
