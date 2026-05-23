"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import {
  getProtectedNavigationItem,
  getVisibleProtectedNavigation,
} from "@/lib/config/navigation";
import { type StaffRole } from "@/lib/auth/roles";
import { appendCurrentSessionParam } from "@/lib/navigation/session-href";
import { cn } from "@/lib/utils";

type SidebarNavProps = {
  staffRole: StaffRole;
  /** "sidebar" = full sidebar list. "topbar" = compact horizontal grid (md viewports). */
  mode?: "sidebar" | "topbar";
  className?: string;
};

const eagerPrefetchHrefs = new Set([
  "/protected/payments",
  "/protected/dashboard",
  "/protected/students",
]);

export function SidebarNav({
  staffRole,
  mode = "sidebar",
  className,
}: SidebarNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeItem = getProtectedNavigationItem(pathname);
  const navigationItems = getVisibleProtectedNavigation(staffRole);
  const isTopbar = mode === "topbar";

  return (
    <nav
      className={cn(
        isTopbar
          ? "grid grid-cols-2 gap-1.5 sm:grid-cols-4"
          : "flex flex-col gap-0.5",
        className,
      )}
      aria-label="Workspace navigation"
    >
      {navigationItems.map((item) => {
        const active = activeItem?.href === item.href;
        const Icon = item.icon;
        const href = appendCurrentSessionParam(item.href, searchParams);

        if (isTopbar) {
          return (
            <Link
              key={item.href}
              href={href}
              prefetch={eagerPrefetchHrefs.has(item.href)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-[11px] font-medium leading-4 transition-colors duration-150",
                active
                  ? "border-border-strong bg-surface-2 text-foreground"
                  : "border-border bg-surface text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        }

        return (
          <Link
            key={item.href}
            href={href}
            prefetch={eagerPrefetchHrefs.has(item.href)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors duration-150",
              active
                ? "bg-surface-2 text-foreground"
                : "text-muted-foreground hover:bg-surface-2/70 hover:text-foreground",
            )}
          >
            {/* Active rule */}
            {active ? (
              <span
                aria-hidden="true"
                className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-accent"
              />
            ) : null}
            <Icon
              className={cn(
                "size-4 shrink-0",
                active ? "text-accent" : "text-muted-foreground group-hover:text-foreground",
              )}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
