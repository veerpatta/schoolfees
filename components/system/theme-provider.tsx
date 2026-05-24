"use client";

/**
 * Wraps `next-themes` so the whole app shares a single tri-state theme
 * (light / dark / system).
 *
 * Why a thin wrapper:
 * 1. The root layout is a server component — `next-themes`' provider is
 *    client-only, so we isolate the "use client" boundary here.
 * 2. We bolt on a tiny side-effect that adds `theme-ready` to <html> after
 *    first paint. The base CSS in `app/globals.css` only enables the
 *    color-transition rule when that class is present — so swapping themes
 *    is smooth, but the very first render never flashes.
 *
 * Storage key is namespaced under `vpps.theme` so multiple tabs and any
 * future portals stay coordinated.
 */

import { useEffect } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

type ThemeProviderProps = {
  children: React.ReactNode;
};

function ThemeReadinessFlag() {
  useEffect(() => {
    // Defer to next frame so the initial paint never sees the transition.
    const id = requestAnimationFrame(() => {
      document.documentElement.classList.add("theme-ready");
    });
    return () => cancelAnimationFrame(id);
  }, []);
  return null;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="vpps.theme"
      disableTransitionOnChange={false}
    >
      <ThemeReadinessFlag />
      {children}
    </NextThemesProvider>
  );
}
