"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useSessionSwitching } from "@/lib/session/switching-context";

/**
 * Thin top-of-page indeterminate progress bar that fires on every client
 * navigation. Uses `usePathname` + `useSearchParams` so it triggers whenever
 * the URL changes — including App Router server-component swaps.
 *
 * Lives at the top of `<DashboardShell>` so it sits above the topbar.
 * Hidden under `prefers-reduced-motion`.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const isFirstRender = useRef(true);
  const { isSwitching } = useSessionSwitching();
  const showProgress = visible || isSwitching;

  useEffect(() => {
    if (isFirstRender.current) {
      // Don't flash on the initial mount — that's not a navigation.
      isFirstRender.current = false;
      return;
    }

    // Pathname or query changed → a navigation is in flight (or just completed).
    // Show the bar briefly. Next.js doesn't expose a "navigation pending"
    // signal in App Router, so we show it for a short window to indicate
    // "something just happened" — premium products do exactly this.
    setVisible(true);

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      setVisible(false);
      timeoutRef.current = null;
    }, 380);

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [pathname, searchParams]);

  return (
    <div
      aria-hidden={!showProgress}
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 print:hidden"
    >
      <div
        className={[
          "h-full origin-left bg-accent transition-opacity duration-150",
          showProgress ? "opacity-100" : "opacity-0",
        ].join(" ")}
        style={{
          width: "100%",
          transform: "translate3d(0, 0, 0)",
          maskImage:
            "linear-gradient(90deg, transparent 0%, hsl(var(--accent)) 35%, hsl(var(--accent)) 65%, transparent 100%)",
        }}
      >
        <div className="h-full w-full anim-route-progress bg-accent" />
      </div>
    </div>
  );
}
