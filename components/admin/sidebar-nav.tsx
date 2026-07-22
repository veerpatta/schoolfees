"use client";

import { useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  getGroupedProtectedNavigation,
  getProtectedNavigationItem,
  getVisibleProtectedNavigation,
  type ProtectedNavigationItem,
} from "@/lib/config/navigation";
import { type StaffRole } from "@/lib/auth/roles";
import { appendCurrentSessionParam } from "@/lib/navigation/session-href";
import { cn } from "@/lib/utils";

type SidebarNavProps = {
  staffRole: StaffRole;
  /** "sidebar" = full sidebar list. "topbar" = compact horizontal grid (md viewports). */
  mode?: "sidebar" | "topbar";
  /**
   * "ink" renders on the dark --nav sidebar surface (Ledger Calm 2.0);
   * "light" keeps the paper styling used by the tablet topbar grid.
   */
  tone?: "light" | "ink";
  /** Count pills keyed by nav href (e.g. payments today, defaulter count). */
  counts?: Record<string, number>;
  className?: string;
};

// These three are always eagerly prefetched (the office's daily flow). Every
// other nav item is prefetched only on hover/focus so we don't blast the
// server with N speculative requests on every page load — see useHoverPrefetch
// below.
const eagerPrefetchHrefs = new Set([
  "/protected/payments",
  "/protected/dashboard",
  "/protected/students",
]);

/**
 * Idempotent hover-prefetch hook. On the first onMouseEnter / onFocus / onTouchStart
 * for a given href, calls router.prefetch() and remembers it so subsequent
 * hovers are free. Combines with the eagerly-prefetched set above so the most
 * common destinations stay warm regardless of intent.
 */
function useHoverPrefetch() {
  const router = useRouter();
  const warmed = useRef<Set<string>>(new Set());
  return useCallback(
    (href: string) => {
      if (warmed.current.has(href)) return;
      warmed.current.add(href);
      router.prefetch(href);
    },
    [router],
  );
}

export function SidebarNav({
  staffRole,
  mode = "sidebar",
  tone = "light",
  counts,
  className,
}: SidebarNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeItem = getProtectedNavigationItem(pathname);
  const isTopbar = mode === "topbar";
  const isInk = tone === "ink" && !isTopbar;
  const t = useTranslations("Navigation");
  const warmRoute = useHoverPrefetch();
  const translateLabel = (item: { label: string; i18nKey?: string }) =>
    item.i18nKey ? t(item.i18nKey) : item.label;

  const renderItem = (item: ProtectedNavigationItem) => {
    const active = activeItem?.href === item.href;
    const Icon = item.icon;
    const href = appendCurrentSessionParam(item.href, searchParams);

    const isEager = eagerPrefetchHrefs.has(item.href);
    const onWarm = isEager || active ? undefined : () => warmRoute(item.href);

    if (isTopbar) {
      return (
        <Link
          key={item.href}
          href={href}
          prefetch={isEager}
          onMouseEnter={onWarm}
          onFocus={onWarm}
          onTouchStart={onWarm}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-[11px] font-medium leading-4 transition-colors duration-150",
            active
              ? "border-border-strong bg-surface-2 text-foreground"
              : "border-border bg-surface text-muted-foreground hover:bg-surface-2 hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          <span className="truncate">{translateLabel(item)}</span>
        </Link>
      );
    }

    const count = counts?.[item.href];

    return (
      <Link
        key={item.href}
        href={href}
        prefetch={isEager}
        onMouseEnter={onWarm}
        onFocus={onWarm}
        onTouchStart={onWarm}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex items-center gap-2.5 overflow-hidden rounded-lg px-2.5 py-2 text-sm font-medium transition-colors duration-150",
          isInk ? "focus-ring-ink" : "focus-ring",
          isInk
            ? active
              ? "bg-nav-hover text-nav-foreground"
              : "text-nav-muted hover:bg-nav-hover/70 hover:text-nav-foreground"
            : active
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
            isInk
              ? active
                ? "text-accent"
                : "text-nav-muted group-hover:text-nav-foreground"
              : active
                ? "text-accent"
                : "text-muted-foreground group-hover:text-foreground",
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate">{translateLabel(item)}</span>
        {typeof count === "number" && count > 0 ? (
          <span
            className={cn(
              "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none",
              isInk
                ? "bg-nav-surface text-nav-muted group-hover:text-nav-foreground"
                : "bg-surface-2 text-muted-foreground",
              active && isInk && "bg-nav text-nav-foreground",
            )}
          >
            {count > 999 ? "999+" : count}
          </span>
        ) : null}
      </Link>
    );
  };

  if (isTopbar) {
    const navigationItems = getVisibleProtectedNavigation(staffRole);
    return (
      <nav
        className={cn("grid grid-cols-2 gap-1.5 sm:grid-cols-4", className)}
        aria-label={t("workspaceNavLabel")}
      >
        {navigationItems.map(renderItem)}
      </nav>
    );
  }

  // Sidebar mode: grouped Daily / Records sections (Ledger Calm 2.0).
  const groups = getGroupedProtectedNavigation(staffRole);

  return (
    <nav
      className={cn("flex flex-col gap-4", className)}
      aria-label={t("workspaceNavLabel")}
    >
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-0.5">
          <p
            className={cn(
              "px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
              isInk ? "text-nav-muted/70" : "text-subtle-foreground",
            )}
          >
            {t(group.i18nKey)}
          </p>
          {group.items.map(renderItem)}
        </div>
      ))}
    </nav>
  );
}
