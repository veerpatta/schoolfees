"use client";

import { useSyncExternalStore } from "react";

import {
  getKeyboardOffset,
  getServerKeyboardOffset,
  subscribeKeyboardOffset,
} from "@/ui/system/keyboard-offset-store";

/**
 * Pixels of the layout viewport currently covered by the on-screen keyboard.
 * 0 when the keyboard is down, and on browsers that resize the layout viewport
 * themselves (most Android) — where bottom alignment already does the job.
 *
 * `useSyncExternalStore` rather than useState+useEffect so the server snapshot
 * is defined and React cannot tear between the CSS variable and this value
 * mid-render.
 */
export function useKeyboardOffset(): number {
  return useSyncExternalStore(
    subscribeKeyboardOffset,
    getKeyboardOffset,
    getServerKeyboardOffset,
  );
}
