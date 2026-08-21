"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, X, XCircle } from "lucide-react";

import { cn } from "@/platform/utils";

/**
 * Semantic weight of a toast. "tone" rather than "variant" on purpose: the
 * design system already uses tone for Notice/StatusBadge/.tone-*, while variant
 * means emphasis on Button.
 */
export type ToastTone = "neutral" | "success" | "warning" | "danger";

type ToastPayload = {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Leading glyph. Overrides the tone icon when supplied. */
  icon?: ReactNode;
  /** Defaults to "neutral" so every pre-existing caller is unchanged. */
  tone?: ToastTone;
  /** Defaults to 5s, or 8s for warning/danger — those need reading time. */
  durationMs?: number;
};

type ToastItem = ToastPayload & {
  id: string;
  /** Set for the length of the exit animation, then the item is dropped. */
  exiting?: boolean;
};

const toastEventName = "vpps-toast";
const DEFAULT_DURATION_MS = 5000;
const DANGER_DURATION_MS = 8000;
/** Must match the anim-toast-out duration in globals.css. */
const EXIT_MS = 180;
const MAX_VISIBLE = 3;

export function toast(payload: ToastPayload) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<ToastPayload>(toastEventName, { detail: payload }));
}

function toneIcon(tone: ToastTone) {
  if (tone === "success") {
    return <CheckCircle2 className="size-4" />;
  }

  if (tone === "warning") {
    return <AlertTriangle className="size-4" />;
  }

  if (tone === "danger") {
    return <XCircle className="size-4" />;
  }

  return null;
}

export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);
  /** id -> dismiss timer, so hovering can pause and leaving can resume. */
  const timers = useRef(new Map<string, number>());
  /** id -> ms still owed when the timer was paused. */
  const remaining = useRef(new Map<string, number>());
  const startedAt = useRef(new Map<string, number>());

  const remove = useCallback((id: string) => {
    // Two-phase: mark exiting so the animation can play, then drop the item.
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, exiting: true } : item)),
    );

    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, EXIT_MS);
  }, []);

  const scheduleDismiss = useCallback(
    (id: string, ms: number) => {
      window.clearTimeout(timers.current.get(id));
      startedAt.current.set(id, Date.now());
      remaining.current.set(id, ms);
      timers.current.set(
        id,
        window.setTimeout(() => {
          timers.current.delete(id);
          remove(id);
        }, ms),
      );
    },
    [remove],
  );

  const pause = useCallback((id: string) => {
    const timer = timers.current.get(id);

    if (timer === undefined) {
      return;
    }

    window.clearTimeout(timer);
    timers.current.delete(id);

    const owed = (remaining.current.get(id) ?? 0) - (Date.now() - (startedAt.current.get(id) ?? 0));
    remaining.current.set(id, Math.max(owed, 1000));
  }, []);

  const resume = useCallback(
    (id: string) => {
      if (timers.current.has(id)) {
        return;
      }

      const owed = remaining.current.get(id);

      if (owed !== undefined) {
        scheduleDismiss(id, owed);
      }
    },
    [scheduleDismiss],
  );

  useEffect(() => {
    function handleToast(event: Event) {
      const detail = (event as CustomEvent<ToastPayload>).detail;
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      // Only ever MAX_VISIBLE on screen. Dropped items keep their timers, which
      // then fire harmlessly against an id that is already gone.
      setItems((current) => [...current, { ...detail, id }].slice(-MAX_VISIBLE));

      const tone = detail.tone ?? "neutral";
      scheduleDismiss(
        id,
        detail.durationMs ??
          (tone === "danger" || tone === "warning" ? DANGER_DURATION_MS : DEFAULT_DURATION_MS),
      );
    }

    window.addEventListener(toastEventName, handleToast);
    return () => window.removeEventListener(toastEventName, handleToast);
  }, [scheduleDismiss]);

  // Capture the ref maps so cleanup does not read a mutated .current.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  if (items.length === 0) {
    return null;
  }

  return (
    /* Phone: a full-width ink pill riding just above the tab bar, per the v2
       design. Desktop: the corner card it has always been. One tree rather
       than two viewports so a toast can never render twice. */
    <div
      className={cn(
        "no-print fixed z-[80] flex flex-col gap-2",
        "inset-x-3.5 bottom-[calc(var(--mobile-bottom-nav-offset)+12px)]",
        "md:inset-x-auto md:bottom-4 md:right-4 md:w-[min(360px,calc(100vw-2rem))]",
      )}
    >
      {items.map((item) => {
        const tone = item.tone ?? "neutral";
        const glyph = item.icon ?? toneIcon(tone);

        return (
          <div
            key={item.id}
            // Danger interrupts; everything else is polite.
            role={tone === "danger" ? "alert" : "status"}
            data-tone={tone}
            onPointerEnter={() => pause(item.id)}
            onPointerLeave={() => resume(item.id)}
            onFocusCapture={() => pause(item.id)}
            onBlurCapture={() => resume(item.id)}
            className={cn(
              "flex items-start gap-3 rounded-[15px] bg-nav px-4 py-3 text-nav-foreground shadow-lg",
              // md:relative anchors the absolutely-positioned dismiss button.
              "md:relative md:block md:rounded-lg md:border md:border-border md:bg-card md:px-4 md:py-3 md:pr-10 md:text-sm md:text-foreground",
              item.exiting ? "anim-toast-out" : "anim-toast-in md:anim-slide-up",
              // A 3px rail, not a flood fill: the design system reserves solid
              // colour for actions and soft tones for state.
              tone === "success" && "border-l-[3px] border-l-success md:border-l-[3px]",
              tone === "warning" && "border-l-[3px] border-l-warning md:border-l-[3px]",
              tone === "danger" && "border-l-[3px] border-l-destructive md:border-l-[3px]",
            )}
          >
            <div className="flex min-w-0 flex-1 items-start gap-3 md:flex md:items-start md:gap-3">
              {glyph ? (
                <span
                  aria-hidden="true"
                  data-toast-icon={tone}
                  className={cn(
                    "mt-px shrink-0 text-base",
                    // Tone must never be colour-only (WCAG 1.4.1), so the icon
                    // renders on both breakpoints — unlike the old phone-only glyph.
                    tone === "success" && "text-success-soft-foreground md:text-success",
                    tone === "danger" && "text-destructive-soft-foreground md:text-destructive",
                    tone === "neutral" && "text-nav-muted md:text-muted-foreground",
                  )}
                >
                  {glyph}
                </span>
              ) : null}
              <span className="min-w-0 flex-1 md:block">
                <p className="text-[12.5px] font-bold leading-snug md:text-sm md:font-semibold">
                  {item.title}
                </p>
                {item.description ? (
                  <p className="mt-1 text-[11px] text-nav-muted md:text-xs md:text-muted-foreground">
                    {item.description}
                  </p>
                ) : null}
                {item.action ? <span className="mt-2 block">{item.action}</span> : null}
              </span>
            </div>
            <button
              type="button"
              onClick={() => remove(item.id)}
              aria-label="Dismiss"
              /* 44px tap target on the phone pill: it sits directly over the
                 tab bar, so a near miss must not trigger navigation. */
              className={cn(
                "-my-3 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg",
                "text-nav-muted hover:text-nav-foreground md:absolute md:right-1 md:top-1 md:size-8",
                "md:text-muted-foreground md:hover:text-foreground focus-ring",
              )}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
