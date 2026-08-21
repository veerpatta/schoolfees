"use client";

import { useEffect, type ComponentProps, type ReactNode } from "react";
import Link, { useLinkStatus } from "next/link";

/** Broadcast whenever a Link starts or stops navigating. */
export const NAV_EVENT = "vpps-nav";

export type NavPendingDetail = { pending: boolean };

/**
 * Reports whether THIS link's navigation is still in flight.
 *
 * `useLinkStatus` may only be called from a descendant of the `<Link>` it
 * describes, which is why this is a separate component rather than a hook call
 * in NavLink itself.
 */
function LinkPending({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent<NavPendingDetail>(NAV_EVENT, { detail: { pending } }),
    );

    // A link unmounting mid-navigation (the nav collapsing on a phone) must not
    // leave the progress bar stuck on.
    return () => {
      if (pending) {
        window.dispatchEvent(
          new CustomEvent<NavPendingDetail>(NAV_EVENT, { detail: { pending: false } }),
        );
      }
    };
  }, [pending]);

  return <>{children}</>;
}

/**
 * A `<Link>` that tells the app it is loading.
 *
 * The progress bar used to key off `usePathname()`, which only changes AFTER
 * the navigation commits — so a slow route showed nothing at all while it
 * loaded, then flashed a bar once the page was already on screen. Exactly
 * backwards.
 *
 * The window CustomEvent transport is the same one `toast.tsx` already uses,
 * so the progress bar stays decoupled from the link tree with no new
 * state-management dependency.
 *
 * Worth applying only to the main navigation surfaces: each instance costs a
 * client component, and the fallback in RouteProgress still covers everything
 * else.
 */
export function NavLink({ children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      <LinkPending>{children}</LinkPending>
    </Link>
  );
}
