"use client";

/**
 * Density context — single source of truth for "cozy vs compact" across
 * tables, forms, and any density-aware primitive.
 *
 * Wire it once at the layout level. Consumers can either:
 *   - read the value via `useDensity()`
 *   - opt into the CSS-driven sizing utilities by adding `density-row`,
 *     `density-cell`, or `density-input` to their elements. The provider
 *     mirrors the current value onto `<html data-density="…">` so plain
 *     CSS selectors in `app/globals.css` do the rest with zero runtime cost.
 *
 * Default = cozy. Choice is persisted in localStorage under `vpps.density`
 * so it survives reloads.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Density = "cozy" | "compact";

export type DensityContextValue = {
  density: Density;
  setDensity: (next: Density) => void;
  toggleDensity: () => void;
};

const STORAGE_KEY = "vpps.density";
const DEFAULT_DENSITY: Density = "cozy";

const DensityContext = createContext<DensityContextValue | null>(null);

/**
 * Stable safe-default returned by `useDensity()` when no provider is
 * mounted. Exported so tests can assert the inert contract without having
 * to invoke a React hook outside a render.
 */
export const DENSITY_SAFE_DEFAULT: DensityContextValue = Object.freeze({
  density: DEFAULT_DENSITY,
  setDensity: () => {},
  toggleDensity: () => {},
});

function isDensity(value: unknown): value is Density {
  return value === "cozy" || value === "compact";
}

function readStoredDensity(): Density {
  if (typeof window === "undefined") return DEFAULT_DENSITY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isDensity(raw) ? raw : DEFAULT_DENSITY;
  } catch {
    return DEFAULT_DENSITY;
  }
}

export function DensityProvider({ children }: { children: React.ReactNode }) {
  const [density, setDensityState] = useState<Density>(DEFAULT_DENSITY);

  // Hydrate from localStorage after mount to avoid SSR mismatches.
  useEffect(() => {
    setDensityState(readStoredDensity());
  }, []);

  // Reflect onto <html> so global CSS rules can target it without React.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-density", density);
  }, [density]);

  const setDensity = useCallback((next: Density) => {
    setDensityState(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Ignore quota/privacy errors — density just won't persist.
      }
    }
  }, []);

  const toggleDensity = useCallback(() => {
    setDensity(density === "cozy" ? "compact" : "cozy");
  }, [density, setDensity]);

  const value = useMemo<DensityContextValue>(
    () => ({ density, setDensity, toggleDensity }),
    [density, setDensity, toggleDensity],
  );

  return (
    <DensityContext.Provider value={value}>{children}</DensityContext.Provider>
  );
}

export function useDensity(): DensityContextValue {
  const ctx = useContext(DensityContext);
  return ctx ?? DENSITY_SAFE_DEFAULT;
}
