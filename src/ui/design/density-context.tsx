"use client";

/**
 * Density context — historically allowed staff to flip between cozy and
 * compact spacing across tables, forms, and the receipt. The toggle was
 * removed because it was rarely used and added cognitive overhead.
 *
 * This module is preserved as a stub so existing call sites compile until a
 * follow-up phase deletes them. `useDensity()` always returns "cozy" (the
 * historical default), `setDensity`/`toggleDensity` are no-ops, and the
 * `DensityProvider` is now a transparent pass-through.
 */

import type { ReactNode } from "react";

export type Density = "cozy" | "compact";

export type DensityContextValue = {
  density: Density;
  setDensity: (next: Density) => void;
  toggleDensity: () => void;
};

const FIXED_DENSITY: Density = "cozy";

export const DENSITY_SAFE_DEFAULT: DensityContextValue = Object.freeze({
  density: FIXED_DENSITY,
  setDensity: () => {},
  toggleDensity: () => {},
});

export function DensityProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useDensity(): DensityContextValue {
  return DENSITY_SAFE_DEFAULT;
}
