"use client";

import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type ToastPayload = {
  title: string;
  description?: string;
  action?: ReactNode;
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
    <div className="fixed bottom-4 right-4 z-[80] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2 no-print">
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          className={cn(
            "rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground shadow-lg",
            "anim-slide-up",
          )}
        >
          <p className="font-semibold">{item.title}</p>
          {item.description ? <p className="mt-1 text-xs text-muted-foreground">{item.description}</p> : null}
          {item.action ? <div className="mt-2">{item.action}</div> : null}
        </div>
      ))}
    </div>
  );
}
