"use client";

import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

type ScrollRestoringMainProps = {
  children: ReactNode;
  className?: string;
};

export function ScrollRestoringMain({ children, className }: ScrollRestoringMainProps) {
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

  return (
    <main ref={mainRef} className={cn(className)}>
      {children}
    </main>
  );
}
