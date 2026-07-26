"use client";

import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type ToastPayload = {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Leading glyph, shown on the phone pill only. Decorative. */
  icon?: ReactNode;
};

type ToastItem = ToastPayload & {
  id: string;
};

const toastEventName = "vpps-toast";

export function toast(payload: ToastPayload) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<ToastPayload>(toastEventName, { detail: payload }));
}

export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function handleToast(event: Event) {
      const detail = (event as CustomEvent<ToastPayload>).detail;
      const id = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

      setItems((current) => [...current, { ...detail, id }].slice(-3));
      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== id));
      }, 5000);
    }

    window.addEventListener(toastEventName, handleToast);
    return () => window.removeEventListener(toastEventName, handleToast);
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
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          className={cn(
            "anim-toast-in flex items-center gap-3 rounded-[15px] bg-nav px-4 py-3 text-nav-foreground shadow-lg",
            "md:anim-slide-up md:block md:rounded-lg md:border md:border-border md:bg-card md:px-4 md:py-3 md:text-sm md:text-foreground",
          )}
        >
          {item.icon ? (
            <span aria-hidden="true" className="shrink-0 text-base md:hidden">
              {item.icon}
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
      ))}
    </div>
  );
}
