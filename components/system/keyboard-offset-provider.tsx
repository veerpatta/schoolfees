"use client";

import { useEffect } from "react";

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

    function updateKeyboardOffset() {
      document.documentElement.style.setProperty(
        "--keyboard-offset",
        `${Math.max(0, window.innerHeight - viewport!.height)}px`,
      );
    }

    updateKeyboardOffset();
    viewport.addEventListener("resize", updateKeyboardOffset);
    viewport.addEventListener("scroll", updateKeyboardOffset);

    return () => {
      viewport.removeEventListener("resize", updateKeyboardOffset);
      viewport.removeEventListener("scroll", updateKeyboardOffset);
      document.documentElement.style.removeProperty("--keyboard-offset");
    };
  }, []);

  return null;
}
