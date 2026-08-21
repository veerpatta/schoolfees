"use client";

import { useEffect } from "react";

import {
  computeKeyboardOffset,
  setKeyboardOffset,
} from "@/ui/system/keyboard-offset-store";

/**
 * Publishes the on-screen keyboard height as `--keyboard-offset` on <html>.
 *
 * On iOS the keyboard OVERLAYS the layout viewport: the page keeps its full
 * height and anything pinned to the bottom ends up behind the keyboard, where
 * no amount of internal scrolling can reach it. `visualViewport` is the only
 * way to learn how much is covered. On most Android browsers the layout
 * viewport resizes instead, so the delta is 0 and every consumer degrades to
 * plain bottom alignment.
 *
 * This used to live inside the Payment Desk, which meant only that one screen
 * lifted its actions above the keyboard — every other sheet with a text input
 * (Waive late fee, Log contact, Close due as discount, WhatsApp templates)
 * trapped its submit button underneath. Mounting it once for the whole
 * protected workspace fixes them together.
 */
export function KeyboardOffsetProvider() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }

    let frame: number | null = null;
    let published = -1;

    function publish() {
      frame = null;
      const next = computeKeyboardOffset(
        window.innerHeight,
        viewport!.height,
        viewport!.offsetTop,
      );

      // iOS fires `scroll` at touch frequency while the keyboard is up, and
      // most of those events do not change the covered height at all. Writing
      // the custom property anyway re-resolves every var() that reads it,
      // document-wide, on each one.
      if (next === published) {
        return;
      }

      published = next;
      document.documentElement.style.setProperty("--keyboard-offset", `${next}px`);
      setKeyboardOffset(next);
    }

    function schedule() {
      if (frame !== null) {
        return;
      }
      frame = window.requestAnimationFrame(publish);
    }

    publish();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);

    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      document.documentElement.style.removeProperty("--keyboard-offset");
      setKeyboardOffset(0);
    };
  }, []);

  return null;
}
