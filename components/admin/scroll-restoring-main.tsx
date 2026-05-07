"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type ScrollRestoringMainProps = {
  children: ReactNode;
  className?: string;
};

export function ScrollRestoringMain({ children, className }: ScrollRestoringMainProps) {
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const key = `vpps.scroll.${pathname}`;
    const mainElement = mainRef.current;
    const saved = sessionStorage.getItem(key);
    if (saved) {
      const position = JSON.parse(saved) as { mainTop?: number; windowTop?: number };
      requestAnimationFrame(() => {
        if (typeof position.windowTop === "number") {
          window.scrollTo({ top: position.windowTop });
        }
        if (typeof position.mainTop === "number" && mainElement) {
          mainElement.scrollTop = position.mainTop;
        }
      });
    }

    return () => {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          mainTop: mainElement?.scrollTop ?? 0,
          windowTop: window.scrollY,
        }),
      );
    };
  }, [pathname]);

  return (
    <main ref={mainRef} className={cn(className)}>
      {children}
    </main>
  );
}
