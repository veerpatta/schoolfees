"use client";

import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { isMobileTakeoverRoute } from "@/lib/config/navigation";
import { cn } from "@/lib/utils";

type ScrollRestoringMainProps = {
  children: ReactNode;
  className?: string;
  /** Pinned at the top of the phone scroll region (the takeover back bar). */
  mobileBar?: ReactNode;
};

export function ScrollRestoringMain({
  children,
  className,
  mobileBar,
}: ScrollRestoringMainProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mainRef = useRef<HTMLElement>(null);
  const storageKey = useMemo(() => {
    const search = searchParams.toString();
    return `vpps.scroll.${pathname}${search ? `?${search}` : ""}`;
  }, [pathname, searchParams]);

  useEffect(() => {
    const mainElement = mainRef.current;
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      try {
        const position = JSON.parse(saved) as { mainTop?: number; windowTop?: number };
        requestAnimationFrame(() => {
          if (typeof position.windowTop === "number") {
            const maxWindowTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
            window.scrollTo({ top: Math.min(position.windowTop, maxWindowTop) });
          }
          if (typeof position.mainTop === "number" && mainElement) {
            const maxMainTop = Math.max(0, mainElement.scrollHeight - mainElement.clientHeight);
            mainElement.scrollTop = Math.min(position.mainTop, maxMainTop);
          }
        });
      } catch {
        sessionStorage.removeItem(storageKey);
      }
    }

    return () => {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          mainTop: mainElement?.scrollTop ?? 0,
          windowTop: window.scrollY,
        }),
      );
    };
  }, [storageKey]);

  // Tab-bar screens need bottom clearance inside the scroll region; takeover
  // screens hide the bar and get the full height.
  const hasBottomNav = !isMobileTakeoverRoute(pathname);

  return (
    <main
      ref={mainRef}
      className={cn("mobile-app-main", className)}
      data-bottom-nav={hasBottomNav ? "true" : "false"}
    >
      {mobileBar}
      {children}
    </main>
  );
}
