"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/platform/utils";

/**
 * Connection pill (mobile app v2, Home).
 *
 * The design puts a pulsing "Online" dot at the top of the home screen. It is
 * only worth the pixels if it tells the truth, so it reads `navigator.onLine`
 * rather than hard-coding "Online" — a fee counter in a school office does
 * lose its connection, and a clerk about to take cash should be able to see
 * that before they start rather than after they hit Collect.
 *
 * Renders nothing until mounted: `navigator.onLine` is unavailable on the
 * server, and claiming "Online" in the SSR pass would flash a wrong state.
 */
export function ConnectionPill({ className }: { className?: string }) {
  const t = useTranslations("MobileApp");
  const [status, setStatus] = useState<"unknown" | "online" | "offline">("unknown");

  useEffect(() => {
    const sync = () => setStatus(navigator.onLine ? "online" : "offline");
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (status === "unknown") return null;

  const offline = status === "offline";

  return (
    <span
      role="status"
      className={cn(
        "inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[10.5px] font-bold",
        offline
          ? "border-destructive/40 tone-danger"
          : "border-success/40 tone-success",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          offline ? "bg-destructive" : "anim-pulse-dot bg-success",
        )}
      />
      {offline ? t("offline") : t("online")}
    </span>
  );
}
