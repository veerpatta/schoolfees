"use client";

import { ViewTransition, type ReactNode } from "react";

/**
 * Cross-fades the page body when the route changes.
 *
 * React only runs a View Transition for updates made inside a Transition,
 * which is exactly what an App Router navigation is: the old screen's DOM
 * stays put until the new one is ready, and the two are then cross-faded
 * by the browser instead of the new screen popping in and re-running its
 * own mount animation. The same applies to a streamed section replacing
 * its skeleton. The animation itself lives in globals.css under the
 * `vt-page` class, where reduced motion turns it off.
 *
 * A client component rather than a server one so the element type is
 * created by the same React that renders it; the shell around it stays a
 * server component.
 */
export function ShellViewTransition({ children }: { children: ReactNode }) {
  return <ViewTransition default="vt-page">{children}</ViewTransition>;
}
